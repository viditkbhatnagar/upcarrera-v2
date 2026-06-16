import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsInt, IsOptional } from 'class-validator';

/**
 * Query DTO for the role-permissions list endpoints (?role_id=).
 * Uses @Type(() => Number) so the global ValidationPipe (transform: true)
 * coerces the query string to a number — same pattern as the finance lists,
 * NOT a per-param ParseIntPipe.
 */
export class ListRolePermissionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  role_id?: number;
}

/**
 * Replace-set assignment for a role's permissions. Ports App/Roles_permission::add:
 * the legacy form wiped role_permissions for the role and re-inserted one row per
 * submitted permission. Here we accept explicit permission ids (the API already
 * exposes ids) rather than slugs.
 */
export class AssignRolePermissionsDto {
  @Type(() => Number)
  @IsInt()
  role_id!: number;

  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  permission_ids!: number[];
}
