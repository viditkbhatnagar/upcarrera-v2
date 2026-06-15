import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Every field optional on edit — mirrors the legacy free-form edit form.
 * Declared standalone (no PartialType) to avoid an extra @nestjs/mapped-types
 * dependency; field set mirrors CreateLeadDto.
 */
export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  gender?: string;

  @IsOptional()
  @IsInt()
  age?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  whatsapp_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  whatsapp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  qualification?: string;

  @IsOptional()
  @IsInt()
  country_id?: number;

  @IsOptional()
  @IsInt()
  interest_status?: number;

  @IsOptional()
  @IsInt()
  lead_status_id?: number;

  @IsOptional()
  @IsInt()
  candidate_status_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  remarks?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lead_source_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsInt()
  telecaller_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  class?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  syllabus?: string;

  @IsOptional()
  @IsInt()
  university_id?: number;

  @IsOptional()
  @IsInt()
  institution_id?: number;

  @IsOptional()
  @IsInt()
  course_id?: number;

  @IsOptional()
  @IsString()
  subject_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  place?: string;
}
