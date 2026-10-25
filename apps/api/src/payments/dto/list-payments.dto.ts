import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const PAYMENT_STATUSES = ['Paid', 'Partial', 'Pending', 'Overdue'] as const;
export const DUE_PERIODS = ['overdue', 'next7', 'next30'] as const;

const amount = () => Type(() => Number);

/**
 * Query params for GET /payments. Every filter is optional and ANDed. Text
 * filters match the label the screen shows (university / course / intake name,
 * payment mode) exactly; amounts are in rupees.
 */
export class ListPaymentsDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() @MaxLength(200) university?: string;
  @IsOptional() @IsString() @MaxLength(200) course?: string;
  @IsOptional() @IsString() @MaxLength(200) intake?: string;
  @IsOptional() @IsIn(PAYMENT_STATUSES) status?: (typeof PAYMENT_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(50) mode?: string;
  @IsOptional() @IsIn(DUE_PERIODS) due?: (typeof DUE_PERIODS)[number];

  /** Next-due-date range (YYYY-MM-DD, inclusive). */
  @IsOptional() @IsDateString() due_from?: string;
  @IsOptional() @IsDateString() due_to?: string;
  /** Last-payment-date range (YYYY-MM-DD, inclusive). */
  @IsOptional() @IsDateString() paid_from?: string;
  @IsOptional() @IsDateString() paid_to?: string;

  @IsOptional() @amount() @IsNumber() @Min(0) total_min?: number;
  @IsOptional() @amount() @IsNumber() @Min(0) total_max?: number;
  @IsOptional() @amount() @IsNumber() @Min(0) paid_min?: number;
  @IsOptional() @amount() @IsNumber() @Min(0) paid_max?: number;
  @IsOptional() @amount() @IsNumber() @Min(0) due_min?: number;
  @IsOptional() @amount() @IsNumber() @Min(0) due_max?: number;
  @IsOptional() @amount() @IsNumber() @Min(0) pending_min?: number;
  @IsOptional() @amount() @IsNumber() @Min(0) pending_max?: number;
}
