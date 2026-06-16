import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query for GET /subjects. Extends the shared pagination contract with an
 * optional ?course_id filter (subjects.course_id), mirroring the legacy
 * get_subject_by_course() lookup used throughout the demo-session flow.
 */
export class SubjectListQueryDto {
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
}
