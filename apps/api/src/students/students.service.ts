import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { Prisma, applications } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { candidateDocFileWhereOr } from '../common/candidate-doc';
import { StudentProfileService } from './student-profile.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { ListStudentsDto } from './dto/list-students.dto';
import {
  ApplicationStage,
  ListApplicationsDto,
} from './dto/list-applications.dto';
import { CheckDuplicateApplicationDto } from './dto/check-duplicate-application.dto';
import { normalizeIndianMobile } from './indian-mobile';
import { UpdateCredentialsDto } from './dto/update-credentials.dto';
import { UpsertFinanceDto } from './dto/finance.dto';
import { ListFinanceDto } from './dto/list-finance.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { AcademicGradesDto } from './dto/academic-grades.dto';
import { UpdateQualificationsDto } from './dto/update-qualifications.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { ApplicationCourseFeeDto } from './dto/application-course-fee.dto';
import { ApplicationAcademicDto } from './dto/application-academic.dto';
import { ListAcademicStudentsDto } from './dto/list-academic-students.dto';
import { UpdateAcademicStudentDto } from './dto/update-academic-student.dto';
import { CreateEnrolmentDto } from './dto/create-enrolment.dto';
import {
  assertApplicationReferences,
  changesProgramme,
} from './application-references';
import { AuditService } from '../workflow/audit.service';
import { StageEngineService } from '../workflow/stage-engine.service';
import { RecordAccessService, AccessUser, AccessScope } from '../workflow/record-access.service';
import {
  effectiveStage,
  effectiveStageWhere,
  stageNo,
  allowedActions,
  lmsPaidTo,
  lmsPaymentMode,
  Stage,
  STAGES,
} from '../workflow/stages';
import { istYear } from '../workflow/ist-date';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/** admission_status value for a dropped-out student (legacy dropout pipeline). */
const ADMISSION_STATUS_DROPOUT = 4;

/** role_id for students in the users table (legacy convention). */
const STUDENT_ROLE_ID = 4;

/**
 * students.admission_status (Int code) -> human label.
 *
 * Source of truth is the legacy admin_dashboard $map (0-indexed), ported in
 * DashboardService.ADMISSION_STATUS_LABELS, and the live seed
 * (database/ci-seed.sql seeds admission_status = 2 -> "Enrolled"). Wording is
 * normalised to the exact KPI-card labels the web client renders
 * (apps/web/src/lib/students-data.ts): "In Progress" / "Passed Out".
 */
const ADMISSION_STATUS_LABELS: Record<number, string> = {
  0: 'Pending',
  1: 'In Progress',
  2: 'Enrolled',
  3: 'Passed Out',
  4: 'Dropout',
  5: 'Cancelled',
};

/**
 * The KPI-card status keys, in display order. Drives the GET /students/stats
 * `by_status` breakdown so every card always has a (possibly zero) count.
 */
const ADMISSION_STATUS_ORDER = [
  'Pending',
  'In Progress',
  'Enrolled',
  'Passed Out',
  'Dropout',
  'Cancelled',
  // Rows whose admission_status is null or an unmapped code. Always present (at
  // 0 when clean) so the breakdown reconciles with `total` by construction;
  // clients should hide the bucket when it is zero.
  'Unknown',
] as const;

/** Maps an admission_status Int code to its human label ('Unknown' when unmapped). */
function admissionStatusLabel(code: number | null | undefined): string {
  if (code == null) return 'Unknown';
  return ADMISSION_STATUS_LABELS[code] ?? 'Unknown';
}

/**
 * Human status label for an admission *application* row (NOT a student row).
 *
 * The `applications` table has no Int pipeline code — `admission_status` is a
 * Boolean? flag and the catalog ci-seed never maps it, so the meaningful
 * lifecycle stage is derived from the application's own lifecycle columns,
 * matching the legacy App\Application list view ordering:
 *   - is_converted = 1            -> "Converted"   (already became a student)
 *   - is_archived  = true         -> "Archived"
 *   - status       = false        -> "Inactive"
 *   - otherwise                   -> "Active"      (open application)
 */
function applicationStatusLabel(application: {
  is_converted: number | null;
  is_archived: boolean;
  status: boolean | null;
}): string {
  if (application.is_converted === 1) return 'Converted';
  if (application.is_archived) return 'Archived';
  if (application.status === false) return 'Inactive';
  return 'Active';
}

/**
 * The Phase 1 application id: APP-YYYY-NNNNNN, e.g. APP-2026-000865.
 * YYYY is the creation year and NNNNNN the zero-padded application_id.
 */
