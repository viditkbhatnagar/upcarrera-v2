import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Port of Institutions::add. Creates a role_id=5 `users` row. The legacy app
 * did almost no validation, so only name/username/password are required; the
 * rest mirror the editable institution columns. `code` is the users.code Int.
 * University association is via users.university_id (legacy) — institution_id
 * is also accepted as a passthrough (both are Int? in the schema).
 */
export class CreateInstitutionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

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
