import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query for GET /states. Extends pagination with an optional ?country filter.
 * The `states` table has a `country` VarChar column (NOT country_id), so the
 * filter is a string match on that column.
 */
export class StatesListQueryDto {
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

  // states.country is a VarChar(100) column, not an FK id.
  @IsOptional()
  @IsString()
  country?: string;
}
