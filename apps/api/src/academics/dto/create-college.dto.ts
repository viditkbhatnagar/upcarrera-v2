import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Port of the legacy College form. The legacy controller only wrote `title`
 * (plus created_by/at). title is VarChar(160) and nullable in the schema.
 */
export class CreateCollegeDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;
}
