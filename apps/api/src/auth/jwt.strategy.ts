import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: number;
  data: {
    id: number;
    role_id: number | null;
    username: string | null;
    email: string | null;
    [key: string]: unknown;
  };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
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

  validate(payload: JwtPayload) {
    return {
      userId: payload.sub ?? payload.data?.id,
      roleId: payload.data?.role_id,
      ...payload.data,
    };
  }
}
