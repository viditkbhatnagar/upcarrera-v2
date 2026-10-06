import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
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
 * Port of Consultant::edit. Every field is optional (the legacy edit was a
 * partial update); only supplied fields are copied through. `password`, when
 * present and non-empty, is re-hashed (mirrors the legacy edit_password flow).
 */
export class UpdateConsultantDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;

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

  @IsOptional()
  @IsString()
  dob?: string;

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

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  assigned_universities?: number[];
}
