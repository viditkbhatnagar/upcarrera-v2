import {
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { IsIndianMobile } from '../../students/indian-mobile';

/**
 * PATCH /applications/:id/corrections — typo fixes to form fields, from a
 * whitelist. The programme fields (university/course/specialisation/session) are
 * deliberately absent: the global whitelist ValidationPipe strips anything not
 * listed here, so a correction can never silently re-point the programme — that
 * goes through the change-request flow. Every changed field is audited.
 */
export class CorrectApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsIndianMobile()
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  second_phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsapp_no?: string;

  @IsOptional()
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  abc_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  source?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

/** The exact columns a correction may touch (used by the audit diff). */
export const CORRECTABLE_FIELDS = [
  'name',
  'email',
  'phone',
  'second_phone',
  'whatsapp_no',
  'dob',
  'gender',
  'state',
  'district',
  'address',
  'abc_id',
  'source',
  'remarks',
] as const;
