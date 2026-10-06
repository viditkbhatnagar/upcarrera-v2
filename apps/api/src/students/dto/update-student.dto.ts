import {
  IsInt,
  IsOptional,
  IsString,
  IsDateString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * A phone-shaped value: digits with optional +, spaces, dashes and brackets, or
 * '' to clear. Numbers here may be international, so this is a shape check, not
 * the Indian-mobile rule applications use.
 */
const PHONE_SHAPE = /^(\+?[\d\s\-()]{6,24})?$/;
const PHONE_SHAPE_MESSAGE = 'must be a phone number (digits, +, spaces or dashes)';

/**
 * Every field optional on update — mirrors the permissive legacy update.
 * (Standalone, not PartialType, since @nestjs/mapped-types is not a dependency.)
 */
export class UpdateStudentDto {
  @IsOptional()
  @IsInt()
  student_id?: number; // FK -> users.id

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsInt()
  consultant_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  enrollment_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  application_id?: string;

  @IsOptional()
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsInt()
  age?: number;

  @IsOptional()
  @IsString()
  @MaxLength(11)
  second_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(PHONE_SHAPE, { message: `second_phone ${PHONE_SHAPE_MESSAGE}` })
  second_phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  state?: string;

  @IsOptional()
  @IsInt()
  nationality?: number;

  @IsOptional()
  @IsString()
  @MaxLength(25)
  @Matches(PHONE_SHAPE, { message: `whatsapp_no ${PHONE_SHAPE_MESSAGE}` })
  whatsapp_no?: string;

  @IsOptional()
  @IsDateString()
  enrollment_date?: string;

  // 0 Pending · 1 In Progress · 2 Enrolled · 3 Passed Out · 4 Dropout · 5 Cancelled
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  admission_status?: number;

  @IsOptional()
  @IsInt()
  course_id?: number;

  @IsOptional()
  @IsInt()
  specialisation_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  mode?: string;

  @IsOptional()
  @IsInt()
  session_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string;

  @IsOptional()
  @IsString()
  courses?: string;

  @IsOptional()
  @IsString()
  semester_details?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  gpa?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  abc_id?: string;

  @IsOptional()
  @IsInt()
  upcarrera_commission?: number;

  @IsOptional()
  @IsInt()
  tuitionFees?: number;

  @IsOptional()
  @IsInt()
  examFees?: number;

  @IsOptional()
  @IsInt()
  miscFees?: number;

  @IsOptional()
  @IsString()
  scholarshipDetails?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  adm_pipeline?: string;

  @IsOptional()
  @IsInt()
  pipeline_user?: number;

  @IsOptional()
  @IsInt()
  ref_student?: number;

  @IsOptional()
  @IsInt()
  referred_by?: number;
}
