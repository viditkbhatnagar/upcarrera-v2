import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Query params for GET /demo-sessions — pagination + optional filters that
 * actually exist on the demo_sessions table (teacher_id / lead_id / course_id).
 */
export class ListDemoSessionsDto {
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
  teacher_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  lead_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  course_id?: number;
}
