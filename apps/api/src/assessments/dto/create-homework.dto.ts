import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Port of the legacy Homework::add() form (App/Controllers/App/Homework.php).
 * Field set is identical to the assessment form; the legacy controller always
 * wrote teacher_status / student_status = 0 on create.
 */
export class CreateHomeworkDto {
  @IsOptional()
  @IsString()
  @MaxLength(260)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  student_id?: number;

  @IsOptional()
  @IsInt()
  teacher_id?: number;

  @IsOptional()
  @IsInt()
  course_id?: number;

  @IsOptional()
  @IsInt()
  subject_id?: number;

  /** Due date (YYYY-MM-DD). Stored on the `due_date` Date column. */
  @IsOptional()
  @IsDateString()
  due_date?: string;
}
