import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CANONICAL_COURSE_LEVELS } from './document-requirement.constants';

/** GET /document-requirements — pagination plus an optional canonical-level filter. */
export class DocumentRequirementQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsIn(CANONICAL_COURSE_LEVELS, {
    message: `course_level must be one of: ${CANONICAL_COURSE_LEVELS.join(', ')}`,
  })
  course_level?: string;
}
