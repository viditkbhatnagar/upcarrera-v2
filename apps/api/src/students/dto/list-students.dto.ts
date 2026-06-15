import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/** Query params for GET /students — pagination + optional admission_status filter. */
export class ListStudentsDto {
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

  // students.admission_status is an Int in the legacy schema.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  admission_status?: number;
}
