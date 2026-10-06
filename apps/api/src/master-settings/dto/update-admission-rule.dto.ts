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
 * Patch a course admission rule. Every field is optional; course_id is NOT
 * patchable here (the rule is 1:1 with its course — delete and recreate to move
 * it). min_qualification/min_percentage/min_cgpa accept null to clear a minimum.
 */
export class UpdateAdmissionRuleDto {
  @IsOptional()
  @IsIn([...MIN_QUALIFICATION_LEVELS], {
    message: `min_qualification must be one of: ${MIN_QUALIFICATION_LEVELS.join(', ')}`,
  })
  min_qualification?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(MIN_PERCENTAGE_FLOOR)
  @Max(MIN_PERCENTAGE_CEILING)
  min_percentage?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(MIN_CGPA_FLOOR)
  @Max(MIN_CGPA_CEILING)
  min_cgpa?: number | null;

  @IsOptional()
  @IsBoolean()
  requires_employment?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MIN_EXPERIENCE_MONTHS_CEILING)
  min_experience_months?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}
