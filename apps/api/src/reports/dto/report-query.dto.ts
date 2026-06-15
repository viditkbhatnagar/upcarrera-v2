import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional } from 'class-validator';

/** Output formats supported by every report endpoint. */
export type ReportFormat = 'json' | 'csv';

/**
 * Shared query DTO for the reporting endpoints.
 *
 * Mirrors the legacy `from_date` / `to_date` GET params used by
 * App/Controllers/App/{Lead_report,Students_report,Income_report,Followup_report}.php,
 * but exposes them as the cleaner `from` / `to` names. `?format=csv` switches
 * the response to a CSV download.
 *
 * Dates are validated as ISO date strings (YYYY-MM-DD). The global
 * ValidationPipe runs with transform:true, so @Type coerces numeric params.
 */
export class ReportQueryDto {
  /** Inclusive lower bound on the report's date column (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Inclusive upper bound on the report's date column (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  to?: string;

  /** Response format. Defaults to JSON; `csv` triggers a text/csv download. */
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: ReportFormat;
}

/** Followups report adds an optional telecaller filter (role_id 2 / 6 in CI4). */
export class FollowupReportQueryDto extends ReportQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  telecaller_id?: number;
}
