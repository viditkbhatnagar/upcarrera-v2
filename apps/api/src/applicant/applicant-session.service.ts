import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  APPLICANT_AUDIENCE,
  APPLICANT_SESSION_TTL_SECONDS,
  APPLICANT_TOKEN_TYPE,
  ApplicantConfig,
} from './applicant-config';

/** The decoded applicant-session claims (after signature + aud + typ checks). */
export interface ApplicantSessionClaims {
  /** application_id */
  aid: number;
  /** application_magic_link.id */
  lid: number;
}

interface RawClaims {
  typ?: unknown;
  aid?: unknown;
  lid?: unknown;
}

/**
 * Signs and verifies the short-lived applicant session JWT (HS256), using a
 * secret SEPARATE from the staff JWT (ApplicantConfig). The session is only a
 * convenience bearer; ApplicantSessionGuard re-reads the magic-link row on every
 * request, so the token alone grants nothing after revoke/consume/expire.
 */
@Injectable()
export class ApplicantSessionService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ApplicantConfig,
  ) {}

  /**
   * Mint a session whose exp is min(now + 2h, link.expiresAt), so a session can
   * never outlive its link. Returns the token and the absolute expiry it carries.
   */
  sign(aid: number, lid: number, linkExpiresAt: Date, now: Date = new Date()): {
    token: string;
    expiresAt: Date;
  } {
    const slidingMs = APPLICANT_SESSION_TTL_SECONDS * 1000;
    const cappedMs = Math.min(slidingMs, linkExpiresAt.getTime() - now.getTime());
    const ttlSeconds = Math.max(1, Math.floor(cappedMs / 1000));
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const token = this.jwt.sign(
      { typ: APPLICANT_TOKEN_TYPE, aid, lid },
      {
        secret: this.config.sessionSecret,
        algorithm: 'HS256',
        audience: APPLICANT_AUDIENCE,
        expiresIn: ttlSeconds,
      },
    );
    return { token, expiresAt };
  }

  /**
   * Verify signature + audience + expiry (via JwtService) and the `typ` claim.
   * Returns the claims, or null on ANY failure — callers map null to 401 so no
   * detail leaks about why a token was rejected.
   */
  verify(token: string | undefined | null): ApplicantSessionClaims | null {
    if (!token || typeof token !== 'string') return null;
    let raw: RawClaims;
    try {
      raw = this.jwt.verify<RawClaims>(token, {
        secret: this.config.sessionSecret,
        algorithms: ['HS256'],
        audience: APPLICANT_AUDIENCE,
      });
    } catch {
      return null;
    }
    if (raw.typ !== APPLICANT_TOKEN_TYPE) return null;
    const aid = Number(raw.aid);
    const lid = Number(raw.lid);
    if (!Number.isInteger(aid) || aid <= 0) return null;
    if (!Number.isInteger(lid) || lid <= 0) return null;
    return { aid, lid };
  }
}
