import {
  IsInt,
  IsOptional,
  IsString,
  IsDateString,
  MaxLength,
} from 'class-validator';

/**
 * Port of the legacy `students` insert (Students_model::$allowedFields).
 * The legacy app performed no validation, so almost every column is optional.
 * `student_id` (FK -> users.id), `address` and `consultant_id` are NOT NULL in
 * the schema, so they are required here.
 */
export class CreateStudentDto {
  @IsInt()
  student_id!: number; // FK -> users.id

  @IsString()
  address!: string;

  @IsInt()
  consultant_id!: number;

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
  whatsapp_no?: string;

  @IsOptional()
  @IsDateString()
  enrollment_date?: string;

  @IsOptional()
  @IsInt()
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
