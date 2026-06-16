import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Port of Consultant_target::add. A target binds a consultant to a goal `value`
 * over a [from_date, to_date] window for a given `type` (1 = points, 2 = count).
 * The service enforces the legacy date-range conflict guard before inserting.
 */
export class CreateTargetDto {
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  consultant_id!: number;

  // 1 = points-based (sum of specialisation points), 2 = admission-count.
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  type!: number;

  // YYYY-MM-DD — coerced to a Date for the @db.Date columns.
  @IsString()
  @IsNotEmpty()
  from_date!: string;

  @IsString()
  @IsNotEmpty()
  to_date!: string;

  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  value!: number;
}

/** Port of Consultant_target::edit — all fields optional partial update. */
export class UpdateTargetDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  type?: number;

  @IsOptional()
  @IsString()
  from_date?: string;

  @IsOptional()
  @IsString()
  to_date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  value?: number;
}
