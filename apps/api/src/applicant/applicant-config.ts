import { Injectable } from '@nestjs/common';

const DEFAULT_PORTAL_URL = 'https://admissions.upcarrera.com/apply';
const DEFAULT_TTL_HOURS = 168; // 7 days
const MAX_TTL_HOURS = 24 * 90; // 90 days — a sane upper bound
const MIN_SECRET_LENGTH = 32;
const HOUR_MS = 3_600_000;

/** JWT claims identifying an applicant session (never a staff identity). */
export const APPLICANT_AUDIENCE = 'upcarrera-applicant';
export const APPLICANT_TOKEN_TYPE = 'applicant';
/** Sliding applicant-session lifetime, capped at the link expiry (design #6). */
export const APPLICANT_SESSION_TTL_SECONDS = 2 * 60 * 60; // 2h

/**
 * WS5 (AP03) configuration, validated FAIL-FAST at boot.
 *
 * Nest instantiates this singleton while building AppModule, so a bad/missing
 * value throws inside NestFactory.create()/compile() and the API refuses to
 * start — never silently accepts an applicant session signed with a weak or
 * shared secret.
 *
 * SECURITY: APPLICANT_SESSION_SECRET MUST be separate from JWT_SECRET. The staff
 * JwtStrategy trusts anything signed with JWT_SECRET as a staff identity, so a
 * shared secret would let an applicant token be replayed as staff (and vice
 * versa). We also require >= 32 chars.
 */
@Injectable()
export class ApplicantConfig {
  readonly sessionSecret: string;
  readonly portalUrl: string;
  readonly magicLinkTtlHours: number;

  constructor() {
    const secret = process.env.APPLICANT_SESSION_SECRET?.trim();
    const jwtSecret = process.env.JWT_SECRET?.trim();

    if (!secret || secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        'APPLICANT_SESSION_SECRET is not set or is shorter than 32 characters — ' +
          'refusing to start. Generate one with `openssl rand -base64 48`.',
      );
    }
    if (jwtSecret && secret === jwtSecret) {
      throw new Error(
        'APPLICANT_SESSION_SECRET must be DIFFERENT from JWT_SECRET — refusing to ' +
          'start. A shared secret lets an applicant token be replayed as staff.',
      );
    }

    const portal = (process.env.APPLICANT_PORTAL_URL ?? DEFAULT_PORTAL_URL).trim();
    if (!/^https?:\/\//i.test(portal)) {
      throw new Error(
        `APPLICANT_PORTAL_URL must be an absolute http(s) URL (got "${portal}").`,
      );
    }

    const ttlRaw = process.env.MAGIC_LINK_TTL_HOURS;
    const ttl = ttlRaw != null && ttlRaw !== '' ? Number(ttlRaw) : DEFAULT_TTL_HOURS;
    if (!Number.isFinite(ttl) || ttl <= 0 || ttl > MAX_TTL_HOURS) {
      throw new Error(
        `MAGIC_LINK_TTL_HOURS must be a positive number of hours <= ${MAX_TTL_HOURS} ` +
          `(got "${ttlRaw}").`,
      );
    }

    this.sessionSecret = secret;
    this.portalUrl = portal.replace(/\/+$/, '');
    this.magicLinkTtlHours = Math.floor(ttl);
  }

  /**
   * The link the student clicks. The raw token rides in the URL FRAGMENT (#t=),
   * which browsers never send to the server or in the Referer header, so it never
   * reaches nginx access logs. The SPA strips it with history.replaceState.
   */
  buildMagicLinkUrl(rawToken: string): string {
    return `${this.portalUrl}#t=${rawToken}`;
  }

  /** The link's absolute expiry from `now` (UTC — Prisma stores UTC). */
  expiresAt(now: Date = new Date()): Date {
    return new Date(now.getTime() + this.magicLinkTtlHours * HOUR_MS);
  }
}
