import { Type } from 'class-transformer';
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
 * Port of the legacy Group_course form. `group_name` is required (legacy
 * validation: min 3 / max 255). `course_ids` is required and at least one
 * course must be selected; it is stored as a JSON-encoded array of ids in the
 * `course_ids` LongText column (the service does the JSON.stringify, mirroring
 * the legacy json_encode($courseIds)).
 */
export class CreateGroupCourseDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  group_name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  course_ids!: number[];
}
