import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

const MAX_INT = 2147483647; // keep ids within MySQL INT so Prisma never throws a 500

/**
 * Public self-serve application submission (online admission funnel). Every value
 * arrives as a multipart/form-data string, so numeric ids are coerced with
 * @Type(() => Number). Validation here is UX-grade; the service re-checks the
 * (university, course, intake) offering against live data and never trusts the
 * client. Unknown multipart keys are stripped by the global whitelist pipe, and
 * the service only ever writes server-controlled values (source, stage, numbering,
 * ownership) — a client cannot set those.
 *
 * PRIVACY: the full Aadhaar number is accepted here only to derive the last 4
 * digits; the service stores last-4 ONLY (never the full number), matching the
 * magic-link form's design.
 */
export class PublicApplicationDto {
  // ---- program (validated against live offerings in the service) ----
  @Type(() => Number) @IsInt() @Min(1) @Max(MAX_INT)
  university_id!: number;

  @Type(() => Number) @IsInt() @Min(1) @Max(MAX_INT)
  course_id!: number;

  @Type(() => Number) @IsInt() @Min(1) @Max(MAX_INT)
  intake_id!: number;

  // ---- identity ----
  @IsString() @IsNotEmpty() @MaxLength(100)
  @Matches(/^[A-Za-z][A-Za-z .'-]{1,99}$/, { message: 'Enter a valid full name' })
  full_name!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date_of_birth must be YYYY-MM-DD' })
  date_of_birth!: string;

  @IsString() @MaxLength(10)
  gender!: string;

  @IsOptional() @IsString() @MaxLength(50)
  nationality?: string;

  @IsOptional() @IsString() @MaxLength(20)
  marital_status?: string;

  // Full Aadhaar (optional) — service keeps the last 4 digits only.
  @IsOptional() @Matches(/^(\d[\s]?){12}$/, { message: 'Enter a valid 12-digit Aadhaar number' })
  aadhaar_number?: string;

  @IsOptional() @IsString() @MaxLength(20)
  passport_number?: string;

  @IsString() @IsNotEmpty() @MaxLength(160)
  father_name!: string;

  @IsOptional() @IsString() @MaxLength(160)
  mother_name?: string;

  @IsOptional() @IsString() @MaxLength(160)
  guardian_name?: string;

  // ---- contact (E.164 like +919876543210) ----
  @Matches(/^\+?\d{8,15}$/, { message: 'Enter a valid phone number' })
  phone!: string;

  @IsOptional() @Matches(/^\+?\d{8,15}$/, { message: 'Enter a valid phone number' })
  alt_phone?: string;

  @Matches(/^\+?\d{8,15}$/, { message: 'Enter a valid WhatsApp number' })
  whatsapp!: string;

  @IsEmail({}, { message: 'Enter a valid email address' }) @MaxLength(120)
  email!: string;

  @IsOptional() @IsString() @MaxLength(60)
  country?: string;

  @IsOptional() @IsString() @MaxLength(100)
  state?: string;

  @IsOptional() @IsString() @MaxLength(60)
  district?: string;

  @IsOptional() @IsString() @MaxLength(500)
  permanent_address?: string;

  @IsOptional() @IsString() @MaxLength(500)
  correspondence_address?: string;

  // ---- education / work ----
  @IsOptional() @IsString() @MaxLength(60)
  highest_qualification?: string;

  @IsOptional() @IsString() @MaxLength(150)
  school_college?: string;

  @IsOptional() @IsString() @MaxLength(10)
  year_of_passing?: string;

  @IsOptional() @IsString() @MaxLength(10)
  percentage_grade?: string;

  @IsString() @IsNotEmpty() @MaxLength(60)
  employment_status!: string;

  @IsOptional() @IsString() @MaxLength(150)
  organisation_name?: string;

  @IsOptional() @IsString() @MaxLength(100)
  designation?: string;

  // ---- declarations ----
  @IsIn(['1', 'true', 'on', 'yes'], { message: 'You must agree to the Terms and Conditions' })
  agree_terms!: string;

  // ---- anti-abuse honeypot: must stay empty (hidden field) ----
  @IsOptional() @IsString() @MaxLength(200)
  company_website?: string;
}
