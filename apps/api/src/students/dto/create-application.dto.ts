import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Body for POST /applications. Ports App/Application::add (the bio/contact step).
 * The service additionally seeds 3 default qualification rows (10th/12th/Degree),
 * mirroring the legacy controller. Every field is optional — the legacy app ran no
 * validation. Date fields are ISO strings, coerced to Date in the service.
 */
export class CreateApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  code?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
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
