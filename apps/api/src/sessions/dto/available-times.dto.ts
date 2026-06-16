import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * Query for GET /teacher-schedules/available-times?teacher_id=&date=
 * Port of Sessions::get_teacher_schedule_times() — returns the teacher's
 * schedule slots for a given date, sorted by start_time ascending.
 */
export class AvailableTimesDto {
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  teacher_id!: number;

  // YYYY-MM-DD
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date!: string;
}
