import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendOtpDto {
  // users.phone is VarChar(30).
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;
}
