import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConsultantDto } from './dto/create-consultant.dto';
import { UpdateConsultantDto } from './dto/update-consultant.dto';
import { ListConsultantsDto } from './dto/list-consultants.dto';
import { ListAdmissionsDto } from './dto/list-admissions.dto';
import { ListTargetsDto } from './dto/list-targets.dto';
import { CreateTargetDto, UpdateTargetDto } from './dto/create-target.dto';

/** Legacy role id for consultants (Consultant.php hard-codes role_id = 6). */
const CONSULTANT_ROLE_ID = 6;
/** Legacy role id for students (used to scope a consultant's enrolled students). */
const STUDENT_ROLE_ID = 4;
const BCRYPT_ROUNDS = 10;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/** Target types (Consultant_target::index). */
const TARGET_TYPE_POINTS = 1; // sum of specialisation points
const TARGET_TYPE_COUNT = 2; // admission count

/**
 * Port of CI4 App\Controllers\App\{Consultant, Consultant_target}.
 *
 * A consultant is a `users` row with role_id = 6. The legacy schema uses manual
 * timestamp columns (no auto timestamps), so created_at/updated_at are set by
 * hand, and "delete" stamps deleted_at instead of removing the row.
 *
 * Two schema realities differ from the legacy code and are handled faithfully:
 *   - The legacy `students.fee` column does NOT exist in the new schema. The
 *     canonical billing source is the `invoice` table (used by the leads
 *     conversion saga), so "fee revenue" is the SUM of invoice.payable_amount
 *     for the consultant's students.
 *   - The legacy `students.student_status` column does NOT exist; its schema
 *     equivalent is `students.admission_status` (Int), used for that filter.
 */
