import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Body for PATCH /users/:id/password. Ports Sales::edit_password /
 * Telecallers::reset_password: optionally rename the user (with a uniqueness
 * check) and reset the password, preserving the previous hash in prev_password.
 */
export class UpdatePasswordDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
