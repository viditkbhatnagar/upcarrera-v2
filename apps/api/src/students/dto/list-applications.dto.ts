import { Type } from 'class-transformer';
import { IsBooleanString, IsDateString, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * The Phase 1 workflow stages (migration 002), in display order. The list filters
 * and `counts` are computed over the EFFECTIVE stage (derived from stage +
 * is_converted / is_archived / status), so filtering by a stage returns exactly
 * the rows its card counts.
 */
export const APPLICATION_STAGES = [
  'lead_added',
  'form_pending',
  'counsellor_review',
  'fee_pending',
  'fee_verification',
  'sa_verification',
  'converted',
  'rejected',
] as const;

export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

/**
 * Query params for GET /applications — pagination, free-text search and the list
 * screen's dropdown filters. All compose (AND); the response's stage `counts`
 * honour every filter EXCEPT `stage` itself, so the pipeline cards still show the
 * whole funnel for the filtered set. Results are additionally ANDed with the
 * caller's record-access scope on the server.
 */
export class ListApplicationsDto {
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
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  university_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  course_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  session_id?: number;

  /** The counsellor the list DISPLAYS (pipeline_user, else created_by). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  consultant_id?: number;

  /** Alias of consultant_id (the design names it counsellor_id). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  counsellor_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  team_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  group_id?: number;

  @IsOptional()
  @IsIn(APPLICATION_STAGES)
  stage?: ApplicationStage;

  /** 'true' to show only applications currently on hold. */
  @IsOptional()
  @IsBooleanString()
  on_hold?: string;

  /** 'true' to show only on-hold applications whose follow-up date is due. */
  @IsOptional()
  @IsBooleanString()
  followup_due?: string;

  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;
}
