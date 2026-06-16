import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Port of Institutions::edit — partial profile update (no password change;
 * use PATCH /institutions/:id/password for that). Every field optional,
 * mirroring the permissive legacy update.
 */
export class UpdateInstitutionDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  university_id?: number;

  @IsOptional()
  @IsInt()
  institution_id?: number;

  @IsOptional()
  @IsInt()
  code?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  email?: string;

  @IsOptional()
  @IsString()
  profile_picture?: string;
}
