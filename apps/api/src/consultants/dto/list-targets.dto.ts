import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Query params for GET /consultant-targets — port of Consultant_target::index
 * filters: search across the joined consultant's name/phone/email, target `type`
 * (1 = points-based, 2 = admission-count), and `state` (added / not_added).
 */
export class ListTargetsDto {
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
  type?: number;

  @IsOptional()
  @IsIn(['added', 'not_added'])
  state?: 'added' | 'not_added';
}
