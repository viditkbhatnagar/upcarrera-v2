import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** POST /applications/:id/magic-link — send or resend. */
export class IssueMagicLinkDto {
  @IsOptional() @IsBoolean()
  resend?: boolean;
}

/** POST /applications/:id/form/reopen — reason (10-500 chars) shown to the student. */
export class ReopenFormDto {
  @IsString()
  @MinLength(10, { message: 'Give the student a clear reason (at least 10 characters).' })
  @MaxLength(500)
  reason!: string;
}

/**
 * PATCH /applications/:id/form/:section — a staff typo correction. Same section
 * `data` as the public save (validated per-section in the service), with
 * row_version for optimistic concurrency.
 */
export class StaffSectionPatchDto {
  @IsObject()
  data!: Record<string, unknown>;

  @IsInt() @Min(0)
  row_version!: number;
}
