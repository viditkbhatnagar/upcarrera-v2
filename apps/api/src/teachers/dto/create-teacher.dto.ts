import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Port of CI4 App\Controllers\App\Teachers::add().
 * A teacher is a `users` row with role_id=3. The legacy app validated nothing,
 * so most fields are optional — but name/username/password are required to create a usable login.
 */
export class CreateTeacherDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsString()
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  password!: string;

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
  @MaxLength(50)
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  highest_qualification?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  languages_spoken?: string;

  @IsOptional()
  @IsString()
  profile_picture?: string;

  @IsOptional()
  @IsString()
  @MaxLength(260)
  zoom_id?: string;

  @IsOptional()
  @IsString()
  zoom_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(260)
  zoom_password?: string;

  @IsOptional()
  @IsString()
  meeting_link?: string;

  @IsOptional()
  @IsInt()
  status?: number;
}
