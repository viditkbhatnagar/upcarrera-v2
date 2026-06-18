import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto, ChangePasswordDto } from './dto/password.dto';
import { AssignRolePermissionsDto } from './dto/role-permission.dto';
import { CreatePermissionDto, UpdatePermissionDto } from './dto/permission.dto';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { SwitchRoleDto } from './dto/switch-role.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const BCRYPT_ROUNDS = 10;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Port of CI4 App/Admin, User_role, Permissions, Roles_permission, Notifications
 * controllers + settings_helper. Staff-facing platform administration.
 *
 * Conventions (legacy schema uses manual timestamps + soft-delete):
 *  - list/get filter `where: { deleted_at: null }`
 *  - delete = set `deleted_at` to a JS Date (never hard-delete)
 *  - create/update set created_at/updated_at explicitly from a JS Date
 */
@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  private normalisePaging(page?: number, limit?: number) {
    const safePage = Number.isFinite(page) && (page as number) > 0 ? Math.floor(page as number) : DEFAULT_PAGE;
    const safeLimit = Number.isFinite(limit) && (limit as number) > 0 ? Math.floor(limit as number) : DEFAULT_LIMIT;
    return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit, take: safeLimit };
  }

  /** Strip the password hash before returning a user to the client. */
  private sanitizeUser<T extends { password?: string | null }>(user: T): Omit<T, 'password'> {
    const { password: _password, ...rest } = user;
    return rest;
  }

  // ---------------------------------------------------------------------------
  // Users (App/Admin)
  // ---------------------------------------------------------------------------

  async findUsers(
    page?: number,
    limit?: number,
    roleId?: number,
    excludeRoleId?: number,
  ): Promise<Paginated<unknown>> {
    const { skip, take, page: p, limit: l } = this.normalisePaging(page, limit);
    const where = {
      deleted_at: null,
      // roleId (exact role) and excludeRoleId (everything but a role, e.g. staff
      // = "not student") are mutually exclusive; exact match wins if both given.
      ...(roleId !== undefined
        ? { role_id: roleId }
        : excludeRoleId !== undefined
          ? { role_id: { not: excludeRoleId } }
          : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.users.findMany({ where, skip, take, orderBy: { id: 'desc' } }),
      this.prisma.users.count({ where }),
    ]);

    return { items: rows.map((u) => this.sanitizeUser(u)), total, page: p, limit: l };
  }

  async findUser(id: number) {
    const user = await this.prisma.users.findFirst({ where: { id, deleted_at: null } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.sanitizeUser(user);
  }

  async createUser(dto: CreateUserDto) {
    const now = new Date();
    const password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const created = await this.prisma.users.create({
      data: {
        ...dto,
        password,
        created_at: now,
        updated_at: now,
      },
    });
    return this.sanitizeUser(created);
  }

  async updateUser(id: number, dto: UpdateUserDto) {
    await this.findUser(id); // 404 if missing/soft-deleted

    const now = new Date();
    const { password, ...rest } = dto;
    const hashedPassword =
      password !== undefined ? await bcrypt.hash(password, BCRYPT_ROUNDS) : undefined;

    const updated = await this.prisma.users.update({
      where: { id },
      data: {
        ...rest,
        ...(hashedPassword !== undefined ? { password: hashedPassword } : {}),
        updated_at: now,
      },
    });
    return this.sanitizeUser(updated);
  }

  async removeUser(id: number) {
    await this.findUser(id); // 404 if missing/already soft-deleted
    const now = new Date();
    await this.prisma.users.update({
      where: { id },
      data: { deleted_at: now, updated_at: now },
    });
    return { id };
  }

  /**
   * Admin password reset. Ports App/Admin::reset_password.
   * Sets a new username (uniqueness-checked against other live users) + a fresh
   * bcrypt password, and snapshots the old hash into `prev_password`. No
   * current-password check — this is an administrative override.
   */
  async resetPassword(id: number, dto: ResetPasswordDto) {
    const user = await this.prisma.users.findFirst({
      where: { id, deleted_at: null },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.username !== undefined) {
      const clash = await this.prisma.users.findFirst({
        where: { username: dto.username, deleted_at: null, NOT: { id } },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException('Username already exists');
      }
    }

    const now = new Date();
    const hashed = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const updated = await this.prisma.users.update({
      where: { id },
      data: {
        ...(dto.username !== undefined ? { username: dto.username } : {}),
        prev_password: user.password ?? null,
        password: hashed,
        updated_at: now,
      },
    });
    return this.sanitizeUser(updated);
  }

  /**
   * Self-service password change. Ports App/Profile::reset_password, hardened
   * with a current-password verification the legacy form lacked. Never touches
   * the username. The acting user id comes from the JWT, not the body.
   */
  async changePassword(id: number, dto: ChangePasswordDto) {
    const user = await this.prisma.users.findFirst({
      where: { id, deleted_at: null },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const matches =
      typeof user.password === 'string' &&
      user.password.length > 0 &&
      (await bcrypt.compare(dto.current_password, user.password));
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const now = new Date();
    const hashed = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    await this.prisma.users.update({
      where: { id },
      data: {
        prev_password: user.password ?? null,
        password: hashed,
        updated_at: now,
      },
    });
    return { id };
  }

  // ---------------------------------------------------------------------------
  // Roles (user_role)
  // ---------------------------------------------------------------------------

  async findRoles() {
    return this.prisma.user_role.findMany({
      where: { deleted_at: null },
      orderBy: { id: 'asc' },
    });
  }

  /** Port of App/User_role::add. user_role uses created_at/updated_at. */
  async createRole(dto: CreateRoleDto) {
    const now = new Date();
    return this.prisma.user_role.create({
      data: { title: dto.title ?? null, created_at: now, updated_at: now },
    });
  }

  /** Port of App/User_role::edit. 404 if missing/soft-deleted. */
  async updateRole(id: number, dto: UpdateRoleDto) {
    const existing = await this.prisma.user_role.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) {
      throw new NotFoundException('Role not found');
    }
    const now = new Date();
    return this.prisma.user_role.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        updated_at: now,
      },
    });
  }

  /** Soft-delete a role (App/User_role::delete used the model's soft remove()). */
  async removeRole(id: number) {
    const existing = await this.prisma.user_role.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) {
      throw new NotFoundException('Role not found');
    }
    const now = new Date();
    await this.prisma.user_role.update({
      where: { id },
      data: { deleted_at: now, updated_at: now },
    });
    return { id };
  }

  // ---------------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------------

  async findPermissions() {
    return this.prisma.permissions.findMany({
      where: { deleted_at: null },
      orderBy: { id: 'asc' },
    });
  }

  /** Port of App/Permissions::add. permissions uses created_at/updated_at. */
  async createPermission(dto: CreatePermissionDto) {
    const now = new Date();
    return this.prisma.permissions.create({
      data: {
        title: dto.title ?? null,
        slug: dto.slug ?? null,
        created_at: now,
        updated_at: now,
      },
    });
  }

  /** Port of App/Permissions::edit. 404 if missing/soft-deleted. */
  async updatePermission(id: number, dto: UpdatePermissionDto) {
    const existing = await this.prisma.permissions.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) {
      throw new NotFoundException('Permission not found');
    }
    const now = new Date();
    return this.prisma.permissions.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        updated_at: now,
      },
    });
  }

  /**
   * Soft-delete a permission (App/Permissions::delete used the model's soft
   * remove()). The role_permissions guard reads slugs through this table, so we
   * flush the RBAC cache afterwards.
   */
  async removePermission(id: number) {
    const existing = await this.prisma.permissions.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) {
      throw new NotFoundException('Permission not found');
    }
    const now = new Date();
    await this.prisma.permissions.update({
      where: { id },
      data: { deleted_at: now, updated_at: now },
    });
    PermissionsGuard.invalidateCache();
    return { id };
  }

  // ---------------------------------------------------------------------------
  // Role-permissions (Roles_permission::index — join role_permissions->permissions)
  // ---------------------------------------------------------------------------

  async findRolePermissions(roleId?: number) {
    const where = {
      deleted_at: null,
      ...(roleId !== undefined ? { role_id: roleId } : {}),
    };

    const links = await this.prisma.role_permissions.findMany({
      where,
      orderBy: { id: 'asc' },
    });

    const permissionIds = links
      .map((l) => l.permission_id)
      .filter((pid): pid is number => pid !== null && pid !== undefined);

    const permissions = permissionIds.length
      ? await this.prisma.permissions.findMany({
          where: { id: { in: permissionIds }, deleted_at: null },
        })
      : [];

    const permById = new Map(permissions.map((p) => [p.id, p]));

    return links.map((link) => ({
      id: link.id,
      role_id: link.role_id,
      permission_id: link.permission_id,
      permission:
        link.permission_id !== null && link.permission_id !== undefined
          ? (permById.get(link.permission_id) ?? null)
          : null,
    }));
  }

  /**
   * Permissions NOT yet granted to the given role. Ports
   * App/Roles_permission::get_unassigned_permissions (a LEFT JOIN where the
   * role_permissions row is null). Here: all live permissions minus the ids
   * already linked to this role.
   */
  async findUnassignedPermissions(roleId: number) {
    const links = await this.prisma.role_permissions.findMany({
      where: { role_id: roleId, deleted_at: null },
      select: { permission_id: true },
    });

    const assignedIds = links
      .map((l) => l.permission_id)
      .filter((id): id is number => id !== null && id !== undefined);

    return this.prisma.permissions.findMany({
      where: {
        deleted_at: null,
        ...(assignedIds.length ? { id: { notIn: assignedIds } } : {}),
      },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * Replace a role's permission set. Ports App/Roles_permission::add, which
   * wiped the role's role_permissions rows and re-inserted one per submitted
   * permission. We delete (soft, deleted_at) the existing live rows, validate
   * the requested permission ids against live permissions, insert fresh rows
   * (role_permissions uses created_on, NOT created_at), then flush the RBAC
   * slug cache for this role so the change takes effect immediately.
   */
  async replaceRolePermissions(dto: AssignRolePermissionsDto) {
    const { role_id, permission_ids } = dto;

    const role = await this.prisma.user_role.findFirst({
      where: { id: role_id, deleted_at: null },
      select: { id: true },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    // Keep only ids that map to live permissions (legacy looked each slug up in
    // a lookup table and skipped unknown ones — same defensive intent).
    const validPermissions = await this.prisma.permissions.findMany({
      where: { id: { in: permission_ids }, deleted_at: null },
      select: { id: true },
    });
    const validIds = validPermissions.map((p) => p.id);

    const now = new Date();

    // Soft-delete the role's current live links, then insert the new set.
    await this.prisma.role_permissions.updateMany({
      where: { role_id, deleted_at: null },
      data: { deleted_at: now, updated_on: now },
    });

    if (validIds.length) {
      await this.prisma.role_permissions.createMany({
        data: validIds.map((permission_id) => ({
          role_id,
          permission_id,
          created_on: now,
        })),
      });
    }

    // Newly granted/revoked slugs must take effect without a process restart.
    PermissionsGuard.invalidateCache(role_id);

    return this.findRolePermissions(role_id);
  }

  // ---------------------------------------------------------------------------
  // Settings (settings_helper — item/value rows; no soft-delete on this table)
  // ---------------------------------------------------------------------------

  async getSettings(): Promise<Record<string, string | null>> {
    const rows = await this.prisma.settings.findMany();
    return rows.reduce<Record<string, string | null>>((acc, row) => {
      if (row.item) {
        acc[row.item] = row.value ?? null;
      }
      return acc;
    }, {});
  }

  async updateSettings(
    settings: Record<string, string | number | boolean | null>,
  ): Promise<Record<string, string | null>> {
    const now = new Date();

    // Upsert each item by `item`. The legacy table has no unique constraint declared
    // in Prisma, so look the row up by item and create/update accordingly.
    for (const [item, rawValue] of Object.entries(settings)) {
      const value = rawValue === null || rawValue === undefined ? null : String(rawValue);
      const existing = await this.prisma.settings.findFirst({ where: { item } });
      if (existing) {
        await this.prisma.settings.update({
          where: { id: existing.id },
          data: { value, updated_on: now },
        });
      } else {
        await this.prisma.settings.create({
          data: { item, value, updated_on: now },
        });
      }
    }

    return this.getSettings();
  }

  // ---------------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------------

  async findNotifications(userId?: number) {
    return this.prisma.notifications.findMany({
      where: {
        deleted_at: null,
        ...(userId !== undefined ? { user_id: userId } : {}),
      },
      orderBy: { id: 'desc' },
    });
  }

  // ---------------------------------------------------------------------------
  // App (public) — App/Controllers/Api/App::app_version
  // ---------------------------------------------------------------------------

  /**
   * Public mobile app version gate. Ports App::app_version, which returns the
   * three settings rows the app reads on launch. Missing rows resolve to null
   * (the settings table has no row for an item until it is first set).
   */
  async getAppVersion(): Promise<{
    ios_version: string | null;
    android_version: string | null;
    ios_register_show: string | null;
  }> {
    const settings = await this.getSettings();
    return {
      ios_version: settings.ios_version ?? null,
      android_version: settings.android_version ?? null,
      // Legacy key is `ios_register`, surfaced to the app as `ios_register_show`.
      ios_register_show: settings.ios_register ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // Self-service profile — App/Controllers/Api/User::update / ::switch_role
  // ---------------------------------------------------------------------------

  /**
   * Authenticated user updates their OWN profile. Ports User::update. The id is
   * always the JWT subject (never a body/param), so a caller can only edit their
   * own row. Only the self-editable fields are accepted (the DTO whitelists
   * name/code/phone/email/profile_picture).
   */
  async updateMe(id: number, dto: UpdateMeDto) {
    const user = await this.prisma.users.findFirst({
      where: { id, deleted_at: null },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const now = new Date();
    const updated = await this.prisma.users.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.profile_picture !== undefined
          ? { profile_picture: dto.profile_picture }
          : {}),
        updated_by: id,
        updated_at: now,
      },
    });
    return this.sanitizeUser(updated);
  }

  /**
   * Switch the acting user's active role. Ports User::switch_role, which wrote
   * users.current_role. That column is ABSENT from the current Prisma schema, so
   * this is a documented no-op: we simply return the (unchanged) current user.
   * TODO(prod-table): once `users.current_role` exists in schema.prisma, persist
   * `dto.current_role` here (updated_by = id, updated_at = now) and return the
   * refreshed row.
   */
  async switchRole(id: number, _dto: SwitchRoleDto) {
    const user = await this.prisma.users.findFirst({
      where: { id, deleted_at: null },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.sanitizeUser(user);
  }
}
