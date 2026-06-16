import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Port of Telecallers::add. Creates a role_id=2 `users` row. The legacy app did
 * almost no validation, so only name/username/password are required; the rest
 * mirror the editable user columns. `code` is the users.code Int FK.
 */
export class CreateTelecallerDto {
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
