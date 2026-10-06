import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../workflow/audit.service';

/** Legacy user_role id for students — they share this login with the mobile app. */
const STUDENT_ROLE_ID = 4;
/** users.status value for a deactivated account (1 = active; NULL = legacy, treated as active). */
const INACTIVE_STATUS = 0;

/** Request context captured for the login audit (never the password). */
export interface LoginContext {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Port of CI4 Users_model::login_username_app() + jwt_helper::generate_auth_token().
 * NOTE: the legacy hardcoded master-password backdoor is intentionally NOT ported.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(username: string, password: string, ctx: LoginContext = {}) {
    const user = await this.prisma.users.findFirst({
      where: { username, deleted_at: null },
    });
    if (!user) {
      await this.auditLoginFailed(username, null, null, 'user_not_found', ctx);
      throw new UnauthorizedException('User not found!');
    }

    // Existing PHP password_hash() bcrypt ($2y$) hashes verify unchanged with bcryptjs.
    const ok = await bcrypt.compare(password, user.password ?? '');
    if (!ok) {
      await this.auditLoginFailed(username, user.id, user.role_id, 'bad_password', ctx);
      throw new UnauthorizedException('Invalid password!');
    }

    // Deactivated STAFF cannot sign in (Phase 1 spec 1.1). Students (role 4) share
    // this endpoint with the mobile app, so their behaviour is unchanged. NULL is
    // active. Checked AFTER the password, so state is only revealed to someone who
    // already knows the password.
    if (user.role_id !== STUDENT_ROLE_ID && user.status === INACTIVE_STATUS) {
      await this.auditLoginFailed(username, user.id, user.role_id, 'inactive', ctx);
      throw new UnauthorizedException(
        'This account has been deactivated. Contact your administrator.',
      );
    }

    await this.auditLoginOk(user.id, user.role_id, username, ctx);

    const snapshot = this.toSnapshot(user);
    const auth_token = await this.jwt.signAsync({ sub: user.id, data: snapshot });
    return { ...snapshot, auth_token };
  }

  /** Best-effort 'login' audit — never blocks a successful sign-in. */
  private async auditLoginOk(
    userId: number,
    roleId: number | null,
    username: string,
    ctx: LoginContext,
  ): Promise<void> {
    try {
      await this.audit.record(this.prisma, {
        action: 'login',
        entity: 'users',
        entityId: userId,
        actorId: userId,
        actorRoleId: roleId,
        actorType: 'user',
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        context: { username },
      });
    } catch (err) {
      this.logger.warn(`login audit skipped: ${(err as Error).message}`);
    }
  }

  /** Best-effort 'login_failed' audit — the attempted username is recorded, never the password. */
  private async auditLoginFailed(
    username: string,
    userId: number | null,
    roleId: number | null,
    reason: string,
    ctx: LoginContext,
  ): Promise<void> {
    try {
      await this.audit.record(this.prisma, {
        action: 'login_failed',
        entity: 'users',
        entityId: userId,
        actorId: null,
        actorRoleId: roleId,
        actorType: 'anonymous',
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        context: { username, reason },
      });
    } catch (err) {
      this.logger.warn(`login_failed audit skipped: ${(err as Error).message}`);
    }
  }

  private toSnapshot(user: {
    id: number;
    role_id: number | null;
    name: string | null;
    username: string | null;
    email: string | null;
    phone: string | null;
    profile_picture: string | null;
  }) {
    return {
      id: user.id,
      role_id: user.role_id,
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      profile_picture: user.profile_picture,
    };
  }
}
