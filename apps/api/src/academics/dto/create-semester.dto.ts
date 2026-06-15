import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/** Port of the legacy semester form. All fields optional; types enforced. */
export class CreateSemesterDto {
  @IsOptional()
  @IsInt()
  university_id?: number;

  @IsOptional()
  @IsInt()
  course_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsInt()
  semester_fee?: number;
}
