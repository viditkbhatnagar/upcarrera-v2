import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/** Query params for GET /student/feed — pagination only. */
export class ListFeedDto {
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
