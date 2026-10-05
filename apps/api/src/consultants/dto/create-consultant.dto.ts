import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  IsConsultantPhone,
  transformConsultantPhone,
} from '../consultant-phone';
import { trimEmployeeCode } from './employee-code';

/**
 * Port of Consultant::add (App/Controllers/App/Consultant.php).
 * The legacy controller performed no validation beyond a duplicate phone/email
 * check, so almost everything is optional; we only enforce types/column lengths.
 * `password` and `username` are required to provision a login (legacy hashed the
 * posted password with password_hash()). `assigned_universities` is the list of
 * university ids the consultant handles (legacy stored it as a JSON column).
 */
export class CreateConsultantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  // users.code is an Int? in the new schema (legacy stored the dial-code here).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  code?: number;

  // Normalised before validation (QA C08): "87146 89444", "09072238556" and
  // "+91 98765 43210" are all stored as the bare 10-digit national number,
  // so new rows stop adding to the mixed formats already in the column.
  @IsOptional()
  @Transform(transformConsultantPhone)
  @IsString()
  @MaxLength(30)
  @IsConsultantPhone()
  phone?: string;

  /**
   * Hand-entered employee id, e.g. "UC-1024" (users.employee_code, migration
   * 001). Unique across all users; a clash is a 409. On update an empty string
   * clears it, and the list falls back to showing `UC-<users.id>`.
   */
  @IsOptional()
  @Transform(trimEmployeeCode)
  @IsString()
  @MaxLength(32)
  @Matches(/^$|^[A-Za-z0-9][A-Za-z0-9\-_/]*$/, {
    message:
      'employee_code may contain only letters, digits, "-", "_" and "/", and must start with a letter or digit',
  })
  employee_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  gender?: string;

  // YYYY-MM-DD — coerced to a Date for the dob @db.Date column.
  @IsOptional()
  @IsString()
  dob?: string;

  // YYYY-MM-DD — date of joining (doj @db.Date column).
  @IsOptional()
  @IsString()
  doj?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  country_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  languages_spoken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  highest_qualification?: string;

  @IsOptional()
  @IsString()
  profile_picture?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;

  // University ids this consultant is assigned to (legacy `university[]` POST).
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  assigned_universities?: number[];
}
