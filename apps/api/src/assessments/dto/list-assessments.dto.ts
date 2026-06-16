import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Query params for GET /assessments and GET /homework.
 *
 * Pagination (`?page`, `?limit`) plus the optional `?student_id`, `?teacher_id`
 * and `?course_id` filters. The global ValidationPipe runs with transform:true,
 * so @Type coerces these numeric query params before validation.
 */
export class ListAssessmentsDto {
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
  student_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  teacher_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  course_id?: number;
}
