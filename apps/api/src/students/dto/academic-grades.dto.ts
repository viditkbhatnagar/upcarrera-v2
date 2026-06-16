import { IsOptional } from 'class-validator';

/**
 * Body for PATCH /students/:id/academic-grades.
 *
 * The legacy `students` table stores academic progress as JSON in LongText columns:
 * `courses`, `course_status`, `attendance`, `midtermGrades`, `finalGrades`,
 * `paymentStatus`. The service JSON-stringifies whatever structured value is supplied
 * (object/array) before persisting, and JSON-parses on read. Each field is optional —
 * only the provided columns are updated.
 */
export class AcademicGradesDto {
  @IsOptional()
  courses?: unknown;

  @IsOptional()
  course_status?: unknown;

  @IsOptional()
  attendance?: unknown;

  @IsOptional()
  midtermGrades?: unknown;

  @IsOptional()
  finalGrades?: unknown;

  @IsOptional()
  paymentStatus?: unknown;
}
