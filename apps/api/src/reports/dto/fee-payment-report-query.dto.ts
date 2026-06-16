import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import type { ReportFormat } from './report-query.dto';

/**
 * Query DTO for GET /reports/fee-payment (and the GET /reports/fee variant).
 *
 * Ports the GET filters of CI4 Fee_payment_report.php::fee_report() /
 * Reports.php::fee_report():
 *  - from_date / to_date -> users.created_at inclusive day bounds.
 *  - university_id       -> users.university_id (lives on the student-role user).
 *  - payment_status      -> finance.payment_status (free-text VarChar(20)).
 *
 * `?format=csv` switches the response to a CSV download. The global
 * ValidationPipe runs with transform:true, so @Type coerces the numeric params
 * (no per-param ParseIntPipe — matches the codebase style).
 */
export class FeePaymentReportQueryDto {
  /** Inclusive lower bound on users.created_at (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  from_date?: string;

  /** Inclusive upper bound on users.created_at (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  to_date?: string;

  /** Filter to a single university (users.university_id). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  university_id?: number;

  /** Filter on finance.payment_status (free-text, e.g. 'paid' / 'partial'). */
  @IsOptional()
  @IsString()
  payment_status?: string;

  /** Response format. Defaults to JSON; `csv` triggers a text/csv download. */
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: ReportFormat;
}
