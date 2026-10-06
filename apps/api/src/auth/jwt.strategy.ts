import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: number;
  /** Standard JWT issued-at (seconds). Present on every token we sign. */
  iat?: number;
  data: {
    id: number;
    role_id: number | null;
    username: string | null;
    email: string | null;
    [key: string]: unknown;
  };
}

/** Mirror AuthService.login: students share the mobile login; 0 = deactivated. */
const STUDENT_ROLE_ID = 4;
const INACTIVE_STATUS = 0;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // Fail fast: never sign/verify tokens with an insecure default. A missing
    // JWT_SECRET in production silently accepts forged tokens, so refuse to boot.
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error(
        'JWT_SECRET is not set — refusing to start. Provide a strong secret ' +
          '(e.g. `openssl rand -base64 48`) in the environment.',
      );
    }

    super({
      // Prefer Authorization: Bearer; fall back to the legacy ?auth_token= query
      // param so existing mobile clients keep working during the transition.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req): string | null => (req?.query?.auth_token as string) ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    const userId = payload.sub ?? payload.data?.id;
    if (!userId) throw new UnauthorizedException();

    // Per-request account + session check. Fail OPEN on a DB error — a transient
    // hiccup must never log every signed-in user out — but reject on a definitive
    // answer. Existing users have password_changed_at = NULL, so NO current session
    // is affected until a password is actually reset.
    try {
      const row = await this.prisma.users.findUnique({
        where: { id: Number(userId) },
        select: { password_changed_at: true, status: true, role_id: true, deleted_at: true },
      });
      // Soft-deleted account: its token dies immediately (M8).
      if (!row || row.deleted_at) throw new UnauthorizedException('Account no longer exists.');
      // Deactivated staff (students keep the shared mobile login) — mirror login (M8).
      if (row.role_id !== STUDENT_ROLE_ID && row.status === INACTIVE_STATUS) {
        throw new UnauthorizedException('This account has been deactivated.');
      }
      // Session invalidation (migration 004): a reset stamps password_changed_at,
      // so any token signed before that instant is dead. A token with NO iat cannot
      // be proven to predate the change, so once a change exists it is rejected (M8).
      if (row.password_changed_at) {
        const changedSec = Math.floor(row.password_changed_at.getTime() / 1000);
        if (typeof payload.iat !== 'number' || payload.iat < changedSec) {
          throw new UnauthorizedException('Your password was changed. Please log in again.');
        }
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error(`JWT session check skipped (DB error): ${(err as Error).message}`);
    }

    return {
      userId,
      roleId: payload.data?.role_id,
      ...payload.data,
    };
  }
}
