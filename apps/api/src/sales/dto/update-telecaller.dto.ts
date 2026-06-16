import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Port of Telecallers::edit — a partial profile update. Every field optional;
 * password is NOT changed here (use PATCH /users/:id/password). Mirrors the
 * legacy edit form which only touched name/email/code/phone/profile_picture.
 */
export class UpdateTelecallerDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  email?: string;

  @IsOptional()
  @IsInt()
  code?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  profile_picture?: string;
}
