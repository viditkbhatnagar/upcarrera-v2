import { IsInt, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

/** Port of the legacy subjects form. All fields optional; types enforced. */
export class CreateSubjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsNumber()
  session_amount?: number;

  @IsOptional()
  @IsInt()
  course_id?: number;
}
