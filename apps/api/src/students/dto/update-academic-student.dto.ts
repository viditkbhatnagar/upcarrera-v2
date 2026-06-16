import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for PATCH /academic/students/:id. Ports App/Academic::edit — updates the
 * student's academic fields on the `students` row (and `users.university_id`).
 * The :id here is the student's user id (students.student_id = users.id), matching
 * the legacy route. Every field optional.
 */
export class UpdateAcademicStudentDto {
  // users.university_id (legacy updates the users row too)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  university_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  enrollment_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  application_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  abc_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  consultant_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  admission_status?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  specialisation_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  adm_pipeline?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pipeline_user?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ref_student?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  course_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  mode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  session_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string;
}
