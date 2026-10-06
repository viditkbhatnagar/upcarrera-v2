import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isCandidateDocFile } from '../common/candidate-doc';
import { RoleRegistryService } from './role-registry.service';
import {
  ActorContext,
  allowedActions,
  effectiveStage,
  effectiveStageWhere,
  Stage,
  StageRow,
} from './stages';

/** The authenticated principal, as populated on request.user by JwtStrategy. */
export interface AccessUser {
  userId?: number | null;
  id?: number | null;
  roleId?: number | null;
  role_id?: number | null;
}

/** The row fields record access reads to decide ownership. */
export interface OwnedRow extends StageRow {
  pipeline_user: number | null;
  created_by: number | null;
}

export type AccessScope =
  | { scope: 'all'; roleKey: string | null; roleId: number | null }
  | { scope: 'owners'; ids: number[]; roleKey: string | null; roleId: number | null }
  | { scope: 'stages'; stages: Stage[]; roleKey: string | null; roleId: number | null }
  | { scope: 'none'; roleKey: string | null; roleId: number | null };

interface CacheEntry {
  scope: AccessScope;
  at: number;
}

/** scopeFor re-reads the role FRESH from the DB, cached only this long. */
const SCOPE_TTL_MS = 60_000;

/**
 * Server-side record (row) access for applications (QA AP04). It NEVER trusts the
 * 7-day JWT role snapshot: scopeFor() reads users.role_id fresh (cached 60s), so
 * a deactivated or role-changed user loses access without re-login.
 *
 * Leaders and managers are identified through the migration-001 hierarchy
 * (sales_team.leader, counsellor_group.manager_id), NOT by role id (CRITIQUE #6).
 * The VARCHAR sales_team.leader is only ever compared to a user id as a
 * TS-built string value (`leader: String(me)`), never through a cross-table
 * varchar join, so the mixed legacy collations can never raise an error.
 *
 * scopeWhere() (the list predicate) and canSee() (the loaded-row check) mirror
 * each other exactly, so the list and the detail guard cannot drift apart.
 */
