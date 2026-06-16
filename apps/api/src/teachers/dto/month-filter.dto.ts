import { Matches } from 'class-validator';
import { IsOptional } from 'class-validator';

/**
 * Optional `?month=YYYY-MM` query filter shared by the salary-payments list and
 * salary-summary endpoints. Mirrors the legacy Teacher_salary_report month
 * window (scheduled_date / payment_date >= month-01 and <= month-end).
 */
export class MonthFilterDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be in YYYY-MM format' })
  month?: string;
}

/** `?month=YYYY-MM` required form (salary-summary needs a concrete window). */
export class RequiredMonthDto {
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be in YYYY-MM format' })
  month!: string;
}
