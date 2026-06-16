import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Port of Consultant::edit. Every field is optional (the legacy edit was a
 * partial update); only supplied fields are copied through. `password`, when
 * present and non-empty, is re-hashed (mirrors the legacy edit_password flow).
 */
export class UpdateConsultantDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  code?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  gender?: string;

  @IsOptional()
  @IsString()
  dob?: string;

  @IsOptional()
  @IsString()
  doj?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  country_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  languages_spoken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  highest_qualification?: string;

  @IsOptional()
  @IsString()
  profile_picture?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  assigned_universities?: number[];
}
