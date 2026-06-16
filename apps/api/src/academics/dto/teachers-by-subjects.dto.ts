import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

/**
 * Body for POST /subjects/teachers-by-subjects. Resolves the teachers assigned
 * to each of the given subjects. @Type(() => Number) coerces each element so
 * the global transform pipe accepts numeric-string array members.
 */
export class TeachersBySubjectsDto {
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  subject_ids!: number[];
}
