import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Port of Leads_model::$allowedFields. The legacy app performed no validation,
 * so almost every field is optional; we only enforce types and column lengths.
 */
export class CreateLeadDto {
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

  // Legacy column is a VARCHAR(100), not an FK int.
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
