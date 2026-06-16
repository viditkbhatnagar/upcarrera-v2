import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Body for PATCH /applications/:id/course-fee.
 * Ports App/Application::edit_course_fee — updates the registration/course fee
 * fields on the application row. `fee_receipt` is a stored file path (upload itself
 * is out of scope here).
 */
export class ApplicationCourseFeeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  amount?: number;

  @IsOptional()
  @IsDateString()
  paid_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  payment_mode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  payment_to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fee_receipt?: string;
}
