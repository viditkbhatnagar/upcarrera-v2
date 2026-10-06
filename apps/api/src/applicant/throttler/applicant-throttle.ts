import { ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * Named throttler windows for the PUBLIC applicant surface (design per-endpoint
 * notes). The module baselines are GENEROUS so routes that do not override a
 * given window never false-trip for a real student; each route then tightens the
 * window(s) that matter via @Throttle. The tracker (see ApplicantThrottlerGuard)
 * is the client IP for the unauthenticated session route and the SESSION (link
 * id) for everything else — NOTE CGNAT: many students share one carrier IP, so
 * the per-SESSION window is the real control and the per-IP one is only a coarse
 * backstop.
 */
export const THROTTLE_SHORT = 'short'; // 1 minute
export const THROTTLE_MEDIUM = 'medium'; // 10 minutes
export const THROTTLE_LONG = 'long'; // 1 hour

export const TTL_SHORT = 60_000;
export const TTL_MEDIUM = 600_000;
export const TTL_LONG = 3_600_000;

export const applicantThrottlers: ThrottlerModuleOptions = {
  throttlers: [
    { name: THROTTLE_SHORT, ttl: TTL_SHORT, limit: 300 },
    { name: THROTTLE_MEDIUM, ttl: TTL_MEDIUM, limit: 300 },
    { name: THROTTLE_LONG, ttl: TTL_LONG, limit: 1000 },
  ],
};

/* ---- per-route overrides (passed to @Throttle on each handler) ---- */

/** POST /public/application/session — per IP: 10/min AND 40/hour. */
export const THROTTLE_SESSION = {
  [THROTTLE_SHORT]: { ttl: TTL_SHORT, limit: 10 },
  [THROTTLE_LONG]: { ttl: TTL_LONG, limit: 40 },
};
/** POST /public/application/session/refresh — per session: 120/min. */
export const THROTTLE_REFRESH = { [THROTTLE_SHORT]: { ttl: TTL_SHORT, limit: 120 } };
/** GET /public/application (+lookups) — per session: 120/min. */
export const THROTTLE_READ = { [THROTTLE_SHORT]: { ttl: TTL_SHORT, limit: 120 } };
/** PUT sections / POST program.confirm / DELETE document — per session: 60/min. */
export const THROTTLE_WRITE = { [THROTTLE_SHORT]: { ttl: TTL_SHORT, limit: 60 } };
/** POST /public/application/documents — per application: 20 / 10 min. */
export const THROTTLE_UPLOAD = { [THROTTLE_MEDIUM]: { ttl: TTL_MEDIUM, limit: 20 } };
/** POST /public/application/submit — per session: 5/min. */
export const THROTTLE_SUBMIT = { [THROTTLE_SHORT]: { ttl: TTL_SHORT, limit: 5 } };
