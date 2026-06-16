import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Query params for GET /student/performance — optional course_id filter.
 * Port of CI4 Api/Student/Performance::index (?course_id=).
 */
export class PerformanceQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  course_id?: number;
}
