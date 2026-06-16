import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

/**
 * Query params for GET /leads/followups.
 *
 * Lists the follow-up funnel (lead_status_id = 3, not converted). Pagination
 * plus the optional filters the legacy Followup screen offered. The from/to
 * bounds apply to followup_date (a DATE column), mirroring the legacy follow-up
 * date-range picker. Numeric params are coerced with @Type(() => Number) so the
 * global transform pipe never has to fight a per-param ParseIntPipe.
 */
export class ListFollowupsDto {
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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  telecaller_id?: number;

  /** leads.lead_source_id is a VarChar in the legacy schema — filter as a string. */
  @IsOptional()
  lead_source_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  course_id?: number;

  /** Inclusive lower bound on followup_date (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Inclusive upper bound on followup_date (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  to?: string;
}
