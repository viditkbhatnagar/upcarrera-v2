import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Port of the legacy specialisations form. Types enforced.
 *
 * `title` is REQUIRED on create (trimmed, non-blank): a specialisation with no
 * name cannot be picked or de-duplicated. The service rejects a title that
 * already exists for the same `course_id` (NULL = the shared master list),
 * compared case-insensitively and whitespace-normalised, with 409.
 *
 * UpdateSpecialisationDto is a PartialType, so `title` stays optional on edit.
 */
export class CreateSpecialisationDto {
  @IsOptional()
  @IsInt()
  course_id?: number;

  // Required checks sit closest to the property so they are reported first.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(160)
  @IsNotEmpty({ message: 'Specialisation name is required' })
  @IsString({ message: 'Specialisation name is required' })
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  point?: string;

  @IsOptional()
  @IsString()
  fee_structure?: string;

  @IsOptional()
  @IsInt()
  total_amount?: number;
}
