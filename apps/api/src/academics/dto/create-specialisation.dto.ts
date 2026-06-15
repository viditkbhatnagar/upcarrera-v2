import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/** Port of the legacy specialisations form. All fields optional; types enforced. */
export class CreateSpecialisationDto {
  @IsOptional()
  @IsInt()
  course_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  point?: string;

  @IsOptional()
  @IsString()
  fee_structure?: string;

  @IsOptional()
  @IsInt()
  total_amount?: number;
}
