import { IsString, IsNotEmpty, MaxLength, MinLength, Matches } from 'class-validator';

/**
 * Self-serve password recovery (migration 004). Two unauthenticated steps:
 *   1. ForgotPasswordDto  -> emails a one-time code (no account enumeration).
 *   2. ResetWithOtpDto     -> verifies the code and sets the new password.
 *
 * Both run under the public /api/public/auth surface (nginx rate-limited) and the
 * service adds per-user + per-code caps on top.
 */
export class ForgotPasswordDto {
  /** Email address or user ID the account signs in with. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(190)
  identifier!: string;
}

export class ResetWithOtpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(190)
  identifier!: string;

  /** The 6-digit code from the email. */
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from your email.' })
  otp!: string;

  /** New password. bcrypt hashes only the first 72 bytes, so cap the input there. */
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(72)
  password!: string;
}
