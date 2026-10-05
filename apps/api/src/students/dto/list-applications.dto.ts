import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Query params for GET /applications — pagination plus a free-text search.
 *
 * `search` matches the fields a counsellor actually types into the list filters:
 * the applicant's name, email or phone, and the printed application id. Without
 * it the screen could only filter the ten rows already on the page, so searching
 * for an application on page 2 from page 1 returned nothing (QA AP07).
 *
 * @Type coerces query strings under the global transform ValidationPipe; we do
 * NOT use per-param ParseIntPipe because it conflicts with that pipe.
 */
export class ListApplicationsDto {
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
  @IsString()
  search?: string;
}
