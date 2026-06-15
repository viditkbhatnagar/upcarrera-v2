import { IsInt, IsNotEmpty, IsOptional } from 'class-validator';

/**
 * Port of CI4 App\Models\Teachers_subjects_model — links a teacher (users.id) to a course.
 */
export class CreateSubjectDto {
  @IsInt()
  @IsNotEmpty()
  user_id!: number;

  @IsOptional()
  @IsInt()
  course_id?: number;
}
