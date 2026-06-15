import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
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
