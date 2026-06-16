import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Port of Demo_sessions::edit() — every field optional (permissive edit form).
 * When `schedule_id` is supplied the service resolves from_time/to_time from the
 * matching teachers_schedules row (start_time/end_time), mirroring the legacy
 * behavior where the schedule drove the slot times. Declared standalone (no
 * PartialType) to match CreateDemoSessionDto's no-mapped-types convention.
 */
export class UpdateDemoSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  session_no?: string;

  @IsOptional()
  @IsString()
  @MaxLength(260)
  session_title?: string;

  @IsOptional()
  @IsInt()
  lead_id?: number;

  @IsOptional()
  @IsInt()
  course_id?: number;

  @IsOptional()
  @IsInt()
  subject_id?: number;

  @IsOptional()
  @IsInt()
  teacher_id?: number;

  @IsOptional()
  @IsInt()
  schedule_id?: number;

  // YYYY-MM-DD; coerced to a Date in the service.
  @IsOptional()
  @IsString()
  scheduled_date?: string;

  // HH:mm:ss; only used when schedule_id is NOT supplied (otherwise resolved
  // from the schedule). Coerced to a Date in the service.
  @IsOptional()
  @IsString()
  from_time?: string;

  @IsOptional()
  @IsString()
  to_time?: string;

  @IsOptional()
  @IsBoolean()
  teacher_status?: boolean;

  @IsOptional()
  @IsBoolean()
  lead_status?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(260)
  teacher_remarks?: string;

  @IsOptional()
  @IsString()
  @MaxLength(260)
  lead_remarks?: string;
}
