import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The Phase 1 role keys the workflow resolves ids through. The migration seeds
 * these at explicit ids (super_admin 1 .. student_affairs 104), but ids are
 * NEVER hard-coded here: production AUTO_INCREMENT and editable titles make both
 * ids and titles unsafe to match, so everything goes through user_role.role_key.
 */
export const REQUIRED_ROLE_KEYS = [
  'super_admin',
  'admin',
  'counsellor',
  'team_leader',
  'manager',
  'accounts',
  'student_affairs',
] as const;

export type RoleKey =
  | (typeof REQUIRED_ROLE_KEYS)[number]
  | 'telecaller'
  | 'teacher'
  | 'student'
  | 'institution'
  | 'client';

/**
 * Loads user_role.role_key -> id at boot and resolves roles by key both ways.
 * Fails CLOSED: if any Phase 1 role key is missing, the API refuses to start,
 * so a half-applied migration can never leave record access silently open.
 */
@Injectable()
export class RoleRegistryService implements OnModuleInit {
  private readonly logger = new Logger(RoleRegistryService.name);
  private readonly idByKey = new Map<string, number>();
  private readonly keyById = new Map<number, string>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.load();
  }

  /** (Re)load the role map from the database. */
  async load(): Promise<void> {
    const rows = await this.prisma.user_role.findMany({
      where: { role_key: { not: null } },
      select: { id: true, role_key: true },
    });

    this.idByKey.clear();
    this.keyById.clear();
    for (const r of rows) {
      if (r.role_key) {
        this.idByKey.set(r.role_key, r.id);
        this.keyById.set(r.id, r.role_key);
      }
    }

    const missing = REQUIRED_ROLE_KEYS.filter((k) => !this.idByKey.has(k));
    if (missing.length > 0) {
      throw new Error(
        `RoleRegistry: required role_key(s) missing from user_role: ${missing.join(', ')}. ` +
          'Apply migration 002 (sections 6-7) before starting the API.',
      );
    }
    this.logger.log(`Loaded ${this.idByKey.size} role keys`);
  }

  /** The users.role_id for a role key, or undefined when it is not seeded. */
  idFor(key: RoleKey): number | undefined {
    return this.idByKey.get(key);
  }

  /** The role_key for a users.role_id, or null for an unknown/legacy role. */
  keyForId(roleId: number | null | undefined): string | null {
    if (roleId == null) return null;
    return this.keyById.get(roleId) ?? null;
  }
}
