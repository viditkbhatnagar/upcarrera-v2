import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * Query params for GET /clients — pagination + the legacy index() filters.
 * Port of Clients::index (App/Controllers/App/Clients.php), which filtered
 * role_id=8 users by users.partnership_status and users.country_id.
 *
 * @Type coerces query strings under the global transform ValidationPipe; we do
 * NOT use per-param ParseIntPipe because it conflicts with that pipe.
 */
export class ListClientsDto {
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

  // users.partnership_status (VarChar(20)); legacy ?partnership_status= filter.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  partnership_status?: string;

  // users.country_id; legacy ?country_id= filter.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  country_id?: number;
}
