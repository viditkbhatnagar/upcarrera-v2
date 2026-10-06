import { ArrayNotEmpty, IsArray, IsIn, IsInt, Min } from 'class-validator';
import { CANONICAL_COURSE_LEVELS } from './document-requirement.constants';

/**
 * PATCH /document-requirements/reorder — atomically renumber one canonical level's
 * checklist. `ids` is the FULL ordered list of the level's live requirement ids; the
 * service renumbers them 1..n in a single transaction. This exists because the old
 * client-side "swap two rows' sort_order" was a no-op whenever the two rows' values
 * tied (every freshly created row defaults to 0) and the two PATCHes were not atomic.
 */
export class ReorderDocumentRequirementsDto {
  @IsIn(CANONICAL_COURSE_LEVELS, {
    message: `course_level must be one of: ${CANONICAL_COURSE_LEVELS.join(', ')}`,
  })
  course_level!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids!: number[];
}
