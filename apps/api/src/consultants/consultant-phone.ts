import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Counsellor phone numbers (QA C08).
 *
 * `users.phone` is a free-text VarChar(30) in the database shared with the LMS,
 * and the legacy forms accepted anything, so stored values come in several
 * shapes: "87146 89444", "09072238556", "919562004111", "97454003222". The dial
 * code lives in a separate column (`users.code`, 91 for Indian users).
 *
 * New writes are normalised to one canonical shape so the mess stops growing:
 *   - an Indian mobile (code 91 or no code given) is stored as its bare 10-digit
 *     national number, e.g. "9562004111", with `users.code` = 91 — the shape the
 *     clean legacy rows already have;
 *   - a number typed with a non-91 "+" prefix is stored as E.164 ("+97455001234");
 *   - a number posted with an explicit non-91 `code` is stored as its digits.
 *
 * Existing rows are NEVER rewritten here; the LMS reads this column too.
 */

export const INDIA_DIAL_CODE = 91;

const INDIAN_MOBILE = /^[6-9]\d{9}$/;
const INTERNATIONAL_DIGITS = /^\d{8,15}$/;
const NATIONAL_DIGITS = /^\d{4,15}$/;

/** Formatting characters people type between digit groups. */
const SEPARATORS = /[\s\-().]/g;

/**
 * Canonical stored form of `raw`, or null when it is not a usable number.
 * Idempotent: a value it returned normalises to itself.
 */
export function normaliseConsultantPhone(
  raw: string,
  dialCode?: number | null,
): string | null {
  const cleaned = raw.replace(SEPARATORS, '');
  if (cleaned === '') return null;

  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1);
    if (!INTERNATIONAL_DIGITS.test(digits)) return null;
    if (digits.startsWith(String(INDIA_DIAL_CODE))) {
      const national = digits.slice(2);
      return INDIAN_MOBILE.test(national) ? national : null;
    }
    return `+${digits}`;
  }

  if (!/^\d+$/.test(cleaned)) return null;

  if (dialCode != null && dialCode !== INDIA_DIAL_CODE) {
    return NATIONAL_DIGITS.test(cleaned) ? cleaned : null;
  }

  let national = cleaned;
  if (national.length === 12 && national.startsWith('91')) national = national.slice(2);
  else if (national.length === 11 && national.startsWith('0')) national = national.slice(1);

  return INDIAN_MOBILE.test(national) ? national : null;
}

/** True when a normalised phone is a bare Indian 10-digit mobile. */
export function isIndianNational(phone: string): boolean {
  return INDIAN_MOBILE.test(phone);
}

/**
 * The shapes the same Indian number may already be stored in by the legacy
 * forms, so a duplicate check catches "87146 89444" when "8714689444" is posted.
 */
export function storedPhoneVariants(phone: string): string[] {
  if (!isIndianNational(phone)) return [phone];
  return [
    phone,
    `0${phone}`,
    `91${phone}`,
    `+91${phone}`,
    `${phone.slice(0, 5)} ${phone.slice(5)}`,
    `+91 ${phone}`,
    `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`,
  ];
}

/** Reads the sibling `code` property the way the DTO will once it is coerced. */
function dialCodeOf(obj: unknown): number | null {
  const code = (obj as { code?: unknown } | null)?.code;
  if (code === undefined || code === null || code === '') return null;
  const n = Number(code);
  return Number.isInteger(n) ? n : null;
}

/**
 * class-transformer @Transform body: normalise when the value is valid, leave it
 * untouched when it is not so @IsConsultantPhone can reject it with a message.
 * An empty string is passed through (it means "clear" on update).
 */
export function transformConsultantPhone({
  value,
  obj,
}: {
  value: unknown;
  obj: unknown;
}): unknown {
  if (typeof value !== 'string') return value;
  if (value.trim() === '') return '';
  return normaliseConsultantPhone(value, dialCodeOf(obj)) ?? value;
}

/** Rejects a phone that cannot be normalised for the posted dial code. */
export function IsConsultantPhone(options?: ValidationOptions) {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'isConsultantPhone',
      target: target.constructor,
      propertyName,
      options: {
        message:
          'phone must be a valid 10-digit Indian mobile number (e.g. 98765 43210), or an international number starting with +',
        ...options,
      },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          if (value === '') return true;
          return normaliseConsultantPhone(value, dialCodeOf(args.object)) === value;
        },
      },
    });
  };
}
