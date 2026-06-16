import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for POST /users/me/switch-role. Ports App/Controllers/Api/User::switch_role,
 * which set users.current_role. That column is NOT present in the current Prisma
 * schema, so the service treats this as a no-op stub (see TODO(prod-table)).
 */
export class SwitchRoleDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  current_role?: string;
}
