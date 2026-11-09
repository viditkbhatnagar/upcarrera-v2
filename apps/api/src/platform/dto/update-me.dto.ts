import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for PATCH /users/me. Ports App/Controllers/Api/User::update — the
 * authenticated user editing their OWN row. Only the self-editable bio/contact
 * fields are accepted (name/code/phone/profile_picture); role/username/password
 * are deliberately NOT settable here.
 *
 * `email` is intentionally NOT self-editable: it is the login identifier, so a
 * self-service change is an account-integrity/takeover risk (QA S1). Email is
 * managed by admins through user management. With ValidationPipe whitelisting,
 * any `email` sent here is stripped rather than applied.
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
  @IsString()
  profile_picture?: string;
}
