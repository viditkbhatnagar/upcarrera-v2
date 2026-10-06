import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Edit payload for /group-courses/:id. Both fields optional; when `course_ids`
 * is supplied it must still be non-empty (legacy refused an empty selection).
 * The service only re-encodes course_ids when present, leaving it untouched
 * otherwise.
 */
export class UpdateGroupCourseDto {
  // Trimmed; a rename onto another live group's name is rejected with 409.
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  group_name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  course_ids?: number[];
}
