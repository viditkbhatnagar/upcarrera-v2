import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** The live account state the guards must re-check, not trust from the JWT. */
export interface UserState {
  roleId: number | null;
  status: number | null;
  deletedAt: Date | null;
}

interface CacheEntry {
  state: UserState | null;
  at: number;
}

/** How long a fresh read is trusted before the guards re-query (CRITIQUE #13). */
const USER_STATE_TTL_MS = 5 * 60 * 1000;

/**
 * Shared, short-TTL cache of each user's live role_id + status + deleted_at.
 *
 * The JWT is valid for 7 days and freezes the role at sign-in, so a user who is
 * deactivated or has their role changed would otherwise keep their old access
 * until the token expired. Both global guards (Permissions, Roles) resolve the
 * role THROUGH this cache instead of the token, so the change takes effect within
 * five minutes without forcing a re-login.
 */
@Injectable()
export class UserStateService {
  private readonly cache = new Map<number, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async get(userId: number): Promise<UserState | null> {
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.at < USER_STATE_TTL_MS) return cached.state;

    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { role_id: true, status: true, deleted_at: true },
    });
    const state: UserState | null = user
      ? { roleId: user.role_id, status: user.status, deletedAt: user.deleted_at }
      : null;

    this.cache.set(userId, { state, at: Date.now() });
    return state;
  }

  /** True when the account is missing, soft-deleted, or deactivated (status 0). */
  isInactive(state: UserState | null): boolean {
    return !state || state.deletedAt != null || state.status === 0;
  }

  invalidate(userId?: number): void {
    if (userId === undefined) this.cache.clear();
    else this.cache.delete(userId);
  }
}
