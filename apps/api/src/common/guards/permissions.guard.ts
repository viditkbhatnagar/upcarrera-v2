import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

/** Legacy super-admin role id (user_role.id === 1, "Super Admin"). */
const SUPER_ADMIN_ROLE_ID = 1;

/**
 * Controller-layer authorization. Ports application/app/Helpers/permission_helper.php
 * (has_permission + the per-role helpers) into a single clean allow-list guard.
 *
 * The legacy admin helper used inverted logic (`return !in_array($permission, ...)`),
 * which silently granted Super Admin every permission EXCEPT a hand-maintained
 * deny-list, and shipped a `has_permission_sub_admint` typo that meant sub-admin
 * checks never ran. This guard replaces both with:
 *   - a Super Admin (role_id === 1) bypass that allows ALL routes, and
 *   - a positive allow-list for every other role: the required slug must be
 *     present in that role's granted permissions.
 *
 * Granted slugs are cached per role_id in an in-memory Map so we hit the DB at
 * most once per role for the process lifetime (mirrors how the legacy helper
 * loaded the role's permission set per request, minus the per-request cost).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  /** role_id -> Set<permission slug>. Populated lazily on first check per role. */
  private static readonly slugCache = new Map<number, Set<string>>();

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredSlug = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @RequirePermission on this route -> nothing to enforce.
    if (!requiredSlug) return true;

    const { user } = context.switchToHttp().getRequest();
    const roleId = Number(user?.roleId ?? user?.role_id);

    if (!user || !Number.isFinite(roleId)) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }

    // Super Admin bypass: allow every route (fixes the legacy inverted deny-list).
    if (roleId === SUPER_ADMIN_ROLE_ID) return true;

    const slugs = await this.getRoleSlugs(roleId);
    if (!slugs.has(requiredSlug)) {
      throw new ForbiddenException(
        `Your role does not have the required permission: ${requiredSlug}`,
      );
    }
    return true;
  }

  /** Returns the cached slug set for a role, loading it from the DB on first use. */
  private async getRoleSlugs(roleId: number): Promise<Set<string>> {
    const cached = PermissionsGuard.slugCache.get(roleId);
    if (cached) return cached;

    // role_permissions JOIN permissions on permission_id, scoped to this role.
    // Soft-delete aware on both sides (mirrors the reads elsewhere in the app).
    const rows = await this.prisma.role_permissions.findMany({
      where: { role_id: roleId, deleted_at: null },
      select: { permission_id: true },
    });

    const permissionIds = rows
      .map((r) => r.permission_id)
      .filter((id): id is number => id !== null && id !== undefined);

    const permissions = permissionIds.length
      ? await this.prisma.permissions.findMany({
          where: { id: { in: permissionIds }, deleted_at: null },
          select: { slug: true },
        })
      : [];

    const slugs = new Set<string>(
      permissions
        .map((p) => p.slug)
        .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0),
    );

    PermissionsGuard.slugCache.set(roleId, slugs);
    return slugs;
  }

  /**
   * Clears the in-memory slug cache. Call this after mutating role_permissions
   * (e.g. from the roles-permissions management endpoints) so newly granted or
   * revoked slugs take effect without a process restart.
   */
  static invalidateCache(roleId?: number): void {
    if (roleId === undefined) {
      PermissionsGuard.slugCache.clear();
    } else {
      PermissionsGuard.slugCache.delete(roleId);
    }
  }
}
