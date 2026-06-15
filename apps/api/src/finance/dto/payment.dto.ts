import { IsEnum, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';
import { payment_payment_type } from '@prisma/client';

/**
 * Records a single row in the `payment` model — a plain insert.
 * NOTE: this does NOT touch Razorpay; gateway order/verify is phase-3.
 */
export class CreatePaymentDto {
  @IsOptional()
  @IsInt()
  user_id?: number;

  @IsOptional()
  @IsInt()
  invoice_id?: number;

  @IsOptional()
  @IsEnum(payment_payment_type)
  payment_type?: payment_payment_type;

  @IsOptional()
  @IsNumber()
  paid_amount?: number;

  // ISO date string for the @db.Date column.
  @IsOptional()
  @IsString()
  payment_date?: string;

  @IsOptional()
  @IsString()
  reference_no?: string;

  @IsOptional()
  @IsString()
  remark?: string;

  // Commission / money columns are read & written as-is (string|number).
  @IsOptional()
  refferal_commision_individual?: string | number;

  @IsOptional()
  refferal_commision_institution?: string | number;

  @IsOptional()
  university_commision_amount?: string | number;
}
