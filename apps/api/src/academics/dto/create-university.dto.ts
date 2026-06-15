import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Port of the legacy university form. All fields optional (legacy did no
 * validation); only types and column lengths are enforced.
 *
 * NOTE: `country_id` is a free-form Text column in the legacy schema (it can
 * hold a comma-separated list of ids), so it is typed as a string, not an int.
 */
export class CreateUniversityDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  // Legacy column is a Text blob (may hold multiple ids), not an FK int.
  @IsOptional()
  @IsString()
  country_id?: string;

  @IsOptional()
  @IsString()
  accreditation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  category?: string;

  @IsOptional()
  @IsInt()
  year_established?: number;

  @IsOptional()
  @IsString()
  affiliations?: string;

  @IsOptional()
  @IsString()
  ranking?: string;

  @IsOptional()
  @IsString()
  intakes?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  photo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1)
  status?: string;
}
