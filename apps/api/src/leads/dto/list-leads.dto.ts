import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/** Query params for GET /leads — pagination + the two legacy funnel filters. */
export class ListLeadsDto {
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
  lead_status_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  telecaller_id?: number;
}
