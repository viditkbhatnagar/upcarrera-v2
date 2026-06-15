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
    super({
      // Prefer Authorization: Bearer; fall back to the legacy ?auth_token= query
      // param so existing mobile clients keep working during the transition.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req): string | null => (req?.query?.auth_token as string) ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'changeme',
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
