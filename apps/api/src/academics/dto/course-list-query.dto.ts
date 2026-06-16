import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query for GET /courses. Extends the shared pagination contract with the
 * legacy Course::index / lms_course filters:
 *   ?university_id  -> course.university_id   (legacy index() filter)
 *   ?lms            -> course.is_lms_course   (legacy lms_course() forces is_lms_course=1)
 *   ?institution_id -> NO backing column on `course` in prisma/schema.prisma.
 *
 * NOTE: the legacy Course::fetch_course() queries `course.institution_id`, but
 * that column does NOT exist in the current schema (course has no institution_id).
 * The param is accepted for API compatibility but is intentionally a no-op so it
 * cannot silently zero out results. See the service for the where-clause.
 */
export class CourseListQueryDto {
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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  university_id?: number;

  // Accepted for legacy parity; `course` has no institution_id column so the
  // service treats this as a no-op rather than filtering to an empty set.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  institution_id?: number;

  // ?lms=1 (or 0) -> is_lms_course filter. Coerced to a number so '1' works.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  lms?: number;
}
