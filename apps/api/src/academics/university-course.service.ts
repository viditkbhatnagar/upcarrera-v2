import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { deriveIntakeStatus } from '../finance/fee-structures/fee-structure.money';
import { TagCoursesDto } from './dto/tag-courses.dto';
import { UpdateTaggedCourseDto } from './dto/update-tagged-course.dto';
import { ReplaceOfferingsDto, CopyOfferingsDto } from './dto/offerings.dto';

/**
 * IN04 — University x Course x Intake mapping.
 *
 * Owns the two catalog relations migration 002 created:
 *   - `university_course`         (tagged courses, M:N, the source of truth for
 *                                  "which courses does University X offer")
 *   - `university_course_intake`  (offerings: a tagged pair open in an intake)
 *
 * Conventions mirror AcademicsService: soft delete (stamp `deleted_at`), manual
 * `created_at` / `updated_at`, bulk groupBy counts (never N+1). It NEVER writes
 * `course.university_id` — the mapping tables replace that legacy column as the
 * source of truth. Intake Open/Upcoming/Closed is derived by the one shared
 * WS2 helper (deriveIntakeStatus), with the (year, month) fallback so production
 * intakes that have a NULL start_date still resolve.
 */

/** A tagged-course row as the university detail page renders it. */
export interface TaggedCourseView {
  course_id: number;
  title: string | null;
  short_name: string | null;
  level: string | null;
  duration: string | null;
  course_status: number | null;
  university_course_name: string | null;
  university_course_code: string | null;
  status: number | null;
  open_intake_count: number;
  open_intakes: Array<{ id: number; name: string | null }>;
}

/** A university that offers a given course (the Courses screen drawer). */
export interface CourseUniversityView {
  university_id: number;
  university_title: string | null;
  university_course_name: string | null;
  status: number | null;
  open_intake_count: number;
}

/** The offerings for one intake, grouped by university. */
export interface IntakeOfferingsView {
  intake_id: number;
  universities: Array<{
    university_id: number;
    university_title: string | null;
    courses: Array<{
      course_id: number;
      label: string | null;
      university_course_name: string | null;
    }>;
  }>;
  total_pairs: number;
}

/** Catalog cascade step shapes (Add Lead), keyed by id. */
export interface CatalogUniversity {
  id: number;
  title: string | null;
}
export interface CatalogCourse {
  course_id: number;
  label: string | null;
  specialisations: Array<{ id: number; title: string | null }>;
}
export interface CatalogIntake {
  id: number;
  name: string | null;
  start_date: Date | null;
  closing_date: Date | null;
}

/** 1 = offered. The mapping API always writes status explicitly, never NULL. */
const STATUS_ACTIVE = 1;
const STATUS_PAUSED = 0;

