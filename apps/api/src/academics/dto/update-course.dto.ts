import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { CreateCourseDto, DURATION_MAGNITUDE, trimString } from './create-course.dto';

/** Validate a field whenever it is SENT — `null` included; skip only when omitted. */
const whenSent = ValidateIf((_obj: unknown, value: unknown) => value !== undefined);

/**
 * Every field optional on edit, so the CREATE-time requirements (level /
 * specialisations / duration / total_duration) do NOT apply to a field that is
 * omitted — legacy rows that lack them remain editable.
 *
 * Those four are re-declared here rather than inherited through PartialType:
 * PartialType's @IsOptional also lets `null` through, which would blank the
 * column (or 500 on the NOT NULL `total_duration`). A field that IS sent —
 * `null` included — must be non-blank, and total_duration a positive number.
 */
export class UpdateCourseDto extends PartialType(
  OmitType(CreateCourseDto, [
    'level',
    'duration',
    'total_duration',
    'specialisations',
  ] as const),
) {
  @whenSent
  @Transform(trimString)
  @MaxLength(255)
  @IsNotEmpty({ message: 'Course level is required' })
  @IsString({ message: 'Course level is required' })
  level?: string;

  @whenSent
  @Transform(trimString)
  @MaxLength(50)
  @IsNotEmpty({ message: 'Duration unit is required' })
  @IsString({ message: 'Duration unit is required' })
  duration?: string;

  @whenSent
  @Transform(trimString)
  @MaxLength(255)
  @Matches(DURATION_MAGNITUDE, {
    message: 'Duration must be a positive number, e.g. 2',
  })
  @IsString({ message: 'Duration must be a positive number, e.g. 2' })
  total_duration?: string;

  @whenSent
  @Transform(trimString)
  @IsNotEmpty({ message: 'Specialisation is required (use "General" if none)' })
  @IsString({ message: 'Specialisation is required (use "General" if none)' })
  specialisations?: string;
}
