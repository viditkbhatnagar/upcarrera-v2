import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for PATCH /lead-statuses/:id — port of Lead_status controller edit().
 *
 * Named *-config to avoid colliding with UpdateLeadStatusDto, which is the
 * funnel-progression DTO for PATCH /leads/:id/status.
 */
export class UpdateLeadStatusConfigDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title?: string;
}
