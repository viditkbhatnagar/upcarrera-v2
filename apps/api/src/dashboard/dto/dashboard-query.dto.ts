import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Optional `year` filter for the admin/consultant trend charts.
 * Uses @Type(() => Number) so the global ValidationPipe (transform: true)
 * coerces the query string to a number — matching the project-wide list-DTO
 * pattern (NO per-param ParseIntPipe, which conflicts with that transform).
 */
export class DashboardQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year?: number;
}
