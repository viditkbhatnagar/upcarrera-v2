import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { IsIndianMobile } from '../indian-mobile';

/**
 * Body for PATCH /applications/:id — generic bio/contact update.
 * Every field optional, mirroring the permissive legacy update. (Standalone, not
 * PartialType, since @nestjs/mapped-types is not a dependency in this project.)
 */
export class UpdateApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  /** Validated like the create path (QA AP10). */
  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  code?: number;

  /** Validated like the create path (QA AP10): a 10-digit Indian mobile. */
  @IsOptional()
  @IsIndianMobile()
  phone?: string;

  @IsOptional()
  @IsDateString()
  enrollment_date?: string;

  @IsOptional()
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  gender?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  nationality?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  second_code?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  second_phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsapp_no?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  country_id?: number;

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
  @IsBoolean()
  status?: boolean;
}
