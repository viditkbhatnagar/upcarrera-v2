import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for POST /students/:id/finance and PATCH /students/:id/finance.
 * One `finance` row per student (finance.student_id = users.id, i.e. the student's
 * user id). Ports App/Students::finance_add / finance_edit. Every field is optional,
 * mirroring the permissive legacy insert/update.
 */
export class UpsertFinanceDto {
  @IsOptional()
  @IsInt()
  tuitionFees?: number;

  @IsOptional()
  @IsInt()
  examFees?: number;

  @IsOptional()
  @IsInt()
  miscFees?: number;

  @IsOptional()
  @IsString()
  scholarship_details?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  payment_status?: string;
}
