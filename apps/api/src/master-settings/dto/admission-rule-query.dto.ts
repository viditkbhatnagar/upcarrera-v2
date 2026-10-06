import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** GET /course-admission-rules — pagination plus an optional ?course_id filter. */
export class AdmissionRuleQueryDto {
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
  @Min(1)
  course_id?: number;
}
