/**
 * Counsellor phone display + dialling (QA C08).
 *
 * `users.phone` is free text in the database shared with the LMS, so stored
 * values come in many shapes ("87146 89444", "09072238556", "919562004111").
 * The dial code is a separate column (`users.code`, 91 for Indian users).
 *
 * These helpers format for DISPLAY only; nothing here is ever posted back. A
 * value that cannot be read confidently is shown exactly as stored rather than
 * guessed at — a mangled number is worse than an untidy one when someone dials
 * it. The API normalises new writes (see apps/api/src/consultants/consultant-phone.ts).
 */

const INDIA = 91;
const INDIAN_MOBILE = /^[6-9]\d{9}$/;
const INTERNATIONAL = /^\d{8,15}$/;

/** Bare 10-digit Indian national number, or null. */
function indianNational(raw: string, code?: number | null): string | null {
  if (code != null && code !== INDIA) return null;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    if (!digits.startsWith("91")) return null;
    digits = digits.slice(2);
  } else if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return INDIAN_MOBILE.test(digits) ? digits : null;
}

/** E.164 ("+919876543210") when the number can be read confidently, else null. */
export function phoneE164(raw: string | null | undefined, code?: number | null): string | null {
  if (!raw || raw.trim() === "") return null;
  const national = indianNational(raw, code);
  if (national) return `+${INDIA}${national}`;

  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) {
    // A "+91" number that is not an Indian mobile is invalid, not international:
    // the API (normaliseConsultantPhone) rejects it, so this must too, or the
    // dialogs would pass it and the list would build a wa.me link for it.
    // The "+" makes the country explicit, so users.code does not matter here.
    if (digits.startsWith(String(INDIA))) {
      return INDIAN_MOBILE.test(digits.slice(2)) ? `+${digits}` : null;
    }
    return INTERNATIONAL.test(digits) ? `+${digits}` : null;
  }
  if (code != null && code !== INDIA && /^\d{4,15}$/.test(digits)) {
    const full = `${code}${digits}`;
    return INTERNATIONAL.test(full) ? `+${full}` : null;
  }
  return null;
}

/** "+91 98765 43210" for an Indian mobile; the stored text unchanged otherwise. */
export function formatPhone(
  raw: string | null | undefined,
  code?: number | null,
  empty = "—",
): string {
  if (!raw || raw.trim() === "") return empty;
  const national = indianNational(raw, code);
  if (national) return `+${INDIA} ${national.slice(0, 5)} ${national.slice(5)}`;
  const e164 = phoneE164(raw, code);
  return e164 ?? raw.trim();
}

/** WhatsApp click-to-chat link, or null when the number is not dialable. */
export function whatsappHref(raw: string | null | undefined, code?: number | null): string | null {
  const e164 = phoneE164(raw, code);
  return e164 ? `https://wa.me/${e164.slice(1)}` : null;
}

/**
 * Pre-submit check mirroring the API rule: an empty value is fine (optional),
 * otherwise it must be an Indian mobile or an international number with "+".
 */
export function isAcceptablePhoneInput(value: string): boolean {
  const v = value.trim();
  if (v === "") return true;
  if (/[^\d\s\-().+]/.test(v)) return false;
  return phoneE164(v, null) != null;
}
