import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for PATCH /applications/:id/academic.
 * Ports App/Application::academic — updates the academic/admission fields on the
 * application. The legacy controller force-sets admission_status = 0 (false) on this
 * step; the service now does so only when the university or course actually
 * changes, so an edit of the counsellor, source or intake leaves it alone.
 *
 * The reference ids accept null (@IsOptional passes null through) so an edit can
 * CLEAR a course/specialisation that no longer fits the chosen university —
 * dropping the key would leave the old one on the row.
 */
export class ApplicationAcademicDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  university_id?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  course_id?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  specialisation_id?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  session_id?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  adm_pipeline?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pipeline_user?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  source?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  custom_application_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  abc_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  enrollment_id?: string;
}
