import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VerifyOtpDto {
  // users.phone is VarChar(30).
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;

  // users.otp is VarChar(10).
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  otp!: string;
}
