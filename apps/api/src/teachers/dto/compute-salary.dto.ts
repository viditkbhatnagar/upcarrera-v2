import { IsDateString, IsNotEmpty } from 'class-validator';

/**
 * Query params for GET /teachers/:id/salary.
 * Dates are ISO `YYYY-MM-DD` strings (inclusive range against demo_sessions.scheduled_date).
 * We keep them as validated strings and parse to Date in the service so the
 * caller controls the exact day boundary (mirrors the legacy month filter which
 * used `scheduled_date >= month-01` / `<= month-end`).
 */
export class ComputeSalaryDto {
  @IsNotEmpty()
  @IsDateString()
  from!: string;

  @IsNotEmpty()
  @IsDateString()
  to!: string;
}
