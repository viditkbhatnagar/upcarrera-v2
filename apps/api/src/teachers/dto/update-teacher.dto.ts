import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Port of CI4 App\Controllers\App\Teachers::edit().
 * Every field is optional on update; password is re-hashed only when supplied.
 */
export class UpdateTeacherDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  password?: string;

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
