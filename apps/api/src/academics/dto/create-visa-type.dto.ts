import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Port of the legacy Visa_type form (only `title` is written). */
export class CreateVisaTypeDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;
}
