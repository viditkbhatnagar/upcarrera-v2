import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MIN_CGPA_CEILING,
  MIN_CGPA_FLOOR,
  MIN_EXPERIENCE_MONTHS_CEILING,
  MIN_PERCENTAGE_CEILING,
  MIN_PERCENTAGE_FLOOR,
  MIN_QUALIFICATION_LEVELS,
} from './admission-rule.constants';

/**
 * Create the machine-checkable eligibility rule for a course (1:1 with course.id).
 * `course_id` is validated against the course master in the service; a second live
 * rule for the same course returns 409. min_percentage and min_cgpa are compared
 * against the applicant's highest qualification by score type — a course may set
 * either, both, or neither.
 */
export class CreateAdmissionRuleDto {
  @IsInt()
  @Min(1)
  course_id!: number;

  @IsOptional()
  @IsIn(MIN_QUALIFICATION_LEVELS, {
    message: `min_qualification must be one of: ${MIN_QUALIFICATION_LEVELS.join(', ')}`,
  })
  min_qualification?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(MIN_PERCENTAGE_FLOOR)
  @Max(MIN_PERCENTAGE_CEILING)
  min_percentage?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(MIN_CGPA_FLOOR)
  @Max(MIN_CGPA_CEILING)
  min_cgpa?: number;

  @IsOptional()
  @IsBoolean()
  requires_employment?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MIN_EXPERIENCE_MONTHS_CEILING)
  min_experience_months?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
