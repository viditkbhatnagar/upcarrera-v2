import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/** The seven weekday tokens the legacy timetable_add() accepted. */
export const WEEKDAY_TOKENS = [
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
] as const;

export type WeekdayToken = (typeof WEEKDAY_TOKENS)[number];

/**
 * Port of Sessions::timetable_add() (Session_old.php). The legacy action took a
 * `scheduled_date` of 'YYYY-MM', a `week` array of weekday tokens, and inserted
 * one `sessions` row per matching weekday occurrence in that month (today or
 * later).
 *
 * NOTE on the schema: the legacy `sessions` table carried
 * student_id/teacher_id/course_id/subject_id/scheduled_date/from_time/to_time,
 * but the migrated `sessions` table in prisma/schema.prisma is thin — only
 * session_id + session_title (+ audit) exist. Those scheduling columns live on
 * `demo_sessions`. We therefore accept the full legacy payload for parity, but
 * only persist `session_title` (per generated occurrence) onto each `sessions`
 * row; the scheduling identifiers are validated + echoed back, not stored. See
 * the service for the per-occurrence loop.
 */
export class BulkSessionsDto {
  @IsOptional()
  @IsString()
  @MaxLength(260)
  session_title?: string;

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

  /** Weekday tokens, e.g. ['mon','wed','fri']. */
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(WEEKDAY_TOKENS, { each: true })
  weekdays!: WeekdayToken[];

  /** Target month as 'YYYY-MM'. */
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be in YYYY-MM format' })
  month!: string;

  // HH:mm or HH:mm:ss — echoed back for parity (not stored on the thin table).
  @IsOptional()
  @IsString()
  from_time?: string;

  @IsOptional()
  @IsString()
  to_time?: string;
}
