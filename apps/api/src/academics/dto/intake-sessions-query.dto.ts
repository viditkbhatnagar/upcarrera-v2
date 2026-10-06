import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { ListQueryDto } from './list-query.dto';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /intakes/sessions — the intake master (legacy `sessions` table) with
 * live roll-ups. Every filter is optional and narrows the STUDENT counts; the
 * intake rows themselves are only narrowed by `search`.
 */
export class IntakeSessionsQueryDto extends ListQueryDto {
  /** Substring match on sessions.session_title. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(260)
  search?: string;

  /** Count only students/applications whose course belongs to this university. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  university_id?: number;

  /** Count only students/applications on this course. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  course_id?: number;

  /** Inclusive lower bound on students.enrollment_date (YYYY-MM-DD). */
  @IsOptional()
  @Matches(ISO_DAY, { message: 'from must be a date in YYYY-MM-DD form' })
  from?: string;

  /** Inclusive upper bound on students.enrollment_date (YYYY-MM-DD). */
  @IsOptional()
  @Matches(ISO_DAY, { message: 'to must be a date in YYYY-MM-DD form' })
  to?: string;
}
