import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Port of CI4 App\Controllers\App\Teacher_schedules.
 * `date` is an ISO date string (YYYY-MM-DD); start/end are time strings (HH:MM:SS).
 */
export class CreateScheduleDto {
  @IsInt()
  @IsNotEmpty()
  teacher_id!: number;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  start_time?: string;

  @IsOptional()
  @IsString()
  end_time?: string;
}
