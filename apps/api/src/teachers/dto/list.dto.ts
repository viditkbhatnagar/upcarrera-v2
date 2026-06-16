import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/** Shared pagination — @Type coerces query strings under the global transform pipe. */
class PaginationDto {
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
}

export class TeacherListDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search_key?: string;

  /**
   * Narrow to teachers assigned to a course via teachers_subjects.course_id
   * (port of Teachers::get_teacher_by_course).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  course_id?: number;

  /**
   * Narrow to teachers assigned to the course that owns this subject
   * (subjects.course_id -> teachers_subjects.course_id).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  subject_id?: number;
}

export class TeacherIdListDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  teacher_id?: number;
}

export class UserIdListDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  user_id?: number;
}
