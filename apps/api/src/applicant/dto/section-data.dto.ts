import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/* ---- enum vocabularies (migration 002 comments; stored lower-case) ---- */
export const CATEGORIES = ['general', 'obc', 'sc', 'st', 'ews', 'other'] as const;
export const MARITAL_STATUSES = ['single', 'married', 'other'] as const;
export const QUALIFICATION_LEVELS = ['10th', '12th', 'diploma', 'ug', 'pg', 'doctorate'] as const;
export const SCORE_TYPES = ['percentage', 'cgpa', 'grade'] as const;
export const EMPLOYMENT_STATUSES = ['employed', 'self_employed', 'unemployed'] as const;

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Personal section. Fields split between `applications` (dob, gender, nationality,
 * abc_id) and `application_form` (the rest). phone is NEVER here (read-only).
 * Every field is optional so a DRAFT (complete=false) validates only types/format;
 * the service enforces required-presence when complete=true.
 */
export class PersonalDataDto {
  @IsOptional() @IsString() @MaxLength(100)
  name_on_certificate?: string;

  @IsOptional() @IsString() @MaxLength(160)
  father_guardian_name?: string;

  @IsOptional() @IsString() @MaxLength(160)
  mother_name?: string;

  @IsOptional() @IsIn(CATEGORIES)
  category?: string;

  @IsOptional() @IsIn(MARITAL_STATUSES)
  marital_status?: string;

  // last 4 digits ONLY — a full Aadhaar number is never accepted.
  @IsOptional() @Matches(/^\d{4}$/, { message: 'aadhaar_last4 must be exactly 4 digits' })
  aadhaar_last4?: string;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dob must be YYYY-MM-DD' })
  dob?: string;

  @IsOptional() @IsString() @MaxLength(10)
  gender?: string;

  @IsOptional() @IsInt() @Min(1)
  nationality?: number;

  @IsOptional() @IsString() @MaxLength(100)
  abc_id?: string;
}

/**
 * Contact section. second_phone/whatsapp_no/address/state/district ->
 * `applications`; pin_code -> `application_form`.
 *
 * SECURITY MEDIUM 4: `email` is READ-ONLY here, exactly like the mobile number —
 * the counsellor owns it at Add Lead. It is deliberately NOT a field on this DTO,
 * so the strict public/staff validator (forbidNonWhitelisted) REJECTS any `email`
 * sent in a section save and the public form can never repoint the application's
 * system mail (reopen/resend links, approval, fee, payment, the submitted PDF).
 */
export class ContactDataDto {
  @IsOptional() @Matches(/^\d{6,15}$/, { message: 'second_phone must be 6-15 digits' })
  second_phone?: string;

  @IsOptional() @Matches(/^\d{6,15}$/, { message: 'whatsapp_no must be 6-15 digits' })
  whatsapp_no?: string;

  @IsOptional() @IsString() @MaxLength(500)
  address?: string;

  @IsOptional() @IsString() @MaxLength(100)
  state?: string;

  @IsOptional() @IsString() @MaxLength(100)
  district?: string;

  @IsOptional() @Matches(/^[1-9]\d{5}$/, { message: 'pin_code must be a 6-digit Indian PIN code' })
  pin_code?: string;
}

/** One education record -> a `qualification` row (student_id stays 0 pre-conversion). */
export class QualificationRecordDto {
  @IsOptional() @IsInt() @Min(1)
  id?: number; // existing qualification_id to update

  @IsIn(QUALIFICATION_LEVELS)
  level_code!: string;

  @IsOptional() @IsString() @MaxLength(50)
  label?: string; // legacy `qualification` free-text label

  @IsOptional() @IsString() @MaxLength(160)
  institution?: string;

  @IsOptional() @IsString() @MaxLength(100)
  board?: string;

  @IsOptional() @IsInt() @Min(1950) @Max(CURRENT_YEAR)
  passing_year?: number;

  @IsIn(SCORE_TYPES)
  score_type!: string;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999.99)
  score_value!: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(100)
  score_scale?: number;
}

/** Education section: the highest level + repeatable qualification records. */
export class EducationDataDto {
  @IsOptional() @IsIn(QUALIFICATION_LEVELS)
  highest_qualification?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => QualificationRecordDto)
  records?: QualificationRecordDto[];
}

/** One prior-employment row for employment_history (JSON array). */
export class EmploymentHistoryItemDto {
  @IsOptional() @IsString() @MaxLength(160)
  employer?: string;

  @IsOptional() @IsString() @MaxLength(120)
  designation?: string;

  @IsOptional() @IsString() @MaxLength(20)
  from?: string;

  @IsOptional() @IsString() @MaxLength(20)
  to?: string;
}

/** Employment section (only when the course requires it). */
export class EmploymentDataDto {
  @IsOptional() @IsIn(EMPLOYMENT_STATUSES)
  employment_status?: string;

  @IsOptional() @IsInt() @Min(0) @Max(900)
  total_experience_months?: number;

  @IsOptional() @IsString() @MaxLength(160)
  current_employer?: string;

  @IsOptional() @IsString() @MaxLength(120)
  current_designation?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => EmploymentHistoryItemDto)
  employment_history?: EmploymentHistoryItemDto[];
}
