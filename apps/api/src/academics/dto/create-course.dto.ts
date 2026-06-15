import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Port of the legacy course form. The legacy app validated nothing, so all
 * fields are optional; we only enforce types and column lengths.
 *
 * NOTE: `specialisations` and `subjects` are free-form Text columns that the
 * legacy UI stored as JSON/text blobs — they are passed through as-is.
 */
export class CreateCourseDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  short_name?: string;

  @IsOptional()
  @IsString()
  photo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  stream?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  level?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  duration?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  total_duration?: string;

  // Free-form JSON/text blob — passed through unchanged.
  @IsOptional()
  @IsString()
  specialisations?: string;

  @IsOptional()
  @IsString()
  eligibility_criteria?: string;

  // Free-form JSON/text blob — passed through unchanged.
  @IsOptional()
  @IsString()
  subjects?: string;

  @IsOptional()
  @IsString()
  assessment_methods?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  payment_mode?: string;

  @IsOptional()
  @IsBoolean()
  emi_facility?: boolean;

  @IsOptional()
  @IsString()
  point?: string;

  @IsOptional()
  @IsInt()
  total_amount?: number;

  @IsOptional()
  @IsString()
  fee_structure?: string;

  @IsOptional()
  @IsString()
  @MaxLength(25)
  study_mode?: string;

  @IsOptional()
  @IsInt()
  is_lms_course?: number;

  @IsOptional()
  @IsInt()
  university_id?: number;

  @IsOptional()
  @IsInt()
  status?: number;
}
