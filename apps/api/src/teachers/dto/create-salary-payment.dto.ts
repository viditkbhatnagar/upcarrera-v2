import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/** Mirrors the Prisma `salary_payment_payment_type` enum (cash | cheque | bank). */
export enum SalaryPaymentType {
  cash = 'cash',
  cheque = 'cheque',
  bank = 'bank',
}

/**
 * Port of CI4 App\Controllers\App\Teacher_salary::make_payment().
 * Records one salary_payment row for a teacher. `paid_by` is taken from the
 * authenticated user in the controller, NOT the body. The period is given as a
 * `YYYY-MM` string and split into the legacy `month` (zero-padded) / `year` columns.
 */
export class CreateSalaryPaymentDto {
  @IsInt()
  @IsNotEmpty()
  teacher_id!: number;

  @IsNumber()
  @Min(0.01, { message: 'paid_amount must be greater than 0' })
  paid_amount!: number;

  /** Period the payment covers, `YYYY-MM` (e.g. "2026-06"). */
  @IsString()
  @IsNotEmpty()
  period!: string;

  /** Actual date the money moved, ISO `YYYY-MM-DD`. Defaults to today. */
  @IsOptional()
  @IsString()
  payment_date?: string;

  @IsOptional()
  @IsEnum(SalaryPaymentType)
  payment_type?: SalaryPaymentType;

  @IsOptional()
  @IsString()
  reference_no?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}
