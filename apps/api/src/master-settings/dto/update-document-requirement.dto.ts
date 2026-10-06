import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  APPLIES_WHEN_VALUES,
  CANONICAL_COURSE_LEVELS,
  MAX_FILES_CEILING,
} from './document-requirement.constants';

/**
 * Patch a document-checklist requirement. Every field is optional; an omitted key
 * leaves the stored value untouched. Changing course_level/document_type_id
 * re-runs the (course_level, document_type_id) uniqueness check in the service.
 */
export class UpdateDocumentRequirementDto {
  @IsOptional()
  @IsIn(CANONICAL_COURSE_LEVELS, {
    message: `course_level must be one of: ${CANONICAL_COURSE_LEVELS.join(', ')}`,
  })
  course_level?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  document_type_id?: number;

  @IsOptional()
  @IsBoolean()
  is_required?: boolean;

  @IsOptional()
  @IsIn([...APPLIES_WHEN_VALUES, 'always', ''], {
    message: `applies_when must be 'employment' or 'always'`,
  })
  applies_when?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_FILES_CEILING)
  max_files?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  help_text?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;
}
