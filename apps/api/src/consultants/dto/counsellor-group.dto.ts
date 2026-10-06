import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Counsellor groups — the top of the Group -> Team -> Counsellor hierarchy
 * (Phase 1 spec 2.3), backed by the `counsellor_group` table added in
 * database/migrations/001-counsellor-hierarchy.sql.
 *
 * The manager is a users.id. The spec requires them to hold the Manager role;
 * that is a role check the API applies, not something the column can express.
 */
export class CreateCounsellorGroupDto {
  /** Operator-facing code, e.g. "GR-001". Unique where present. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  manager_id?: number;

  /** 1 = active, 0 = inactive, matching the rest of the legacy schema. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;
}

/**
 * Partial update. Every field is optional so a caller can change one attribute
 * without restating the rest — an omitted key leaves the stored value alone.
 */
export class UpdateCounsellorGroupDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  manager_id?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;
}

/**
 * Move a counsellor between teams (Phase 1 spec 2.1 "Transfer Team").
 *
 * `team_id: null` removes them from their team without deleting anything.
 */
export class AssignTeamDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  team_id?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  reports_to?: number | null;
}
