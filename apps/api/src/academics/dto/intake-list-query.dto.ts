import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query for GET /intakes. Pagination plus an optional server-side
 * `?university_id` filter that keeps only intakes which have at least one live
 * offering for that university (the Intakes screen's universities filter).
 */
export class IntakeListQueryDto {
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
  university_id?: number;
}