@Injectable()
export class UniversityCourseService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // shared guards + intake-status helpers
  // ---------------------------------------------------------------------------

  private async assertUniversityLive(id: number): Promise<void> {
    const row = await this.prisma.university.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('University not found!');
  }

  private async assertIntakeLive(id: number): Promise<void> {
    const row = await this.prisma.intake.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Intake not found!');
  }

  /**
   * The subset of the given intake ids that are Open right now. An intake whose
   * status is explicitly 'Inactive' is never Open; otherwise the WS2 date rule
   * (with the year/month fallback) decides.
   */
  private async openIntakeIds(
    intakeIds: number[],
    now: Date,
  ): Promise<Set<number>> {
    const unique = [...new Set(intakeIds)];
    if (unique.length === 0) return new Set();
    const intakes = await this.prisma.intake.findMany({
      where: { id: { in: unique }, deleted_at: null },
      select: {
        id: true,
        start_date: true,
        closing_date: true,
        year: true,
        month: true,
        status: true,
      },
    });
    const open = new Set<number>();
    for (const i of intakes) {
      if ((i.status ?? '').trim().toLowerCase() === 'inactive') continue;
      const derived = deriveIntakeStatus(i.start_date, i.closing_date, now, {
        year: i.year,
        month: i.month,
      });
      if (derived === 'Open') open.add(i.id);
    }
    return open;
  }

  /** id -> title for the given university ids (one query). */
  private async universityTitles(
    ids: number[],
  ): Promise<Map<number, string | null>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.university.findMany({
      where: { id: { in: unique } },
      select: { id: true, title: true },
    });
    return new Map(rows.map((u) => [u.id, u.title ?? null]));
  }

  /** id -> name for the given intake ids (one query). */
  private async intakeNames(ids: number[]): Promise<Map<number, string | null>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.intake.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((i) => [i.id, i.name ?? null]));
  }

  // ---------------------------------------------------------------------------
  // tagged courses  -> /universities/:id/courses
  // ---------------------------------------------------------------------------

  /** GET /universities/:id/courses — tagged courses + each one's open-intake count + chips. */
  async listTaggedCourses(
    universityId: number,
    now: Date = new Date(),
  ): Promise<TaggedCourseView[]> {
    await this.assertUniversityLive(universityId);

    const tags = await this.prisma.university_course.findMany({
      where: { university_id: universityId, deleted_at: null },
      orderBy: { id: 'desc' },
    });
    if (tags.length === 0) return [];

    const courseIds = [...new Set(tags.map((t) => t.course_id))];
    const [courses, offerings] = await Promise.all([
      this.prisma.course.findMany({
        where: { id: { in: courseIds } },
        select: {
          id: true,
          title: true,
          short_name: true,
          level: true,
          duration: true,
          status: true,
        },
      }),
      this.prisma.university_course_intake.findMany({
        where: {
          university_id: universityId,
          course_id: { in: courseIds },
          deleted_at: null,
          status: STATUS_ACTIVE,
        },
        select: { course_id: true, intake_id: true },
      }),
    ]);
    const courseById = new Map(courses.map((c) => [c.id, c]));

    const openSet = await this.openIntakeIds(
      offerings.map((o) => o.intake_id),
      now,
    );
    const nameById = await this.intakeNames(
      offerings.filter((o) => openSet.has(o.intake_id)).map((o) => o.intake_id),
    );
    const openByCourse = new Map<number, Array<{ id: number; name: string | null }>>();
    for (const o of offerings) {
      if (!openSet.has(o.intake_id)) continue;
      const list = openByCourse.get(o.course_id) ?? [];
      list.push({ id: o.intake_id, name: nameById.get(o.intake_id) ?? null });
      openByCourse.set(o.course_id, list);
    }

    return tags.map((t) => {
      const course = courseById.get(t.course_id);
      const open = openByCourse.get(t.course_id) ?? [];
      return {
        course_id: t.course_id,
        title: course?.title ?? null,
        short_name: course?.short_name ?? null,
        level: course?.level ?? null,
        duration: course?.duration ?? null,
        course_status: course?.status ?? null,
        university_course_name: t.university_course_name ?? null,
        university_course_code: t.university_course_code ?? null,
        status: t.status ?? null,
        open_intake_count: open.length,
        open_intakes: open,
      };
    });
  }

  /**
   * POST /universities/:id/courses — tag one or more courses. Reviving a
   * soft-deleted row instead of inserting a duplicate keeps the (university,
   * course) unique key (which covers soft-deleted rows) intact.
   */
  async tagCourses(
    universityId: number,
    dto: TagCoursesDto,
    actorUserId: number,
  ): Promise<{ added: number; revived: number; already: number }> {
    await this.assertUniversityLive(universityId);

    const courseIds = [...new Set(dto.items.map((i) => i.course_id))];
    const liveCourses = await this.prisma.course.findMany({
      where: { id: { in: courseIds }, deleted_at: null },
      select: { id: true },
    });
    const liveIds = new Set(liveCourses.map((c) => c.id));
    const missing = courseIds.filter((id) => !liveIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Course(s) not found or deleted: ${missing.join(', ')}`,
      );
    }

    // De-duplicate the payload, last write wins on the name/code.
    const byCourse = new Map<number, { name?: string; code?: string }>();
    for (const item of dto.items) {
      byCourse.set(item.course_id, {
        name: item.university_course_name,
        code: item.university_course_code,
      });
    }

    const existing = await this.prisma.university_course.findMany({
      where: { university_id: universityId, course_id: { in: courseIds } },
      select: { id: true, course_id: true, deleted_at: true },
    });
    const existingByCourse = new Map(existing.map((r) => [r.course_id, r]));

    const now = new Date();
    let added = 0;
    let revived = 0;
    let already = 0;

    for (const [courseId, label] of byCourse) {
      const row = existingByCourse.get(courseId);
      if (!row) {
        await this.prisma.university_course.create({
          data: {
            university_id: universityId,
            course_id: courseId,
            university_course_name: label.name ?? null,
            university_course_code: label.code ?? null,
            status: STATUS_ACTIVE,
            source: 'ui',
            created_by: actorUserId,
            created_at: now,
            updated_at: now,
          },
        });
        added += 1;
      } else if (row.deleted_at !== null) {
        await this.prisma.university_course.update({
          where: { id: row.id },
          data: {
            university_course_name: label.name ?? null,
            university_course_code: label.code ?? null,
            status: STATUS_ACTIVE,
            source: 'ui',
            deleted_at: null,
            deleted_by: null,
            updated_by: actorUserId,
            updated_at: now,
          },
        });
        revived += 1;
      } else {
        already += 1;
      }
    }

    return { added, revived, already };
  }

  /** PATCH /universities/:id/courses/:courseId — rename or pause/resume a tag. */
  async updateTaggedCourse(
    universityId: number,
    courseId: number,
    dto: UpdateTaggedCourseDto,
    actorUserId: number,
  ) {
    const row = await this.prisma.university_course.findFirst({
      where: { university_id: universityId, course_id: courseId, deleted_at: null },
    });
    if (!row) {
      throw new NotFoundException('This course is not tagged to the university.');
    }
    return this.prisma.university_course.update({
      where: { id: row.id },
      data: {
        ...(dto.university_course_name !== undefined
          ? { university_course_name: dto.university_course_name ?? null }
          : {}),
        ...(dto.university_course_code !== undefined
          ? { university_course_code: dto.university_course_code ?? null }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        updated_by: actorUserId,
        updated_at: new Date(),
      },
    });
  }

  /**
   * DELETE /universities/:id/courses/:courseId — untag.
   *
   * Soft-deletes the university_course row and that pair's offerings in one
   * transaction. Blocks with 409 when the pair is still referenced by in-flight
   * applications (not converted, not archived) or by a non-expired fee structure,
   * so nothing live is orphaned.
   */
  async untagCourse(
    universityId: number,
    courseId: number,
    actorUserId: number,
  ): Promise<{ untagged: true; offerings_removed: number }> {
    const row = await this.prisma.university_course.findFirst({
      where: { university_id: universityId, course_id: courseId, deleted_at: null },
    });
    if (!row) {
      throw new NotFoundException('This course is not tagged to the university.');
    }

    const offerings = await this.prisma.university_course_intake.findMany({
      where: {
        university_id: universityId,
        course_id: courseId,
        deleted_at: null,
      },
      select: { id: true, intake_id: true },
    });
    const offeringIntakeIds = [...new Set(offerings.map((o) => o.intake_id))];

    const [appsByPair, appsByIntake, feeStructures] = await Promise.all([
      this.prisma.applications.count({
        where: {
          university_id: universityId,
          course_id: courseId,
          deleted_at: null,
          is_archived: false,
          OR: [{ is_converted: null }, { is_converted: { not: 1 } }],
        },
      }),
      offeringIntakeIds.length > 0
        ? this.prisma.applications.count({
            where: {
              // Scope to the EXACT (university, course) pair: a course tagged to
              // two universities both offered in the same intake must not 409
              // university A's untag over an application that belongs to
              // university B (WS3 MEDIUM 3 false positive).
              university_id: universityId,
              intake_id: { in: offeringIntakeIds },
              course_id: courseId,
              deleted_at: null,
              is_archived: false,
              OR: [{ is_converted: null }, { is_converted: { not: 1 } }],
            },
          })
        : Promise.resolve(0),
      this.prisma.fee_structure.count({
        where: {
          university_id: universityId,
          course_id: courseId,
          status: { not: 'expired' },
        },
      }),
    ]);

    const inflightApps = Math.max(appsByPair, appsByIntake);
    if (inflightApps > 0 || feeStructures > 0) {
      const parts: string[] = [];
      if (inflightApps > 0) {
        parts.push(`${inflightApps} in-flight application(s)`);
      }
      if (feeStructures > 0) {
        parts.push(`${feeStructures} active or draft fee structure(s)`);
      }
      throw new ConflictException(
        `Cannot untag this course: it still has ${parts.join(' and ')} for this university. Resolve or expire them first.`,
      );
    }

    const now = new Date();
    const offeringIds = offerings.map((o) => o.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.university_course.update({
        where: { id: row.id },
        data: { deleted_at: now, deleted_by: actorUserId, updated_at: now },
      });
      if (offeringIds.length > 0) {
        await tx.university_course_intake.updateMany({
          where: { id: { in: offeringIds } },
          data: { deleted_at: now, deleted_by: actorUserId, updated_at: now },
        });
      }
    });

    return { untagged: true, offerings_removed: offeringIds.length };
  }

  /** GET /courses/:id/universities — which universities offer this course. */
  async courseUniversities(
    courseId: number,
    now: Date = new Date(),
  ): Promise<CourseUniversityView[]> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deleted_at: null },
      select: { id: true },
    });
    if (!course) throw new NotFoundException('Course not found!');

    const tags = await this.prisma.university_course.findMany({
      where: { course_id: courseId, deleted_at: null },
      select: { university_id: true, university_course_name: true, status: true },
    });
    if (tags.length === 0) return [];

    const universityIds = [...new Set(tags.map((t) => t.university_id))];
    const [titles, offerings] = await Promise.all([
      this.universityTitles(universityIds),
      this.prisma.university_course_intake.findMany({
        where: {
          course_id: courseId,
          university_id: { in: universityIds },
          deleted_at: null,
          status: STATUS_ACTIVE,
        },
        select: { university_id: true, intake_id: true },
      }),
    ]);
    const openSet = await this.openIntakeIds(
      offerings.map((o) => o.intake_id),
      now,
    );
    const openByUniversity = new Map<number, Set<number>>();
    for (const o of offerings) {
      if (!openSet.has(o.intake_id)) continue;
      const set = openByUniversity.get(o.university_id) ?? new Set<number>();
      set.add(o.intake_id);
      openByUniversity.set(o.university_id, set);
    }

    return tags
      .map((t) => ({
        university_id: t.university_id,
        university_title: titles.get(t.university_id) ?? null,
        university_course_name: t.university_course_name ?? null,
        status: t.status ?? null,
        open_intake_count: openByUniversity.get(t.university_id)?.size ?? 0,
      }))
      .sort((a, b) =>
        (a.university_title ?? '').localeCompare(b.university_title ?? ''),
      );
  }

  // ---------------------------------------------------------------------------
  // offerings  -> /intakes/:id/offerings
  // ---------------------------------------------------------------------------

  /** GET /intakes/:id/offerings — pairs offered in an intake, grouped by university. */
  async listOfferings(intakeId: number): Promise<IntakeOfferingsView> {
    await this.assertIntakeLive(intakeId);

    const rows = await this.prisma.university_course_intake.findMany({
      where: { intake_id: intakeId, deleted_at: null, status: STATUS_ACTIVE },
      select: { university_id: true, course_id: true },
    });

    const universityIds = [...new Set(rows.map((r) => r.university_id))];
    const courseIds = [...new Set(rows.map((r) => r.course_id))];
    const [titles, courses, tags] = await Promise.all([
      this.universityTitles(universityIds),
      this.prisma.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, title: true },
      }),
      universityIds.length > 0
        ? this.prisma.university_course.findMany({
            where: {
              university_id: { in: universityIds },
              course_id: { in: courseIds },
              deleted_at: null,
            },
            select: {
              university_id: true,
              course_id: true,
              university_course_name: true,
            },
          })
        : Promise.resolve([]),
    ]);
    const courseTitleById = new Map(courses.map((c) => [c.id, c.title ?? null]));
    const nameByPair = new Map(
      tags.map((t) => [`${t.university_id}:${t.course_id}`, t.university_course_name ?? null]),
    );

    const byUniversity = new Map<
      number,
      IntakeOfferingsView['universities'][number]
    >();
    for (const r of rows) {
      const bucket =
        byUniversity.get(r.university_id) ??
        ({
          university_id: r.university_id,
          university_title: titles.get(r.university_id) ?? null,
          courses: [],
        } satisfies IntakeOfferingsView['universities'][number]);
      const ucName = nameByPair.get(`${r.university_id}:${r.course_id}`) ?? null;
      bucket.courses.push({
        course_id: r.course_id,
        label: ucName ?? courseTitleById.get(r.course_id) ?? null,
        university_course_name: ucName,
      });
      byUniversity.set(r.university_id, bucket);
    }

    const universities = [...byUniversity.values()].sort((a, b) =>
      (a.university_title ?? '').localeCompare(b.university_title ?? ''),
    );
    return { intake_id: intakeId, universities, total_pairs: rows.length };
  }

  /**
   * PUT /intakes/:id/offerings — replace the whole offering set for an intake in
   * one transaction. Every pair must be a live, active university_course.
   */
  async replaceOfferings(
    intakeId: number,
    dto: ReplaceOfferingsDto,
    actorUserId: number,
  ): Promise<{ added: number; revived: number; removed: number }> {
    await this.assertIntakeLive(intakeId);

    // Normalise the desired set (drop exact duplicates in the payload).
    const desired = new Map<string, { university_id: number; course_id: number }>();
    for (const o of dto.offerings) {
      desired.set(`${o.university_id}:${o.course_id}`, o);
    }

    // Every desired pair must be a live, active tagged course.
    if (desired.size > 0) {
      const pairs = [...desired.values()];
      const tags = await this.prisma.university_course.findMany({
        where: {
          deleted_at: null,
          status: STATUS_ACTIVE,
          OR: pairs.map((p) => ({
            university_id: p.university_id,
            course_id: p.course_id,
          })),
        },
        select: { university_id: true, course_id: true },
      });
      const liveTags = new Set(tags.map((t) => `${t.university_id}:${t.course_id}`));
      const invalid = pairs.filter(
        (p) => !liveTags.has(`${p.university_id}:${p.course_id}`),
      );
      if (invalid.length > 0) {
        const sample = invalid
          .slice(0, 5)
          .map((p) => `(university ${p.university_id}, course ${p.course_id})`)
          .join(', ');
        throw new BadRequestException(
          `These pairs are not active tagged courses and cannot be offered: ${sample}`,
        );
      }
    }

    const existing = await this.prisma.university_course_intake.findMany({
      where: { intake_id: intakeId },
      select: { id: true, university_id: true, course_id: true, deleted_at: true },
    });
    const existingByKey = new Map(
      existing.map((r) => [`${r.university_id}:${r.course_id}`, r]),
    );

    const now = new Date();
    let added = 0;
    let revived = 0;
    let removed = 0;

    await this.prisma.$transaction(async (tx) => {
      // Insert new / revive soft-deleted for each desired pair.
      for (const [key, pair] of desired) {
        const row = existingByKey.get(key);
        if (!row) {
          await tx.university_course_intake.create({
            data: {
              university_id: pair.university_id,
              course_id: pair.course_id,
              intake_id: intakeId,
              status: STATUS_ACTIVE,
              source: 'ui',
              created_by: actorUserId,
              created_at: now,
              updated_at: now,
            },
          });
          added += 1;
        } else if (row.deleted_at !== null) {
          await tx.university_course_intake.update({
            where: { id: row.id },
            data: {
              status: STATUS_ACTIVE,
              source: 'ui',
              deleted_at: null,
              deleted_by: null,
              updated_by: actorUserId,
              updated_at: now,
            },
          });
          revived += 1;
        }
      }

      // Soft-delete any currently-live offering not in the desired set.
      const toRemove = existing.filter(
        (r) =>
          r.deleted_at === null &&
          !desired.has(`${r.university_id}:${r.course_id}`),
      );
      if (toRemove.length > 0) {
        // WS3 MEDIUM 4: removing an offering must apply the SAME referenced-by
        // guard that untag enforces — never orphan an in-flight application
        // (applications.intake_id) or a non-expired fee structure that points at
        // the (university, course, intake) triple being removed. Checked inside
        // the transaction so the whole replace rolls back on a conflict.
        await this.assertOfferingsRemovable(tx, intakeId, toRemove);
        await tx.university_course_intake.updateMany({
          where: { id: { in: toRemove.map((r) => r.id) } },
          data: { deleted_at: now, deleted_by: actorUserId, updated_at: now },
        });
        removed = toRemove.length;
      }
    });

    return { added, revived, removed };
  }

  /**
   * WS3 MEDIUM 4 — the referenced-by guard for offerings being REMOVED (PUT
   * replace). An offering may be dropped only when nothing live still points at
   * its exact (university, course, intake) triple: no in-flight application
   * (applications.intake_id, not archived, not converted) and no non-expired fee
   * structure. Mirrors untagCourse's guard so a replace can never orphan a live
   * reference. Runs on the transaction client so a conflict rolls the whole
   * replace back.
   */
  private async assertOfferingsRemovable(
    tx: Prisma.TransactionClient,
    intakeId: number,
    toRemove: Array<{ university_id: number; course_id: number }>,
  ): Promise<void> {
    if (toRemove.length === 0) return;
    const pairOr = toRemove.map((r) => ({
      university_id: r.university_id,
      course_id: r.course_id,
    }));

    const [apps, fees] = await Promise.all([
      tx.applications.findMany({
        where: {
          intake_id: intakeId,
          deleted_at: null,
          is_archived: false,
          AND: [
            { OR: pairOr },
            { OR: [{ is_converted: null }, { is_converted: { not: 1 } }] },
          ],
        },
        select: { university_id: true, course_id: true },
      }),
      tx.fee_structure.findMany({
        where: {
          intake_id: intakeId,
          status: { not: 'expired' },
          OR: pairOr,
        },
        select: { university_id: true, course_id: true },
      }),
    ]);

    const blocked = new Set<string>([
      ...apps.map((a) => `${a.university_id}:${a.course_id}`),
      ...fees.map((f) => `${f.university_id}:${f.course_id}`),
    ]);
    if (blocked.size === 0) return;

    const sample = [...blocked]
      .slice(0, 5)
      .map((key) => {
        const [u, c] = key.split(':');
        return `(university ${u}, course ${c})`;
      })
      .join(', ');
    throw new ConflictException(
      `Cannot remove these offerings — they are still referenced by in-flight applications or non-expired fee structures for this intake: ${sample}. Resolve or expire them first.`,
    );
  }

  /**
   * POST /intakes/:id/offerings/copy — copy offerings from another intake. Adds
   * missing pairs (source='copy'); never removes any. Only pairs that are still
   * live, active tagged courses are copied.
   */
  async copyOfferings(
    intakeId: number,
    dto: CopyOfferingsDto,
    actorUserId: number,
  ): Promise<{ added: number; revived: number; already: number }> {
    await this.assertIntakeLive(intakeId);
    if (dto.from_intake_id === intakeId) {
      throw new BadRequestException('Cannot copy offerings from the same intake.');
    }
    await this.assertIntakeLive(dto.from_intake_id);

    const source = await this.prisma.university_course_intake.findMany({
      where: {
        intake_id: dto.from_intake_id,
        deleted_at: null,
        status: STATUS_ACTIVE,
      },
      select: { university_id: true, course_id: true },
    });
    if (source.length === 0) {
      return { added: 0, revived: 0, already: 0 };
    }

    // Keep only pairs that are still live, active tagged courses.
    const liveTagRows = await this.prisma.university_course.findMany({
      where: {
        deleted_at: null,
        status: STATUS_ACTIVE,
        OR: source.map((s) => ({
          university_id: s.university_id,
          course_id: s.course_id,
        })),
      },
      select: { university_id: true, course_id: true },
    });
    const liveTags = new Set(
      liveTagRows.map((t) => `${t.university_id}:${t.course_id}`),
    );
    const pairs = source.filter((s) =>
      liveTags.has(`${s.university_id}:${s.course_id}`),
    );

    const existing = await this.prisma.university_course_intake.findMany({
      where: { intake_id: intakeId },
      select: { id: true, university_id: true, course_id: true, deleted_at: true },
    });
    const existingByKey = new Map(
      existing.map((r) => [`${r.university_id}:${r.course_id}`, r]),
    );

    const now = new Date();
    let added = 0;
    let revived = 0;
    let already = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const p of pairs) {
        const key = `${p.university_id}:${p.course_id}`;
        const row = existingByKey.get(key);
        if (!row) {
          await tx.university_course_intake.create({
            data: {
              university_id: p.university_id,
              course_id: p.course_id,
              intake_id: intakeId,
              status: STATUS_ACTIVE,
              source: 'copy',
              created_by: actorUserId,
              created_at: now,
              updated_at: now,
            },
          });
          added += 1;
        } else if (row.deleted_at !== null) {
          await tx.university_course_intake.update({
            where: { id: row.id },
            data: {
              status: STATUS_ACTIVE,
              source: 'copy',
              deleted_at: null,
              deleted_by: null,
              updated_by: actorUserId,
              updated_at: now,
            },
          });
          revived += 1;
        } else {
          already += 1;
        }
      }
    });

    return { added, revived, already };
  }

  // ---------------------------------------------------------------------------
  // admission catalog cascade  -> /admission-catalog/*
  // ---------------------------------------------------------------------------

  /** GET /admission-catalog/universities — universities with >=1 open offering. */
  async catalogUniversities(now: Date = new Date()): Promise<CatalogUniversity[]> {
    const offerings = await this.prisma.university_course_intake.findMany({
      where: { deleted_at: null, status: STATUS_ACTIVE },
      select: { university_id: true, course_id: true, intake_id: true },
    });
    if (offerings.length === 0) return [];

    const openSet = await this.openIntakeIds(
      offerings.map((o) => o.intake_id),
      now,
    );
    const openOfferings = offerings.filter((o) => openSet.has(o.intake_id));
    if (openOfferings.length === 0) return [];

    // Only pairs that are still live, active tagged courses count.
    const activeTags = await this.activeTagKeys(openOfferings);
    const universityIds = [
      ...new Set(
        openOfferings
          .filter((o) => activeTags.has(`${o.university_id}:${o.course_id}`))
          .map((o) => o.university_id),
      ),
    ];
    if (universityIds.length === 0) return [];

    const universities = await this.prisma.university.findMany({
      where: { id: { in: universityIds }, deleted_at: null },
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
    });
    return universities.map((u) => ({ id: u.id, title: u.title ?? null }));
  }

  /** GET /admission-catalog/universities/:id/courses — this university's open-offered courses. */
  async catalogCourses(
    universityId: number,
    now: Date = new Date(),
  ): Promise<CatalogCourse[]> {
    await this.assertUniversityLive(universityId);

    const offerings = await this.prisma.university_course_intake.findMany({
      where: {
        university_id: universityId,
        deleted_at: null,
        status: STATUS_ACTIVE,
      },
      select: { course_id: true, intake_id: true },
    });
    if (offerings.length === 0) return [];

    const openSet = await this.openIntakeIds(
      offerings.map((o) => o.intake_id),
      now,
    );
    const openCourseIds = [
      ...new Set(
        offerings.filter((o) => openSet.has(o.intake_id)).map((o) => o.course_id),
      ),
    ];
    if (openCourseIds.length === 0) return [];

    // Keep only courses whose (university, course) tag is still live and active.
    const tags = await this.prisma.university_course.findMany({
      where: {
        university_id: universityId,
        course_id: { in: openCourseIds },
        deleted_at: null,
        status: STATUS_ACTIVE,
      },
      select: { course_id: true, university_course_name: true },
    });
    const courseIds = tags.map((t) => t.course_id);
    if (courseIds.length === 0) return [];

    const [courses, specialisations] = await Promise.all([
      this.prisma.course.findMany({
        where: { id: { in: courseIds }, deleted_at: null },
        select: { id: true, title: true },
      }),
      this.prisma.specialisations.findMany({
        where: { course_id: { in: courseIds }, deleted_at: null },
        select: { id: true, course_id: true, title: true },
      }),
    ]);
    const liveCourseById = new Map(courses.map((c) => [c.id, c.title ?? null]));
    const specByCourse = new Map<number, Array<{ id: number; title: string | null }>>();
    for (const s of specialisations) {
      if (s.course_id == null) continue;
      const list = specByCourse.get(s.course_id) ?? [];
      list.push({ id: s.id, title: s.title ?? null });
      specByCourse.set(s.course_id, list);
    }

    return tags
      .filter((t) => liveCourseById.has(t.course_id))
      .map((t) => ({
        course_id: t.course_id,
        label: t.university_course_name ?? liveCourseById.get(t.course_id) ?? null,
        specialisations: specByCourse.get(t.course_id) ?? [],
      }))
      .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
  }

  /** GET /admission-catalog/universities/:id/courses/:courseId/intakes — open intakes for a pair. */
  async catalogIntakes(
    universityId: number,
    courseId: number,
    now: Date = new Date(),
  ): Promise<CatalogIntake[]> {
    // WS3 LOW 5: a PAUSED or soft-deleted (university, course) tag must not
    // cascade open intakes — mirror catalogCourses, which filters on activeTagKeys.
    // Without this a paused tag still showed open intakes in the Add Lead cascade.
    const activeTags = await this.activeTagKeys([
      { university_id: universityId, course_id: courseId },
    ]);
    if (!activeTags.has(`${universityId}:${courseId}`)) return [];

    const offerings = await this.prisma.university_course_intake.findMany({
      where: {
        university_id: universityId,
        course_id: courseId,
        deleted_at: null,
        status: STATUS_ACTIVE,
      },
      select: { intake_id: true },
    });
    if (offerings.length === 0) return [];

    const openSet = await this.openIntakeIds(
      offerings.map((o) => o.intake_id),
      now,
    );
    const openIds = [...openSet];
    if (openIds.length === 0) return [];

    const intakes = await this.prisma.intake.findMany({
      where: { id: { in: openIds }, deleted_at: null },
      select: { id: true, name: true, start_date: true, closing_date: true },
      orderBy: { id: 'asc' },
    });
    return intakes.map((i) => ({
      id: i.id,
      name: i.name ?? null,
      start_date: i.start_date,
      closing_date: i.closing_date,
    }));
  }

  /** The subset of the given (university, course) pairs that are live, active tags. */
  private async activeTagKeys(
    pairs: Array<{ university_id: number; course_id: number }>,
  ): Promise<Set<string>> {
    const unique = new Map<string, { university_id: number; course_id: number }>();
    for (const p of pairs) {
      unique.set(`${p.university_id}:${p.course_id}`, p);
    }
    if (unique.size === 0) return new Set();
    const rows = await this.prisma.university_course.findMany({
      where: {
        deleted_at: null,
        status: STATUS_ACTIVE,
        OR: [...unique.values()].map((p) => ({
          university_id: p.university_id,
          course_id: p.course_id,
        })),
      },
      select: { university_id: true, course_id: true },
    });
    return new Set(rows.map((r) => `${r.university_id}:${r.course_id}`));
  }

  // ---------------------------------------------------------------------------
  // real counts for the existing list endpoints (bulk groupBy, no N+1)
  // ---------------------------------------------------------------------------

  /** university.id -> { tagged_courses, open_intakes } for the GET /universities page. */
  async universityCatalogCounts(
    universityIds: number[],
    now: Date = new Date(),
  ): Promise<Map<number, { tagged_courses: number; open_intakes: number }>> {
    const result = new Map<number, { tagged_courses: number; open_intakes: number }>();
    if (universityIds.length === 0) return result;

    const [tagged, offerings] = await Promise.all([
      this.prisma.university_course.groupBy({
        by: ['university_id'],
        where: { university_id: { in: universityIds }, deleted_at: null },
        _count: { _all: true },
      }),
      this.prisma.university_course_intake.findMany({
        where: {
          university_id: { in: universityIds },
          deleted_at: null,
          status: STATUS_ACTIVE,
        },
        select: { university_id: true, intake_id: true },
      }),
    ]);
    const taggedByUniversity = new Map<number, number>(
      tagged.map((t) => [t.university_id, t._count._all]),
    );

    const openSet = await this.openIntakeIds(
      offerings.map((o) => o.intake_id),
      now,
    );
    const openByUniversity = new Map<number, Set<number>>();
    for (const o of offerings) {
      if (!openSet.has(o.intake_id)) continue;
      const set = openByUniversity.get(o.university_id) ?? new Set<number>();
      set.add(o.intake_id);
      openByUniversity.set(o.university_id, set);
    }

    for (const id of universityIds) {
      result.set(id, {
        tagged_courses: taggedByUniversity.get(id) ?? 0,
        open_intakes: openByUniversity.get(id)?.size ?? 0,
      });
    }
    return result;
  }

  /** course.id -> number of universities that offer it (distinct), for GET /courses. */
  async mappedUniversitiesCountByCourse(
    courseIds: number[],
  ): Promise<Map<number, number>> {
    if (courseIds.length === 0) return new Map();
    // university_course is unique on (university_id, course_id), so the row count
    // per course_id IS the distinct-university count.
    const rows = await this.prisma.university_course.groupBy({
      by: ['course_id'],
      where: { course_id: { in: courseIds }, deleted_at: null },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.course_id, r._count._all]));
  }

  /** intake.id -> { universities, courses } offered, for GET /intakes. */
  async intakeOfferingCounts(
    intakeIds: number[],
  ): Promise<Map<number, { universities: number; courses: number }>> {
    const result = new Map<number, { universities: number; courses: number }>();
    if (intakeIds.length === 0) return result;
    const rows = await this.prisma.university_course_intake.findMany({
      where: {
        intake_id: { in: intakeIds },
        deleted_at: null,
        status: STATUS_ACTIVE,
      },
      select: { intake_id: true, university_id: true, course_id: true },
    });
    const uniByIntake = new Map<number, Set<number>>();
    const courseByIntake = new Map<number, Set<number>>();
    for (const r of rows) {
      const u = uniByIntake.get(r.intake_id) ?? new Set<number>();
      u.add(r.university_id);
      uniByIntake.set(r.intake_id, u);
      const c = courseByIntake.get(r.intake_id) ?? new Set<number>();
      c.add(r.course_id);
      courseByIntake.set(r.intake_id, c);
    }
    for (const id of intakeIds) {
      result.set(id, {
        universities: uniByIntake.get(id)?.size ?? 0,
        courses: courseByIntake.get(id)?.size ?? 0,
      });
    }
    return result;
  }

  /** intake ids that have at least one live, active offering for a university. */
  async intakeIdsForUniversity(universityId: number): Promise<number[]> {
    const rows = await this.prisma.university_course_intake.findMany({
      where: {
        university_id: universityId,
        deleted_at: null,
        status: STATUS_ACTIVE,
      },
      select: { intake_id: true },
      distinct: ['intake_id'],
    });
    return rows.map((r) => r.intake_id);
  }
}

export { STATUS_ACTIVE, STATUS_PAUSED };
