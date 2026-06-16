import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Port of Clients::edit. Every field is optional (the legacy edit was a partial
 * update); only supplied fields are copied through. `password`, when present and
 * non-empty, is re-hashed (mirrors the legacy reset_password flow).
 */
export class UpdateClientDto {
  // --- users fields ---------------------------------------------------------

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
  @Type(() => Number)
  @IsInt()
  country_id?: number;

  @IsOptional()
  @IsString()
  profile_picture?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  partnership_status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;

  // --- clients profile fields ----------------------------------------------

  @IsOptional()
  @IsString()
  @MaxLength(100)
  business_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  consultant_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  business_category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  languages?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  whatsapp?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  commission_model?: string;

  @IsOptional()
  @IsString()
  agreement?: string;

  @IsOptional()
  @IsString()
  start_date?: string;

  @IsOptional()
  @IsString()
  end_date?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  university?: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  course?: number[];
}
