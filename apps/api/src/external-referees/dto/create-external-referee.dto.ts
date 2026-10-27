import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength, Validate } from 'class-validator';
import { MinPhoneDigits } from '../referee-validation';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Body for POST /external-referees. Mirrors the web validateReferee(). */
export class CreateExternalRefereeDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(255)
  name!: string;

  @Transform(trim)
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  email!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'phone is required' })
  @MaxLength(30)
  @Validate(MinPhoneDigits)
  phone!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'state is required' })
  @MaxLength(100)
  state!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'district is required' })
  @MaxLength(100)
  district!: string;
}
