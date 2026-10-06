import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';

/**
 * Indian mobile number rules for admission applications (QA AP10).
 *
 * A mobile is 10 digits starting 6-9. Counsellors type it in many shapes —
 * "98765 43210", "+91 98765-43210", "09876543210", "919876543210" — so the
 * number is canonicalised to the bare 10 digits before it is validated and
 * stored. Bare 10 digits is what the existing 844 rows already hold, and the
 * click-to-call flow's normalizePhone() turns it into +91XXXXXXXXXX itself.
 *
 * Kept in the students module (rather than lifting calls' normalizePhone) so the
 * calling flow is untouched; the two agree on every valid Indian mobile.
 */
export const INDIAN_MOBILE_PATTERN = /^[6-9]\d{9}$/;

export const INDIAN_MOBILE_MESSAGE =
  'phone must be a valid 10-digit Indian mobile number';

/**
 * Canonical 10-digit form of an Indian mobile, or null when `raw` is not one.
 * Strips spaces, dashes, dots and brackets, then a +91 / 91 / 0 prefix.
 */
export function normalizeIndianMobile(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let digits = String(raw).replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) {
    if (!digits.startsWith('+91')) return null;
    digits = digits.slice(3);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return INDIAN_MOBILE_PATTERN.test(digits) ? digits : null;
}

/**
 * DTO decorator: canonicalise the value when it is a valid Indian mobile, then
 * require the canonical shape. An invalid value is passed through trimmed so
 * @Matches rejects it with a clear message instead of storing it.
 * Pair with @IsOptional() to keep the field optional.
 */
export function IsIndianMobile(): PropertyDecorator {
  const transform = Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    return normalizeIndianMobile(value) ?? value.trim();
  });
  const matches = Matches(INDIAN_MOBILE_PATTERN, { message: INDIAN_MOBILE_MESSAGE });
  return (target: object, propertyKey: string | symbol) => {
    transform(target, propertyKey);
    matches(target, propertyKey);
  };
}
