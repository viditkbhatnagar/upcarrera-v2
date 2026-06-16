import { IsDateString, IsOptional } from 'class-validator';

/**
 * Query DTO for GET /reports/assessments and GET /reports/homework.
 *
 * Mirrors the legacy `from_date` / `to_date` GET params used by
 * App/Controllers/App/{Assessment_report,Home_work_report}.php, exposed as the
 * cleaner `from` / `to` names. The legacy code only applied the date window when
 * BOTH bounds were present (created_at >= from 00:00:00 AND <= to 23:59:59);
 * the service reproduces that all-or-nothing behaviour.
 */
export class AssessmentReportQueryDto {
  /** Inclusive lower bound on created_at (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Inclusive upper bound on created_at (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  to?: string;
}
