import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
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
import {
  INDIA_DIAL_CODE,
  isIndianNational,
  storedPhoneVariants,
} from './consultant-phone';

import {
  stripUserSecrets,
  USER_SECRET_FIELDS,
  type UserSecretField,
} from '../common/user-secrets';
/** Re-exported for existing callers; the list itself lives in common/user-secrets.ts. */
export { USER_SECRET_FIELDS };
/**
 * users columns that hold a credential and must never leave the API:
 *   password / prev_password  bcrypt hashes (current and previous);
 *   otp                       the live one-time login code;
 *   zoom_password             the counsellor's Zoom account password.
 * No screen reads any of them. zoom_id, zoom_email and meeting_link are
 * identifiers that are shared with students by design, so they stay.
 */

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

/** Rows the profile's Applications table shows; the counts cover every row. */
const PROFILE_APPLICATION_ROWS = 100;
/** Targets returned on the profile — the most recent windows first. */
const PROFILE_TARGET_ROWS = 24;

/**
 * students.admission_status code -> label. Mirrors ADMISSION_STATUS_LABELS in
 * students.service.ts (module-private there) so the profile's buckets read the
 * same as the Students screen.
 */
const ADMISSION_STATUS_LABELS: Record<number, string> = {
  0: 'Pending',
  1: 'In Progress',
  2: 'Enrolled',
  3: 'Passed Out',
  4: 'Dropout',
  5: 'Cancelled',
};
const ADMISSION_STATUS_ORDER = [
  'Pending',
  'In Progress',
  'Enrolled',
  'Passed Out',
  'Dropout',
  'Cancelled',
  'Unknown',
] as const;

function admissionStatusLabel(code: number | null | undefined): string {
  if (code == null) return 'Unknown';
  return ADMISSION_STATUS_LABELS[code] ?? 'Unknown';
}

/** Application lifecycle label — same rule as students.service.ts. */
function applicationStatusLabel(a: {
  is_converted: number | null;
  is_archived: boolean;
  status: boolean | null;
}): string {
  if (a.is_converted === 1) return 'Converted';
  if (a.is_archived) return 'Archived';
  if (a.status === false) return 'Inactive';
  return 'Active';
}

/** Midnight today (UTC) — target windows are @db.Date columns. */
function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** The window contains `day` (open ends count as unbounded). */
function targetWindowContains(
  t: { from_date: Date | null; to_date: Date | null },
  day: Date,
): boolean {
  return (!t.from_date || t.from_date <= day) && (!t.to_date || t.to_date >= day);
}

/**
 * Strict YYYY-MM-DD -> UTC midnight Date for the @db.Date columns. `new Date()`
 * silently rolls impossible days forward (2025-02-30 -> 2025-03-02), which
 * would store a window nobody asked for, so the parts must round-trip.
 */
function parseTargetDate(value: string, field: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(Date.UTC(y, mo - 1, d));
    if (
      date.getUTCFullYear() === y &&
      date.getUTCMonth() === mo - 1 &&
      date.getUTCDate() === d
    ) {
      return date;
    }
  }
  throw new BadRequestException(`${field} is not a valid calendar date (YYYY-MM-DD).`);
}

function assertWindowOrder(from: Date, to: Date): void {
  if (to < from) {
    throw new BadRequestException('to_date must be on or after from_date.');
  }
}

type TargetForPerformance = {
  type: number | null;
  value: number | null;
  consultant_id: number | null;
  from_date: Date | null;
  to_date: Date | null;
};
type ActiveTargetSummary = {
  consultant_target_id: number;
  consultant_id: number | null;
  type: number | null;
  value: number | null;
  from_date: Date | null;
  to_date: Date | null;
  achieved: number;
  performance: string;
};
type StudentForPerformance = {
  consultant_id: number;
  course_id: number | null;
  enrollment_date: Date | null;
};

/**
 * The student enrolled inside the target's window. Same semantics as the old
 * per-target Prisma filter: no window at all matches every student; any bound
 * excludes a NULL enrollment_date (SQL comparison with NULL is never true).
 */
