import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { UserStateService } from '../user-state.service';

/** Legacy super-admin role id (user_role.id === 1, "Super Admin"). */
const SUPER_ADMIN_ROLE_ID = 1;

/** How long a role's granted slugs are cached before a re-read (role_permissions
 *  can be edited out of band by the LMS Roles screen). */
const SLUG_TTL_MS = 5 * 60 * 1000;

interface SlugCacheEntry {
  slugs: Set<string>;
  at: number;
}

/**
 * Controller-layer authorization. Ports permission_helper.php into a clean
 * allow-list: Super Admin (role_id 1) bypasses, every other role must hold the
 * required slug.
 *
 * CRITIQUE #13 — it NEVER trusts the 7-day JWT role. The acting role_id and the
 * account's live status/deleted_at are re-read through UserStateService (5-min
 * TTL), so a deactivated or role-changed user loses access without re-login. The
 * granted-slug set is likewise cached with a TTL, because the LMS Roles &
 * Permissions screen rewrites role_permissions out of band.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  /** role_id -> { slugs, at }. Populated lazily, expired by SLUG_TTL_MS. */
  private static readonly slugCache = new Map<number, SlugCacheEntry>();

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly userState: UserStateService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredSlug = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @RequirePermission on this route -> nothing to enforce.
    if (!requiredSlug) return true;

    const { user } = context.switchToHttp().getRequest();
    const userId = Number(user?.userId ?? user?.id);
    if (!user || !Number.isFinite(userId)) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }

    // Re-read the live account: a deactivated / deleted user is refused even with
    // a still-valid token, and the FRESH role (not the JWT snapshot) is used below.
    const state = await this.userState.get(userId);
    if (this.userState.isInactive(state)) {
      throw new ForbiddenException('This account is no longer active.');
    }
    const roleId = Number(state?.roleId);
    if (!Number.isFinite(roleId)) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }

    // Super Admin bypass.
    if (roleId === SUPER_ADMIN_ROLE_ID) return true;

    const slugs = await this.getRoleSlugs(roleId);
    if (!slugs.has(requiredSlug)) {
      throw new ForbiddenException(
        `Your role does not have the required permission: ${requiredSlug}`,
      );
    }
    return true;
  }

  /** Returns the cached slug set for a role, re-reading it after the TTL. */
  private async getRoleSlugs(roleId: number): Promise<Set<string>> {
    const cached = PermissionsGuard.slugCache.get(roleId);
    if (cached && Date.now() - cached.at < SLUG_TTL_MS) return cached.slugs;

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

    PermissionsGuard.slugCache.set(roleId, { slugs, at: Date.now() });
    return slugs;
  }

  /**
   * Clears the in-memory slug cache. Call after mutating role_permissions so a
   * grant/revoke takes effect immediately rather than after the TTL.
   */
  static invalidateCache(roleId?: number): void {
    if (roleId === undefined) {
      PermissionsGuard.slugCache.clear();
    } else {
      PermissionsGuard.slugCache.delete(roleId);
    }
  }
}
