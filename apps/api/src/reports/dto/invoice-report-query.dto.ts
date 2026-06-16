import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional } from 'class-validator';
import type { ReportFormat } from './report-query.dto';

/**
 * Query DTO for GET /reports/invoices.
 *
 * Ports the GET filters of CI4 App/Controllers/App/Invoice.php::index() (which
 * Invoice_report.php's view reused):
 *  - from_date / to_date -> invoice.date inclusive day bounds (exposed as the
 *    legacy `from_date` / `to_date` names the mobile clients already send).
 *  - course_id           -> invoice.course_id.
 *  - student_id          -> invoice.student_id.
 *
 * `?format=csv` switches the response to a CSV download. The global
 * ValidationPipe runs with transform:true, so @Type coerces the numeric params
 * (no per-param ParseIntPipe — matches the codebase style).
 */
export class InvoiceReportQueryDto {
  /** Inclusive lower bound on invoice.date (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  from_date?: string;

  /** Inclusive upper bound on invoice.date (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  to_date?: string;

  /** Filter to a single course (invoice.course_id). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  course_id?: number;

  /** Filter to a single student (invoice.student_id = users.id). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  student_id?: number;

  /** Response format. Defaults to JSON; `csv` triggers a text/csv download. */
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: ReportFormat;
}