function enrolledWithin(enrolled: Date | null, t: TargetForPerformance): boolean {
  if (!t.from_date && !t.to_date) return true;
  if (!enrolled) return false;
  if (t.from_date && enrolled < t.from_date) return false;
  if (t.to_date && enrolled > t.to_date) return false;
  return true;
}

/**
 * One enrollment_date filter covering every target's window (min from_date to
 * max to_date). A bound is dropped when any target leaves that end open, and
 * the filter is dropped entirely when any target has no window at all, since
 * that target counts students with no enrollment_date too.
 */
function enrollmentWindowUnion(
  targets: readonly TargetForPerformance[],
): Prisma.studentsWhereInput {
  if (targets.length === 0 || targets.some((t) => !t.from_date && !t.to_date)) return {};
  const froms = targets.map((t) => t.from_date);
  const tos = targets.map((t) => t.to_date);
  // reduce, not Math.min(...spread): the Targets screen can pass thousands.
  const lower = froms.every((d): d is Date => d != null)
    ? froms.reduce((a, b) => (b < a ? b : a))
    : undefined;
  const upper = tos.every((d): d is Date => d != null)
    ? tos.reduce((a, b) => (b > a ? b : a))
    : undefined;
  if (!lower && !upper) return { enrollment_date: { not: null } };
  return {
    enrollment_date: { ...(lower ? { gte: lower } : {}), ...(upper ? { lte: upper } : {}) },
  };
}

/**
 * Status counts, distinct counsellors and window months across a whole target
 * list (no extra queries). Status uses the same UTC "today" as is_active:
 * Upcoming = starts after today, Ended = ended before today, else Active.
 */
function summariseTargets(
  targets: readonly { consultant_id: number | null; from_date: Date | null; to_date: Date | null }[],
  today: Date,
) {
  let active = 0;
  let upcoming = 0;
  let ended = 0;
  const consultantIds = new Set<number>();
  const months = new Set<string>();
  for (const t of targets) {
    if (t.from_date && t.from_date > today) upcoming += 1;
    else if (t.to_date && t.to_date < today) ended += 1;
    else active += 1;
    if (t.consultant_id != null) consultantIds.add(t.consultant_id);
    const anchorDate = t.from_date ?? t.to_date;
    if (anchorDate) months.add(anchorDate.toISOString().slice(0, 7));
  }
  return {
    active,
    upcoming,
    ended,
    consultant_ids: [...consultantIds].sort((x, y) => x - y),
    months: [...months].sort().reverse(),
  };
}

/** Trim a group code; blank or null means "no code" (stored as NULL). */
function normaliseGroupCode(code: string | null | undefined): string | null {
  const trimmed = code?.trim();
  return trimmed ? trimmed : null;
}

function isoDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : 'open';
}

