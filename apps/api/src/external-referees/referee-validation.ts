import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/** A phone needs at least this many digits (matches the web validateReferee). */
export const MIN_PHONE_DIGITS = 7;

export const digitCount = (value: string): number => value.replace(/\D/g, '').length;

@ValidatorConstraint({ name: 'minPhoneDigits', async: false })
export class MinPhoneDigits implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && digitCount(value) >= MIN_PHONE_DIGITS;
  }
  defaultMessage(): string {
    return `phone must contain at least ${MIN_PHONE_DIGITS} digits`;
  }
}
