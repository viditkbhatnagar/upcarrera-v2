import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

/**
 * consultant_target.type codes — the only two the legacy schema encodes
 * (Consultant_target::index). There is no revenue target type.
 *   1 = points: SUM(specialisations.point) over the counsellor's students
 *       enrolled inside [from_date, to_date].
 *   2 = admissions: COUNT of those students.
 */
export const TARGET_TYPES = [1, 2] as const;

/** consultant_target.value is a signed INT column. */
const MAX_TARGET_VALUE = 2_147_483_647;

/** Calendar date only; the service also rejects impossible days (2025-02-30). */
export const TARGET_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = '$property must be a date in YYYY-MM-DD format';

/**
 * Port of Consultant_target::add. A target binds a consultant to a goal `value`
 * over a [from_date, to_date] window for a given `type` (1 = points, 2 = count).
 * The service enforces the legacy date-range conflict guard before inserting.
 */
export class CreateTargetDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  consultant_id!: number;

  // 1 = points-based (sum of specialisation points), 2 = admission-count.
  @Type(() => Number)
  @IsInt()
  @IsIn(TARGET_TYPES, { message: 'type must be 1 (points) or 2 (admissions)' })
  @IsNotEmpty()
  type!: number;

  // YYYY-MM-DD — coerced to a Date for the @db.Date columns.
  @IsString()
  @IsNotEmpty()
  @Matches(TARGET_DATE_PATTERN, { message: DATE_MESSAGE })
  from_date!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(TARGET_DATE_PATTERN, { message: DATE_MESSAGE })
  to_date!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_TARGET_VALUE)
  @IsNotEmpty()
  value!: number;
}

/**
 * Port of Consultant_target::edit — all fields optional partial update. The
 * consultant is fixed once a target exists (reassigning would silently move
 * the achieved history to someone else); delete and re-assign instead.
 */
export class UpdateTargetDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(TARGET_TYPES, { message: 'type must be 1 (points) or 2 (admissions)' })
  type?: number;

  @IsOptional()
  @IsString()
  @Matches(TARGET_DATE_PATTERN, { message: DATE_MESSAGE })
  from_date?: string;

  @IsOptional()
  @IsString()
  @Matches(TARGET_DATE_PATTERN, { message: DATE_MESSAGE })
  to_date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_TARGET_VALUE)
  value?: number;
}
