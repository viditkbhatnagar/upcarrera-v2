import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for PATCH /leads/:id/verify — port of Leads::verify_lead.
 *
 * Flags the lead verified (is_verified = 1, verified_by, verified_at) and, when
 * supplied, updates the verified contact fields. `name` maps to the legacy
 * `title` column (the lead's display name).
 */
export class VerifyLeadDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsInt()
  course_id?: number;
}
