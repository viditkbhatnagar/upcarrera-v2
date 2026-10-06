import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** POST /applications/:id/accept — optional optimistic-concurrency hint. */
export class AcceptApplicationDto {
  @IsOptional()
  @IsString()
  expected_stage?: string;
}

/** POST /applications/:id/reopen — the reason the student sees on the re-opened form. */
export class ReopenApplicationDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

/** POST /applications/:id/hold — reason + a follow-up date (>= today, checked in the service). */
export class HoldApplicationDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsDateString()
  followup_date!: string;
}

/** POST /applications/:id/resume — an optional note. */
export class ResumeApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** POST /applications/:id/documents/:documentId/review — SA per-document verdict. */
export class ReviewDocumentDto {
  @IsIn(['verified', 'rejected'])
  status!: 'verified' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** POST /applications/:id/sa-review — the four checks + the decision. */
export class SaReviewDto {
  @IsOptional()
  @IsBoolean()
  identity_ok?: boolean;

  @IsOptional()
  @IsBoolean()
  eligibility_ok?: boolean;

  @IsOptional()
  @IsBoolean()
  legible_ok?: boolean;

  @IsOptional()
  @IsBoolean()
  program_ok?: boolean;

  @IsIn(['approve', 'send_back', 'reject'])
  decision!: 'approve' | 'send_back' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