@Injectable()
export class ConsultantsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizePagination(page?: number, limit?: number) {
    const safePage = page && page > 0 ? page : DEFAULT_PAGE;
    const safeLimit = limit && limit > 0 ? limit : DEFAULT_LIMIT;
    return {
      page: safePage,
      limit: safeLimit,
      skip: (safePage - 1) * safeLimit,
    };
  }

  /** Never leak password hashes in API responses. */
  private stripSecrets<
    T extends { password?: string | null; prev_password?: string | null },
  >(user: T): Omit<T, 'password' | 'prev_password'> {
    const { password, prev_password, ...rest } = user;
    return rest;
  }

  // ===========================================================================
  // Consultants CRUD (users where role_id = 6)
  // ===========================================================================

  /** GET /consultants — paginate + legacy search (name/phone/email) + status. */
  async findAll(query: ListConsultantsDto) {
    const pg = this.normalizePagination(query.page, query.limit);

    const where = {
      deleted_at: null,
      role_id: CONSULTANT_ROLE_ID,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search } },
              { phone: { contains: query.search } },
              { email: { contains: query.search } },
            ],
          }
        : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.users.findMany({
        where,
        skip: pg.skip,
        take: pg.limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.users.count({ where }),
    ]);

    return {
      items: items.map((u) => this.stripSecrets(u)),
      total,
      page: pg.page,
      limit: pg.limit,
    };
  }

  /**
   * GET /consultants/groups — counsellor groups derived from the `users.region`
   * column (there is no dedicated group table). Each distinct region becomes a
   * group with its real counsellor count. Teams have no region link, so
   * total_teams is null (the UI renders "—"); manager/target likewise have no
   * source. A null/blank region is surfaced as "Unassigned".
   */
  async groups() {
    const grouped = await this.prisma.users.groupBy({
      by: ['region'],
      where: { role_id: CONSULTANT_ROLE_ID, deleted_at: null },
      _count: { _all: true },
    });

    const items = grouped
      .map((g) => {
        const region = (g.region ?? '').trim();
        return {
          id: region || 'unassigned',
          name: region || 'Unassigned',
          region: region || null,
          total_counsellors: g._count._all,
          total_teams: null as number | null,
          manager: null as string | null,
          status: 1,
        };
      })
      .sort((a, b) => b.total_counsellors - a.total_counsellors);

    return {
      items,
      total: items.length,
      total_counsellors: items.reduce((s, g) => s + g.total_counsellors, 0),
    };
  }

  /** Re-validate a consultant exists (role_id=6, not soft-deleted) or 404. */
  private async getConsultantOrThrow(id: number) {
    const consultant = await this.prisma.users.findFirst({
      where: { id, deleted_at: null, role_id: CONSULTANT_ROLE_ID },
    });
    if (!consultant) {
      throw new NotFoundException('Consultant not found!');
    }
    return consultant;
  }

  /**
   * GET /consultants/:id — profile + resolved country + their enrolled students.
   * Port of Consultant::view (which joined countries and listed role_id=4
   * students where students.consultant_id = :id).
   */
  async findOne(id: number) {
    const consultant = await this.getConsultantOrThrow(id);

    const country = consultant.country_id
      ? await this.prisma.countries.findUnique({
          where: { country_id: consultant.country_id },
          select: { country_id: true, country: true },
        })
      : null;

    const studentProfiles = await this.prisma.students.findMany({
      where: { consultant_id: id, deleted_at: null },
      orderBy: { id: 'desc' },
    });

    const students = await this.attachStudentUsers(studentProfiles);

    return {
      ...this.stripSecrets(consultant),
      country: country?.country ?? null,
      students,
      total_students: students.length,
    };
  }

  /**
   * POST /consultants — create a role_id=6 user with a bcrypt-hashed password.
   * Port of Consultant::add, including the duplicate (code+phone) / email guard.
   * The legacy "welcome email" is intentionally skipped: no EmailService is
   * wired into this module (it is optional per the migration brief).
   */
  async create(dto: CreateConsultantDto, actorUserId: number) {
    // Duplicate guard (legacy checked code+phone and email separately).
    const dupPhone =
      dto.phone !== undefined
        ? await this.prisma.users.count({
            where: {
              code: dto.code ?? undefined,
              phone: dto.phone,
              deleted_at: null,
            },
          })
        : 0;
    const dupEmail =
      dto.email !== undefined && dto.email !== ''
        ? await this.prisma.users.count({
            where: { email: dto.email, deleted_at: null },
          })
        : 0;

    if (dupPhone > 0 || dupEmail > 0) {
      throw new ConflictException('User already exists!');
    }

    const now = new Date();
    const hashed = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const consultant = await this.prisma.users.create({
      data: {
        name: dto.name,
        username: dto.username,
        password: hashed,
        code: dto.code ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        gender: dto.gender ?? null,
        dob: dto.dob ? new Date(dto.dob) : null,
        doj: dto.doj ? new Date(dto.doj) : null,
        country_id: dto.country_id ?? null,
        languages_spoken: dto.languages_spoken ?? null,
        highest_qualification: dto.highest_qualification ?? null,
        profile_picture: dto.profile_picture ?? null,
        assigned_universities: this.encodeUniversities(
          dto.assigned_universities,
        ),
        status: dto.status ?? 1,
        role_id: CONSULTANT_ROLE_ID,
        created_by: actorUserId,
        updated_by: actorUserId,
        created_at: now,
        updated_at: now,
      },
    });

    // Keep the consultant_universities join table in sync with the JSON column.
    await this.syncConsultantUniversities(
      consultant.id,
      dto.assigned_universities,
      actorUserId,
    );

    // NOTE(welcome-email): legacy send_email() of login credentials is skipped —
    // no EmailService is provided to this module (optional per the brief).
    return this.stripSecrets(consultant);
  }

  /**
   * PATCH /consultants/:id — partial update (port of Consultant::edit), incl.
   * `assigned_universities`. Re-hashes the password only when a new one is given.
   */
  async update(id: number, dto: UpdateConsultantDto, actorUserId: number) {
    await this.getConsultantOrThrow(id); // 404 if missing / not a consultant

    const now = new Date();
    const data: Record<string, unknown> = {
      updated_by: actorUserId,
      updated_at: now,
    };

    // Copy through only the simple scalar fields actually supplied.
    const scalarKeys: (keyof UpdateConsultantDto)[] = [
      'name',
      'username',
      'code',
      'phone',
      'email',
      'gender',
      'country_id',
      'languages_spoken',
      'highest_qualification',
      'profile_picture',
      'status',
    ];
    for (const key of scalarKeys) {
      if (dto[key] !== undefined) {
        data[key] = dto[key];
      }
    }

    if (dto.dob !== undefined) data.dob = dto.dob ? new Date(dto.dob) : null;
    if (dto.doj !== undefined) data.doj = dto.doj ? new Date(dto.doj) : null;

    if (dto.assigned_universities !== undefined) {
      data.assigned_universities = this.encodeUniversities(
        dto.assigned_universities,
      );
    }

    if (dto.password !== undefined && dto.password !== '') {
      data.password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    }

    const consultant = await this.prisma.users.update({
      where: { id },
      data,
    });

    if (dto.assigned_universities !== undefined) {
      await this.syncConsultantUniversities(
        id,
        dto.assigned_universities,
        actorUserId,
      );
    }

    return this.stripSecrets(consultant);
  }

  /** DELETE /consultants/:id — soft delete (stamp deleted_at). */
  async remove(id: number, actorUserId: number) {
    await this.getConsultantOrThrow(id);

    const now = new Date();
    await this.prisma.users.update({
      where: { id },
      data: { deleted_at: now, deleted_by: actorUserId, updated_at: now },
    });
    return { id };
  }

  // ===========================================================================
  // Assigned universities
  // ===========================================================================

  /**
   * GET /consultants/:id/universities — the consultant's assigned universities.
   * Prefers the consultant_universities join table; falls back to the legacy
   * users.assigned_universities JSON column when the join table is empty.
   */
  async getUniversities(id: number) {
    const consultant = await this.getConsultantOrThrow(id);

    let universityIds = (
      await this.prisma.consultant_universities.findMany({
        where: { user_id: id, deleted_at: null },
        select: { university_id: true },
      })
    )
      .map((row) => row.university_id)
      .filter((uid): uid is number => uid != null);

    if (universityIds.length === 0) {
      universityIds = this.decodeUniversities(consultant.assigned_universities);
    }

    if (universityIds.length === 0) {
      return [];
    }

    return this.prisma.university.findMany({
      where: { id: { in: universityIds }, deleted_at: null },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * PUT /consultants/:id/universities — replace the assigned list wholesale.
   * Updates BOTH the users.assigned_universities JSON (legacy add_university)
   * and the consultant_universities join table so the two never diverge.
   */
  async replaceUniversities(
    id: number,
    universityIds: number[],
    actorUserId: number,
  ) {
    await this.getConsultantOrThrow(id);

    const unique = [...new Set(universityIds)];
    const now = new Date();

    await this.prisma.users.update({
      where: { id },
      data: {
        assigned_universities: this.encodeUniversities(unique),
        updated_by: actorUserId,
        updated_at: now,
      },
    });

    await this.syncConsultantUniversities(id, unique, actorUserId);

    return this.getUniversities(id);
  }

  /**
   * DELETE /consultants/:id/universities/:university_id — drop one university.
   * Port of Consultant::delete_university (filtered the JSON array). Mirrors the
   * removal into the join table.
   */
  async removeUniversity(
    id: number,
    universityId: number,
    actorUserId: number,
  ) {
    const consultant = await this.getConsultantOrThrow(id);

    const remaining = this.decodeUniversities(
      consultant.assigned_universities,
    ).filter((uid) => uid !== universityId);

    return this.replaceUniversities(id, remaining, actorUserId);
  }

  // ===========================================================================
  // Performance
  // ===========================================================================

  /**
   * GET /consultants/performance — every consultant with total_students and
   * total_fee_revenue (port of Consultant::performance). Honours the same
   * search/status filters as the list endpoint.
   */
  async performanceAll(query: ListConsultantsDto) {
    const where = {
      deleted_at: null,
      role_id: CONSULTANT_ROLE_ID,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search } },
              { phone: { contains: query.search } },
              { email: { contains: query.search } },
            ],
          }
        : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
    };

    const consultants = await this.prisma.users.findMany({
      where,
      orderBy: { id: 'desc' },
    });

    const items = await Promise.all(
      consultants.map(async (c) => {
        const metrics = await this.consultantMetrics(c.id);
        return { ...this.stripSecrets(c), ...metrics };
      }),
    );

    return { items, total: items.length };
  }

  /**
   * GET /consultants/:id/performance — one consultant's detail with their
   * students and aggregate fee revenue (port of Consultant::view_performance).
   */
  async performanceOne(id: number) {
    const consultant = await this.getConsultantOrThrow(id);

    const studentProfiles = await this.prisma.students.findMany({
      where: { consultant_id: id, deleted_at: null },
      orderBy: { id: 'desc' },
    });

    const studentUserIds = studentProfiles.map((s) => s.student_id);
    const feeByStudent = await this.feeRevenueByStudent(studentUserIds);

    const students = (await this.attachStudentUsers(studentProfiles)).map(
      (s) => ({
        ...s,
        total_fee_revenue: feeByStudent.get(s.student_id) ?? 0,
      }),
    );

    const totalFeeRevenue = students.reduce(
      (sum, s) => sum + s.total_fee_revenue,
      0,
    );

    return {
      ...this.stripSecrets(consultant),
      students,
      total_students: students.length,
      total_fee_revenue: totalFeeRevenue,
    };
  }

  // ===========================================================================
  // Admissions (cross-consultant student enrollments)
  // ===========================================================================

  /**
   * GET /consultants/admissions — cross-consultant student enrollments with
   * filters (search by user name/phone/email, student_status -> admission_status,
   * university_id). Returns the paged items plus the total fee across the page.
   * Port of Consultant::admissions.
   */
  async admissions(query: ListAdmissionsDto) {
    const pg = this.normalizePagination(query.page, query.limit);

    // Filter on the students table first (admission_status), then resolve the
    // backing users (role_id=4) and apply the name/phone/email + university filter.
    const studentWhere = {
      deleted_at: null,
      ...(query.student_status !== undefined
        ? { admission_status: query.student_status }
        : {}),
    };

    const allProfiles = await this.prisma.students.findMany({
      where: studentWhere,
      orderBy: { id: 'desc' },
    });

    // Resolve the backing user rows (role_id = 4) and apply the user-level filters.
    const userIds = allProfiles.map((p) => p.student_id);
    const users =
      userIds.length > 0
        ? await this.prisma.users.findMany({
            where: {
              id: { in: userIds },
              role_id: STUDENT_ROLE_ID,
              deleted_at: null,
              ...(query.university_id !== undefined
                ? { university_id: query.university_id }
                : {}),
              ...(query.search
                ? {
                    OR: [
                      { name: { contains: query.search } },
                      { phone: { contains: query.search } },
                      { email: { contains: query.search } },
                    ],
                  }
                : {}),
            },
          })
        : [];

    const userById = new Map(users.map((u) => [u.id, u]));
    const matched = allProfiles.filter((p) => userById.has(p.student_id));

    const feeByStudent = await this.feeRevenueByStudent(
      matched.map((p) => p.student_id),
    );

    const enriched = matched.map((p) => ({
      ...p,
      user: this.stripSecrets(userById.get(p.student_id)!),
      total_fee_revenue: feeByStudent.get(p.student_id) ?? 0,
    }));

    const totalFee = enriched.reduce((sum, r) => sum + r.total_fee_revenue, 0);

    const items = enriched.slice(pg.skip, pg.skip + pg.limit);

    return {
      items,
      total: enriched.length,
      total_fee: totalFee,
      page: pg.page,
      limit: pg.limit,
    };
  }

  /**
   * GET /consultants/admissions/:student_id — one student's full
   * consultant-context profile (the user row + students profile + assigned
   * consultant + fee revenue). Port of Consultant::view_admission.
   * `student_id` is the users.id of the student (legacy joined on users.id).
   */
  async admissionDetail(studentUserId: number) {
    const user = await this.prisma.users.findFirst({
      where: {
        id: studentUserId,
        role_id: STUDENT_ROLE_ID,
        deleted_at: null,
      },
    });
    if (!user) {
      throw new NotFoundException('Student not found!');
    }

    const profile = await this.prisma.students.findFirst({
      where: { student_id: studentUserId, deleted_at: null },
      orderBy: { id: 'desc' },
    });

    const consultant =
      profile?.consultant_id != null
        ? await this.prisma.users.findFirst({
            where: { id: profile.consultant_id, deleted_at: null },
            select: { id: true, name: true },
          })
        : null;

    const feeByStudent = await this.feeRevenueByStudent([studentUserId]);

    return {
      ...this.stripSecrets(user),
      profile,
      consultant,
      total_fee_revenue: feeByStudent.get(studentUserId) ?? 0,
    };
  }

  // ===========================================================================
  // Consultant targets
  // ===========================================================================

  /**
   * GET /consultant-targets — targets joined to their consultant, each with a
   * computed performance % (port of Consultant_target::index):
   *   - type 1 (points): achieved = SUM(specialisations.point) for the
   *     consultant's students enrolled within [from_date, to_date].
   *   - type 2 (count): achieved = COUNT of those students.
   *   performance = round(achieved / value * 100, 2) + '%'.
   */
  async findTargets(query: ListTargetsDto) {
    const pg = this.normalizePagination(query.page, query.limit);

    const where = {
      deleted_at: null,
      ...(query.type !== undefined ? { type: query.type } : {}),
      ...(query.state === 'added' ? { consultant_id: { not: null } } : {}),
      ...(query.state === 'not_added' ? { consultant_id: null } : {}),
    };

    const allTargets = await this.prisma.consultant_target.findMany({
      where,
      orderBy: { consultant_target_id: 'desc' },
    });

    // Resolve consultants and optionally apply the name/phone/email search.
    const consultantIds = [
      ...new Set(
        allTargets
          .map((t) => t.consultant_id)
          .filter((cid): cid is number => cid != null),
      ),
    ];

    const consultants =
      consultantIds.length > 0
        ? await this.prisma.users.findMany({
            where: {
              id: { in: consultantIds },
              ...(query.search
                ? {
                    OR: [
                      { name: { contains: query.search } },
                      { phone: { contains: query.search } },
                      { email: { contains: query.search } },
                    ],
                  }
                : {}),
            },
            select: { id: true, name: true },
          })
        : [];

    const consultantById = new Map(consultants.map((c) => [c.id, c]));

    // When searching, drop targets whose consultant didn't match the search.
    const filtered = query.search
      ? allTargets.filter(
          (t) => t.consultant_id != null && consultantById.has(t.consultant_id),
        )
      : allTargets;

    const computed = await Promise.all(
      filtered.map(async (target) => {
        const performance = await this.computeTargetPerformance(target);
        return {
          ...target,
          consultant_name:
            target.consultant_id != null
              ? (consultantById.get(target.consultant_id)?.name ?? null)
              : null,
          ...performance,
        };
      }),
    );

    const items = computed.slice(pg.skip, pg.skip + pg.limit);

    return { items, total: computed.length, page: pg.page, limit: pg.limit };
  }

  /** GET /consultant-targets/:id — one target with its computed performance. */
  async findTarget(id: number) {
    const target = await this.prisma.consultant_target.findFirst({
      where: { consultant_target_id: id, deleted_at: null },
    });
    if (!target) {
      throw new NotFoundException('Consultant target not found!');
    }

    const consultant =
      target.consultant_id != null
        ? await this.prisma.users.findFirst({
            where: { id: target.consultant_id, deleted_at: null },
            select: { id: true, name: true },
          })
        : null;

    const performance = await this.computeTargetPerformance(target);

    return {
      ...target,
      consultant_name: consultant?.name ?? null,
      ...performance,
    };
  }

  /**
   * POST /consultant-targets — create a target after the legacy date-range
   * conflict guard (no overlapping target for the same consultant + type).
   * Port of Consultant_target::add.
   */
  async createTarget(dto: CreateTargetDto, actorUserId: number) {
    const fromDate = new Date(dto.from_date);
    const toDate = new Date(dto.to_date);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('Invalid from_date / to_date.');
    }

    // Overlap test: an existing target conflicts when its window intersects
    // [from, to] — i.e. existing.from_date <= to AND existing.to_date >= from.
    const conflict = await this.prisma.consultant_target.findFirst({
      where: {
        deleted_at: null,
        consultant_id: dto.consultant_id,
        type: dto.type,
        from_date: { lte: toDate },
        to_date: { gte: fromDate },
      },
    });

    if (conflict) {
      throw new ConflictException(
        'Date range conflicts with an existing record for this consultant and type.',
      );
    }

    const now = new Date();
    return this.prisma.consultant_target.create({
      data: {
        type: dto.type,
        from_date: fromDate,
        to_date: toDate,
        value: dto.value,
        consultant_id: dto.consultant_id,
        created_by: actorUserId,
        updated_by: actorUserId,
        created_at: now,
        updated_at: now,
      },
    });
  }

  /** PATCH /consultant-targets/:id — partial update (port of Consultant_target::edit). */
  async updateTarget(id: number, dto: UpdateTargetDto, actorUserId: number) {
    const existing = await this.prisma.consultant_target.findFirst({
      where: { consultant_target_id: id, deleted_at: null },
    });
    if (!existing) {
      throw new NotFoundException('Consultant target not found!');
    }

    const data: Record<string, unknown> = {
      updated_by: actorUserId,
      updated_at: new Date(),
    };
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.value !== undefined) data.value = dto.value;
    if (dto.from_date !== undefined) data.from_date = new Date(dto.from_date);
    if (dto.to_date !== undefined) data.to_date = new Date(dto.to_date);

    return this.prisma.consultant_target.update({
      where: { consultant_target_id: id },
      data,
    });
  }

  /** DELETE /consultant-targets/:id — soft delete. */
  async removeTarget(id: number, actorUserId: number) {
    const existing = await this.prisma.consultant_target.findFirst({
      where: { consultant_target_id: id, deleted_at: null },
    });
    if (!existing) {
      throw new NotFoundException('Consultant target not found!');
    }

    const now = new Date();
    await this.prisma.consultant_target.update({
      where: { consultant_target_id: id },
      data: { deleted_at: now, deleted_by: actorUserId, updated_at: now },
    });
    return { consultant_target_id: id };
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /** Aggregate {total_students, total_fee_revenue} for one consultant. */
  private async consultantMetrics(consultantId: number) {
    const profiles = await this.prisma.students.findMany({
      where: { consultant_id: consultantId, deleted_at: null },
      select: { student_id: true },
    });
    const feeByStudent = await this.feeRevenueByStudent(
      profiles.map((p) => p.student_id),
    );
    const totalFeeRevenue = [...feeByStudent.values()].reduce(
      (sum, v) => sum + v,
      0,
    );
    return {
      total_students: profiles.length,
      total_fee_revenue: totalFeeRevenue,
    };
  }

  /**
   * Sum invoice.payable_amount per student (the schema's canonical fee source —
   * the legacy students.fee column does not exist here). Returns a map of
   * studentUserId -> total payable. Empty input -> empty map (never throws).
   */
  private async feeRevenueByStudent(
    studentUserIds: number[],
  ): Promise<Map<number, number>> {
    const ids = [...new Set(studentUserIds)].filter((n) => n != null);
    if (ids.length === 0) {
      return new Map();
    }

    const grouped = await this.prisma.invoice.groupBy({
      by: ['student_id'],
      where: { student_id: { in: ids }, deleted_at: null },
      _sum: { payable_amount: true },
    });

    const map = new Map<number, number>();
    for (const row of grouped) {
      if (row.student_id != null) {
        map.set(row.student_id, row._sum.payable_amount ?? 0);
      }
    }
    return map;
  }

  /** Attach the backing users row (role_id=4) onto each students profile. */
  private async attachStudentUsers<T extends { student_id: number }>(
    profiles: T[],
  ) {
    const ids = [...new Set(profiles.map((p) => p.student_id))];
    const users =
      ids.length > 0
        ? await this.prisma.users.findMany({ where: { id: { in: ids } } })
        : [];
    const userById = new Map(users.map((u) => [u.id, this.stripSecrets(u)]));
    return profiles.map((p) => ({
      ...p,
      user: userById.get(p.student_id) ?? null,
    }));
  }

  /**
   * Compute a target's achieved value and performance %. Mirrors
   * Consultant_target::index: type 1 sums specialisation points for the
   * consultant's students enrolled in the window; type 2 counts them.
   */
  private async computeTargetPerformance(target: {
    type: number | null;
    value: number | null;
    consultant_id: number | null;
    from_date: Date | null;
    to_date: Date | null;
  }) {
    const value = target.value ?? 0;

    if (target.consultant_id == null) {
      return { achieved: 0, performance: '0%' };
    }

    const dateFilter = {
      ...(target.from_date ? { gte: target.from_date } : {}),
      ...(target.to_date ? { lte: target.to_date } : {}),
    };

    const students = await this.prisma.students.findMany({
      where: {
        consultant_id: target.consultant_id,
        deleted_at: null,
        ...(target.from_date || target.to_date
          ? { enrollment_date: dateFilter }
          : {}),
      },
      select: { course_id: true },
    });

    let achieved = 0;

    if (target.type === TARGET_TYPE_POINTS) {
      // Sum specialisations.point for each student's course (legacy joined
      // specialisations.course_id = students.course_id and summed `point`).
      const courseIds = [
        ...new Set(
          students
            .map((s) => s.course_id)
            .filter((cid): cid is number => cid != null),
        ),
      ];
      if (courseIds.length > 0) {
        const specs = await this.prisma.specialisations.findMany({
          where: { course_id: { in: courseIds }, deleted_at: null },
          select: { course_id: true, point: true },
        });
        // point is a Text column; sum the numeric value per course.
        const pointByCourse = new Map<number, number>();
        for (const spec of specs) {
          if (spec.course_id == null) continue;
          const n = Number(spec.point);
          const add = Number.isNaN(n) ? 0 : n;
          pointByCourse.set(
            spec.course_id,
            (pointByCourse.get(spec.course_id) ?? 0) + add,
          );
        }
        for (const s of students) {
          if (s.course_id != null) {
            achieved += pointByCourse.get(s.course_id) ?? 0;
          }
        }
      }
    } else if (target.type === TARGET_TYPE_COUNT) {
      achieved = students.length;
    }

    const pct = value > 0 ? (achieved / value) * 100 : 0;
    return {
      achieved,
      performance: `${Math.round(pct * 100) / 100}%`,
    };
  }

  /** Sync the consultant_universities join table to the given id list. */
  private async syncConsultantUniversities(
    consultantId: number,
    universityIds: number[] | undefined,
    actorUserId: number,
  ) {
    if (universityIds === undefined) {
      return;
    }
    const unique = [...new Set(universityIds)];
    const now = new Date();

    await this.prisma.$transaction([
      // Hard-delete the existing join rows for a clean replace (the join table
      // is a derived index of the JSON column, so a wholesale rewrite is safe).
      this.prisma.consultant_universities.deleteMany({
        where: { user_id: consultantId },
      }),
      ...(unique.length > 0
        ? [
            this.prisma.consultant_universities.createMany({
              data: unique.map((universityId) => ({
                user_id: consultantId,
                university_id: universityId,
                created_by: actorUserId,
                updated_by: actorUserId,
                created_at: now,
                updated_at: now,
              })),
            }),
          ]
        : []),
    ]);
  }

  /** Encode a university id list to the legacy JSON string column. */
  private encodeUniversities(ids: number[] | undefined): string | null {
    if (ids === undefined) {
      return null;
    }
    return JSON.stringify([...new Set(ids)]);
  }

  /** Decode the legacy users.assigned_universities JSON column to number ids. */
  private decodeUniversities(raw: string | null | undefined): number[] {
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((v) => Number(v))
        .filter((n) => !Number.isNaN(n));
    } catch {
      return [];
    }
  }
}
