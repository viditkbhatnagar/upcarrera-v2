import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

/** Body for POST /student/switch-course — set the student's primary course. */
export class SwitchCourseDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  courseId!: number;
}
