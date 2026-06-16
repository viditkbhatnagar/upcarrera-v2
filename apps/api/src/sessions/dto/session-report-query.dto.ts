import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * Query for GET /reports/sessions?from_date=&to_date=
 * Port of Session_report::index() — an optional inclusive date window on
 * session_attendance_teacher.date. Both bounds are optional; supplying neither
 * returns the full report.
 */
export class SessionReportQueryDto {
  // YYYY-MM-DD
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from_date must be in YYYY-MM-DD format',
  })
  from_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'to_date must be in YYYY-MM-DD format',
  })
  to_date?: string;
}
