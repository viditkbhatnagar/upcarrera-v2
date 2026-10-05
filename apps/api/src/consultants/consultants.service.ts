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
import {
  AssignTeamDto,
  CreateCounsellorGroupDto,
  UpdateCounsellorGroupDto,
} from './dto/counsellor-group.dto';
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
      items: await this.decorateHierarchy(items.map((u) => this.stripSecrets(u))),
      total,
      page: pg.page,
      limit: pg.limit,
    };
  }

  /**
   * Resolve each counsellor's place in the Group -> Team -> Counsellor chain.
   *
   * Before migration 001 there was nothing to resolve: team membership existed
   * only inside `sales_team.members` (a JSON blob, readable team -> member but
   * never member -> team), there was no group table at all, and the list screen
   * surfaced "—" for Team, Team Leader, Group and Manager on every row (QA C05).
   * `users.team_id` now carries the link, so the chain can be walked.
   *
   * Three batched queries total, whatever the row count — teams, then groups,
   * then the leader/manager names. No per-row lookups.
   *
   * Null is returned for anything genuinely unset rather than a placeholder, so
   * the caller can tell "no team" from "team with no leader".
   */
  private async decorateHierarchy<
    T extends { id: number; team_id?: number | null },
  >(users: T[]) {
    const teamIds = [
      ...new Set(users.map((u) => u.team_id).filter((id): id is number => !!id)),
    ];

    const teams = teamIds.length
      ? await this.prisma.sales_team.findMany({
          where: { id: { in: teamIds }, deleted_at: null },
          select: { id: true, name: true, leader: true, group_id: true },
        })
      : [];
    const teamById = new Map(teams.map((t) => [t.id, t]));

    const groupIds = [
      ...new Set(teams.map((t) => t.group_id).filter((id): id is number => !!id)),
    ];
    const groups = groupIds.length
      ? await this.prisma.counsellor_group.findMany({
          where: { id: { in: groupIds }, deleted_at: null },
          select: { id: true, code: true, name: true, manager_id: true },
        })
      : [];
    const groupById = new Map(groups.map((g) => [g.id, g]));

    // sales_team.leader is a VarChar holding a users.id — the reason the Teams
    // screen rendered "30" and "31" as leader names (QA T03).
    const personIds = [
      ...new Set(
        [
          ...teams.map((t) => Number(t.leader)),
          ...groups.map((g) => g.manager_id ?? NaN),
        ].filter((n) => Number.isInteger(n) && n > 0),
      ),
    ];
    const people = personIds.length
      ? await this.prisma.users.findMany({
          where: { id: { in: personIds }, deleted_at: null },
          select: { id: true, name: true },
        })
      : [];
    const personById = new Map(people.map((p) => [p.id, p.name]));

    return users.map((u) => {
      const team = u.team_id ? teamById.get(u.team_id) : undefined;
      const group = team?.group_id ? groupById.get(team.group_id) : undefined;
      const leaderId = Number(team?.leader);

      return {
        ...u,
        team_name: team?.name ?? null,
        team_leader_id: Number.isInteger(leaderId) && leaderId > 0 ? leaderId : null,
        team_leader_name: Number.isInteger(leaderId)
          ? (personById.get(leaderId) ?? null)
          : null,
        group_id: group?.id ?? null,
        group_code: group?.code ?? null,
        group_name: group?.name ?? null,
        manager_id: group?.manager_id ?? null,
        manager_name: group?.manager_id
          ? (personById.get(group.manager_id) ?? null)
          : null,
      };
    });
  }

  /**
   * GET /consultants/groups — counsellor groups derived from the `users.region`
   * column (there is no dedicated group table). Each distinct region becomes a
   * group with its real counsellor count. Teams have no region link, so
   * total_teams is null (the UI renders "—"); manager/target likewise have no
   * source. A null/blank region is surfaced as "Unassigned".
   */
  /**
   * GET /consultants/groups — the real counsellor groups.
   *
   * This used to group users by the free-text `region` column, which is empty
   * for every consultant, so it returned a single invented "Unassigned" bucket
   * holding all 35 counsellors with no manager and no team count (QA G02).
   * Migration 001 added the `counsellor_group` table, so this now reports what
   * is actually stored, with live counts rolled up through the teams.
   */
  async groups() {
    const [groups, teams] = await Promise.all([
      this.prisma.counsellor_group.findMany({
        where: { deleted_at: null },
        orderBy: { id: 'asc' },
      }),
      this.prisma.sales_team.findMany({
        where: { deleted_at: null },
        select: { id: true, group_id: true },
      }),
    ]);

    const managerIds = [
      ...new Set(groups.map((g) => g.manager_id).filter((id): id is number => !!id)),
    ];
    const managers = managerIds.length
      ? await this.prisma.users.findMany({
          where: { id: { in: managerIds }, deleted_at: null },
          select: { id: true, name: true },
        })
      : [];
    const managerById = new Map(managers.map((m) => [m.id, m.name]));

    // Counts are derived from the live membership rather than stored, so they
    // cannot drift from reality the way a typed-in total would.
    const teamsByGroup = new Map<number, number[]>();
    for (const t of teams) {
      if (t.group_id == null) continue;
      teamsByGroup.set(t.group_id, [...(teamsByGroup.get(t.group_id) ?? []), t.id]);
    }

    const counsellorsByTeam = await this.prisma.users.groupBy({
      by: ['team_id'],
      where: { role_id: CONSULTANT_ROLE_ID, deleted_at: null, team_id: { not: null } },
      _count: { _all: true },
    });
    const countByTeam = new Map(
      counsellorsByTeam.map((r) => [r.team_id as number, r._count._all]),
    );

    const items = groups.map((g) => {
      const teamIds = teamsByGroup.get(g.id) ?? [];
      return {
        id: g.id,
        code: g.code,
        name: g.name,
        manager_id: g.manager_id,
        manager: g.manager_id ? (managerById.get(g.manager_id) ?? null) : null,
        total_teams: teamIds.length,
        total_counsellors: teamIds.reduce((sum, id) => sum + (countByTeam.get(id) ?? 0), 0),
        status: g.status ?? 1,
      };
    });

    // Counsellors in no team at all belong to no group. Reported separately so
    // the screen can show them honestly instead of inventing a bucket.
    const unassigned = await this.prisma.users.count({
      where: { role_id: CONSULTANT_ROLE_ID, deleted_at: null, team_id: null },
    });

    return {
      items,
      total: items.length,
      total_counsellors: items.reduce((s, g) => s + g.total_counsellors, 0),
      unassigned_counsellors: unassigned,
    };
  }

  /** POST /consultants/groups */
  async createGroup(dto: CreateCounsellorGroupDto, actorUserId: number) {
    await this.assertGroupCodeFree(dto.code);
    if (dto.manager_id !== undefined) await this.assertUserExists(dto.manager_id);

    const now = new Date();
    return this.prisma.counsellor_group.create({
      data: {
        code: dto.code ?? null,
        name: dto.name,
        manager_id: dto.manager_id ?? null,
        status: dto.status ?? 1,
        created_by: actorUserId,
        created_at: now,
        updated_at: now,
      },
    });
  }

  /** PATCH /consultants/groups/:id */
  async updateGroup(id: number, dto: UpdateCounsellorGroupDto, actorUserId: number) {
    const existing = await this.prisma.counsellor_group.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) throw new NotFoundException('Counsellor group not found!');

    if (dto.code !== undefined && dto.code !== existing.code) {
      await this.assertGroupCodeFree(dto.code);
    }
    if (dto.manager_id !== undefined && dto.manager_id !== null) {
      await this.assertUserExists(dto.manager_id);
    }

    return this.prisma.counsellor_group.update({
      where: { id },
      data: {
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.manager_id !== undefined ? { manager_id: dto.manager_id } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        updated_by: actorUserId,
        updated_at: new Date(),
      },
    });
  }

  /** DELETE /consultants/groups/:id — soft delete, and orphan its teams. */
  async removeGroup(id: number, actorUserId: number) {
    const existing = await this.prisma.counsellor_group.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) throw new NotFoundException('Counsellor group not found!');

    const now = new Date();
    await this.prisma.$transaction([
      // Teams must not keep pointing at a deleted group, or the hierarchy walk
      // would resolve a group that is gone.
      this.prisma.sales_team.updateMany({
        where: { group_id: id },
        data: { group_id: null, updated_at: now },
      }),
      this.prisma.counsellor_group.update({
        where: { id },
        data: { deleted_at: now, deleted_by: actorUserId },
      }),
    ]);

    return { id };
  }

  /** Group codes are the operator-facing identifier, so they must be unique. */
  private async assertGroupCodeFree(code: string | null | undefined) {
    if (!code) return;
    const clash = await this.prisma.counsellor_group.findFirst({
      where: { code, deleted_at: null },
    });
    if (clash) throw new ConflictException('A group with this code already exists');
  }

  private async assertUserExists(userId: number) {
    const user = await this.prisma.users.findFirst({
      where: { id: userId, deleted_at: null },
    });
    if (!user) throw new NotFoundException('User not found!');
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
  /**
   * PATCH /consultants/:id/team — move a counsellor to another team.
   *
   * Writes BOTH sides on purpose. `users.team_id` is the new source of truth,
   * but `sales_team.members` (a JSON array of user ids) is still read by legacy
   * PHP and possibly by the LMS, which shares this database. Updating only the
   * new column would leave those readers seeing stale rosters, so both are kept
   * in step inside one transaction until the legacy path is retired.
   *
   * A counsellor belongs to exactly one team (spec 2.2), so they are removed
   * from every other team's member list as part of the move.
   */
  async assignTeam(consultantId: number, dto: AssignTeamDto, actorUserId: number) {
    const consultant = await this.getConsultantOrThrow(consultantId);

    const targetTeamId = dto.team_id ?? null;
    if (targetTeamId !== null) {
      const team = await this.prisma.sales_team.findFirst({
        where: { id: targetTeamId, deleted_at: null },
      });
      if (!team) throw new NotFoundException('Sales Team not found!');
    }
    if (dto.reports_to !== undefined && dto.reports_to !== null) {
      await this.assertUserExists(dto.reports_to);
    }

    // Every team whose JSON roster mentions this user, so stale entries can be
    // stripped. The blob cannot be queried by member, so they are filtered here.
    const allTeams = await this.prisma.sales_team.findMany({
      where: { deleted_at: null },
      select: { id: true, members: true },
    });

    const now = new Date();
    const rosterWrites = allTeams.flatMap((team) => {
      const ids = this.parseMemberIdList(team.members);
      const shouldContain = team.id === targetTeamId;
      const contains = ids.includes(consultantId);
      if (shouldContain === contains) return [];

      const next = shouldContain
        ? [...ids, consultantId]
        : ids.filter((id) => id !== consultantId);

      return [
        this.prisma.sales_team.update({
          where: { id: team.id },
          data: {
            // Written as JSON STRINGS (`["30","31"]`) to match exactly what the
            // legacy rows already hold. Reading tolerates both shapes, but the
            // legacy PHP that also reads this column may compare strictly, so
            // the safe choice on a shared database is to keep its format rather
            // than quietly switching it to numbers.
            members: JSON.stringify(next.map(String)),
            updated_at: now,
            updated_by: actorUserId,
          },
        }),
      ];
    });

    await this.prisma.$transaction([
      this.prisma.users.update({
        where: { id: consultant.id },
        data: {
          team_id: targetTeamId,
          ...(dto.reports_to !== undefined ? { reports_to: dto.reports_to } : {}),
          updated_by: actorUserId,
          updated_at: now,
        },
      }),
      ...rosterWrites,
    ]);

    const [decorated] = await this.decorateHierarchy([
      this.stripSecrets(await this.getConsultantOrThrow(consultantId)),
    ]);
    return decorated;
  }

  /** PATCH /consultants/teams/:id/group — put a team under a group. */
  async assignTeamGroup(teamId: number, groupId: number | null, actorUserId: number) {
    const team = await this.prisma.sales_team.findFirst({
      where: { id: teamId, deleted_at: null },
    });
    if (!team) throw new NotFoundException('Sales Team not found!');

    if (groupId !== null) {
      const group = await this.prisma.counsellor_group.findFirst({
        where: { id: groupId, deleted_at: null },
      });
      if (!group) throw new NotFoundException('Counsellor group not found!');
    }

    return this.prisma.sales_team.update({
      where: { id: teamId },
      data: { group_id: groupId, updated_by: actorUserId, updated_at: new Date() },
    });
  }

  /** Parse the legacy sales_team.members JSON into numeric ids, tolerating junk. */
  private parseMemberIdList(members: string | null): number[] {
    if (!members) return [];
    try {
      const parsed: unknown = JSON.parse(members);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((m) => Number(m)).filter((n) => Number.isInteger(n) && n > 0);
    } catch {
      return [];
    }
  }

}
