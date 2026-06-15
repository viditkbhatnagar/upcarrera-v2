import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/** Query params for GET /student/sessions — pagination only. */
export class ListStudentSessionsDto {
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
