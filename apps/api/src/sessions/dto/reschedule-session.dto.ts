import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * Body for PATCH /sessions/:id/reschedule.
 *
 * SCHEMA NOTE: the v2 `sessions` table is thin (PK session_id + session_title
 * only) — it has NO scheduled_date / from_time / to_time columns. The legacy
 * reschedule flow updated those columns, but they are absent here, so the
 * service cannot persist them (see SessionsService.rescheduleSession + its
 * TODO(prod-table) note). These fields are accepted + validated so the contract
 * is forward-compatible, and echoed back in the response for the caller.
 */
export class RescheduleSessionDto {
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
