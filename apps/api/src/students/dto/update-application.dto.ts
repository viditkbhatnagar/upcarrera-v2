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
 * Body for PATCH /applications/:id — generic bio/contact update.
 * Every field optional, mirroring the permissive legacy update. (Standalone, not
 * PartialType, since @nestjs/mapped-types is not a dependency in this project.)
 */
export class UpdateApplicationDto {
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
