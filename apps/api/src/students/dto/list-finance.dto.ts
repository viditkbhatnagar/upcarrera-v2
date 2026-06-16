import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsDateString, Min } from 'class-validator';

/**
 * Query params for GET /students/finance — pagination plus the legacy filters from
 * App/Students::finance (date range on users.created_at, university_id).
 */
export class ListFinanceDto {
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
  @IsDateString()
  from_date?: string;

  @IsOptional()
  @IsDateString()
  to_date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  university_id?: number;
}
