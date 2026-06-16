import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for PATCH /students/:id/credentials.
 * Ports App/Students::ajax_edit_password — updates the student's `users` row with
 * a new username plus a bcrypt-hashed password. Username uniqueness (excluding the
 * row itself) is enforced in the service, mirroring the legacy duplicate check.
 */
export class UpdateCredentialsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  username!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  password?: string;
}
