import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { IsIndianMobile } from '../indian-mobile';

/**
 * Body for POST /applications. Ports App/Application::add (the bio/contact step).
 * The service additionally seeds 3 default qualification rows (10th/12th/Degree),
 * mirroring the legacy controller. Date fields are ISO strings, coerced to Date
 * in the service.
 *
 * Every field stays optional, but the two that identify an applicant are now
 * validated when present (QA AP10): `phone` must be a 10-digit Indian mobile
 * (canonicalised to its bare 10 digits) and `email` must be an email address.
 * The legacy app validated neither, which is how "12" became a stored phone.
 *
 * The academic fields (university_id .. source) are the same ones
 * PATCH /applications/:id/academic takes. Accepting them here lets the Add Lead
 * dialog create a complete application in ONE atomic call, instead of a create
 * followed by a second request that could fail and leave a half-filled row.
 */
export class CreateApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  code?: number;

  @IsOptional()
  @IsIndianMobile()
  phone?: string;

  @IsOptional()
  @IsDateString()
  enrollment_date?: string;

  @IsOptional()
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  gender?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  nationality?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  second_code?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  second_phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsapp_no?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  country_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean()
  status?: boolean;

  // --- academic / admission fields (same as ApplicationAcademicDto) ---

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  university_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  course_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  specialisation_id?: number;

  /** The intake. applications.session_id references sessions.session_id. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  session_id?: number;

  /**
   * IN04: the chosen intake (intake.id). The server validates that
   * (university_id, course_id, intake_id) is a live, open offering, stores
   * applications.intake_id, and dual-writes applications.session_id from
   * intake.session_id so legacy displays/joins still resolve.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  intake_id?: number;

  /** The assigned counsellor (users.id). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pipeline_user?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  source?: string;
}
