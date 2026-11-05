import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Query params for GET /students — pagination + optional filters.
 *
 * `admission_status` filters the students table directly. `course_id`,
 * `university_id`, `session_id` (intake) and `consultant_id` (counsellor) filter
 * the students table directly too — matching the columns the Students list shows,
 * so "All Courses / Universities / Intakes / Counsellors" narrow exactly those
 * rows (QA ST05). `team_id` / `group_id` resolve to the counsellors of that
 * team/group and match students.consultant_id. `subject_id` / `teacher_id` still
 * narrow to enrolled students via the `enrol` table (legacy LMS filter), and
 * `referred_by` filters students.referred_by. All are coerced to numbers and
 * optional.
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

  // Direct students-table filter: the student's admission course (students.course_id),
  // matching the Course column the list shows.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  course_id?: number;

  // Direct students-table filter: the student's university. Resolved to the course's
  // university (students.course_id -> course.university_id), falling back to the
  // student user's university (users.university_id) — the same rule the list displays.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  university_id?: number;

  // Direct students-table filter: the intake (students.session_id -> sessions).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  session_id?: number;

  // Direct students-table filter: the counsellor (students.consultant_id).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  consultant_id?: number;

  // Counsellor-hierarchy filters: resolve to the counsellors of the team/group,
  // then match students.consultant_id.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  team_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  group_id?: number;

  // Enrolment filters: resolve student user ids via the `enrol` table, then match
  // students.student_id. teacher_id can also be sourced via teachers_subjects.course_id.
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

  /**
   * Free-text search over the student's name, email and phone (all held on the
   * linked `users` row) and over the printed `STU-<n>` id.
   *
   * Without it the Students screen could only filter the rows already fetched,
   * so searching for a student on page 2 from page 1 found nothing (QA ST02).
   * It intersects with the enrolment filters rather than replacing them.
   */
  @IsOptional()
  @IsString()
  search?: string;
}
