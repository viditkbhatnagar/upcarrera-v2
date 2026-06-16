import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Admin-driven password reset. Ports App/Admin::reset_password:
 * sets a new username + bcrypt password (username-uniqueness enforced in the
 * service), and snapshots the old hash into users.prev_password. No "current
 * password" check — this is an administrative override.
 */
export class ResetPasswordDto {
  @IsOptional()
  @IsString()
  @MaxLength(190)
  username?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  password!: string;
}

/**
 * Self-service password change. Ports App/Profile::reset_password but adds the
 * current-password verification the legacy form lacked: the caller must prove
 * they know their existing password before it is rotated. Never touches username.
 */
export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  current_password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  password!: string;
}
