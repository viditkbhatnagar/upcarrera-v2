import { IsIn, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Body for PATCH /courses/:id/lms. Ports Course::add_to_lms($course_id, $is_add):
 * is_add=1 -> is_lms_course=1, else 0, and stamps added_at. If `is_add` is
 * omitted the service flips the current value (toggle semantics).
 */
export class ToggleLmsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  is_add?: number;
}
