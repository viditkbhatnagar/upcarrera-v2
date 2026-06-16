import { IsOptional, IsString } from 'class-validator';

/**
 * Create/update payloads for the `commission_plan` model. The legacy columns
 * expected_commission_amount / amount_received are VarChar(288) money strings,
 * so they are accepted as string|number and written through as-is.
 */
export class CreateCommissionPlanDto {
  @IsOptional()
  expected_commission_amount?: string | number;

  // ISO date string (YYYY-MM-DD) for the @db.Date column.
  @IsOptional()
  @IsString()
  expected_date?: string;
}

export class UpdateCommissionPlanDto extends CreateCommissionPlanDto {}

/** PATCH /students/commission-plan/:id/amount-received. */
export class UpdateAmountReceivedDto {
  @IsOptional()
  amount_received?: string | number;

  @IsOptional()
  @IsString()
  amount_received_date?: string;
}

/** PATCH /students/:id/upcarrera-commission — students.upcarrera_commission (Int). */
export class UpdateUpcarreraCommissionDto {
  @IsOptional()
  upcarrera_commission?: number;
}
