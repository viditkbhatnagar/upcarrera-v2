import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for PATCH /applications/:id/academic.
 * Ports App/Application::academic — updates the academic/admission fields on the
 * application. The legacy controller force-sets admission_status = 0 (false) on this
 * step; that behaviour is preserved in the service.
 */
export class ApplicationAcademicDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  university_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  course_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  specialisation_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  session_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  adm_pipeline?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pipeline_user?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  source?: string;

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
