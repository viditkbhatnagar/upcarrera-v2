import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { invoice_payment_status } from '@prisma/client';

/**
 * Query DTOs for the finance list endpoints.
 * Uses @Type(() => Number) so the global ValidationPipe (transform: true)
 * coerces query strings to numbers — the param-level ParseIntPipe pattern
 * conflicts with that transform, so we use DTOs here (same as leads/students).
 */
class PaginationDto {
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
}

export class ListInvoicesDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  student_id?: number;

  @IsOptional()
  @IsEnum(invoice_payment_status)
  payment_status?: invoice_payment_status;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  course_id?: number;

  // ISO dates (YYYY-MM-DD) filter on invoice.date — both must be present.
  @IsOptional()
  @IsString()
  from_date?: string;

  @IsOptional()
  @IsString()
  to_date?: string;
}

export class ListPaymentsDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  invoice_id?: number;
}

export class ListFeeTypesDto extends PaginationDto {}

export class ListCommissionPlansDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  student_id?: number;
}

/** Shared date-range query (ISO YYYY-MM-DD). Used by several finance reports. */
class DateRangeDto {
  @IsOptional()
  @IsString()
  from_date?: string;

  @IsOptional()
  @IsString()
  to_date?: string;
}

/** GET /finance/fee-status — students referred by a client with finance rows. */
export class FeeStatusQueryDto extends DateRangeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  referred_by?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  university_id?: number;
}

/** GET /finance/student-commission — role_id=4 students + upcarrera_commission. */
export class StudentCommissionQueryDto extends DateRangeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  university_id?: number;

  // 0 => commission NOT set; >0 => commission set. Mirrors legacy commission_status.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  commission_status?: number;
}

/** GET /finance/university-commission — per-university commission rollup. */
export class UniversityCommissionReportQueryDto extends DateRangeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  university_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  commission_status?: number;
}

/** GET /finance/students — role_id=4 students joined to students table. */
export class FinanceStudentsQueryDto extends DateRangeDto {}

/** GET /fee-management/installments & /course-fee — student fee installment list. */
export class FeeManagementListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  university_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  course_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  consultant_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  client_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  admission_status?: number;

  @IsOptional()
  @IsString()
  source?: string;

  // added | partially_added | not_added
  @IsOptional()
  @IsString()
  list_by?: string;
}

/** GET /fee-management/payment-status — installment payment status report. */
export class PaymentStatusQueryDto extends DateRangeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  university_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  course_id?: number;

  // 1 OVERDUE | 2 DUE | 3 UPCOMING | 4 PAID
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  list_by?: number;
}

/** GET /university-commission — students grouped for university commission. */
export class UniversityCommissionListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  university_id?: number;
}
