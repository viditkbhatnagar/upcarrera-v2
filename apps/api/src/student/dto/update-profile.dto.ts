import { Type } from 'class-transformer';
import { IsDateString, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for PATCH /student/profile.
 *
 * A student edits a small, self-owned slice spanning two tables:
 *  - users:    name, email, phone, profile_picture
 *  - students: dob
 *
 * Everything is optional (partial update). The global ValidationPipe runs with
 * whitelist:true, so unknown keys are stripped. Port of CI4 App/Profile::edit,
 * which only allowed name/email/phone/dob/image.
 */
export class UpdateStudentProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(50)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @Type(() => String)
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsString()
  profile_picture?: string;
}
