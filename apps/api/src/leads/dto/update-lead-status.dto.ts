import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for PATCH /leads/:id/status. Mirrors legacy Leads::update_lead_status:
 * writes a lead_activity history row AND updates the lead's current status.
 * `followup_date` is an ISO date string (DB column is a DATE).
 */
export class UpdateLeadStatusDto {
  @IsInt()
  @IsNotEmpty()
  lead_status_id!: number;

  @IsOptional()
  @IsString()
  followup_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  remarks?: string;
}
