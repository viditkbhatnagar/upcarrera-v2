import { IsIn, IsOptional, Matches } from 'class-validator';
import type { ReportFormat } from './report-query.dto';

/**
 * Query DTO for GET /reports/teacher-salary.
 * `?month=YYYY-MM` selects the calendar month (defaults to the current month,
 * mirroring Teacher_salary_report::index). `?format=csv` triggers a CSV download.
 */
export class TeacherSalaryReportQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be in YYYY-MM format' })
  month?: string;

  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: ReportFormat;
}
