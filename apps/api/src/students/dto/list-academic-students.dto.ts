import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Query params for GET /academic/students — pagination plus the legacy filters from
 * App/Academic::index (admission_status on the students join, university_id on users).
 */
export class ListAcademicStudentsDto {
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
  admission_status?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  university_id?: number;
}