function formatApplicationId(createdAt: Date, applicationId: number): string {
  return `APP-${createdAt.getFullYear()}-${String(applicationId).padStart(6, '0')}`;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days the application has been in its current stage. For NULL-stage legacy
 * rows (no stage_entered_at) it falls back to updated_at, then created_at.
 */
function daysInStage(row: {
  stage_entered_at: Date | null;
  updated_at: Date | null;
  created_at: Date | null;
}): number {
  const since = row.stage_entered_at ?? row.updated_at ?? row.created_at;
  if (!since) return 0;
  const diff = Date.now() - new Date(since).getTime();
  return diff > 0 ? Math.floor(diff / MS_PER_DAY) : 0;
}

/** bcrypt cost factor, matching the rest of the codebase. */
const BCRYPT_ROUNDS = 10;

/**
 * Port of CI4 App/Students + App/Application read/write CRUD.
 * Legacy uses manual timestamps and soft-delete (deleted_at IS NULL), both honoured here.
 */
@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profile: StudentProfileService,
    private readonly audit: AuditService,
    private readonly stageEngine: StageEngineService,
    private readonly access: RecordAccessService,
  ) {}

  // GET /students — paginate + optional filters.
  //   ?admission_status        — students.admission_status
  //   ?referred_by             — students.referred_by
  //   ?course_id / ?subject_id / ?teacher_id — enrolled students only.
  //
  // The enrolment filters resolve to a set of student *user ids* via the `enrol`
  // table (enrol.user_id = users.id = students.student_id). teacher_id is also
  // honoured through teachers_subjects.course_id (a teacher's assigned courses),
  // unioned with any direct enrol.teacher_id match. Ports the legacy
  // get_students_by_course_subject_teacher + university_enrolment filters.
  async listStudents(query: ListStudentsDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const enrolmentIds = await this.resolveEnrolmentStudentIds(query);
    const searchIds = await this.resolveSearchStudentIds(query.search);

    // Both narrow by student_id, so they must INTERSECT — letting one overwrite
    // the other would silently widen a filtered list.
    const studentIdFilter =
      enrolmentIds !== undefined && searchIds !== undefined
        ? enrolmentIds.filter((id) => searchIds.includes(id))
        : (enrolmentIds ?? searchIds);

    // A filter was requested but matched nothing -> empty page.
    if (studentIdFilter !== undefined && studentIdFilter.length === 0) {
      return {
        items: [],
        total: 0,
        page,
        limit,
        counts: this.emptyAdmissionStatusCounts(),
      };
    }

    const where = {
      deleted_at: null,
      ...(query.admission_status !== undefined
        ? { admission_status: query.admission_status }
        : {}),
      ...(query.referred_by !== undefined
        ? { referred_by: query.referred_by }
        : {}),
      ...(studentIdFilter !== undefined
        ? { student_id: { in: studentIdFilter } }
        : {}),
    };

    const [rows, total, counts] = await Promise.all([
      this.prisma.students.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.students.count({ where }),
      // Live KPI-card counts. Computed over the same filtered set (minus
      // pagination) so the cards reconcile with the rows the UI is showing.
      this.admissionStatusCounts(where),
    ]);

    const items = await this.decorateStudents(rows);

    return { items, total, page, limit, counts };
  }

  /**
   * Decorate raw `students` rows with their joined display fields, resolving every
   * related table in ONE bulk query each (no N+1):
   *   - name / email / phone / profile_picture <- users (students.student_id)
   *   - dial_code                              <- users.code (the phone's country code)
   *   - consultant_name                        <- users (students.consultant_id)
   *   - course_title + university_id           <- course (students.course_id), else
   *                                               users.university_id (the legacy
   *                                               profile joins the university there)
   *   - university_title                       <- university
   *   - specialisation_title                   <- specialisations (students.specialisation_id)
   *   - session_title                          <- sessions (students.session_id; PK is session_id)
   *   - admission_status_label                 <- ADMISSION_STATUS_LABELS
   *
   * The student-user and consultant ids both point at `users`, so they share a
   * single findMany. Returns plain objects (raw row + decorated fields); no
   * existing field is removed or renamed.
   */
  private async decorateStudents<
    T extends {
      student_id: number;
      consultant_id: number;
      course_id: number | null;
      specialisation_id: number | null;
      session_id: number | null;
      admission_status: number | null;
    },
  >(rows: T[]) {
    if (rows.length === 0) return [];

    // Collect the related id sets.
    const userIds = [
      ...new Set(
        rows.flatMap((r) => [r.student_id, r.consultant_id]),
      ),
    ];
    const courseIds = [
      ...new Set(
        rows.map((r) => r.course_id).filter((c): c is number => c != null),
      ),
    ];
    // sessions PK is session_id (NOT id), so the page's session ids come from
    // students.session_id and are looked up by sessions.session_id below.
    const sessionIds = [
      ...new Set(
        rows.map((r) => r.session_id).filter((s): s is number => s != null),
      ),
    ];

    const specialisationIds = [
      ...new Set(
        rows
          .map((r) => r.specialisation_id)
          .filter((s): s is number => s != null),
      ),
    ];

    // ONE bulk query per related table.
    const [users, courses, sessions, specialisations] = await Promise.all([
      userIds.length > 0
        ? this.prisma.users.findMany({
            where: { id: { in: userIds } },
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              code: true,
              university_id: true,
              profile_picture: true,
            },
          })
        : Promise.resolve([]),
      courseIds.length > 0
        ? this.prisma.course.findMany({
            where: { id: { in: courseIds } },
            select: { id: true, title: true, university_id: true },
          })
        : Promise.resolve([]),
      sessionIds.length > 0
        ? this.prisma.sessions.findMany({
            where: { session_id: { in: sessionIds } },
            select: { session_id: true, session_title: true },
          })
        : Promise.resolve([]),
      specialisationIds.length > 0
        ? this.prisma.specialisations.findMany({
            where: { id: { in: specialisationIds } },
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
    ]);

    // Resolve the universities referenced by the page's courses, or by the
    // student's own users.university_id (one more bulk query).
    const universityIds = [
      ...new Set(
        [
          ...courses.map((c) => c.university_id),
          ...users.map((u) => u.university_id),
        ].filter((u): u is number => u != null),
      ),
    ];
    const universities =
      universityIds.length > 0
        ? await this.prisma.university.findMany({
            where: { id: { in: universityIds } },
            select: { id: true, title: true },
          })
        : [];

    // Build id -> row Maps and merge.
    const userById = new Map(users.map((u) => [u.id, u]));
    const courseById = new Map(courses.map((c) => [c.id, c]));
    const universityTitleById = new Map(
      universities.map((u) => [u.id, u.title ?? null]),
    );
    const sessionTitleById = new Map(
      sessions.map((s) => [s.session_id, s.session_title ?? null]),
    );
    const specialisationTitleById = new Map(
      specialisations.map((s) => [s.id, s.title ?? null]),
    );

    return rows.map((row) => {
      const studentUser = userById.get(row.student_id);
      const consultant = userById.get(row.consultant_id);
      const course = row.course_id != null ? courseById.get(row.course_id) : undefined;
      const universityId =
        course?.university_id ?? studentUser?.university_id ?? null;

      return {
        ...row,
        name: studentUser?.name ?? null,
        email: studentUser?.email ?? null,
        phone: studentUser?.phone ?? null,
        dial_code: studentUser?.code ?? null,
        profile_picture: studentUser?.profile_picture ?? null,
        consultant_name: consultant?.name ?? null,
        course_title: course?.title ?? null,
        university_id: universityId,
        university_title:
          universityId != null
            ? (universityTitleById.get(universityId) ?? null)
            : null,
        session_title:
          row.session_id != null
            ? (sessionTitleById.get(row.session_id) ?? null)
            : null,
        specialisation_title:
          row.specialisation_id != null
            ? (specialisationTitleById.get(row.specialisation_id) ?? null)
            : null,
        admission_status_label: admissionStatusLabel(row.admission_status),
      };
    });
  }

  /**
   * Per-status counts for the given students where-clause, keyed by the exact
   * KPI-card labels (in display order) so every card has a count (0 when none).
   * One prisma groupBy over admission_status (no per-status round trips).
   */
  /** A zeroed counts object (total 0, every KPI label at 0) for empty pages. */
  private emptyAdmissionStatusCounts() {
    const byStatus: Record<string, number> = {};
    for (const label of ADMISSION_STATUS_ORDER) {
      byStatus[label] = 0;
    }
    return { total: 0, by_status: byStatus };
  }

  private async admissionStatusCounts(where: {
    deleted_at: null;
    admission_status?: number;
    referred_by?: number;
    student_id?: { in: number[] };
  }) {
    const groups = await this.prisma.students.groupBy({
      by: ['admission_status'],
      where,
      _count: { _all: true },
    });

    const byStatus: Record<string, number> = {};
    for (const label of ADMISSION_STATUS_ORDER) {
      byStatus[label] = 0;
    }
    let total = 0;
    for (const g of groups) {
      const n = g._count._all;
      total += n;
      // Every row lands in a bucket, so the cards always sum to `total`. Rows
      // whose admission_status is null or an unmapped code fold into 'Unknown'
      // rather than vanishing — previously they counted toward the total only,
      // which is why the cards added up to 1,526 against a total of 1,541 (QA ST03).
      const label = admissionStatusLabel(g.admission_status);
      byStatus[label] = (byStatus[label] ?? 0) + n;
    }

    return { total, by_status: byStatus };
  }

  /**
   * GET /students/stats — live KPI counters for the students list.
   * Returns { total, by_status: { Pending, "In Progress", Enrolled,
   * "Passed Out", Dropout, Cancelled } } via a single prisma groupBy over
   * admission_status across all non-deleted students.
   */
  async studentStats() {
    return this.admissionStatusCounts({ deleted_at: null });
  }

  /**
   * Resolve the course/subject/teacher enrolment filters to a list of student user
   * ids (which equal students.student_id). Returns `undefined` when no enrolment
   * filter was supplied (so the caller leaves student_id unconstrained), or a
   * possibly-empty id list otherwise.
   */
  /**
   * Resolve a free-text search to the set of `students.student_id` values it matches.
   *
   * A student's name, email and phone live on the linked `users` row, not on
   * `students`, so the text match runs there and comes back as a student_id set
   * the caller can intersect with its other filters. The printed id (`STU-1688`,
   * which is the student_id) is matched directly so a user can paste what they see.
   *
   * Returns undefined when no search was supplied — meaning "do not filter" —
   * which is deliberately different from an empty array, meaning "matched nothing".
   */
  private async resolveSearchStudentIds(
    search: string | undefined,
  ): Promise<number[] | undefined> {
    const term = search?.trim();
    if (!term) return undefined;

    const matched = await this.prisma.users.findMany({
      where: {
        deleted_at: null,
        OR: [
          { name: { contains: term } },
          { email: { contains: term } },
          { phone: { contains: term } },
        ],
      },
      select: { id: true },
    });

    const ids = new Set(matched.map((u) => u.id));

    // `STU-1688` / `1688` — the printed id is the student_id itself.
    const numeric = Number(term.replace(/^stu[-\s]*/i, ''));
    if (Number.isInteger(numeric) && numeric > 0) ids.add(numeric);

    return [...ids];
  }

  private async resolveEnrolmentStudentIds(
    query: ListStudentsDto,
  ): Promise<number[] | undefined> {
    const { course_id, subject_id, teacher_id } = query;
    if (
      course_id === undefined &&
      subject_id === undefined &&
      teacher_id === undefined
    ) {
      return undefined;
    }

    // teacher_id may also be expressed as "courses this teacher is assigned to"
    // via teachers_subjects. Union those course ids with an explicit course_id
    // filter (when both are present, the explicit course_id still applies via the
    // enrol where-clause below, so the union only broadens the teacher match).
    let teacherCourseIds: number[] | undefined;
    if (teacher_id !== undefined) {
      const links = await this.prisma.teachers_subjects.findMany({
        where: { user_id: teacher_id, deleted_at: null },
        select: { course_id: true },
      });
      teacherCourseIds = [
        ...new Set(
          links
            .map((l) => l.course_id)
            .filter((c): c is number => c != null),
        ),
      ];
    }

    const enrolments = await this.prisma.enrol.findMany({
      where: {
        deleted_at: null,
        ...(subject_id !== undefined ? { subject_id } : {}),
        ...(teacher_id !== undefined ? { teacher_id } : {}),
        ...(course_id !== undefined ? { course_id } : {}),
      },
      select: { user_id: true },
    });

    const ids = new Set(
      enrolments
        .map((e) => e.user_id)
        .filter((u): u is number => u != null),
    );

    // Fold in students enrolled in any course the teacher is assigned to.
    if (teacherCourseIds && teacherCourseIds.length > 0) {
      const byTeacherCourse = await this.prisma.enrol.findMany({
        where: {
          deleted_at: null,
          course_id: { in: teacherCourseIds },
          ...(subject_id !== undefined ? { subject_id } : {}),
        },
        select: { user_id: true },
      });
      for (const e of byTeacherCourse) {
        if (e.user_id != null) ids.add(e.user_id);
      }
    }

    return [...ids];
  }

  // GET /students/:id (bare row). Internal 404-guard for the ~15 callers that
  // only need the raw `students` columns; the route handler returns the
  // decorated detail via getStudentDetail() instead.
  async getStudent(id: number) {
    const student = await this.prisma.students.findFirst({
      where: { id, deleted_at: null },
    });
    if (!student) {
      throw new NotFoundException('Student not found!');
    }
    return student;
  }

  /**
   * GET /students/:id — the student row decorated with everything the detail
   * screen renders, resolved via MANUAL bulk joins (the schema has no Prisma
   * relations). A fixed set of bulk queries, never a per-row query (no N+1):
   *
   *   - name / email / phone / profile_picture <- users (students.student_id)
   *   - consultant_name                        <- users (students.consultant_id)
   *   - course_title + university_id/title     <- course -> university
   *   - admission_status_label                 <- student_status / ADMISSION_STATUS_LABELS
   *   - finance                                <- student_payments + course fee +
   *                                               invoice/payment (StudentProfileService)
   *   - application                            <- the linked application, or null
   *
   * The join fields reuse decorateStudents() (same single-row contract as the
   * list), then the invoice/payment finance block is layered on top. Every key is
   * additive: the row keeps its original `id` and all `students` columns, so the
   * { message:'Student fetched', data.id } contract the e2e asserts is preserved.
   */
  async getStudentDetail(id: number) {
    const student = await this.getStudent(id); // 404 if missing/soft-deleted

    // Reuse the list decoration (users + course + university bulk joins) so the
    // detail and list rows expose the exact same joined fields.
    const [decorated] = await this.decorateStudents([student]);

    // Prefer the data-driven student_status lookup for the label; fall back to
    // the inferred code map (decorated.admission_status_label) when unseeded.
    const admissionStatusLabel = await this.resolveAdmissionStatusLabel(
      student.admission_status ?? null,
      decorated.admission_status_label,
    );

    const [finance, application] = await Promise.all([
      this.profile.finance(student),
      this.profile.linkedApplication(student),
    ]);

    return {
      ...decorated,
      admission_status_label: admissionStatusLabel,
      finance,
      application,
    };
  }

  /** GET /students/:id/timeline — events built from the student's real records. */
  async getStudentTimeline(id: number) {
    const student = await this.getStudent(id);
    return this.profile.timeline(student);
  }

  /**
   * Resolves a students.admission_status Int code to a human label. The
   * authoritative source is the `student_status` lookup table (id -> title); when
   * a row is missing (the v2 DB has no seed yet) we fall back to the inferred
   * pipeline label already computed by decorateStudents().
   */
  private async resolveAdmissionStatusLabel(
    code: number | null,
    fallback: string,
  ): Promise<string> {
    if (code == null) return fallback;
    const row = await this.prisma.student_status.findFirst({
      where: { id: code, deleted_at: null },
      select: { title: true },
    });
    return row?.title ?? fallback;
  }

  // POST /students
  async createStudent(dto: CreateStudentDto) {
    const now = new Date();
    return this.prisma.students.create({
      data: {
        ...this.toStudentData(dto),
        // student_id, address and consultant_id are required (NOT NULL) columns.
        student_id: dto.student_id,
        address: dto.address,
        consultant_id: dto.consultant_id,
        created_at: now,
        updated_at: now,
      },
    });
  }

  // PATCH /students/:id
  //
  // The Students list's Edit dialog (QA ST04) sends only the fields the operator
  // changed. Every id it carries must point at a real row, a specialisation must
  // belong to the student's course, and the NOT NULL columns cannot be cleared —
  // otherwise a typo would save a dangling reference into a table the live LMS
  // reads. Moving a student to Dropout stamps users.drop_out_at exactly as
  // PATCH /students/:id/dropout does, so the two paths agree.
  async updateStudent(id: number, dto: UpdateStudentDto, actorUserId?: number) {
    const existing = await this.getStudent(id); // 404 if missing or already soft-deleted
    await this.assertStudentReferences(existing, dto);

    const now = new Date();
    const becomesDropout =
      dto.admission_status === ADMISSION_STATUS_DROPOUT &&
      existing.admission_status !== ADMISSION_STATUS_DROPOUT;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.students.update({
        where: { id },
        data: {
          ...this.toStudentData(dto),
          ...(actorUserId != null ? { updated_by: actorUserId } : {}),
          updated_at: now,
        },
      });
      if (becomesDropout) {
        await tx.users.updateMany({
          where: { id: existing.student_id },
          data: { drop_out_at: now, updated_at: now },
        });
      }
      return updated;
    });
  }

  /**
   * 400s when a PATCH /students/:id body would clear a NOT NULL column or point
   * at a row that does not exist. One query per referenced table, in parallel.
   */
  private async assertStudentReferences(
    existing: { course_id: number | null },
    dto: UpdateStudentDto,
  ) {
    const body = dto as Record<string, unknown>;
    for (const field of ['student_id', 'consultant_id', 'address'] as const) {
      if (body[field] === null) {
        throw new BadRequestException(`${field} cannot be cleared`);
      }
    }

    const [course, specialisation, session, consultant, user] =
      await Promise.all([
        dto.course_id != null
          ? this.prisma.course.findFirst({
              where: { id: dto.course_id, deleted_at: null },
              select: { id: true },
            })
          : null,
        dto.specialisation_id != null
          ? this.prisma.specialisations.findFirst({
              where: { id: dto.specialisation_id, deleted_at: null },
              select: { id: true, course_id: true },
            })
          : null,
        dto.session_id != null
          ? this.prisma.sessions.findFirst({
              where: { session_id: dto.session_id, deleted_at: null },
              select: { session_id: true },
            })
          : null,
        dto.consultant_id != null
          ? this.prisma.users.findFirst({
              where: { id: dto.consultant_id, deleted_at: null },
              select: { id: true },
            })
          : null,
        dto.student_id != null
          ? this.prisma.users.findFirst({
              where: { id: dto.student_id, deleted_at: null },
              select: { id: true },
            })
          : null,
      ]);

    if (dto.course_id != null && !course) {
      throw new BadRequestException(`Course ${dto.course_id} does not exist`);
    }
    if (dto.specialisation_id != null && !specialisation) {
      throw new BadRequestException(
        `Specialisation ${dto.specialisation_id} does not exist`,
      );
    }
    if (dto.session_id != null && !session) {
      throw new BadRequestException(`Session ${dto.session_id} does not exist`);
    }
    if (dto.consultant_id != null && !consultant) {
      throw new BadRequestException(
        `Counsellor ${dto.consultant_id} does not exist`,
      );
    }
    if (dto.student_id != null && !user) {
      throw new BadRequestException(`User ${dto.student_id} does not exist`);
    }

    // The course the student will be on after this save.
    const courseId =
      dto.course_id !== undefined ? dto.course_id : existing.course_id;
    if (
      specialisation?.course_id != null &&
      courseId != null &&
      specialisation.course_id !== courseId
    ) {
      throw new BadRequestException(
        'The specialisation does not belong to the selected course',
      );
    }
  }

  // DELETE /students/:id — soft delete (set deleted_at = now).
  async deleteStudent(id: number) {
    await this.getStudent(id);
    await this.prisma.students.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
    return { id };
  }

  // GET /students/:id/documents
  //
  // student_document.student_id holds the student's USERS id (legacy
  // document_add, convertApplication and POST /files/student-document all write
  // it), not the students PK this route takes. Matching the PK returned another
  // student's documents, or none (QA ST01). Rows uploaded with the linked
  // application before conversion are included too.
  async getStudentDocuments(id: number, user: AccessUser) {
    const student = await this.getStudent(id); // 404 if missing/soft-deleted

    // The rows carry stored file paths, so scope this read the SAME way as the other
    // document routes. When the student links to an application, the caller must be
    // able to VIEW that application; otherwise fall back to the student
    // record-access rule (owner/team/admin). 403 out of scope — never an unscoped
    // branch. The resolved link is reused so documents() does not re-resolve it.
    const linked = await this.profile.linkedApplication(student);
    if (linked) {
      await this.access.assertCanView(user, linked.application_id);
    } else {
      await this.access.assertCanViewStudent(user, student);
    }
    return this.profile.documents(student, linked);
  }

  // GET /students/:id/qualifications
  async getStudentQualifications(id: number) {
    const student = await this.getStudent(id);
    // NOTE: qualification.deleted_at is an Int? in the legacy schema (not a timestamp);
    // "not deleted" is still represented as NULL.
    // qualification.student_id is the USERS id, like student_document (QA ST01).
    return this.prisma.qualification.findMany({
      where: { student_id: student.student_id, deleted_at: null },
      orderBy: { qualification_id: 'desc' },
    });
  }

  // GET /applications — paginate.
  /**
   * Decorate raw `applications` rows with their joined display fields, resolving
   * every related table in ONE bulk query each (no N+1) — mirrors
   * decorateStudents()/AcademicsService knowledge_base:
   *   - applicant_name / applicant_email / applicant_phone <- users (applications.student_id)
   *     (falls back to the row's own name/email/phone, which the legacy form also
   *      stores directly on the application before conversion)
   *   - profile_picture                                    <- users / row.cropped_image
   *   - consultant_name / consultant_id                    <- users (pipeline_user ?? created_by)
   *   - course_title                                       <- course (applications.course_id)
   *   - university_id + university_title                   <- university (course.university_id,
   *                                                           else applications.university_id)
   *   - session_title (the intake / "Batch")               <- sessions (applications.session_id)
   *   - status_label                                       <- applicationStatusLabel()
   *
   * The applicant-user id and the consultant id both point at `users`, so they
   * share a single findMany. Existing fields are preserved; only new display
   * fields are added.
   *
   * NOTE: the `applications` model has no student_id column (the applicant is not
   * yet a user until conversion), so the applicant identity comes from the row
   * itself; the consultant is the pipeline_user (the assigned consultant),
   * falling back to created_by — exactly the ids the convert() saga uses.
   */
  private async decorateApplications<
    T extends {
      application_id: number;
      pipeline_user: number | null;
      created_by: number | null;
      course_id: number | null;
      university_id: number | null;
      session_id: number | null;
      name: string | null;
      email: string | null;
      phone: string | null;
      cropped_image: string | null;
      is_converted: number | null;
      is_archived: boolean;
      status: boolean | null;
      stage: string | null;
      stage_entered_at: Date | null;
      hold_at: Date | null;
      updated_at: Date | null;
      created_at: Date | null;
    },
  >(rows: T[]) {
    if (rows.length === 0) return [];

    // Resolve each application's consultant: the assigned pipeline_user, else
    // the creator (the convert() saga uses the same fallback for consultant_id).
    const consultantIdFor = (r: T): number | null =>
      r.pipeline_user ?? r.created_by ?? null;

    // Collect the related id sets.
    const userIds = [
      ...new Set(
        rows
          .map((r) => consultantIdFor(r))
          .filter((u): u is number => u != null),
      ),
    ];
    const courseIds = [
      ...new Set(
        rows.map((r) => r.course_id).filter((c): c is number => c != null),
      ),
    ];

    // sessions PK is session_id (NOT id); applications.session_id is the intake.
    const sessionIds = [
      ...new Set(
        rows.map((r) => r.session_id).filter((s): s is number => s != null),
      ),
    ];

    // ONE bulk query per related table.
    const [users, courses, sessions] = await Promise.all([
      userIds.length > 0
        ? this.prisma.users.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      courseIds.length > 0
        ? this.prisma.course.findMany({
            where: { id: { in: courseIds } },
            select: { id: true, title: true, university_id: true },
          })
        : Promise.resolve([]),
      sessionIds.length > 0
        ? this.prisma.sessions.findMany({
            where: { session_id: { in: sessionIds } },
            select: { session_id: true, session_title: true },
          })
        : Promise.resolve([]),
    ]);

    const courseById = new Map(courses.map((c) => [c.id, c]));

    // The university an application belongs to: its course's university, or —
    // when the course carries none (or no course is chosen yet) — the
    // application's own university_id, which Add Lead and PATCH /:id/academic
    // write. listApplications' university_id filter applies the same rule, so
    // filtering by a university returns exactly the rows that display it.
    const universityIdFor = (r: T): number | null => {
      const course = r.course_id != null ? courseById.get(r.course_id) : undefined;
      return course?.university_id ?? r.university_id ?? null;
    };

    // Resolve the universities referenced by the page (one more bulk query).
    const universityIds = [
      ...new Set(
        rows.map((r) => universityIdFor(r)).filter((u): u is number => u != null),
      ),
    ];
    const universities =
      universityIds.length > 0
        ? await this.prisma.university.findMany({
            where: { id: { in: universityIds } },
            select: { id: true, title: true },
          })
        : [];

    // Build id -> row Maps and merge.
    const userNameById = new Map(users.map((u) => [u.id, u.name ?? null]));
    const universityTitleById = new Map(
      universities.map((u) => [u.id, u.title ?? null]),
    );
    const sessionTitleById = new Map(
      sessions.map((s) => [s.session_id, s.session_title ?? null]),
    );

    return rows.map((row) => {
      const consultantId = consultantIdFor(row);
      const course = row.course_id != null ? courseById.get(row.course_id) : undefined;
      const universityId = universityIdFor(row);

      return {
        ...row,
        // Applicant identity (stored on the application row itself pre-conversion).
        applicant_name: row.name ?? null,
        applicant_email: row.email ?? null,
        applicant_phone: row.phone ?? null,
        profile_picture: row.cropped_image ?? null,
        // Assigned consultant / counsellor.
        consultant_id: consultantId,
        consultant_name:
          consultantId != null
            ? (userNameById.get(consultantId) ?? null)
            : null,
        // Resolved course + university titles (UI no longer shows raw #ids).
        course_title: course?.title ?? null,
        university_id: universityId,
        university_title:
          universityId != null
            ? (universityTitleById.get(universityId) ?? null)
            : null,
        // The intake ("Batch" column): sessions.session_title. The list used to
        // render enrollment_date here, which is why Batch showed a date (QA AP08).
        session_title:
          row.session_id != null
            ? (sessionTitleById.get(row.session_id) ?? null)
            : null,
        // Human lifecycle label.
        status_label: applicationStatusLabel(row),
        // Phase 1 stage engine (migration 002): the effective stage, its number
        // (1-7, 0 for the terminal rejected), whether it is on hold, and how long
        // it has sat in the current stage.
        stage: effectiveStage(row),
        stage_no: stageNo(effectiveStage(row)),
        stage_source: row.stage ? 'workflow' : 'legacy',
        on_hold: row.hold_at != null,
        days_in_stage: daysInStage(row),
      };
    });
  }

  /**
   * Build the OR clause for the applications free-text search.
   *
   * The list's visible id falls through custom_application_id -> enrollment_id ->
   * `APP-{application_id}` (see students.applications.index.tsx), so a search has
   * to cover all three or a counsellor typing the id they can see finds nothing.
   * A bare number, or one behind an `APP-` prefix, is also matched against the
   * primary key.
   */
  private applicationSearchFilter(search: string | undefined) {
    const term = search?.trim();
    if (!term) return undefined;

    const or: Prisma.applicationsWhereInput[] = [
      { name: { contains: term } },
      { email: { contains: term } },
      { phone: { contains: term } },
      { custom_application_id: { contains: term } },
      { enrollment_id: { contains: term } },
    ];

    const numeric = Number(term.replace(/^app[-\s]*/i, ''));
    if (Number.isInteger(numeric) && numeric > 0) {
      or.push({ application_id: numeric });
    }

    return { OR: or };
  }

  /**
   * Stage counts across the WHOLE filtered set, not just the page being returned.
   *
   * The list previously counted the ten rows on screen, so the pipeline cards read
   * "New Lead 8 (80%)" and changed on every page (QA AP06).
   *
   * Only three stages are derivable from the data today — an application row
   * carries just is_converted / is_archived / status, which is the same signal
   * `applicationStatusLabel` folds and the same mapping the client applies. The
   * remaining pipeline stages (Form Pending, Registration Fee Pending/Paid, Admin
   * Verification Pending) have no column behind them and are reported as 0 rather
   * than guessed; they arrive with the Phase 1 stage engine.
   */
  private async applicationStageCounts(
    where: Prisma.applicationsWhereInput,
  ): Promise<{ counts: Record<Stage, number>; on_hold: number }> {
    const groups = await this.prisma.applications.groupBy({
      by: ['stage', 'is_converted', 'is_archived', 'status'],
      where,
      _count: { _all: true },
    });

    const counts = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
    for (const g of groups) {
      const s = effectiveStage({
        stage: g.stage,
        is_converted: g.is_converted,
        is_archived: g.is_archived,
        status: g.status,
      });
      counts[s] += g._count._all;
    }

    // On Hold overlaps the stage cards (a held row keeps its stage), so it is a
    // sibling of `counts`, never summed into it.
    const on_hold = await this.prisma.applications.count({
      where: { AND: [where, { hold_at: { not: null } }] },
    });

    return { counts, on_hold };
  }

  /**
   * Where-clause for one pipeline stage — the same folding applicationStageCounts
   * applies, so filtering by a stage returns exactly the rows its card counts.
   *
   * NULL-safe on purpose: is_converted and status are nullable, and SQL's
   * `is_converted <> 1` is NOT true for a NULL, so "not converted" has to be
   * spelled as `IS NULL OR <> 1`.
   */
  private applicationStageFilter(
    stage: ApplicationStage | undefined,
  ): Prisma.applicationsWhereInput | undefined {
    if (!stage) return undefined;
    // NULL-safe effective-stage predicate, shared with the counts and the engine.
    return effectiveStageWhere(stage as Stage);
  }

  /**
   * Where-clause for the university the list DISPLAYS (see decorateApplications):
   * the course's university, or the application's own university_id when the
   * course has none or no course is chosen.
   */
  private async applicationUniversityFilter(
    universityId: number | undefined,
  ): Promise<Prisma.applicationsWhereInput | undefined> {
    if (universityId == null) return undefined;

    const [coursesOfUniversity, coursesWithAUniversity] = await Promise.all([
      this.prisma.course.findMany({
        where: { university_id: universityId },
        select: { id: true },
      }),
      this.prisma.course.findMany({
        where: { university_id: { not: null } },
        select: { id: true },
      }),
    ]);

    return {
      OR: [
        { course_id: { in: coursesOfUniversity.map((c) => c.id) } },
        {
          university_id: universityId,
          OR: [
            { course_id: null },
            { course_id: { notIn: coursesWithAUniversity.map((c) => c.id) } },
          ],
        },
      ],
    };
  }

  /**
   * Every list filter except `stage`. The stage counts are computed over this,
   * so the pipeline cards keep showing the whole funnel of the filtered set
   * while the table narrows to one stage.
   */
  /** The display-counsellor predicate: pipeline_user, else created_by. */
  private consultantFilter(ids: number[]): Prisma.applicationsWhereInput {
    return {
      OR: [
        { pipeline_user: { in: ids } },
        { pipeline_user: null, created_by: { in: ids } },
      ],
    };
  }

  /** users.id of every member of a team (users.team_id). */
  private async teamMemberIds(teamId: number): Promise<number[]> {
    const members = await this.prisma.users.findMany({
      where: { team_id: teamId, deleted_at: null },
      select: { id: true },
    });
    return members.map((m) => m.id);
  }

  /** users.id of the members and leaders of every team in a group. */
  private async groupMemberIds(groupId: number): Promise<number[]> {
    const teams = await this.prisma.sales_team.findMany({
      where: { group_id: groupId, deleted_at: null },
      select: { id: true, leader: true },
    });
    const teamIds = teams.map((t) => t.id);
    const leaderIds = teams
      .map((t) => Number(t.leader))
      .filter((n) => Number.isFinite(n) && n > 0);
    const members = teamIds.length
      ? await this.prisma.users.findMany({
          where: { team_id: { in: teamIds }, deleted_at: null },
          select: { id: true },
        })
      : [];
    return [...new Set([...members.map((m) => m.id), ...leaderIds])];
  }

  private async applicationListWhere(
    query: ListApplicationsDto,
    user: AccessUser,
  ): Promise<Prisma.applicationsWhereInput> {
    const and: Prisma.applicationsWhereInput[] = [];

    const search = this.applicationSearchFilter(query.search);
    if (search) and.push(search);

    const university = await this.applicationUniversityFilter(query.university_id);
    if (university) and.push(university);

    if (query.course_id != null) and.push({ course_id: query.course_id });
    if (query.session_id != null) and.push({ session_id: query.session_id });

    const counsellorId = query.consultant_id ?? query.counsellor_id;
    if (counsellorId != null) and.push(this.consultantFilter([counsellorId]));
    if (query.team_id != null) {
      and.push(this.consultantFilter(await this.teamMemberIds(query.team_id)));
    }
    if (query.group_id != null) {
      and.push(this.consultantFilter(await this.groupMemberIds(query.group_id)));
    }

    if (query.on_hold === 'true') and.push({ hold_at: { not: null } });
    if (query.followup_due === 'true') {
      and.push({ hold_at: { not: null }, hold_followup_date: { lte: new Date() } });
    }
    if (query.date_from) and.push({ created_at: { gte: new Date(query.date_from) } });
    if (query.date_to) and.push({ created_at: { lte: new Date(query.date_to) } });

    // Record access (QA AP04): rows are ANDed with the caller's scope. Admin /
    // Super Admin -> {} (no restriction); unknown roles -> matches nothing.
    const scope = await this.access.scopeFor(user);
    and.push(this.access.scopeWhere(scope));

    return { deleted_at: null, AND: and };
  }

  async listApplications(query: ListApplicationsDto, user: AccessUser) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const filtered = await this.applicationListWhere(query, user);
    const stage = this.applicationStageFilter(query.stage);
    const where: Prisma.applicationsWhereInput = stage
      ? { AND: [filtered, stage] }
      : filtered;

    const [rows, total, stageCounts] = await Promise.all([
      this.prisma.applications.findMany({
        where,
        skip,
        take: limit,
        orderBy: { application_id: 'desc' },
      }),
      this.prisma.applications.count({ where }),
      // Computed over the filtered set minus pagination AND minus the stage
      // filter, so every card shows its count for the current filters.
      this.applicationStageCounts(filtered),
    ]);

    const items = await this.decorateApplications(rows);

    return {
      items,
      total,
      page,
      limit,
      counts: stageCounts.counts,
      on_hold: stageCounts.on_hold,
    };
  }

  /**
   * GET /applications/check-duplicate — existing applications that share the
   * given mobile number or email (QA AP10, spec 4.2: show the existing
   * application and its counsellor instead of creating a second one).
   *
   * The phone is compared on its canonical 10 digits and matched by suffix, so a
   * row stored as "+919876543210" or "9876543210" is found for "98765 43210".
   * Email equality is case-insensitive under the table's collation. Soft-deleted
   * applications are ignored. At most 5 matches, newest first.
   */
  async findDuplicateApplications(query: CheckDuplicateApplicationDto) {
    const phone = this.duplicatePhoneKey(query.phone);
    const email = query.email?.trim() || null;

    const or: Prisma.applicationsWhereInput[] = [];
    if (phone) or.push({ phone: { endsWith: phone } });
    if (email) or.push({ email });
    if (or.length === 0) return { duplicate: false, matches: [] };

    const rows = await this.prisma.applications.findMany({
      where: {
        deleted_at: null,
        OR: or,
        ...(query.exclude_id != null
          ? { application_id: { not: query.exclude_id } }
          : {}),
      },
      orderBy: { application_id: 'desc' },
      take: 5,
    });

    const decorated = await this.decorateApplications(rows);
    const matches = decorated.map((r) => {
      const matchedOn: Array<'phone' | 'email'> = [];
      if (phone && this.duplicatePhoneKey(r.phone) === phone) matchedOn.push('phone');
      if (email && r.email != null && r.email.toLowerCase() === email.toLowerCase()) {
        matchedOn.push('email');
      }
      return {
        application_id: r.application_id,
        display_id: this.applicationDisplayId(r),
        name: r.name,
        phone: r.phone,
        email: r.email,
        matched_on: matchedOn,
        consultant_id: r.consultant_id,
        consultant_name: r.consultant_name,
        course_title: r.course_title,
        university_title: r.university_title,
        status_label: r.status_label,
        created_at: r.created_at,
      };
    });

    return { duplicate: matches.length > 0, matches };
  }

  /** The 10-digit key a phone is de-duplicated on, or null when too short to mean anything. */
  private duplicatePhoneKey(raw: string | null | undefined): string | null {
    const canonical = normalizeIndianMobile(raw);
    if (canonical) return canonical;
    const digits = (raw ?? '').replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : null;
  }

  /** The id the list prints: custom_application_id, else enrollment_id, else APP-{id}. */
  private applicationDisplayId(r: {
    application_id: number;
    custom_application_id: string | null;
    enrollment_id: string | null;
  }): string {
    if (r.custom_application_id?.trim()) return r.custom_application_id;
    if (r.enrollment_id?.trim()) return r.enrollment_id;
    return `APP-${r.application_id}`;
  }

  // GET /applications/:id
  async getApplication(applicationId: number) {
    const application = await this.prisma.applications.findFirst({
      where: { application_id: applicationId, deleted_at: null },
    });
    if (!application) {
      throw new NotFoundException('Application not found!');
    }
    return application;
  }

  /**
   * GET /applications/:id — the Summary payload: the decorated row plus the
   * effective stage, hold block, owner and the actions THIS user may take
   * (allowed_actions). Record access is enforced by ApplicationAccessGuard.
   */
  async getApplicationDetail(applicationId: number, user: AccessUser) {
    const application = await this.getApplication(applicationId);
    const [decorated] = await this.decorateApplications([application]);
    const scope = await this.access.scopeFor(user);
    const ctx = this.access.actorContext(scope, application);
    const actions = allowedActions(application, ctx);

    const holdLog = application.hold_at
      ? await this.prisma.application_stage_log.findFirst({
          where: { application_id: applicationId, event: 'hold' },
          orderBy: { id: 'desc' },
        })
      : null;

    return {
      ...decorated,
      effective_stage: decorated.stage,
      hold: application.hold_at
        ? {
            at: application.hold_at,
            followup_date: application.hold_followup_date,
            reason: holdLog?.reason ?? null,
            by: holdLog?.actor_id ?? null,
          }
        : null,
      owner: {
        consultant_id: decorated.consultant_id,
        consultant_name: decorated.consultant_name,
      },
      allowed_actions: actions,
    };
  }

  /**
   * Allocate the next gap-free STU-YYYY-NNNNNN inside the conversion transaction.
   * The INSERT ... ON DUPLICATE KEY UPDATE ... LAST_INSERT_ID() idiom serialises
   * concurrent conversions on the doc_sequence row lock (002 header). The counter
   * column is `last_no` on the committed schema, the aligned dev DB and production
   * (002's manual rename is applied), so it is used unconditionally — no
   * information_schema probe. It is a fixed identifier, never user input, so the raw
   * SQL is injection-free.
   */
  private async allocateStudentNo(tx: Prisma.TransactionClient): Promise<string> {
    const year = istYear();
    await tx.$executeRawUnsafe(
      'INSERT INTO doc_sequence (seq_key, seq_year, `last_no`, updated_at) ' +
        "VALUES ('STU', ?, LAST_INSERT_ID(1), UTC_TIMESTAMP()) " +
        'ON DUPLICATE KEY UPDATE `last_no` = LAST_INSERT_ID(`last_no` + 1), updated_at = UTC_TIMESTAMP()',
      year,
    );
    const rows = await tx.$queryRawUnsafe<Array<{ n: bigint }>>(
      'SELECT LAST_INSERT_ID() AS n',
    );
    const n = Number(rows[0]?.n ?? 0);
    return `STU-${year}-${String(n).padStart(6, '0')}`;
  }

  /**
   * Validate the application against the NARROWER LMS target columns BEFORE the
   * conversion transaction (002 header): users.name <= 100, users.email <= 50,
   * students.state <= 60, students.source <= 50, and students.application_id /
   * enrollment_id <= 50. Returns 400 naming the offending field so a counsellor
   * fixes it before approval, rather than the write failing mid-transaction.
   * (address is coerced to '' in runConversion — students.address is TEXT NOT
   * NULL — so a NULL address can never fail the write and needs no gate here.)
   */
  assertConvertible(application: applications): void {
    const limits: Array<[string, string | null, number]> = [
      ['name', application.name, 100],
      ['email', application.email, 50],
      ['state', application.state, 60],
      ['source', application.source, 50],
      ['custom_application_id', application.custom_application_id, 50],
      ['enrollment_id', application.enrollment_id, 50],
    ];
    for (const [field, value, max] of limits) {
      if (typeof value === 'string' && value.length > max) {
        throw new BadRequestException(
          `Cannot convert: ${field} is ${value.length} characters but the LMS stores at most ${max}. Shorten it and try again.`,
        );
      }
    }
  }

  /**
   * The application -> student conversion, run INSIDE the caller's transaction
   * (Student Affairs approval or the Super-Admin legacy convert). It is race-safe:
   * it first CLAIMS the row (updateMany WHERE not-converted; 0 rows -> 409), so two
   * concurrent approvals cannot create two students. The password is hashed by the
   * caller BEFORE the transaction, the STU number is allocated under the row lock,
   * the registration-fee ledger row is sourced from the verified application_payment
   * (mapped to the LMS vocabulary), and consultant_id = pipeline_user ?? created_by.
   */
  async runConversion(
    tx: Prisma.TransactionClient,
    application: applications,
    actor: { userId: number; roleId: number | null },
    opts: {
      hashedPassword: string;
      payment?: {
        amount: Prisma.Decimal | number;
        paid_on: Date;
        payment_mode: string;
        paid_to: string;
      } | null;
      event: 'converted' | 'legacy_convert';
      reason?: string | null;
      /**
       * Extra stage guard ANDed into the claim WHERE (CRITIQUE #4), so the claim
       * only wins while the application is still at the stage the caller verified
       * (sa_verification for SA approve; sa_verification or a NULL-stage row for
       * the legacy /convert). Combined with hold_at: null it makes a concurrent
       * send_back / hold beat a racing approve to 0 rows -> 409.
       */
      claimStageWhere?: Prisma.applicationsWhereInput;
    },
  ): Promise<{ user_id: number; student_id: number; student_no: string }> {
    const now = new Date();
    const fromStage = effectiveStage(application);

    // Claim the row first — the single point that serialises conversions. Guarded
    // by not-converted AND not-on-hold AND (when given) the caller's stage set, so
    // a concurrent send_back / hold / approve can never double-process (CRITIQUE #4).
    const claim = await tx.applications.updateMany({
      where: {
        AND: [
          { application_id: application.application_id, deleted_at: null },
          { OR: [{ is_converted: null }, { is_converted: { not: 1 } }] },
          { hold_at: null },
          ...(opts.claimStageWhere ? [opts.claimStageWhere] : []),
        ],
      },
      data: {
        is_converted: 1,
        converted_by: actor.userId,
        converted_at: now,
        stage: 'converted',
        stage_entered_at: now,
        updated_by: actor.userId,
        updated_at: now,
      },
    });
    if (claim.count === 0) {
      throw new ConflictException('Application is already converted!');
    }

    const studentNo = await this.allocateStudentNo(tx);

    // 1. users row (role_id = 4 student); password pre-hashed by the caller.
    const user = await tx.users.create({
      data: {
        name: application.name ?? null,
        email: application.email ?? null,
        code: application.code ?? null,
        phone: application.phone ?? null,
        university_id: application.university_id ?? null,
        gender: application.gender ?? null,
        country_id: application.country_id ?? null,
        profile_picture: application.cropped_image ?? null,
        dob: application.dob ?? null,
        role_id: STUDENT_ROLE_ID,
        status: 1,
        password: opts.hashedPassword,
        created_by: actor.userId,
        updated_by: actor.userId,
        created_at: now,
        updated_at: now,
      },
    });

    // 2. registration-fee ledger row, sourced from the verified payment when
    //    present (mapped to the LMS vocabulary), else the legacy columns.
    const p = opts.payment ?? null;
    await tx.student_payments.create({
      data: {
        installment_details: 'Registration Fee',
        amount: p ? Math.round(Number(p.amount)) : (application.amount ?? null),
        paid_date: p ? p.paid_on : (application.paid_date ?? null),
        payment_mode: p ? lmsPaymentMode(p.payment_mode) : (application.payment_mode ?? null),
        payment_to: p ? lmsPaidTo(p.paid_to) : (application.payment_to ?? null),
        status: 'Paid',
        student_id: user.id,
        created_by: application.created_by ?? actor.userId,
        created_at: application.created_at ?? now,
      },
    });

    // adm_pipeline / pipeline_user keep the legacy creator-role derivation.
    const CONSULTANT_ROLE_ID = 6;
    const CLIENT_ROLE_ID = 8;
    const creator = application.created_by
      ? await tx.users.findUnique({
          where: { id: application.created_by },
          select: { role_id: true },
        })
      : null;
    const creatorRoleId = creator?.role_id ?? null;
    let admPipeline = application.adm_pipeline ?? 'consultant';
    let pipelineUser = application.pipeline_user ?? null;
    if (creatorRoleId === CONSULTANT_ROLE_ID) {
      admPipeline = 'consultant';
      pipelineUser = pipelineUser ?? application.created_by ?? null;
    } else if (creatorRoleId === CLIENT_ROLE_ID) {
      admPipeline = 'client';
      pipelineUser = pipelineUser ?? application.created_by ?? null;
    }
    // CRITIQUE: the consultant is pipeline_user, else created_by.
    const consultantId =
      application.pipeline_user ?? application.created_by ?? actor.userId;

    const age = application.dob
      ? Math.floor(
          (now.getTime() - new Date(application.dob).getTime()) /
            (365.25 * 24 * 60 * 60 * 1000),
        )
      : null;

    // 3. students profile row (student_id = new user id), with the STU number.
    await tx.students.create({
      data: {
        student_id: user.id,
        age,
        enrollment_id: application.enrollment_id ?? null,
        application_id: application.custom_application_id ?? null,
        abc_id: application.abc_id ?? null,
        dob: application.dob ?? null,
        nationality: application.nationality ?? null,
        second_code:
          application.second_code != null ? String(application.second_code) : null,
        second_phone: application.second_phone ?? null,
        whatsapp_no: application.whatsapp_no ?? null,
        state: application.state ?? null,
        district: application.district ?? null,
        address: application.address ?? '',
        session_id: application.session_id ?? null,
        source: application.source ?? null,
        admission_status:
          application.admission_status != null
            ? Number(application.admission_status)
            : null,
        consultant_id: consultantId,
        specialisation_id: application.specialisation_id ?? null,
        course_id: application.course_id ?? null,
        enrollment_date: application.enrollment_date ?? null,
        referred_by: application.referred_by ?? application.created_by ?? null,
        adm_pipeline: admPipeline,
        pipeline_user: pipelineUser,
        student_no: studentNo,
        created_by: actor.userId,
        updated_by: actor.userId,
        created_at: now,
        updated_at: now,
      },
    });

    // 4 + 5. stamp the new student onto the application's qualification/document rows.
    await tx.qualification.updateMany({
      where: { application_id: application.application_id },
      data: { student_id: user.id, updated_at: now, updated_by: actor.userId },
    });
    // Only genuine application/student documents are stamped with the new
    // student id. A candidate (lead) document whose lead id happens to equal
    // this application_id must be left alone (its application_id is a lead id,
    // not an application id) — candidate-doc.ts, mirroring documents().
    await tx.student_document.updateMany({
      where: {
        application_id: application.application_id,
        OR: [{ file: null }, { NOT: { OR: candidateDocFileWhereOr() } }],
      },
      data: { student_id: user.id, updated_at: now, updated_by: actor.userId },
    });

    // Domain timeline + audit for the conversion.
    await this.stageEngine.logStageEvent(tx, {
      applicationId: application.application_id,
      event: opts.event,
      fromStage,
      toStage: 'converted',
      actor: { userId: actor.userId, roleId: actor.roleId, onBehalf: opts.event === 'legacy_convert' },
      reason: opts.reason ?? null,
      refTable: 'users',
      refId: user.id,
    });
    await this.audit.record(tx, {
      action: 'create',
      entity: 'students',
      entityId: user.id,
      applicationId: application.application_id,
      actorId: actor.userId,
      actorRoleId: actor.roleId,
      context: { student_no: studentNo },
    });

    return { user_id: user.id, student_id: user.id, student_no: studentNo };
  }

  /**
   * POST /applications/:id/convert — Super-Admin-only legacy direct conversion
   * (was open to any JWT). Allowed only for a NULL-stage legacy row or one at
   * sa_verification; everything else converts through Student Affairs approval.
   */
  async convertApplication(applicationId: number, user: AccessUser) {
    const application = await this.getApplication(applicationId);
    const actorUserId = Number(user.userId ?? user.id);
    const scope = await this.access.scopeFor(user);

    if (scope.roleKey !== 'super_admin') {
      throw new ForbiddenException('Only a Super Admin can convert directly.');
    }
    if (application.is_converted === 1) {
      throw new ConflictException('Application is already converted!');
    }
    const eff = effectiveStage(application);
    const eligible =
      (application.stage == null && eff === 'counsellor_review') ||
      eff === 'sa_verification';
    if (!eligible) {
      throw new BadRequestException(
        'This application must be converted through the Student Affairs approval flow.',
      );
    }

    // Validate the narrow LMS target widths BEFORE the transaction (CRITIQUE #10).
    this.assertConvertible(application);

    // Hash BEFORE the transaction. Source the fee from a verified payment if any.
    const hashedPassword = await bcrypt.hash(application.phone ?? '', BCRYPT_ROUNDS);
    const payment = await this.prisma.application_payment.findFirst({
      where: { application_id: applicationId, status: 'verified', deleted_at: null },
      orderBy: { id: 'desc' },
    });

    // Legacy /convert claim guard (CRITIQUE #4): still at sa_verification, OR a
    // NULL-stage active row (the only two states this override allows).
    const claimStageWhere: Prisma.applicationsWhereInput = {
      OR: [
        effectiveStageWhere('sa_verification'),
        { AND: [{ stage: null }, { is_archived: false }, { OR: [{ status: null }, { status: true }] }] },
      ],
    };

    return this.prisma.$transaction((tx) =>
      this.runConversion(
        tx,
        application,
        { userId: actorUserId, roleId: scope.roleId },
        { hashedPassword, payment, event: 'legacy_convert', claimStageWhere },
      ),
    );
  }

  // POST /students/:id/documents — document upload.
  // Legacy: file move + student_document insert.
  uploadDocument(_id: number): never {
    // TODO(phase-3): port document upload (file storage + student_document insert).
    throw new NotImplementedException('Document upload — phase 3');
  }

  // ===========================================================================
  // Student lifecycle: dropout + credentials
  // ===========================================================================

  /**
   * PATCH /students/:id/dropout — mark the student as dropped out.
   * Sets students.admission_status = 4 (dropout) and stamps drop_out_at = now on
   * the linked users row (drop_out_at lives on `users`, not `students`). Ports the
   * legacy drop_student flow, adapted to the dropout admission_status the task
   * specifies. 404 if the student is missing or soft-deleted.
   */
  async dropoutStudent(id: number) {
    const student = await this.getStudent(id); // 404 if missing/soft-deleted
    const now = new Date();

    const updated = await this.prisma.students.update({
      where: { id },
      data: { admission_status: ADMISSION_STATUS_DROPOUT, updated_at: now },
    });

    // drop_out_at is a users column; the student's user id is students.student_id.
    await this.prisma.users.updateMany({
      where: { id: student.student_id },
      data: { drop_out_at: now, updated_at: now },
    });

    return updated;
  }

  /**
   * PATCH /students/:id/credentials — update the student's login username + password.
   * Operates on the linked users row (students.student_id = users.id). Username must
   * be unique across other users (legacy duplicate check). Password is bcrypt-hashed
   * when supplied. Ports App/Students::ajax_edit_password.
   */
  async updateCredentials(id: number, dto: UpdateCredentialsDto) {
    const student = await this.getStudent(id); // 404 if missing/soft-deleted
    const userId = student.student_id;
    const now = new Date();

    // Reject a username already taken by a different user.
    const clash = await this.prisma.users.findFirst({
      where: { username: dto.username, id: { not: userId }, deleted_at: null },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException('Username Already Exists');
    }

    const passwordHash =
      dto.password !== undefined
        ? await bcrypt.hash(dto.password, BCRYPT_ROUNDS)
        : undefined;

    await this.prisma.users.update({
      where: { id: userId },
      data: {
        username: dto.username,
        ...(passwordHash !== undefined ? { password: passwordHash } : {}),
        updated_at: now,
      },
    });
    return { id, user_id: userId };
  }

  // ===========================================================================
  // Enrolled courses
  // ===========================================================================

  /**
   * GET /students/:id/enrolled-courses — the courses the student is enrolled in.
   * Resolves enrol rows for the student's user id (enrol.user_id), then loads the
   * distinct non-deleted courses. Ports App/Students::get_enrolled_courses.
   */
  async getEnrolledCourses(id: number) {
    const student = await this.getStudent(id);

    const enrolments = await this.prisma.enrol.findMany({
      where: { user_id: student.student_id, deleted_at: null },
      select: { course_id: true },
    });

    const courseIds = [
      ...new Set(
        enrolments
          .map((e) => e.course_id)
          .filter((c): c is number => c != null),
      ),
    ];
    if (courseIds.length === 0) {
      return [];
    }

    return this.prisma.course.findMany({
      where: { id: { in: courseIds }, deleted_at: null },
      orderBy: { id: 'asc' },
    });
  }

  // ===========================================================================
  // Student finance (finance.student_id = users.id)
  // ===========================================================================

  /**
   * GET /students/finance — students (role 4) joined to their finance row.
   * Ports App/Students::finance: optional date range on users.created_at and a
   * university_id filter. Paginated. Each item is the user row plus the finance
   * fields (null finance fields when the student has no finance row yet).
   *
   * Each item is additionally decorated with the student's enrolment display
   * names, resolved by bulk-fetching (no N+1) the related rows for the page:
   *   - course_title     <- course (students.course_id; students.student_id = user.id)
   *   - university_title <- university (course.university_id)
   *   - session_title    <- sessions (students.session_id; sessions PK is session_id)
   * These are null when the user has no students row (or the referenced row is
   * missing). No existing field is removed or renamed.
   */
  async listFinance(query: ListFinanceDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const userWhere = {
      role_id: STUDENT_ROLE_ID,
      deleted_at: null,
      ...(query.university_id !== undefined
        ? { university_id: query.university_id }
        : {}),
      ...(query.from_date && query.to_date
        ? {
            created_at: {
              gte: new Date(`${query.from_date}T00:00:00`),
              lte: new Date(`${query.to_date}T23:59:59`),
            },
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.users.findMany({
        where: userWhere,
        skip,
        take: limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.users.count({ where: userWhere }),
    ]);

    // Batch-load finance rows for the page (no N+1).
    const userIds = users.map((u) => u.id);
    const financeRows = userIds.length
      ? await this.prisma.finance.findMany({
          where: { student_id: { in: userIds }, deleted_at: null },
        })
      : [];
    const financeByStudent = new Map(
      financeRows.map((f) => [f.student_id, f]),
    );

    // Resolve each user's enrolment display names (course / university / session)
    // via their students row (students.student_id = users.id). One bulk findMany
    // per related table, keyed by id, then mapped onto the page (no N+1).
    const studentRows = userIds.length
      ? await this.prisma.students.findMany({
          where: { student_id: { in: userIds }, deleted_at: null },
          select: { student_id: true, course_id: true, session_id: true },
        })
      : [];
    const studentByUserId = new Map(
      studentRows.map((s) => [s.student_id, s]),
    );

    const financeCourseIds = [
      ...new Set(
        studentRows
          .map((s) => s.course_id)
          .filter((c): c is number => c != null),
      ),
    ];
    const financeSessionIds = [
      ...new Set(
        studentRows
          .map((s) => s.session_id)
          .filter((s): s is number => s != null),
      ),
    ];

    const [financeCourses, financeSessions] = await Promise.all([
      financeCourseIds.length > 0
        ? this.prisma.course.findMany({
            where: { id: { in: financeCourseIds } },
            select: { id: true, title: true, university_id: true },
          })
        : Promise.resolve([]),
      financeSessionIds.length > 0
        ? this.prisma.sessions.findMany({
            where: { session_id: { in: financeSessionIds } },
            select: { session_id: true, session_title: true },
          })
        : Promise.resolve([]),
    ]);

    const financeUniversityIds = [
      ...new Set(
        financeCourses
          .map((c) => c.university_id)
          .filter((u): u is number => u != null),
      ),
    ];
    const financeUniversities =
      financeUniversityIds.length > 0
        ? await this.prisma.university.findMany({
            where: { id: { in: financeUniversityIds } },
            select: { id: true, title: true },
          })
        : [];

    const financeCourseById = new Map(
      financeCourses.map((c) => [c.id, c]),
    );
    const financeUniversityTitleById = new Map(
      financeUniversities.map((u) => [u.id, u.title ?? null]),
    );
    const financeSessionTitleById = new Map(
      financeSessions.map((s) => [s.session_id, s.session_title ?? null]),
    );

    const items = users.map((u) => {
      const fin = financeByStudent.get(u.id);
      const studentRow = studentByUserId.get(u.id);
      const course =
        studentRow?.course_id != null
          ? financeCourseById.get(studentRow.course_id)
          : undefined;
      const courseUniversityId = course?.university_id ?? null;
      return {
        ...u,
        finance_id: fin?.id ?? null,
        tuitionFees: fin?.tuitionFees ?? null,
        examFees: fin?.examFees ?? null,
        miscFees: fin?.miscFees ?? null,
        scholarship_details: fin?.scholarship_details ?? null,
        payment_status: fin?.payment_status ?? null,
        course_title: course?.title ?? null,
        university_title:
          courseUniversityId != null
            ? (financeUniversityTitleById.get(courseUniversityId) ?? null)
            : null,
        session_title:
          studentRow?.session_id != null
            ? (financeSessionTitleById.get(studentRow.session_id) ?? null)
            : null,
      };
    });

    return { items, total, page, limit };
  }

  /**
   * GET /students/finance-summary — aggregate fee totals across all students'
   * finance rows, plus the per-payment-status breakdown. A lightweight companion
   * to the finance list (the legacy UI rendered these counters above the table).
   */
  async financeSummary() {
    const rows = await this.prisma.finance.findMany({
      where: { deleted_at: null },
      select: {
        tuitionFees: true,
        examFees: true,
        miscFees: true,
        payment_status: true,
      },
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.tuitionFees += r.tuitionFees ?? 0;
        acc.examFees += r.examFees ?? 0;
        acc.miscFees += r.miscFees ?? 0;
        return acc;
      },
      { tuitionFees: 0, examFees: 0, miscFees: 0 },
    );

    const byPaymentStatus: Record<string, number> = {};
    for (const r of rows) {
      const key = r.payment_status ?? 'Unknown';
      byPaymentStatus[key] = (byPaymentStatus[key] ?? 0) + 1;
    }

    return {
      count: rows.length,
      totals: {
        ...totals,
        grandTotal: totals.tuitionFees + totals.examFees + totals.miscFees,
      },
      byPaymentStatus,
    };
  }

  /**
   * POST /students/:id/finance — create the student's finance row.
   * finance.student_id is the student's user id (= students.student_id). Ports
   * App/Students::finance_add. 404 if the student is missing/soft-deleted.
   */
  async createFinance(id: number, dto: UpsertFinanceDto) {
    const student = await this.getStudent(id);
    const now = new Date();
    return this.prisma.finance.create({
      data: {
        student_id: student.student_id,
        tuitionFees: dto.tuitionFees ?? null,
        examFees: dto.examFees ?? null,
        miscFees: dto.miscFees ?? null,
        scholarship_details: dto.scholarship_details ?? null,
        payment_status: dto.payment_status ?? null,
        created_at: now,
      },
    });
  }

  /**
   * PATCH /students/:id/finance — update the student's finance row.
   * Updates the most recent non-deleted finance row for the student's user id.
   * Ports App/Students::finance_edit. 404 if the student or its finance row is
   * missing.
   */
  async updateFinance(id: number, dto: UpsertFinanceDto) {
    const student = await this.getStudent(id);
    const existing = await this.prisma.finance.findFirst({
      where: { student_id: student.student_id, deleted_at: null },
      orderBy: { id: 'desc' },
    });
    if (!existing) {
      throw new NotFoundException('Finance record not found!');
    }

    return this.prisma.finance.update({
      where: { id: existing.id },
      data: {
        ...(dto.tuitionFees !== undefined
          ? { tuitionFees: dto.tuitionFees }
          : {}),
        ...(dto.examFees !== undefined ? { examFees: dto.examFees } : {}),
        ...(dto.miscFees !== undefined ? { miscFees: dto.miscFees } : {}),
        ...(dto.scholarship_details !== undefined
          ? { scholarship_details: dto.scholarship_details }
          : {}),
        ...(dto.payment_status !== undefined
          ? { payment_status: dto.payment_status }
          : {}),
        updated_at: new Date(),
      },
    });
  }

  // ===========================================================================
  // Student documents (update / delete by document id)
  // ===========================================================================

  /** Loads a non-deleted student_document by id, or 404s. */
  private async getDocumentOr404(documentId: number) {
    const doc = await this.prisma.student_document.findFirst({
      where: { student_document_id: documentId, deleted_at: null },
    });
    if (!doc) {
      throw new NotFoundException('Document not found!');
    }
    return doc;
  }

  /**
   * PATCH /students/documents/:id — update a student_document's label.
   * Ports App/Students::document_edit.
   *
   * CRITIQUE #1 (twin of PATCH /applications/documents/:id): the route param is the
   * DOCUMENT id, so no per-row ApplicationAccessGuard applies. Resolve the owning
   * application and run the SAME record-access check (403 out of scope / 404 when it
   * cannot be resolved). The client-supplied `file` path is IGNORED: only metadata
   * (label) changes here; the stored file is written by the upload path, never by a
   * free-form body field.
   */
  async updateDocument(documentId: number, dto: UpdateDocumentDto, user: AccessUser) {
    const doc = await this.getDocumentOr404(documentId);

    // Discriminator-aware record access shared with the files/candidates document
    // routes: a candidate (lead) doc is scoped through its lead and an
    // application/student doc through its application, so the overloaded
    // application_id is never mistreated as the wrong id-space (candidate-doc.ts).
    await this.access.assertCanAccessDocumentRow(user, doc);

    return this.prisma.student_document.update({
      where: { student_document_id: documentId },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        updated_by: Number(user.userId ?? user.id),
        updated_at: new Date(),
      },
    });
  }

  /**
   * DELETE /students/documents/:id — soft-delete a student_document.
   * Ports App/Students::document_delete (the legacy model soft-deletes).
   *
   * CRITIQUE #1: same ownership resolution + record-access check as updateDocument,
   * so a counsellor or Student token cannot delete another owner's document.
   */
  async deleteDocument(documentId: number, user: AccessUser) {
    const doc = await this.getDocumentOr404(documentId);

    // Discriminator-aware record access shared with the files/candidates document
    // routes: a candidate (lead) doc is scoped through its lead and an
    // application/student doc through its application, so the overloaded
    // application_id is never mistreated as the wrong id-space (candidate-doc.ts).
    await this.access.assertCanAccessDocumentRow(user, doc);

    await this.prisma.student_document.update({
      where: { student_document_id: documentId },
      data: { deleted_at: new Date(), deleted_by: Number(user.userId ?? user.id) },
    });
    return { student_document_id: documentId };
  }

  // ===========================================================================
  // Legacy JSON academic columns on `students`
  // ===========================================================================

  /** Parses a legacy JSON LongText column, tolerating null / malformed values. */
  private parseJsonColumn(raw: string | null): unknown {
    if (raw == null || raw === '') return null;
    try {
      return JSON.parse(raw);
    } catch {
      // Legacy data is not always valid JSON; surface the raw string rather than
      // throwing so reads never 500 on dirty rows.
      return raw;
    }
  }

  /**
   * GET /students/:id/academic-grades — the parsed JSON progress columns.
   * Reads the legacy LongText columns (courses/course_status/attendance/
   * midtermGrades/finalGrades/paymentStatus) and JSON-parses each.
   */
  async getAcademicGrades(id: number) {
    const student = await this.getStudent(id);
    return {
      courses: this.parseJsonColumn(student.courses),
      course_status: this.parseJsonColumn(student.course_status),
      attendance: this.parseJsonColumn(student.attendance),
      midtermGrades: this.parseJsonColumn(student.midtermGrades),
      finalGrades: this.parseJsonColumn(student.finalGrades),
      paymentStatus: this.parseJsonColumn(student.paymentStatus),
    };
  }

  /**
   * PATCH /students/:id/academic-grades — persist the JSON progress columns.
   * Only the supplied fields are written; each is JSON-stringified into its
   * LongText column.
   */
  async updateAcademicGrades(id: number, dto: AcademicGradesDto) {
    await this.getStudent(id);

    const stringify = (v: unknown) =>
      typeof v === 'string' ? v : JSON.stringify(v);

    await this.prisma.students.update({
      where: { id },
      data: {
        ...(dto.courses !== undefined
          ? { courses: stringify(dto.courses) }
          : {}),
        ...(dto.course_status !== undefined
          ? { course_status: stringify(dto.course_status) }
          : {}),
        ...(dto.attendance !== undefined
          ? { attendance: stringify(dto.attendance) }
          : {}),
        ...(dto.midtermGrades !== undefined
          ? { midtermGrades: stringify(dto.midtermGrades) }
          : {}),
        ...(dto.finalGrades !== undefined
          ? { finalGrades: stringify(dto.finalGrades) }
          : {}),
        ...(dto.paymentStatus !== undefined
          ? { paymentStatus: stringify(dto.paymentStatus) }
          : {}),
        updated_at: new Date(),
      },
    });
    return this.getAcademicGrades(id);
  }

  /**
   * GET /students/:id/courses — the parsed legacy students.courses JSON column.
   * A focused companion to academic-grades for the courses list specifically.
   */
  async getStudentCourses(id: number) {
    const student = await this.getStudent(id);
    return { courses: this.parseJsonColumn(student.courses) };
  }

  // ===========================================================================
  // Student qualifications (bulk update / nullify one level)
  // ===========================================================================

  /**
   * PATCH /students/:id/qualifications — bulk-update the student's qualification
   * rows. Each row is matched by its `qualification` label (10th/12th/Degree) and
   * updated in place. qualification.student_id is the student's USERS id, so it
   * is matched against students.student_id — matching the route's students PK
   * wrote onto ANOTHER student's rows. Ports App/Academic::edit_qualification.
   */
  async updateStudentQualifications(id: number, dto: UpdateQualificationsDto) {
    const student = await this.getStudent(id);
    const now = new Date();

    const results: Array<{ qualification: string; updated: number }> = [];
    for (const row of dto.qualifications) {
      const updated = await this.prisma.qualification.updateMany({
        where: {
          student_id: student.student_id,
          qualification: row.qualification,
          deleted_at: null,
        },
        data: {
          ...(row.board !== undefined ? { board: row.board } : {}),
          ...(row.percentage !== undefined
            ? { percentage: row.percentage }
            : {}),
          ...(row.certificate !== undefined
            ? { certificate: row.certificate }
            : {}),
          ...(row.marksheet !== undefined ? { marksheet: row.marksheet } : {}),
          updated_at: now,
        },
      });
      results.push({ qualification: row.qualification, updated: updated.count });
    }

    return { results };
  }

  /**
   * DELETE /students/:id/qualifications/:qual — nullify a single qualification
   * level's details (board/percentage/certificate/marksheet) without removing the
   * row. Ports App/Academic::delete_qualification (a soft "clear", not a delete).
   */
  async clearStudentQualification(id: number, qualification: string) {
    const student = await this.getStudent(id);
    const result = await this.prisma.qualification.updateMany({
      // The USERS id, as in updateStudentQualifications.
      where: { student_id: student.student_id, qualification, deleted_at: null },
      data: {
        board: null,
        percentage: null,
        certificate: null,
        marksheet: null,
        updated_at: new Date(),
      },
    });
    if (result.count === 0) {
      throw new NotFoundException('Qualification not found!');
    }
    return { qualification, cleared: result.count };
  }

  // ===========================================================================
  // Academic students surface (GET/PATCH /academic/students)
  // ===========================================================================

  /**
   * GET /academic/students — list students (role 4) with their enrollment_id /
   * application_id / admission_status. Optional admission_status and university_id
   * filters. Ports App/Academic::index. Paginated.
   */
  async listAcademicStudents(query: ListAcademicStudentsDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    // university_id lives on the users table; resolve matching student user ids first.
    let universityStudentIds: number[] | undefined;
    if (query.university_id !== undefined) {
      const users = await this.prisma.users.findMany({
        where: {
          role_id: STUDENT_ROLE_ID,
          university_id: query.university_id,
          deleted_at: null,
        },
        select: { id: true },
      });
      universityStudentIds = users.map((u) => u.id);
      if (universityStudentIds.length === 0) {
        return { items: [], total: 0, page, limit };
      }
    }

    const where = {
      deleted_at: null,
      ...(query.admission_status !== undefined
        ? { admission_status: query.admission_status }
        : {}),
      ...(universityStudentIds !== undefined
        ? { student_id: { in: universityStudentIds } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.students.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'desc' },
        select: {
          id: true,
          student_id: true,
          enrollment_id: true,
          application_id: true,
          admission_status: true,
          consultant_id: true,
          course_id: true,
        },
      }),
      this.prisma.students.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * GET /academic/students/:id — the academic view of one student.
   * :id is the student's user id (students.student_id = users.id), matching the
   * legacy route. 404 if not found / soft-deleted.
   */
  async getAcademicStudent(userId: number) {
    const student = await this.prisma.students.findFirst({
      where: { student_id: userId, deleted_at: null },
    });
    if (!student) {
      throw new NotFoundException('Student not found!');
    }
    return student;
  }

  /**
   * PATCH /academic/students/:id — update a student's academic fields.
   * :id is the student's user id. Updates the `students` row (academic fields) and,
   * when supplied, users.university_id. Ports App/Academic::edit.
   */
  async updateAcademicStudent(userId: number, dto: UpdateAcademicStudentDto) {
    const student = await this.getAcademicStudent(userId);
    const now = new Date();
    const { university_id, ...studentFields } = dto;

    if (university_id !== undefined) {
      await this.prisma.users.updateMany({
        where: { id: userId },
        data: { university_id, updated_at: now },
      });
    }

    return this.prisma.students.update({
      where: { id: student.id },
      data: { ...studentFields, updated_at: now },
    });
  }

  // ===========================================================================
  // Applications: create + edit steps + qualifications + delete + document edit
  // ===========================================================================

  /**
   * POST /applications — create an application and seed 3 default qualification
   * rows (10th / 12th / Degree). Ports App/Application::add (bio step + qualification
   * seeding). Document seeding (Signature/Aadhar/Photo) is intentionally left to the
   * document-upload surface.
   */
  async createApplication(dto: CreateApplicationDto, actorUserId: number) {
    const now = new Date();
    const { dob, enrollment_date, ...rest } = dto;

    // Spec 4.2 / QA AP10: one applicant, one application. If the mobile or email
    // is already on an application, refuse and name it (and its counsellor) so
    // the counsellor can open that record instead. The Add Lead dialog runs the
    // same lookup first via GET /applications/check-duplicate; this is the
    // server-side guarantee behind it.
    const existing = await this.findDuplicateApplications({
      phone: dto.phone,
      email: dto.email,
    });
    if (existing.duplicate) {
      throw new ConflictException(this.duplicateMessage(existing.matches[0]));
    }
    await assertApplicationReferences(this.prisma, dto, null);

    // The creator's fresh role, for the 'created' stage-log actor (CRITIQUE #3).
    const creatorScope = await this.access.scopeFor({ userId: actorUserId });

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.applications.create({
        data: {
          ...rest,
          ...(dob !== undefined ? { dob: new Date(dob) } : {}),
          ...(enrollment_date !== undefined
            ? { enrollment_date: new Date(enrollment_date) }
            : {}),
          // Keep the canonical mobile in sync on every write of phone (migration 002).
          ...(dto.phone !== undefined
            ? { phone_normalized: normalizeIndianMobile(dto.phone) }
            : {}),
          is_converted: 0,
          is_archived: false,
          // CRITIQUE #3: a new lead enters the workflow at stage 1 (lead_added), so
          // stages 1-2 are reachable. Legacy/LMS rows stay NULL and derive their
          // stage. The 'created' stage-log row below is the timeline's first entry.
          stage: 'lead_added',
          stage_entered_at: now,
          created_by: actorUserId,
          created_at: now,
        },
      });

      // The Phase 1 application id, APP-YYYY-NNNNNN, issued by the server. NNNNNN
      // is the auto-increment primary key, so it is unique, in creation order and
      // race-free without a counter table; it does not restart each year.
      const application = await tx.applications.update({
        where: { application_id: created.application_id },
        data: {
          custom_application_id: formatApplicationId(now, created.application_id),
        },
      });

      // Seed the three default qualification levels for this application.
      const DEFAULT_QUALIFICATIONS = ['10th', '12th', 'Degree'];
      await tx.qualification.createMany({
        data: DEFAULT_QUALIFICATIONS.map((qualification) => ({
          // student_id is NOT NULL in the schema; 0 marks "not yet a student"
          // (gets stamped with the real user id at conversion time).
          student_id: 0,
          application_id: application.application_id,
          qualification,
          created_by: actorUserId,
          created_at: now,
        })),
      });

      // Record the lead's creation on the stage timeline (actor = creator).
      await this.stageEngine.logStageEvent(tx, {
        applicationId: application.application_id,
        event: 'created',
        fromStage: null,
        toStage: 'lead_added',
        actor: { userId: actorUserId, roleId: creatorScope.roleId },
      });

      return application;
    });
  }

  /** The 409 message for a duplicate lead: which application, whose, matched on what. */
  private duplicateMessage(match: {
    display_id: string;
    name: string | null;
    consultant_name: string | null;
    matched_on: Array<'phone' | 'email'>;
  }): string {
    const on = match.matched_on.includes('phone') ? 'mobile number' : 'email';
    const counsellor = match.consultant_name ?? 'no counsellor assigned';
    return `An application with this ${on} already exists: ${match.display_id} (${match.name ?? 'unnamed'}, ${counsellor}).`;
  }

  /**
   * Lockdown for the legacy edit routes: a generic edit is allowed only while the
   * application is at lead_added / form_pending, or for an Admin / Super Admin (who
   * may act at any stage). Past that, fields change through /corrections or the
   * stage actions. Returns the caller's scope so the handler can audit with the
   * fresh role. `adminOnly` restricts the route to Admin / Super Admin outright.
   */
  private async assertEditableStage(
    application: applications,
    user: AccessUser,
    opts: { adminOnly?: boolean } = {},
  ): Promise<AccessScope> {
    const scope = await this.access.scopeFor(user);
    if (scope.scope === 'all') return scope; // Admin / Super Admin bypass.
    if (opts.adminOnly) {
      throw new ForbiddenException('Only an administrator can perform this action.');
    }
    const eff = effectiveStage(application);
    if (eff !== 'lead_added' && eff !== 'form_pending') {
      throw new ForbiddenException(
        'This application can no longer be edited directly; use corrections or the stage actions.',
      );
    }
    return scope;
  }

  /**
   * PATCH /applications/:id — generic bio/contact update, locked to the early
   * stages (or Admin). Every changed field is audited.
   */
  async updateApplication(
    applicationId: number,
    dto: UpdateApplicationDto,
    user: AccessUser,
  ) {
    const before = await this.getApplication(applicationId);
    const scope = await this.assertEditableStage(before, user);
    const actorUserId = Number(user.userId ?? user.id);

    // Changing the mobile/email onto another application's is the same duplicate
    // the create path refuses (QA AP10). The row being edited is not its own match.
    if (dto.phone !== undefined || dto.email !== undefined) {
      const existing = await this.findDuplicateApplications({
        phone: dto.phone,
        email: dto.email,
        exclude_id: applicationId,
      });
      if (existing.duplicate) {
        throw new ConflictException(this.duplicateMessage(existing.matches[0]));
      }
    }

    const { dob, enrollment_date, ...rest } = dto;
    const changes = this.audit.diff(
      before as unknown as Record<string, unknown>,
      dto as unknown as Record<string, unknown>,
      Object.keys(dto),
      ['dob', 'enrollment_date'],
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.applications.update({
        where: { application_id: applicationId },
        data: {
          ...rest,
          ...(dob !== undefined ? { dob: new Date(dob) } : {}),
          ...(enrollment_date !== undefined
            ? { enrollment_date: new Date(enrollment_date) }
            : {}),
          ...(dto.phone !== undefined
            ? { phone_normalized: normalizeIndianMobile(dto.phone) }
            : {}),
          updated_by: actorUserId,
          updated_at: new Date(),
        },
      });
      await this.audit.recordFieldChanges(
        tx,
        {
          action: 'update',
          entity: 'applications',
          entityId: applicationId,
          applicationId,
          actorId: actorUserId,
          actorRoleId: scope.roleId,
        },
        changes,
      );
      return updated;
    });
  }

  /**
   * PATCH /applications/:id/course-fee — Admin only now, since the registration
   * fee goes through /payments. Ports App/Application::edit_course_fee.
   */
  async updateApplicationCourseFee(
    applicationId: number,
    dto: ApplicationCourseFeeDto,
    user: AccessUser,
  ) {
    const existing = await this.getApplication(applicationId);
    const scope = await this.assertEditableStage(existing, user, { adminOnly: true });
    const actorUserId = Number(user.userId ?? user.id);
    const { paid_date, ...rest } = dto;
    const updated = await this.prisma.applications.update({
      where: { application_id: applicationId },
      data: {
        ...rest,
        ...(paid_date !== undefined ? { paid_date: new Date(paid_date) } : {}),
        updated_by: actorUserId,
        updated_at: new Date(),
      },
    });
    await this.audit.record(this.prisma, {
      action: 'update',
      entity: 'applications',
      entityId: applicationId,
      applicationId,
      field: 'course_fee',
      actorId: actorUserId,
      actorRoleId: scope.roleId,
      context: { ...dto },
    });
    return updated;
  }

  /**
   * PATCH /applications/:id/academic — update the academic/admission fields,
   * locked to the early stages (or Admin). admission_status resets only when the
   * programme (university/course) really changes.
   */
  async updateApplicationAcademic(
    applicationId: number,
    dto: ApplicationAcademicDto,
    user: AccessUser,
  ) {
    const existing = await this.getApplication(applicationId);
    const scope = await this.assertEditableStage(existing, user);
    const actorUserId = Number(user.userId ?? user.id);
    await assertApplicationReferences(this.prisma, dto, existing);
    const changes = this.audit.diff(
      existing as unknown as Record<string, unknown>,
      dto as unknown as Record<string, unknown>,
      Object.keys(dto),
    );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.applications.update({
        where: { application_id: applicationId },
        data: {
          ...dto,
          ...(changesProgramme(dto, existing) ? { admission_status: false } : {}),
          updated_by: actorUserId,
          updated_at: new Date(),
        },
      });
      await this.audit.recordFieldChanges(
        tx,
        {
          action: 'update',
          entity: 'applications',
          entityId: applicationId,
          applicationId,
          actorId: actorUserId,
          actorRoleId: scope.roleId,
        },
        changes,
      );
      return updated;
    });
  }

  /**
   * PATCH /applications/:id/qualifications — bulk-update the application's
   * qualification rows, matched by `qualification` label, locked to the early
   * stages (or Admin). Ports App/Application::edit_qualification.
   */
  async updateApplicationQualifications(
    applicationId: number,
    dto: UpdateQualificationsDto,
    user: AccessUser,
  ) {
    const existing = await this.getApplication(applicationId);
    await this.assertEditableStage(existing, user);
    const actorUserId = Number(user.userId ?? user.id);
    const now = new Date();

    const results: Array<{ qualification: string; updated: number }> = [];
    for (const row of dto.qualifications) {
      const updated = await this.prisma.qualification.updateMany({
        where: {
          application_id: applicationId,
          qualification: row.qualification,
          deleted_at: null,
        },
        data: {
          ...(row.board !== undefined ? { board: row.board } : {}),
          ...(row.percentage !== undefined
            ? { percentage: row.percentage }
            : {}),
          ...(row.certificate !== undefined
            ? { certificate: row.certificate }
            : {}),
          ...(row.marksheet !== undefined ? { marksheet: row.marksheet } : {}),
          updated_at: now,
          updated_by: actorUserId,
        },
      });
      results.push({ qualification: row.qualification, updated: updated.count });
    }

    return { results };
  }

  /**
   * DELETE /applications/:id — Admin-only SOFT delete now (was a hard delete).
   * Sets deleted_at/deleted_by and audits it; 404 if missing/already deleted.
   */
  async deleteApplication(applicationId: number, user: AccessUser) {
    const existing = await this.getApplication(applicationId);
    const scope = await this.assertEditableStage(existing, user, { adminOnly: true });
    const actorUserId = Number(user.userId ?? user.id);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.applications.update({
        where: { application_id: applicationId },
        data: { deleted_at: now, deleted_by: actorUserId, updated_at: now },
      });
      await this.audit.record(tx, {
        action: 'delete',
        entity: 'applications',
        entityId: applicationId,
        applicationId,
        actorId: actorUserId,
        actorRoleId: scope.roleId,
      });
    });

    return { application_id: applicationId };
  }

  /**
   * PATCH /applications/documents/:id — update an application document's label.
   * Shares the student_document table with student docs. Ports
   * App/Application::document_edit.
   *
   * CRITIQUE #1: this route has no :id ApplicationAccessGuard (its param is the
   * DOCUMENT id), so it MUST resolve the owning application and run the SAME
   * record-access check as the application routes — otherwise a counsellor could
   * edit another owner's (or a converted student's) document. The client-supplied
   * `file` path is IGNORED here: only metadata (label) changes through this route;
   * the stored file is written by the upload path, never by a free-form body field.
   */
  async updateApplicationDocument(
    documentId: number,
    dto: UpdateDocumentDto,
    user: AccessUser,
  ) {
    const doc = await this.prisma.student_document.findFirst({
      where: { student_document_id: documentId, deleted_at: null },
    });
    if (!doc) {
      throw new NotFoundException('Document not found!');
    }

    // Discriminator-aware record access shared with the files/candidates document
    // routes: a candidate (lead) doc is scoped through its lead and an
    // application/student doc through its application, so the overloaded
    // application_id is never mistreated as the wrong id-space (candidate-doc.ts).
    await this.access.assertCanAccessDocumentRow(user, doc);

    return this.prisma.student_document.update({
      where: { student_document_id: documentId },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        updated_by: Number(user.userId ?? user.id),
        updated_at: new Date(),
      },
    });
  }

  /**
   * Maps DTO fields to the Prisma `students` shape, converting date strings to Date
   * objects and dropping the required-column fields handled explicitly by the caller.
   */
  private toStudentData(dto: CreateStudentDto | UpdateStudentDto) {
    const { dob, enrollment_date, ...rest } = dto;
    // student_id/address/consultant_id are set explicitly on create; for update they
    // pass through `rest` only when present. Date strings are converted to Date objects.
    // null clears the date; new Date(null) would have saved 1970-01-01.
    const toDate = (v: string | null) => (v === null ? null : new Date(v));
    return {
      ...rest,
      ...(dob !== undefined ? { dob: toDate(dob) } : {}),
      ...(enrollment_date !== undefined
        ? { enrollment_date: toDate(enrollment_date) }
        : {}),
    };
  }

  // ===========================================================================
  // Application activity / candidate statuses (legacy Candidate controller)
  // ===========================================================================

  /**
   * GET /applications/:id/activity — the candidate activity log for an
   * application. The legacy `candidate_activity` table is ABSENT from the current
   * Prisma schema, so we cannot query it without breaking compilation. Validate
   * the application exists (404 otherwise) and return a well-formed empty list.
   * TODO(prod-table): once a `candidate_activity` model exists, replace the empty
   * `items` with the real log filtered by application id, ordered newest-first.
   */
  async getApplicationActivity(
    applicationId: number,
  ): Promise<{ items: unknown[]; total: number }> {
    await this.getApplication(applicationId); // 404 if missing/soft-deleted
    return { items: [], total: 0 };
  }

  /**
   * GET /candidate-statuses — the candidate status options. The legacy
   * `candidate_status` table is ABSENT from the current Prisma schema, so we
   * return an empty list rather than reference a non-existent model.
   * TODO(prod-table): once a `candidate_status` model exists, return its live
   * (deleted_at IS NULL) rows ordered by id.
   */
  async getCandidateStatuses(): Promise<{ items: unknown[]; total: number }> {
    return { items: [], total: 0 };
  }

  // ===========================================================================
  // Student enrolments (enrol table; enrol.user_id = users.id)
  // ===========================================================================

  /**
   * POST /students/:id/enrolments — create an `enrol` row linking a student
   * (the :id param is the student record id) to a course, and optionally a
   * subject/teacher. Validates the student exists, then resolves the student's
   * underlying users.id (students.student_id) for enrol.user_id.
   *
   * NOTE: `dto.session_count` is accepted for API parity but the `enrol` table has
   * no column for it in the current schema.
   * TODO(prod-table): persist session count once `enrol` gains the column.
   */
  async createEnrolment(
    studentId: number,
    dto: CreateEnrolmentDto,
    actorUserId: number,
  ) {
    const student = await this.getStudent(studentId); // 404 if missing
    const now = new Date();

    return this.prisma.enrol.create({
      data: {
        user_id: student.student_id,
        ...(dto.course_id !== undefined ? { course_id: dto.course_id } : {}),
        ...(dto.subject_id !== undefined ? { subject_id: dto.subject_id } : {}),
        ...(dto.teacher_id !== undefined ? { teacher_id: dto.teacher_id } : {}),
        created_by: actorUserId,
        created_at: now,
        updated_at: now,
      },
    });
  }

  /**
   * DELETE /students/enrolments/:id — soft-delete an `enrol` row (set deleted_at).
   * 404 if the row is missing or already soft-deleted.
   */
  async deleteEnrolment(enrolId: number, actorUserId: number) {
    const existing = await this.prisma.enrol.findFirst({
      where: { id: enrolId, deleted_at: null },
    });
    if (!existing) {
      throw new NotFoundException('Enrolment not found!');
    }
    const now = new Date();
    await this.prisma.enrol.update({
      where: { id: enrolId },
      data: { deleted_at: now, deleted_by: actorUserId, updated_at: now },
    });
    return { id: enrolId };
  }
}
