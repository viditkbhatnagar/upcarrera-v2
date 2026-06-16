import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query for GET /semesters. Extends pagination with the legacy
 * Semester::fetch_semesters (by course) and
 * Semester::fetch_semester_by_university_id (by university) filters. Both map to
 * real columns on the `semester` model: course_id, university_id.
 */
export class SemesterListQueryDto {
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
  course_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  university_id?: number;
}