@Injectable()
export class RecordAccessService {
  private readonly cache = new Map<number, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RoleRegistryService,
  ) {}

  private resolveId(user: AccessUser | null | undefined): number | null {
    const raw = user?.userId ?? user?.id;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  /** Clear the fresh-role cache (used by tests and after a role change). */
  invalidate(userId?: number): void {
    if (userId === undefined) this.cache.clear();
    else this.cache.delete(userId);
  }

  /** The access scope for a user, reading the role FRESH from the DB (cached 60s). */
  async scopeFor(user: AccessUser | null | undefined): Promise<AccessScope> {
    const id = this.resolveId(user);
    if (id == null) return { scope: 'none', roleKey: null, roleId: null };

    const cached = this.cache.get(id);
    if (cached && Date.now() - cached.at < SCOPE_TTL_MS) return cached.scope;

    const fresh = await this.prisma.users.findUnique({
      where: { id },
      select: { id: true, role_id: true, status: true, deleted_at: true },
    });

    let scope: AccessScope;
    if (!fresh || fresh.deleted_at != null || fresh.status === 0) {
      scope = { scope: 'none', roleKey: null, roleId: fresh?.role_id ?? null };
    } else {
      scope = await this.buildScope(id, fresh.role_id ?? null);
    }

    this.cache.set(id, { scope, at: Date.now() });
    return scope;
  }

  private async buildScope(id: number, roleId: number | null): Promise<AccessScope> {
    const roleKey = this.roles.keyForId(roleId);
    const base = { roleKey, roleId };

    switch (roleKey) {
      case 'super_admin':
      case 'admin':
        return { scope: 'all', ...base };
      case 'counsellor':
        return { scope: 'owners', ids: [id], ...base };
      case 'team_leader':
        return { scope: 'owners', ids: await this.teamLeaderIds(id), ...base };
      case 'manager':
        return { scope: 'owners', ids: await this.managerIds(id), ...base };
      case 'accounts':
        return { scope: 'stages', stages: ['fee_verification'], ...base };
      case 'student_affairs':
        return {
          scope: 'stages',
          stages: ['sa_verification', 'converted', 'rejected'],
          ...base,
        };
      default:
        return { scope: 'none', ...base };
    }
  }

  /** me + members of the teams I lead (sales_team.leader = me) + my direct reports. */
  private async teamLeaderIds(me: number): Promise<number[]> {
    const ledTeams = await this.prisma.sales_team.findMany({
      where: { leader: String(me), deleted_at: null },
      select: { id: true },
    });
    const teamIds = ledTeams.map((t) => t.id);

    const [members, reports] = await Promise.all([
      teamIds.length
        ? this.prisma.users.findMany({
            where: { team_id: { in: teamIds }, deleted_at: null },
            select: { id: true },
          })
        : Promise.resolve([]),
      this.prisma.users.findMany({
        where: { reports_to: me, deleted_at: null },
        select: { id: true },
      }),
    ]);

    return this.unique([me, ...members.map((m) => m.id), ...reports.map((r) => r.id)]);
  }

  /** me + the members and leaders of the teams in the groups I manage + my direct reports. */
  private async managerIds(me: number): Promise<number[]> {
    const groups = await this.prisma.counsellor_group.findMany({
      where: { manager_id: me, deleted_at: null },
      select: { id: true },
    });
    const groupIds = groups.map((g) => g.id);

    const teams = groupIds.length
      ? await this.prisma.sales_team.findMany({
          where: { group_id: { in: groupIds }, deleted_at: null },
          select: { id: true, leader: true },
        })
      : [];
    const teamIds = teams.map((t) => t.id);
    // Leaders are VARCHAR ids: parse in TS, never join the varchar column.
    const leaderIds = teams
      .map((t) => Number(t.leader))
      .filter((n) => Number.isFinite(n) && n > 0);

    const [members, reports] = await Promise.all([
      teamIds.length
        ? this.prisma.users.findMany({
            where: { team_id: { in: teamIds }, deleted_at: null },
            select: { id: true },
          })
        : Promise.resolve([]),
      this.prisma.users.findMany({
        where: { reports_to: me, deleted_at: null },
        select: { id: true },
      }),
    ]);

    return this.unique([
      me,
      ...members.map((m) => m.id),
      ...leaderIds,
      ...reports.map((r) => r.id),
    ]);
  }

  private unique(ids: number[]): number[] {
    return [...new Set(ids)];
  }

  /** The Prisma predicate for a scope — ANDed into the list query. */
  scopeWhere(scope: AccessScope): Prisma.applicationsWhereInput {
    switch (scope.scope) {
      case 'all':
        return {};
      case 'owners':
        return {
          OR: [
            { pipeline_user: { in: scope.ids } },
            { pipeline_user: null, created_by: { in: scope.ids } },
          ],
        };
      case 'stages':
        return { OR: scope.stages.map((s) => effectiveStageWhere(s)) };
      case 'none':
      default:
        // Match nothing.
        return { application_id: { in: [] } };
    }
  }

  /** The in-memory mirror of scopeWhere for an already-loaded row. */
  canSee(scope: AccessScope, row: OwnedRow): boolean {
    switch (scope.scope) {
      case 'all':
        return true;
      case 'owners':
        return row.pipeline_user != null
          ? scope.ids.includes(row.pipeline_user)
          : row.created_by != null && scope.ids.includes(row.created_by);
      case 'stages':
        return scope.stages.includes(effectiveStage(row));
      case 'none':
      default:
        return false;
    }
  }

  /** 403 'Access denied' when the user cannot view application `id`. Shares scopeWhere. */
  async assertCanView(user: AccessUser, id: number): Promise<void> {
    const scope = await this.scopeFor(user);
    const n = await this.prisma.applications.count({
      where: { AND: [{ application_id: id, deleted_at: null }, this.scopeWhere(scope)] },
    });
    if (n === 0) throw new ForbiddenException('Access denied');
  }

  /**
   * LOW-LEVEL resolver for an APPLICATION/STUDENT document only: the application it
   * belongs to — its own application_id when set, else — for a converted student's
   * doc — via the students row (students.application_id holds the custom APP-id
   * string). null when neither resolves, so the caller can fail closed.
   *
   * DANGER: the student_document `application_id` column is OVERLOADED — an
   * application/student doc stores a real applications.application_id, but a
   * candidate (lead) doc stores a leads.id (see common/candidate-doc.ts). So this
   * MUST NOT be called on a row acted on by its id without FIRST classifying it:
   * for a candidate doc it would return a leads.id that assertCanView would then
   * mistreat as an application id. The discriminator-aware entry point for acting
   * on a document BY ITS ROW id is assertCanAccessDocumentRow below — every such
   * route (files/students/applications/candidates) goes through it. This helper is
   * only called directly where the row class is already known to be an
   * application/student doc (createStudentDocument's student -> application scoping,
   * and the non-candidate branch of assertCanAccessDocumentRow).
   */
  async resolveDocumentApplicationId(doc: {
    application_id: number | null;
    student_id: number | null;
  }): Promise<number | null> {
    if (doc.application_id != null) return doc.application_id;
    if (doc.student_id != null) {
      const student = await this.prisma.students.findFirst({
        where: { student_id: doc.student_id, deleted_at: null },
        select: { application_id: true },
      });
      const customId = student?.application_id?.trim();
      if (customId) {
        const appRow = await this.prisma.applications.findFirst({
          where: { custom_application_id: customId, deleted_at: null },
          select: { application_id: true },
        });
        return appRow?.application_id ?? null;
      }
    }
    return null;
  }

  /**
   * The ONE discriminator-aware authorizer for a student_document acted on BY ITS
   * ROW id (download, and the files/students/applications/candidates update+delete
   * routes, whose :id is the document id). Every such route calls THIS method, so
   * the overloaded application_id column is resolved identically everywhere and a
   * candidate (lead) doc can never be reached as an application doc, or vice versa.
   *
   * It classifies by file prefix FIRST (common/candidate-doc.ts), because the
   * application_id column alone cannot tell the two id-spaces apart:
   *   - CANDIDATE (lead) doc    -> scope through LEAD ownership (assertCanViewLead),
   *     NEVER through applications — even when its leads.id numerically collides
   *     with a real applications.application_id.
   *   - APPLICATION/STUDENT doc -> scope through the REAL owning application
   *     (assertCanView). A row whose id does NOT resolve to a live application is
   *     out-of-scope (403), with NO fallback to the lead path — otherwise a lead
   *     owner whose leads.id equals a soft-deleted or foreign application id could
   *     reach a document that is not a candidate doc.
   * Fails closed (403) whenever neither entity can be resolved for scoping.
   */
  async assertCanAccessDocumentRow(
    user: AccessUser,
    doc: {
      application_id: number | null;
      student_id: number | null;
      file: string | null;
    },
  ): Promise<void> {
    if (isCandidateDocFile(doc.file)) {
      // Candidate (lead) doc: application_id holds a leads.id. Scope through the
      // lead and NEVER treat the id as an application, so a colliding real
      // application id can never be used to reach this row.
      if (doc.application_id != null) {
        const lead = await this.prisma.leads.findFirst({
          where: { id: doc.application_id, deleted_at: null },
          select: { created_by: true, telecaller_id: true },
        });
        if (lead) {
          await this.assertCanViewLead(user, lead); // 403 out of scope
          return;
        }
      }
      // A candidate doc whose lead cannot be resolved has no owner to scope to.
      throw new ForbiddenException('Access denied');
    }

    // Application/student doc: resolve the REAL owning application and scope to it.
    // No lead fallback (LOW): an unresolved or soft-deleted application is
    // out-of-scope, not a lead, so a lead owner with a colliding id cannot reach it.
    const applicationId = await this.resolveDocumentApplicationId(doc);
    if (applicationId != null) {
      const liveApplications = await this.prisma.applications.count({
        where: { application_id: applicationId, deleted_at: null },
      });
      if (liveApplications > 0) {
        await this.assertCanView(user, applicationId); // 403 out of scope
        return;
      }
    }
    throw new ForbiddenException('Access denied');
  }

  /**
   * The REVERSE of resolveDocumentApplicationId: the student (users id) an
   * application was converted into, resolved via applications.custom_application_id
   * -> students.application_id -> students.student_id. null when the application is
   * not yet converted (no students row links to it).
   *
   * Used to verify a client-supplied student_id is consistent with a supplied
   * application_id before a document is attached, so an owner of application X can
   * never stamp another owner's student onto {application_id: X, student_id: …}.
   * Shared here (not inlined in FilesService) so the convert-link resolution stays
   * in one place alongside resolveDocumentApplicationId.
   */
  async resolveApplicationStudentId(applicationId: number): Promise<number | null> {
    const app = await this.prisma.applications.findFirst({
      where: { application_id: applicationId, deleted_at: null },
      select: { custom_application_id: true },
    });
    const customId = app?.custom_application_id?.trim();
    if (!customId) return null;
    const student = await this.prisma.students.findFirst({
      where: { application_id: customId, deleted_at: null },
      select: { student_id: true },
    });
    return student?.student_id ?? null;
  }

  /**
   * 403 'Access denied' when the user cannot access a LEAD (candidate) row.
   *
   * Candidate documents overload student_document.application_id to hold a
   * leads.id (there is no candidate_id column — see FilesService). Those routes
   * cannot scope through applications, so they scope through lead ownership using
   * the SAME fresh scope as applications: admins ('all') see every lead; owners
   * see leads they created or telecall; every other scope is refused. It reuses
   * scopeFor (NOT the JWT role snapshot), so it mirrors assertCanView's freshness.
   */
  async assertCanViewLead(
    user: AccessUser,
    lead: { created_by: number | null; telecaller_id: number | null },
  ): Promise<void> {
    const scope = await this.scopeFor(user);
    if (scope.scope === 'all') return;
    if (scope.scope === 'owners') {
      const owns =
        (lead.created_by != null && scope.ids.includes(lead.created_by)) ||
        (lead.telecaller_id != null && scope.ids.includes(lead.telecaller_id));
      if (owns) return;
    }
    throw new ForbiddenException('Access denied');
  }

  /**
   * 403 'Access denied' when the user cannot access a STUDENT row that has NO
   * linked application to scope through (a legacy student imported before the CRM
   * had applications). The `students` table carries the SAME ownership columns as
   * `applications` (pipeline_user, created_by), so this applies the EXACT owner
   * rule scopeWhere/canSee use for applications: admins ('all') see every student;
   * owners see students they own; every other scope (accounts/student_affairs,
   * none) is refused. Reuses scopeFor (NOT the JWT snapshot), mirroring
   * assertCanView/assertCanViewLead. A student WITH a linked application must be
   * scoped through assertCanView on that application instead.
   */
  async assertCanViewStudent(
    user: AccessUser,
    student: { pipeline_user: number | null; created_by: number | null },
  ): Promise<void> {
    const scope = await this.scopeFor(user);
    if (scope.scope === 'all') return;
    if (scope.scope === 'owners') {
      const owns =
        student.pipeline_user != null
          ? scope.ids.includes(student.pipeline_user)
          : student.created_by != null && scope.ids.includes(student.created_by);
      if (owns) return;
    }
    throw new ForbiddenException('Access denied');
  }

  /**
   * 403 unless the stage engine permits `action` for this user on this loaded row
   * at its current effective stage (CRITIQUE #5 — server-side stage-ownership, not
   * just slug + visibility). Returns the resolved scope so the caller can reuse it.
   */
  async assertAction(
    user: AccessUser,
    row: OwnedRow & { hold_at: Date | null },
    action: string,
  ): Promise<AccessScope> {
    const scope = await this.scopeFor(user);
    const ctx = this.actorContext(scope, row);
    if (!allowedActions(row, ctx).includes(action)) {
      throw new ForbiddenException(
        'You are not allowed to perform this action at this stage.',
      );
    }
    return scope;
  }

  /** Build the stage-engine actor context for an action on a loaded row. */
  actorContext(scope: AccessScope, row: OwnedRow): ActorContext {
    const isOwner = scope.scope === 'owners' && this.canSee(scope, row);
    return {
      roleKey: scope.roleKey,
      isAdmin: scope.scope === 'all',
      isOwner,
      isTeamViewer:
        (scope.roleKey === 'team_leader' || scope.roleKey === 'manager') &&
        this.canSee(scope, row),
      isSuperAdmin: scope.roleKey === 'super_admin',
    };
  }
}
