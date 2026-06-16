import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Port of App/User_role::add. The user_role table has a single title column
 * (VarChar(50)). Optional to match the legacy form, but length-bounded.
 */
export class CreateRoleDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  title?: string;
}

/** Port of App/User_role::edit. */
export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  title?: string;
}
