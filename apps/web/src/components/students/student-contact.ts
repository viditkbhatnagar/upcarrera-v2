// WhatsApp deep link for a student (QA ST04).
//
// There is no WhatsApp integration in the API; the button opens WhatsApp's
// click-to-chat (https://wa.me/<number>) with the student's number. wa.me needs
// the full international number as digits only — no "+", spaces or leading 0 —
// so the stored value is normalised here.

/** India's dial code. Every Indian user row carries users.code = 91; a blank code is treated as India. */
const DEFAULT_DIAL_CODE = "91";
/** E.164 allows at most 15 digits including the country code. */
const MAX_INTERNATIONAL_DIGITS = 15;
/** Shorter than this cannot be a real subscriber number. */
const MIN_NATIONAL_DIGITS = 6;
const NATIONAL_DIGITS = 10;

/**
 * The digits wa.me expects, or null when `raw` cannot be a phone number.
 *   "+44 7700 900123"            -> "447700900123"   (already international)
 *   "98765 43210", code 91        -> "919876543210"
 *   "09876543210", code 91        -> "919876543210"   (trunk 0 dropped)
 *   "919876543210"                -> "919876543210"   (code already present)
 */
export function whatsappNumber(
  raw: string | null | undefined,
  dialCode: number | string | null | undefined,
): string | null {
  const source = raw?.trim();
  if (!source) return null;
  let digits = source.replace(/\D/g, "");
  if (!digits) return null;

  if (source.startsWith("+") || digits.startsWith("00")) {
    digits = digits.replace(/^00/, "");
    return digits.length >= MIN_NATIONAL_DIGITS + 1 && digits.length <= MAX_INTERNATIONAL_DIGITS
      ? digits
      : null;
  }
  if (digits.length === NATIONAL_DIGITS + 1 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length > NATIONAL_DIGITS) {
    return digits.length <= MAX_INTERNATIONAL_DIGITS ? digits : null;
  }
  if (digits.length < MIN_NATIONAL_DIGITS) return null;

  const code = String(dialCode ?? "").replace(/\D/g, "") || DEFAULT_DIAL_CODE;
  return code + digits;
}

/** The click-to-chat URL for a student, preferring their WhatsApp number over their phone. */
export function whatsappLink(
  whatsappNo: string | null | undefined,
  phone: string | null | undefined,
  dialCode: number | string | null | undefined,
): string | null {
  const number = whatsappNumber(whatsappNo, dialCode) ?? whatsappNumber(phone, dialCode);
  return number ? `https://wa.me/${number}` : null;
}
