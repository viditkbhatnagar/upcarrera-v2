import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for PATCH /universities/:id/courses/:courseId. Rename the university's own
 * name/code for the course, or pause/resume the tag. Every field is optional;
 * `null` on a name/code clears it (falls back to course.title). @IsOptional
 * passes both null and undefined through, so a cleared field is accepted.
 */
export class UpdateTaggedCourseDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  university_course_name?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  university_course_code?: string | null;

  /** 1 = offered, 0 = paused (hidden from Add Lead, kept for history). */
  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  status?: number;
}
