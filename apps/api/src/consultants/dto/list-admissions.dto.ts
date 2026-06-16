import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Query params for GET /consultants/admissions — port of Consultant::admissions
 * (search across user name/phone/email, plus the student_status + university_id
 * filters). `student_status` maps to students.admission_status in the new schema
 * (the legacy students.student_status column does not exist here).
 */
export class ListAdmissionsDto {
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
  student_status?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  university_id?: number;
}
