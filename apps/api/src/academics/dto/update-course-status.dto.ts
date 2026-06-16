import { IsInt } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Body for PATCH /courses/:id/status. Ports Course::change_status, which set the
 * course `status` column. The legacy lms_course view compared status against the
 * strings 'active'/'inactive'/'pending', but the actual `course.status` column
 * in prisma/schema.prisma is an Int? — the schema is authoritative, so we accept
 * and persist an integer status.
 */
export class UpdateCourseStatusDto {
  @Type(() => Number)
  @IsInt()
  status!: number;
}
