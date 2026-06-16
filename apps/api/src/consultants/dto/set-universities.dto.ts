import { Type } from 'class-transformer';
import { IsArray, IsInt } from 'class-validator';

/**
 * Body for PUT /consultants/:id/universities — replace the consultant's
 * assigned university list wholesale (port of Consultant::add_university,
 * which json_encode'd the posted `university[]` array).
 */
export class SetUniversitiesDto {
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  university_ids!: number[];
}
