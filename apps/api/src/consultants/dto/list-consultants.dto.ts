import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Query params for GET /consultants — pagination + the legacy index() filters
 * (search across name/phone/email, plus an optional status flag).
 * @Type coerces query strings under the global transform ValidationPipe; we do
 * NOT use per-param ParseIntPipe because it conflicts with that pipe.
 */
export class ListConsultantsDto {
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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;
}
