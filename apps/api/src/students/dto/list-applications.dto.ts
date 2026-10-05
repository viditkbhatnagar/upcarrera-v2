import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * The pipeline stage labels the Applications screen renders, in display order.
 * Only "New Lead", "Enrolled" and "Rejected" are derivable from an application
 * row today (is_converted / is_archived / status); the other four have no column
 * behind them until the Phase 1 stage engine lands, so filtering on them returns
 * an empty set rather than a guess.
 */
export const APPLICATION_STAGES = [
  'New Lead',
  'Registration Fee Pending',
  'Registration Fee Paid',
  'Form Pending',
  'Admin Verification Pending',
  'Enrolled',
  'Rejected',
] as const;

export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

/**
 * Query params for GET /applications — pagination, free-text search and the
 * list screen's dropdown filters.
 *
 * `search` matches the fields a counsellor actually types into the list filters:
 * the applicant's name, email or phone, and the printed application id. Without
 * it the screen could only filter the ten rows already on the page, so searching
 * for an application on page 2 from page 1 returned nothing (QA AP07).
 *
 * The id filters (QA AP05) replace dropdowns that compared prototype strings
 * against the current page. They all compose with `search` and with each other
 * (AND), and the response's stage `counts` honour every filter except `stage`
 * itself, so the pipeline cards still show the whole funnel for the filtered set.
 *   - university_id  the university the list DISPLAYS: the course's university,
 *                    falling back to applications.university_id when the course
 *                    has none
 *   - course_id      applications.course_id
 *   - session_id     the intake (applications.session_id -> sessions)
 *   - consultant_id  the counsellor the list DISPLAYS: pipeline_user, falling
 *                    back to created_by when no counsellor is assigned
 *   - stage          one of APPLICATION_STAGES
 *
 * @Type coerces query strings under the global transform ValidationPipe; we do
 * NOT use per-param ParseIntPipe because it conflicts with that pipe.
 */
export class ListApplicationsDto {
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
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  university_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  course_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  session_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  consultant_id?: number;

  @IsOptional()
  @IsIn(APPLICATION_STAGES)
  stage?: ApplicationStage;
}
