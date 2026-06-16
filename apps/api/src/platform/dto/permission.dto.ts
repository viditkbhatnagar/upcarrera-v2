import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Port of App/Permissions::add. The legacy table columns title/slug are
 * VarChar(50). Both were optional in the legacy form (no validation), so we
 * keep them optional but length-bounded.
 */
export class CreatePermissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  slug?: string;
}

/** Port of App/Permissions::edit. Every field optional (partial update). */
export class UpdatePermissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  slug?: string;
}