function targetTypeLabel(type: number): string {
  if (type === TARGET_TYPE_POINTS) return 'points';
  if (type === TARGET_TYPE_COUNT) return 'admissions';
  return `type ${type}`;
}

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

  /**
   * Never leak credentials in API responses. Every users row this module
   * returns passes through here, so the deny-list is the single place a new
   * credential column has to be added. See USER_SECRET_FIELDS.
   */
  /** Remove every credential column — see common/user-secrets.ts. */
  private stripSecrets<T extends object>(user: T): Omit<T, UserSecretField> {
    return stripUserSecrets(user);
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

    const [decorated, activeTargets] = await Promise.all([
      this.decorateHierarchy(items.map((u) => this.stripSecrets(u))),
      this.activeTargetsByConsultant(items.map((u) => u.id)),
    ]);

    return {
      // active_targets: the targets whose window contains today, with
      // achieved/performance (additive; [] when the counsellor has none).
      items: decorated.map((u) => ({ ...u, active_targets: activeTargets.get(u.id) ?? [] })),
      total,
      page: pg.page,
      limit: pg.limit,
    };
  }

  /**
   * Active targets (window contains today) for a page of counsellors, with
   * achieved and performance — three queries total for the whole page (the
   * targets, then targetPerformanceBatch's two). Feeds the list's Active
   * Target column, which used to render a hard-coded 0/0 for everyone.
   */
  private async activeTargetsByConsultant(consultantIds: number[]) {
    const byConsultant = new Map<number, ActiveTargetSummary[]>();
    if (consultantIds.length === 0) return byConsultant;

    const today = startOfToday();
    const targets = await this.prisma.consultant_target.findMany({
      where: {
        consultant_id: { in: consultantIds },
        deleted_at: null,
        AND: [
          { OR: [{ from_date: null }, { from_date: { lte: today } }] },
          { OR: [{ to_date: null }, { to_date: { gte: today } }] },
        ],
      },
      orderBy: [{ type: 'asc' }, { from_date: 'desc' }, { consultant_target_id: 'desc' }],
      select: {
        consultant_target_id: true,
        consultant_id: true,
        type: true,
        value: true,
        from_date: true,
        to_date: true,
      },
    });
    const performance = await this.targetPerformanceBatch(targets);

    targets.forEach((t, i) => {
      const cid = t.consultant_id as number;
      byConsultant.set(cid, [...(byConsultant.get(cid) ?? []), { ...t, ...performance[i] }]);
    });
    return byConsultant;
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
    const code = normaliseGroupCode(dto.code);
    await this.assertGroupCodeFree(code);
    if (dto.manager_id !== undefined) await this.assertUserExists(dto.manager_id);

    const now = new Date();
    return this.withGroupCodeGuard(() =>
      this.prisma.counsellor_group.create({
        data: {
          code,
          name: dto.name,
          manager_id: dto.manager_id ?? null,
          status: dto.status ?? 1,
          created_by: actorUserId,
          created_at: now,
          updated_at: now,
        },
      }),
    );
  }

  /** PATCH /consultants/groups/:id */
  async updateGroup(id: number, dto: UpdateCounsellorGroupDto, actorUserId: number) {
    const existing = await this.prisma.counsellor_group.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) throw new NotFoundException('Counsellor group not found!');

    // "" or null clears the code; anything else must be free (409 otherwise).
    const code = dto.code !== undefined ? normaliseGroupCode(dto.code) : undefined;
    if (code !== undefined && code !== existing.code) {
      await this.assertGroupCodeFree(code, id);
    }
    if (dto.manager_id !== undefined && dto.manager_id !== null) {
      await this.assertUserExists(dto.manager_id);
    }

    return this.withGroupCodeGuard(() =>
      this.prisma.counsellor_group.update({
        where: { id },
        data: {
          ...(code !== undefined ? { code } : {}),
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.manager_id !== undefined ? { manager_id: dto.manager_id } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          updated_by: actorUserId,
          updated_at: new Date(),
        },
      }),
    );
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

  /**
   * Group codes are the operator-facing identifier, so they must be unique.
   *
   * uq_counsellor_group_code is a plain UNIQUE index, so it also covers
   * soft-deleted groups (removeGroup keeps the code for the audit trail). The
   * check therefore ignores deleted_at, like assertEmployeeCodeFree: a code held
   * by a deleted group would otherwise pass here and fail on the index as a 500.
   */
  private async assertGroupCodeFree(code: string | null, exceptGroupId?: number) {
    if (!code) return;
    const clash = await this.prisma.counsellor_group.findFirst({
      where: {
        code,
        ...(exceptGroupId !== undefined ? { id: { not: exceptGroupId } } : {}),
      },
      select: { id: true, deleted_at: true },
    });
    if (!clash) return;
    throw new ConflictException(
      clash.deleted_at
        ? `Group code ${code} belongs to a deleted group and cannot be reused`
        : `A group with code ${code} already exists`,
    );
  }

  /** Turn a lost race on uq_counsellor_group_code into the same 409. */
  private async withGroupCodeGuard<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('A group with this code already exists');
      }
      throw e;
    }
  }

  private async assertUserExists(userId: number) {
    const user = await this.prisma.users.findFirst({
      where: { id: userId, deleted_at: null },
    });
    if (!user) throw new NotFoundException('User not found!');
  }

  /**
   * users.employee_code carries a UNIQUE index (uq_users_employee_code) that
   * also covers soft-deleted rows, so the check deliberately ignores deleted_at:
   * a code held by a deleted user would still make the write fail.
   */
  private async assertEmployeeCodeFree(code: string | null, exceptUserId?: number) {
    if (!code) return;
    const holder = await this.prisma.users.findFirst({
      where: {
        employee_code: code,
        ...(exceptUserId !== undefined ? { id: { not: exceptUserId } } : {}),
      },
      select: { id: true, name: true, deleted_at: true },
    });
    if (!holder) return;
    throw new ConflictException(
      holder.deleted_at
        ? `Employee code ${code} belongs to a deleted user and cannot be reused`
        : `Employee code ${code} is already assigned to ${holder.name ?? `user #${holder.id}`}`,
    );
  }

  /** Turn a lost race on uq_users_employee_code into the same 409. */
  private async withEmployeeCodeGuard<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002' &&
        JSON.stringify(e.meta ?? {}).includes('employee_code')
      ) {
        throw new ConflictException('This employee code is already assigned to another user');
      }
      throw e;
    }
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

    // Team / Team Leader / Group / Manager, so the profile header is not "—".
    const [decorated] = await this.decorateHierarchy([this.stripSecrets(consultant)]);

    return {
      ...decorated,
      reports_to_name: await this.userName(consultant.reports_to),
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
    // The DTO has already normalised the phone (QA C08). An Indian national
    // number with no dial code gets 91, matching every clean legacy row.
    const phone = dto.phone ? dto.phone : undefined;
    const code =
      dto.code ?? (phone && isIndianNational(phone) ? INDIA_DIAL_CODE : undefined);
    const employeeCode = dto.employee_code ? dto.employee_code : null;

    // Duplicate guard (legacy checked code+phone and email separately). The
    // phone is matched in every shape the legacy forms stored it in, so posting
    // "8714689444" is caught by an existing "87146 89444". The dial code only
    // narrows the match for a non-Indian number.
    const dupPhone = phone
      ? await this.prisma.users.count({
          where: {
            phone: { in: storedPhoneVariants(phone) },
            ...(code !== undefined && code !== INDIA_DIAL_CODE ? { code } : {}),
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
    await this.assertEmployeeCodeFree(employeeCode);

    const now = new Date();
    const hashed = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const consultant = await this.withEmployeeCodeGuard(() =>
      this.prisma.users.create({
      data: {
        name: dto.name,
        username: dto.username,
        password: hashed,
        code: code ?? null,
        phone: phone ?? null,
        employee_code: employeeCode,
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
      }),
    );

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

    // Phone arrives normalised from the DTO (QA C08). An empty string clears it.
    // A new Indian number with no dial code posted gets 91, like on create.
    if (dto.phone !== undefined) {
      data.phone = dto.phone === '' ? null : dto.phone;
      if (dto.code === undefined && dto.phone && isIndianNational(dto.phone)) {
        data.code = INDIA_DIAL_CODE;
      }
    }

    // Employee code: "" clears it; anything else must be free (409 otherwise).
    if (dto.employee_code !== undefined) {
      const employeeCode = dto.employee_code === '' ? null : dto.employee_code;
      await this.assertEmployeeCodeFree(employeeCode, id);
      data.employee_code = employeeCode;
    }

    if (dto.assigned_universities !== undefined) {
      data.assigned_universities = this.encodeUniversities(
        dto.assigned_universities,
      );
    }

    if (dto.password !== undefined && dto.password !== '') {
      data.password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    }

    const consultant = await this.withEmployeeCodeGuard(() =>
      this.prisma.users.update({ where: { id }, data }),
    );

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
   *
   * Extended for the profile screen (QA C07), which used to download the 100
   * newest applications and students SYSTEM-WIDE and count the ones that
   * belonged to this counsellor in the browser — so every KPI was computed over
   * a truncated slice (844 applications and 1,500+ students exist). Everything
   * the profile shows is now computed here over the complete set:
   *   - students       every one of the counsellor's students (as before), each
   *                    with course/university titles and a status label;
   *   - student_counts the students bucketed by admission status;
   *   - application_counts / total_applications  ONE groupBy over all of the
   *                    counsellor's applications;
   *   - applications   the most recent ones, for the table (capped, see below);
   *   - targets        the counsellor's targets with achieved/performance and
   *                    an `is_active` flag (window contains today);
   *   - the Group -> Team -> Counsellor chain and reports_to_name.
   * Every added field is additive; the original response keys are unchanged.
   */
  async performanceOne(id: number) {
    const consultant = await this.getConsultantOrThrow(id);

    // An application belongs to a counsellor through pipeline_user, falling back
    // to created_by when unassigned — the same rule GET /applications uses to
    // fill its derived consultant_id.
    const applicationWhere: Prisma.applicationsWhereInput = {
      deleted_at: null,
      OR: [{ pipeline_user: id }, { pipeline_user: null, created_by: id }],
    };

    const [studentProfiles, applicationGroups, recentApplications, targets] =
      await Promise.all([
        this.prisma.students.findMany({
          where: { consultant_id: id, deleted_at: null },
          orderBy: { id: 'desc' },
        }),
        this.prisma.applications.groupBy({
          by: ['is_converted', 'is_archived', 'status'],
          where: applicationWhere,
          _count: { _all: true },
        }),
        this.prisma.applications.findMany({
          where: applicationWhere,
          orderBy: { application_id: 'desc' },
          take: PROFILE_APPLICATION_ROWS,
          select: {
            application_id: true,
            custom_application_id: true,
            name: true,
            course_id: true,
            enrollment_date: true,
            created_at: true,
            is_converted: true,
            is_archived: true,
            status: true,
          },
        }),
        this.profileTargets(id),
      ]);

    const studentUserIds = studentProfiles.map((s) => s.student_id);
    const [feeByStudent, studentsWithUsers, courseTitles] = await Promise.all([
      this.feeRevenueByStudent(studentUserIds),
      this.attachStudentUsers(studentProfiles),
      this.courseTitles([
        ...studentProfiles.map((s) => s.course_id),
        ...recentApplications.map((a) => a.course_id),
      ]),
    ]);

    const students = studentsWithUsers.map((s) => ({
      ...s,
      total_fee_revenue: feeByStudent.get(s.student_id) ?? 0,
      admission_status_label: admissionStatusLabel(s.admission_status),
      ...courseTitles.titlesFor(s.course_id),
    }));

    const totalFeeRevenue = students.reduce(
      (sum, s) => sum + s.total_fee_revenue,
      0,
    );

    const studentCounts = Object.fromEntries(
      ADMISSION_STATUS_ORDER.map((label) => [label, 0]),
    ) as Record<(typeof ADMISSION_STATUS_ORDER)[number], number>;
    for (const s of students) {
      const label = s.admission_status_label as keyof typeof studentCounts;
      studentCounts[label] = (studentCounts[label] ?? 0) + 1;
    }

    const applicationCounts = { total: 0, open: 0, converted: 0, closed: 0 };
    for (const g of applicationGroups) {
      const n = g._count._all;
      applicationCounts.total += n;
      if (g.is_converted === 1) applicationCounts.converted += n;
      else if (g.is_archived || g.status === false) applicationCounts.closed += n;
      else applicationCounts.open += n;
    }

    const applications = recentApplications.map((a) => ({
      ...a,
      applicant_name: a.name ?? null,
      status_label: applicationStatusLabel(a),
      ...courseTitles.titlesFor(a.course_id),
    }));

    // Achieved for every target in two queries total (targetPerformanceBatch).
    const today = startOfToday();
    const performance = await this.targetPerformanceBatch(targets);
    const targetRows = targets.map((t, i) => ({
      ...t,
      ...performance[i],
      is_active: targetWindowContains(t, today),
    }));

    const [decorated] = await this.decorateHierarchy([this.stripSecrets(consultant)]);

    return {
      ...decorated,
      reports_to_name: await this.userName(consultant.reports_to),
      students,
      total_students: students.length,
      total_fee_revenue: totalFeeRevenue,
      student_counts: studentCounts,
      total_applications: applicationCounts.total,
      application_counts: applicationCounts,
      applications,
      applications_truncated: applicationCounts.total > applications.length,
      targets: targetRows,
    };
  }

  /**
   * The profile's targets: the PROFILE_TARGET_ROWS most recent windows, plus
   * every window that contains today. Without the second query a counsellor
   * with a year planned ahead (24+ future targets) had the current one cut off,
   * and the profile said "No target" while one was active. Newest window first.
   */
  private async profileTargets(consultantId: number) {
    const today = startOfToday();
    const [recent, active] = await Promise.all([
      this.prisma.consultant_target.findMany({
        where: { consultant_id: consultantId, deleted_at: null },
        orderBy: [{ from_date: 'desc' }, { consultant_target_id: 'desc' }],
        take: PROFILE_TARGET_ROWS,
      }),
      this.prisma.consultant_target.findMany({
        where: {
          consultant_id: consultantId,
          deleted_at: null,
          AND: [
            { OR: [{ from_date: null }, { from_date: { lte: today } }] },
            { OR: [{ to_date: null }, { to_date: { gte: today } }] },
          ],
        },
      }),
    ]);
    const seen = new Set(recent.map((t) => t.consultant_target_id));
    return [...recent, ...active.filter((t) => !seen.has(t.consultant_target_id))].sort(
      (a, b) =>
        (b.from_date?.getTime() ?? 0) - (a.from_date?.getTime() ?? 0) ||
        b.consultant_target_id - a.consultant_target_id,
    );
  }

  /** Name of one user, or null when unset/missing. */
  private async userName(userId: number | null | undefined): Promise<string | null> {
    if (!userId) return null;
    const user = await this.prisma.users.findFirst({
      where: { id: userId, deleted_at: null },
      select: { name: true },
    });
    return user?.name ?? null;
  }

  /**
   * Course + university titles for a set of course ids, two bulk queries total.
   * Returns a lookup so callers can spread `{course_title, university_id,
   * university_title}` onto any row carrying a course_id.
   */
  private async courseTitles(courseIds: (number | null)[]) {
    const ids = [...new Set(courseIds.filter((c): c is number => c != null))];
    const courses = ids.length
      ? await this.prisma.course.findMany({
          where: { id: { in: ids } },
          select: { id: true, title: true, university_id: true },
        })
      : [];
    const universityIds = [
      ...new Set(courses.map((c) => c.university_id).filter((u): u is number => u != null)),
    ];
    const universities = universityIds.length
      ? await this.prisma.university.findMany({
          where: { id: { in: universityIds } },
          select: { id: true, title: true },
        })
      : [];
    const courseById = new Map(courses.map((c) => [c.id, c]));
    const universityTitle = new Map(universities.map((u) => [u.id, u.title ?? null]));

    return {
      titlesFor(courseId: number | null) {
        const course = courseId != null ? courseById.get(courseId) : undefined;
        const universityId = course?.university_id ?? null;
        return {
          course_title: course?.title ?? null,
          university_id: universityId,
          university_title:
            universityId != null ? (universityTitle.get(universityId) ?? null) : null,
        };
      },
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
   *
   * Ordered by the target window, newest first (from_date, then to_date, then
   * id as a stable tie-break). It used to be ordered by consultant_target_id,
   * i.e. insertion order, which read as a shuffled list of months (QA TG02).
   * Each row also carries consultant_employee_code (so the screen can show the
   * counsellor's display id instead of the bare users.id) and is_active (the
   * window contains today — the same rule the counsellor profile uses).
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
      orderBy: [
        { from_date: 'desc' },
        { to_date: 'desc' },
        { consultant_target_id: 'desc' },
      ],
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
                      { employee_code: { contains: query.search } },
                    ],
                  }
                : {}),
            },
            select: { id: true, name: true, employee_code: true },
          })
        : [];

    const consultantById = new Map(consultants.map((c) => [c.id, c]));

    // When searching, drop targets whose consultant didn't match the search.
    const filtered = query.search
      ? allTargets.filter(
          (t) => t.consultant_id != null && consultantById.has(t.consultant_id),
        )
      : allTargets;

    // Order does not depend on performance, so only the requested page is
    // computed, and in two queries total rather than one or two per target.
    const today = startOfToday();
    const page = filtered.slice(pg.skip, pg.skip + pg.limit);
    const performance = await this.targetPerformanceBatch(page);
    const items = page.map((target, i) => {
      const consultant =
        target.consultant_id != null ? consultantById.get(target.consultant_id) : undefined;
      return {
        ...target,
        consultant_name: consultant?.name ?? null,
        consultant_employee_code: consultant?.employee_code ?? null,
        is_active: targetWindowContains(target, today),
        ...performance[i],
      };
    });

    return {
      items,
      total: filtered.length,
      page: pg.page,
      limit: pg.limit,
      // Over EVERY matching target, not just this page, so the screen's KPI
      // cards and month filter stay right when the list is longer than a page.
      summary: summariseTargets(filtered, today),
    };
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
            select: { id: true, name: true, employee_code: true },
          })
        : null;

    const [performance] = await this.targetPerformanceBatch([target]);

    return {
      ...target,
      consultant_name: consultant?.name ?? null,
      consultant_employee_code: consultant?.employee_code ?? null,
      is_active: targetWindowContains(target, startOfToday()),
      ...performance,
    };
  }

  /**
   * POST /consultant-targets — create a target after the legacy date-range
   * conflict guard (no overlapping target for the same consultant + type).
   * Port of Consultant_target::add.
   *
   * Also rejects what the legacy port let through: impossible calendar dates
   * (JS rolls 2025-02-30 over to 2 March), a window that ends before it starts,
   * and a consultant_id that is not a live counsellor (the target would be
   * orphaned and show as a nameless row).
   */
  async createTarget(dto: CreateTargetDto, actorUserId: number) {
    const fromDate = parseTargetDate(dto.from_date, 'from_date');
    const toDate = parseTargetDate(dto.to_date, 'to_date');
    assertWindowOrder(fromDate, toDate);

    const consultant = await this.prisma.users.findFirst({
      where: {
        id: dto.consultant_id,
        role_id: CONSULTANT_ROLE_ID,
        deleted_at: null,
      },
      select: { id: true },
    });
    if (!consultant) {
      throw new NotFoundException('Consultant not found!');
    }

    await this.assertNoTargetOverlap(dto.consultant_id, dto.type, fromDate, toDate);

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

  /**
   * PATCH /consultant-targets/:id — partial update (port of Consultant_target::edit).
   *
   * Only the fields sent are written. When the type or window changes, the
   * same overlap guard as create runs against the merged values (excluding
   * this row), so an edit cannot produce two clashing targets the create path
   * would have refused.
   */
  async updateTarget(id: number, dto: UpdateTargetDto, actorUserId: number) {
    const existing = await this.prisma.consultant_target.findFirst({
      where: { consultant_target_id: id, deleted_at: null },
    });
    if (!existing) {
      throw new NotFoundException('Consultant target not found!');
    }

    const fromDate =
      dto.from_date !== undefined
        ? parseTargetDate(dto.from_date, 'from_date')
        : existing.from_date;
    const toDate =
      dto.to_date !== undefined
        ? parseTargetDate(dto.to_date, 'to_date')
        : existing.to_date;
    if (fromDate && toDate) assertWindowOrder(fromDate, toDate);

    const type = dto.type ?? existing.type;
    const windowChanged =
      dto.type !== undefined || dto.from_date !== undefined || dto.to_date !== undefined;
    if (
      windowChanged &&
      existing.consultant_id != null &&
      type != null &&
      fromDate &&
      toDate
    ) {
      await this.assertNoTargetOverlap(existing.consultant_id, type, fromDate, toDate, id);
    }

    const data: Record<string, unknown> = {
      updated_by: actorUserId,
      updated_at: new Date(),
    };
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.value !== undefined) data.value = dto.value;
    if (dto.from_date !== undefined) data.from_date = fromDate;
    if (dto.to_date !== undefined) data.to_date = toDate;

    return this.prisma.consultant_target.update({
      where: { consultant_target_id: id },
      data,
    });
  }

  /**
   * The legacy conflict guard: an existing target clashes when it is for the
   * same consultant and type and its window intersects [from, to] — i.e.
   * existing.from_date <= to AND existing.to_date >= from.
   */
  private async assertNoTargetOverlap(
    consultantId: number,
    type: number,
    from: Date,
    to: Date,
    excludeId?: number,
  ) {
    const conflict = await this.prisma.consultant_target.findFirst({
      where: {
        deleted_at: null,
        consultant_id: consultantId,
        type,
        from_date: { lte: to },
        to_date: { gte: from },
        ...(excludeId !== undefined
          ? { consultant_target_id: { not: excludeId } }
          : {}),
      },
      select: { consultant_target_id: true, from_date: true, to_date: true },
    });

    if (conflict) {
      const span = `${isoDate(conflict.from_date)} to ${isoDate(conflict.to_date)}`;
      throw new ConflictException(
        `Date range conflicts with an existing ${targetTypeLabel(type)} target for this consultant (${span}).`,
      );
    }
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
   * Achieved value and performance % for many targets in at most TWO queries,
   * whatever the target count. Mirrors Consultant_target::index:
   *   - type 1 (points): SUM(specialisations.point) over the course of every
   *     student the consultant enrolled within [from_date, to_date];
   *   - type 2 (count): COUNT of those students.
   * An open end of the window is unbounded, and a target with no window at all
   * counts every student (including ones with no enrollment_date), exactly as
   * the per-target query did.
   *
   * This used to run one students query (plus a specialisations query for
   * points) PER target — about 2,000 queries for the Targets screen's
   * limit=1000. Now: one students query across every consultant involved and
   * the union of their windows, one specialisations query for the courses
   * found, then bucketing in memory. Results are returned in input order.
   */
  private async targetPerformanceBatch(targets: readonly TargetForPerformance[]) {
    const owned = targets.filter((t) => t.consultant_id != null);
    const consultantIds = [...new Set(owned.map((t) => t.consultant_id as number))];

    const studentsByConsultant = new Map<number, StudentForPerformance[]>();
    const pointByCourse = new Map<number, number>();

    if (consultantIds.length > 0) {
      const students = await this.prisma.students.findMany({
        where: {
          consultant_id: { in: consultantIds },
          deleted_at: null,
          ...enrollmentWindowUnion(owned),
        },
        select: { consultant_id: true, course_id: true, enrollment_date: true },
      });
      for (const s of students) {
        studentsByConsultant.set(s.consultant_id, [
          ...(studentsByConsultant.get(s.consultant_id) ?? []),
          s,
        ]);
      }

      const needsPoints = owned.some((t) => t.type === TARGET_TYPE_POINTS);
      const courseIds = needsPoints
        ? [
            ...new Set(
              students.map((s) => s.course_id).filter((c): c is number => c != null),
            ),
          ]
        : [];
      if (courseIds.length > 0) {
        const specs = await this.prisma.specialisations.findMany({
          where: { course_id: { in: courseIds }, deleted_at: null },
          select: { course_id: true, point: true },
        });
        // point is a Text column; sum the numeric value per course.
        for (const spec of specs) {
          if (spec.course_id == null) continue;
          const n = Number(spec.point);
          pointByCourse.set(
            spec.course_id,
            (pointByCourse.get(spec.course_id) ?? 0) + (Number.isNaN(n) ? 0 : n),
          );
        }
      }
    }

    return targets.map((target) => {
      const value = target.value ?? 0;
      if (target.consultant_id == null) return { achieved: 0, performance: '0%' };

      const inWindow = (studentsByConsultant.get(target.consultant_id) ?? []).filter(
        (s) => enrolledWithin(s.enrollment_date, target),
      );

      let achieved = 0;
      if (target.type === TARGET_TYPE_POINTS) {
        achieved = inWindow.reduce(
          (sum, s) => sum + (s.course_id != null ? (pointByCourse.get(s.course_id) ?? 0) : 0),
          0,
        );
      } else if (target.type === TARGET_TYPE_COUNT) {
        achieved = inWindow.length;
      }

      const pct = value > 0 ? (achieved / value) * 100 : 0;
      return { achieved, performance: `${Math.round(pct * 100) / 100}%` };
    });
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
