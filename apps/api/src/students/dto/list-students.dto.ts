import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Query params for GET /students — pagination + optional filters.
 *
 * `admission_status` filters the students table directly. The remaining filters
 * (`course_id`, `subject_id`, `teacher_id`) narrow to enrolled students via the
 * `enrol` table, and `referred_by` filters students.referred_by. Ports the legacy
 * App/Students::get_students_by_course_subject_teacher / university_enrolment
 * filters. All are coerced to numbers and optional.
 */
export class ListStudentsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  // students.admission_status is an Int in the legacy schema.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  admission_status?: number;

  // Enrolment filters: resolve student user ids via the `enrol` table, then match
  // students.student_id. teacher_id can also be sourced via teachers_subjects.course_id.
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
  referred_by?: number;
}
