import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * Body for PATCH /demo-sessions/:id/reschedule.
 *
 * Unlike the thin `sessions` table, `demo_sessions` HAS scheduled_date /
 * from_time / to_time columns, so this reschedule genuinely persists. Only the
 * schedule fields are accepted here (port of the legacy reschedule action which
 * touched only date/time). All optional — supply any subset.
 */
export class RescheduleDemoSessionDto {
  // YYYY-MM-DD
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'scheduled_date must be in YYYY-MM-DD format',
  })
  scheduled_date?: string;

  // HH:mm or HH:mm:ss
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/, {
    message: 'from_time must be in HH:mm or HH:mm:ss format',
  })
  from_time?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/, {
    message: 'to_time must be in HH:mm or HH:mm:ss format',
  })
  to_time?: string;
}
