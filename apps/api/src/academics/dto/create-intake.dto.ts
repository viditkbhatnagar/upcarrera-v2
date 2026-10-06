import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** Phase 1 rule: an intake year is a 4-digit year in this window. */
export const MIN_INTAKE_YEAR = 2020;
export const MAX_INTAKE_YEAR = 2035;

/**
 * Admission intake schedule (e.g. "Spring 2026"). All fields optional, but any
 * field that IS sent must be well-formed: the year sits in 2020–2035 and the
 * dates are YYYY-MM-DD. The service additionally checks the dates' years fall
 * in the same window and that the closing date is not before the start date.
 *
 * These rules mirror the Intakes screen. They exist server-side because a date
 * like 0025-08-30 is syntactically valid and, once stored, renders as a
 * plausible-looking wrong date everywhere downstream.
 */
export class CreateIntakeDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  month?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_INTAKE_YEAR, { message: `year must be between ${MIN_INTAKE_YEAR} and ${MAX_INTAKE_YEAR}` })
  @Max(MAX_INTAKE_YEAR, { message: `year must be between ${MIN_INTAKE_YEAR} and ${MAX_INTAKE_YEAR}` })
  year?: number;

  /** YYYY-MM-DD; the service coerces it to a Date. An empty string clears it. */
  @IsOptional()
  @IsString()
  @Matches(/^$|^\d{4}-\d{2}-\d{2}$/, { message: 'start_date must be a date in YYYY-MM-DD form' })
  start_date?: string;

  /** YYYY-MM-DD; the service coerces it to a Date. An empty string clears it. */
  @IsOptional()
  @IsString()
  @Matches(/^$|^\d{4}-\d{2}-\d{2}$/, { message: 'closing_date must be a date in YYYY-MM-DD form' })
  closing_date?: string;

  /** Open | Closed | Inactive */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;
}
