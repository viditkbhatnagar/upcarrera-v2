import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * One qualification row in a bulk update. The `qualification` label (e.g. "10th",
 * "12th", "Degree") identifies which of the student's existing rows to update, in
 * line with the legacy `WHERE student_id = ? AND qualification = ?` match.
 */
export class QualificationRowDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  qualification!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  board?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  percentage?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  certificate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  marksheet?: string;
}

/**
 * Body for PATCH /students/:id/qualifications and PATCH /applications/:id/qualifications.
 * Ports App/Academic::edit_qualification / App/Application::edit_qualification — each
 * row is matched by its `qualification` label and updated in place.
 */
export class UpdateQualificationsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => QualificationRowDto)
  qualifications!: QualificationRowDto[];
}
