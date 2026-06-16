import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

/** Admission intake / cycle (e.g. "Spring 2026"). All fields optional. */
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
  year?: number;

  /** ISO date strings; the service coerces them to Date. */
  @IsOptional()
  @IsString()
  start_date?: string;

  @IsOptional()
  @IsString()
  closing_date?: string;

  /** Open | Closed | Inactive */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;
}
