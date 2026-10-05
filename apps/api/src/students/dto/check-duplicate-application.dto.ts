import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * Query params for GET /applications/check-duplicate (QA AP10, spec 4.2).
 *
 * Either or both of `phone` / `email` may be given; a blank or absent value is
 * simply not checked. `phone` is compared on its canonical 10-digit form, so
 * "+91 98765 43210" finds a row stored as "9876543210". `exclude_id` drops one
 * application from the result — the edit dialog passes the row being edited so
 * an unchanged phone does not report the application as its own duplicate.
 */
export class CheckDuplicateApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  exclude_id?: number;
}
