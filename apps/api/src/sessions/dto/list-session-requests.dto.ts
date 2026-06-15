import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Query params for GET /session-requests — pagination + optional filters that
 * exist on the session_requests table (student_id / course_id / status).
 */
export class ListSessionRequestsDto {
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
  student_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  course_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;
}
