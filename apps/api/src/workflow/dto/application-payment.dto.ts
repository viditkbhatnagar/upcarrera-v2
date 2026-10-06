import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export const PAID_TO_CODES = ['upcarrera', 'university'] as const;
export const PAYMENT_MODE_CODES = [
  'upi',
  'neft',
  'imps',
  'rtgs',
  'cheque',
  'dd',
  'card',
  'cash',
] as const;

/**
 * POST /applications/:id/payments (multipart, with the proof file). Scalars are
 * coerced from the multipart strings by @Type under the global transform pipe.
 */
export class RecordPaymentDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  amount_change_reason?: string;

  @IsIn(PAID_TO_CODES)
  paid_to!: (typeof PAID_TO_CODES)[number];

  @IsIn(PAYMENT_MODE_CODES)
  payment_mode!: (typeof PAYMENT_MODE_CODES)[number];

  @IsString()
  @MaxLength(100)
  txn_ref!: string;

  @IsDateString()
  paid_on!: string;
}

/** POST /application-payments/:id/verify — Accounts marks a pending entry verified. */
export class VerifyPaymentDto {
  @IsOptional()
  @IsDateString()
  bank_credit_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  verify_note?: string;
}

/** POST /application-payments/:id/mismatch — Accounts rejects a pending entry. */
export class MismatchPaymentDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

/** GET /application-payments — the Accounts queue filters. */
export class ListApplicationPaymentsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsIn(['pending', 'verified', 'mismatch', 'void'])
  status?: 'pending' | 'verified' | 'mismatch' | 'void';

  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;

  @IsOptional()
  @IsIn(PAID_TO_CODES)
  paid_to?: (typeof PAID_TO_CODES)[number];

  @IsOptional()
  @IsIn(PAYMENT_MODE_CODES)
  payment_mode?: (typeof PAYMENT_MODE_CODES)[number];

  @IsOptional()
  @IsString()
  search?: string;
}
