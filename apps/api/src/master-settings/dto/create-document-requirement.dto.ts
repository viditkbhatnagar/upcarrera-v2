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
 * Create a document-checklist requirement for one CANONICAL course level.
 * `course_level` MUST be a canonical value (the SA gate + public checklist resolve
 * by it); `document_type_id` is validated against the document_type master in the
 * service. Uniqueness is (course_level, document_type_id) — the DB key — so a
 * second row for the same pair returns 409.
 */
export class CreateDocumentRequirementDto {
  @IsIn(CANONICAL_COURSE_LEVELS, {
    message: `course_level must be one of: ${CANONICAL_COURSE_LEVELS.join(', ')}`,
  })
  course_level!: string;

  @IsInt()
  @Min(1)
  document_type_id!: number;

  @IsOptional()
  @IsBoolean()
  is_required?: boolean;

  /** NULL/'always' = always applies; 'employment' = only when the course needs it. */
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
