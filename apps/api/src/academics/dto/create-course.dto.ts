import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/** Trim string input so "  PG " and "PG" are the same value on write. */
export const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * A duration MAGNITUDE: a positive whole or decimal number ("2", "1.5").
 * `total_duration` holds the magnitude and `duration` holds the unit
 * ("Year" / "Semester" / "Month") — the legacy convention the LMS reads.
 */
export const DURATION_MAGNITUDE = /^(?=.*[1-9])\d+(?:\.\d+)?$/;

/**
 * Port of the legacy course form. The legacy app validated nothing, which is
 * how the catalog ended up with rows that have no level, no specialisation
 * and a duration unit with no number (QA CO03).
 *
 * CREATE therefore requires the three fields every course needs:
 *   - `level`            non-blank
 *   - `specialisations`  non-blank (send "General" when there is none)
 *   - `total_duration`   the magnitude, a positive number ("2")
 *   - `duration`         the unit ("Year", "Semester", "Month")
 *
 * UPDATE does NOT inherit the requirement: UpdateCourseDto is a PartialType,
 * so a legacy row that lacks these fields stays editable — only a value that
 * IS sent must be non-blank / well-formed.
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

  // Decorators run bottom-up and the error envelope shows the FIRST failure,
  // so the "required" checks sit closest to the property.
  @Transform(trimString)
  @MaxLength(255)
  @IsNotEmpty({ message: 'Course level is required' })
  @IsString({ message: 'Course level is required' })
  level!: string;

  // The UNIT ("Year" / "Semester" / "Month"). See the class comment.
  @Transform(trimString)
  @MaxLength(50)
  @IsNotEmpty({ message: 'Duration unit is required' })
  @IsString({ message: 'Duration unit is required' })
  duration!: string;

  // The MAGNITUDE ("2"). A @IsString column — '2' is a string, not a typo.
  @Transform(trimString)
  @MaxLength(255)
  @Matches(DURATION_MAGNITUDE, {
    message: 'Duration must be a positive number, e.g. 2',
  })
  @IsString({ message: 'Duration must be a positive number, e.g. 2' })
  total_duration!: string;

  // Free-form JSON/text blob — passed through unchanged (but trimmed). Send
  // "General" when the course has no specific specialisation.
  @Transform(trimString)
  @IsNotEmpty({ message: 'Specialisation is required (use "General" if none)' })
  @IsString({ message: 'Specialisation is required (use "General" if none)' })
  specialisations!: string;

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
