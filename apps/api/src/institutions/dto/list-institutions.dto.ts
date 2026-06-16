import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Query params for GET /institutions. Pagination + the legacy `search` filter
 * (Institutions::index searched name/phone/email via search_key) plus an
 * added `university_id` filter. Numbers are coerced with @Type(() => Number) +
 * @IsOptional() rather than a per-param ParseIntPipe, which conflicts with the
 * global transform ValidationPipe.
 */
export class ListInstitutionsDto {
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

  // Legacy search_key — matched against name / phone / email.
  @IsOptional()
  @IsString()
  search?: string;

  // Added filter: restrict to institutions linked to a university.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  university_id?: number;
}
