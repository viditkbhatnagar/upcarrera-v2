import { IsInt, IsOptional, IsString } from 'class-validator';

/**
 * POST /fee-management/students/:id/installments — inserts a `student_payments`
 * row. Ported from Fee_management::add_installment. The legacy code caps total
 * paid at the specialisation/special fee total; that guard is ported in the
 * service. `amount` maps to student_payments.amount (Int).
 */
export class CreateInstallmentDto {
  @IsOptional()
  @IsString()
  installment_details?: string;

  @IsOptional()
  @IsInt()
  amount?: number;

  // ISO date strings (YYYY-MM-DD) for the @db.Date columns.
  @IsOptional()
  @IsString()
  due_date?: string;

  @IsOptional()
  @IsString()
  paid_date?: string;

  @IsOptional()
  @IsString()
  payment_mode?: string;

  @IsOptional()
  @IsString()
  payment_to?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

/** PATCH /fee-management/installments/:id — partial update of a student_payments row. */
export class UpdateInstallmentDto extends CreateInstallmentDto {}

/**
 * POST /fee-management/students/:id/special-fee — upserts a `student_special_fees`
 * row keyed on (student_id, specialisation_id). Ported from
 * Fee_management::add_special_fee. specialisation_id is resolved from the student
 * when omitted (legacy reads students.specialisation_id).
 */
export class CreateSpecialFeeDto {
  @IsOptional()
  @IsInt()
  specialisation_id?: number;

  // Decimal(10,2) money column — accept string|number, written as-is.
  @IsOptional()
  special_fee?: string | number;

  @IsOptional()
  @IsString()
  reason?: string;
}
