import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Port of Demo_sessions_model — field set mirrors the demo_sessions table in
 * schema.prisma. The legacy app performed no validation, so every field is
 * optional; we only enforce types + column lengths. Timestamps + audit columns
 * are managed by the service.
 *
 * Date/time columns (scheduled_date, from_time, to_time) are accepted as strings
 * and coerced to Date objects in the service before persistence.
 */
export class CreateDemoSessionDto {
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

  // HH:mm:ss; coerced to a Date in the service.
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
