import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import type { ReportFormat } from './report-query.dto';

/**
 * Query DTO for GET /reports/consultant-performance.
 *
 * Ports the GET filters of CI4 Reports.php::consultant_performance_report():
 *  - search_key -> matched against the consultant's name / phone / email (LIKE).
 *  - status     -> users.status (Int; legacy compared loosely so we coerce).
 *  - university -> exposed for parity with the legacy filter dropdown. NOTE: the
 *    legacy controller fetched the university list but never actually filtered
 *    consultants by it (consultants are role_id=6 users with no university_id
 *    binding in that query), so this is accepted and echoed but does not narrow
 *    the consultant set — documented here so the behaviour is faithful.
 *
 * `?format=csv` switches the response to a CSV download. The global
 * ValidationPipe runs with transform:true, so @Type coerces the numeric params
 * (no per-param ParseIntPipe — matches the codebase style).
 */
export class ConsultantPerformanceReportQueryDto {
  /** Free-text search across consultant name / phone / email. */
  @IsOptional()
  @IsString()
  search_key?: string;

  /** Filter on users.status (1 = active, 0 = inactive). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;

  /** Accepted for parity with the legacy dropdown; does not filter (see note). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  university?: number;

  /** Response format. Defaults to JSON; `csv` triggers a text/csv download. */
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: ReportFormat;
}
