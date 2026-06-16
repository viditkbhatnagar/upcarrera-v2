import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Body for POST /api/zoom/users. Ports the App\Controllers\App\Zoom_users::add
 * form (first_name / last_name / email) into a validated DTO.
 */
export class InviteZoomUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @IsEmail()
  @IsNotEmpty()
  @MaxLength(150)
  email!: string;
}
