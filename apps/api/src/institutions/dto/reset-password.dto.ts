import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Body for PATCH /institutions/:id/password. Ports Institutions::reset_password:
 * optionally rename the user (with a uniqueness check excluding self) and reset
 * the password, preserving the previous hash in prev_password.
 */
export class ResetPasswordDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
