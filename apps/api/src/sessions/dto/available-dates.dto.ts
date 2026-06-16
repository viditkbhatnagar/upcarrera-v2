import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty } from 'class-validator';

/**
 * Query for GET /teacher-schedules/available-dates?teacher_id=
 * Port of Sessions::get_teacher_schedule_dates() — returns the distinct dates a
 * teacher has schedule rows for.
 */
export class AvailableDatesDto {
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  teacher_id!: number;
}
