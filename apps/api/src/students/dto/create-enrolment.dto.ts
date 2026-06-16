import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

/**
 * Body for POST /students/:id/enrolments. Creates an `enrol` row linking a
 * student (users.id, taken from the :id param) to a course, and optionally a
 * subject/teacher. `session_count` is accepted for API parity but the `enrol`
 * table has no column for it in the current schema — see TODO(prod-table) in the
 * service.
 */
export class CreateEnrolmentDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  course_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  subject_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  teacher_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  session_count?: number;
}
