import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Create payload for /countries.
 *
 * ADAPTED: the legacy Country controller wrote `title` + `short_description`,
 * but those columns do NOT exist on the `countries` table that Country_model
 * actually maps to. The real `countries` schema columns are `country` (name),
 * `short_code`, and `phonecode` (PK is country_id). We faithfully target the
 * real columns. `country` and `phonecode` are NOT NULL in the schema.
 */
export class CreateCountryDto {
  @IsString()
  @MaxLength(80)
  country!: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  short_code?: string;

  @Type(() => Number)
  @IsInt()
  phonecode!: number;
}
