import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import type { ReportFormat } from './report-query.dto';

/**
 * Query DTO for GET /reports/courses.
 *
 * Ports the GET filters of CI4 Fee_payment_report.php::course_wise_report():
 *  - from_date / to_date -> course.created_at inclusive day bounds.
 *  - level               -> course.level (free-text VarChar, e.g. 'UG' / 'PG').
 *
 * `?format=csv` switches the response to a CSV download.
 */
export class CourseReportQueryDto {
  /** Inclusive lower bound on course.created_at (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  from_date?: string;

  /** Inclusive upper bound on course.created_at (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  to_date?: string;

  /** Filter on course.level (free-text). */
  @IsOptional()
  @IsString()
  level?: string;

  /** Response format. Defaults to JSON; `csv` triggers a text/csv download. */
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: ReportFormat;
}
