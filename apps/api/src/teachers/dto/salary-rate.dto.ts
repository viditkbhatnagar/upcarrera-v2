import { IsInt, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * Create a per-teacher salary-rate row (POST /teacher-salary-rates).
 * Ports the legacy Teacher_salary rate setup: a `teacher_salary` row carrying
 * the per-duration band rates plus the confirmed-demo bonus.
 */
export class CreateSalaryRateDto {
  @IsInt()
  @IsNotEmpty()
  teacher_id!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salary_30?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salary_45?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salary_1?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salary_confirmed_demo?: number;
}

/** Partial update of a salary-rate row (PATCH /teacher-salary-rates/:id). */
export class UpdateSalaryRateDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  salary_30?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salary_45?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salary_1?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salary_confirmed_demo?: number;
}
