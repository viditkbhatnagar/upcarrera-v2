/**
 * Small, pure helpers that turn workflow rows into the display strings the Phase 1
 * transactional templates expect. They are the formatting layer for the
 * reject/mismatch emails (sa-review + application-payments); the program/counsellor
 * NAMES come from ProgramReferenceService, which both callers reuse so the student
 * and the counsellor always see the same labels.
 *
 * Every function is dash-safe: it returns a printable string (never undefined) even
 * when its input is null, so EmailTemplatesService.render() — which deliberately
 * THROWS on an unfilled {{placeholder}} — always has a value to substitute. Values
 * are returned RAW; render() HTML-escapes every placeholder centrally, so there is
 * no call-site escaping here.
 */

/** The em dash shown for a value that is legitimately absent. */
export const EM_DASH = '—';

const DEFAULT_ADMIN_APP_URL = 'https://admin.upcarrera.com';

/** First token of a name, or `fallback` when the name is blank. */
export function firstNameOr(name: string | null | undefined, fallback: string): string {
  const full = (name ?? '').trim();
  const first = full.split(/\s+/)[0];
  return first || fallback;
}

/** Full name, trimmed, or a safe default when blank. */
export function fullNameOr(name: string | null | undefined, fallback = 'Applicant'): string {
  return (name ?? '').trim() || fallback;
}

/** A trimmed value, or the em dash when blank/null. */
export function orDash(value: string | null | undefined): string {
  return (value ?? '').trim() || EM_DASH;
}

/** IST date-only, e.g. "06 Oct 2026" — em dash when absent. */
export function istDate(value: Date | string | null | undefined): string {
  const d = toDate(value);
  if (!d) return EM_DASH;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/** IST date + time, e.g. "06 Oct 2026, 03:45 PM" — em dash when absent. */
export function istDateTime(value: Date | string | null | undefined): string {
  const d = toDate(value);
  if (!d) return EM_DASH;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

/** A rupee amount, e.g. "₹5,000" — em dash when absent or not a number. */
export function formatInr(amount: unknown): string {
  if (amount == null) return EM_DASH;
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n)) return EM_DASH;
  return `₹${new Intl.NumberFormat('en-IN').format(n)}`;
}

/** A human fee-type label, e.g. "registration" -> "Registration fee". */
export function feeTypeLabel(kind: string | null | undefined): string {
  const k = (kind ?? '').trim();
  if (!k) return 'Fee';
  return `${k.charAt(0).toUpperCase()}${k.slice(1)} fee`;
}

/**
 * The admin-app URL for an application, built from ADMIN_APP_URL (the base the
 * logo/email brand already points at), used as the CTA in the payment-rejected
 * email. Read at call time so tests and config changes take effect.
 */
export function adminApplicationUrl(applicationId: number): string {
  const base = (process.env.ADMIN_APP_URL ?? DEFAULT_ADMIN_APP_URL).replace(/\/+$/, '');
  return `${base}/students/applications/${applicationId}`;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
