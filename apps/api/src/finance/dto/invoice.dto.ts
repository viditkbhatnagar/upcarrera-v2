import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { invoice_payment_status } from '@prisma/client';

/**
 * Create/update payloads for the `invoice` model.
 * Legacy app performed no validation, so every business field stays optional
 * and only types/enums are enforced.
 */
export class CreateInvoiceDto {
  @IsOptional()
  @IsInt()
  university_id?: number;

  @IsOptional()
  @IsInt()
  semester_id?: number;

  @IsOptional()
  @IsInt()
  student_id?: number;

  @IsOptional()
  @IsInt()
  course_id?: number;

  @IsOptional()
  @IsEnum(invoice_payment_status)
  payment_status?: invoice_payment_status;

  @IsOptional()
  @IsNumber()
  total_amount?: number;

  @IsOptional()
  @IsNumber()
  discount_amount?: number;

  @IsOptional()
  @IsNumber()
  payable_amount?: number;

  // Money column collected_commission_of_university is read as-is; accept string|number.
  @IsOptional()
  collected_commission_of_university?: string | number;

  // ISO date strings (e.g. 2026-06-15) for the @db.Date columns.
  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  due_date?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class UpdateInvoiceDto extends CreateInvoiceDto {}
