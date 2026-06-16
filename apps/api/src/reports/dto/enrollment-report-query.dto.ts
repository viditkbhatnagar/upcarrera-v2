import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional } from 'class-validator';

/**
 * Query DTO for the enrollment reporting endpoints.
 *
 * Ports the GET params of App/Controllers/App/Enrollment.php
 * (all_enrollments / university_wise / intake_wise):
 *  - from / to       -> legacy `from_date` / `to_date`, applied to
 *                       students.enrollment_date (inclusive day bounds).
 *  - university_id   -> legacy `users.university_id` filter. NOTE: university_id
 *                       lives on `users` (users.id = students.student_id), NOT on
 *                       the students row, so the service resolves it via users.
 *  - session_id      -> legacy `students.session_id` (intake) filter; direct.
 *
 * The global ValidationPipe runs with transform:true, so @Type coerces the
 * numeric query params (no per-param ParseIntPipe — matches the codebase style).
 */
export class EnrollmentReportQueryDto {
  /** Inclusive lower bound on students.enrollment_date (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Inclusive upper bound on students.enrollment_date (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  to?: string;

  /** Filter to a single university (resolved via users.university_id). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  university_id?: number;

  /** Filter to a single session/intake (students.session_id). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  session_id?: number;
}
