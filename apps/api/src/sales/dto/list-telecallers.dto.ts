import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Query params for GET /telecallers. Pagination + the legacy `search` filter
 * (Telecallers::index searched name/phone/email). Numbers are coerced with
 * @Type(() => Number) + @IsOptional() rather than a per-param ParseIntPipe,
 * which conflicts with the global transform ValidationPipe.
 */
export class ListTelecallersDto {
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
