import {
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

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

  async findUsers(page?: number, limit?: number, roleId?: number): Promise<Paginated<unknown>> {
    const { skip, take, page: p, limit: l } = this.normalisePaging(page, limit);
    const where = {
      deleted_at: null,
      ...(roleId !== undefined ? { role_id: roleId } : {}),
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

  // ---------------------------------------------------------------------------
  // Roles (user_role)
  // ---------------------------------------------------------------------------

  async findRoles() {
    return this.prisma.user_role.findMany({
      where: { deleted_at: null },
      orderBy: { id: 'asc' },
    });
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
   * TODO(phase-3): privilege-escalation guard + bulk assign/remove of
   * role_permissions (Roles_permission::add wipes and re-inserts per role).
   * Phase-3 also wires the RBAC PermissionsGuard that reads these rows.
   */
  assignRolePermissions(): never {
    throw new NotImplementedException(
      'Role-permission assignment + privilege-escalation guard — phase 3',
    );
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
}
