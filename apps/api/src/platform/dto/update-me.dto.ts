import { IsEmail, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for PATCH /users/me. Ports App/Controllers/Api/User::update — the
 * authenticated user editing their OWN row. Only the self-editable bio/contact
 * fields the legacy form exposed (name/code/phone/email/profile_picture) are
 * accepted; role/username/password are deliberately NOT settable here.
 * Every field is optional (the legacy controller ran no validation).
 */
export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  code?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(50)
  email?: string;

  @IsOptional()
  @IsString()
  profile_picture?: string;
}
