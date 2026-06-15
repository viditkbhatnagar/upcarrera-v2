import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Query params for GET /sessions — pagination only.
 *
 * NOTE: the legacy `Session_old.php` controller filtered by teacher_id /
 * student_id / course_id, but those columns live on the `demo_sessions` table,
 * NOT on the current `sessions` table (which only has session_id + session_title
 * per schema.prisma). We therefore do not expose those filters here; use the
 * GET /demo-sessions filters instead.
 */
export class ListSessionsDto {
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
}
