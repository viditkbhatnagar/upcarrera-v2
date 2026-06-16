import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Port of Clients::add (App/Controllers/App/Clients.php).
 * The legacy controller performed no validation beyond a duplicate
 * (code+phone) / email check, so almost everything is optional; we only enforce
 * types/column lengths. `password` and `username` are required to provision a
 * login (legacy hashed the posted password with password_hash()).
 *
 * A client = a `users` row (role_id = 8) PLUS a `clients` profile row. The
 * user-level fields land on `users`; the rest land on `clients`. `university`
 * and `course` are id lists stored as the legacy JSON LongText columns
 * (legacy json_encode'd the posted `university[]` / `course[]` arrays).
 */
export class CreateClientDto {
  // --- users fields ---------------------------------------------------------

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

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  email?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  country_id?: number;

  @IsOptional()
  @IsString()
  profile_picture?: string;

  // users.partnership_status (VarChar(20)). The legacy add() did not write this
  // column, but the list endpoint filters on it, so it is settable here.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  partnership_status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;

  // --- clients profile fields ----------------------------------------------

  @IsOptional()
  @IsString()
  @MaxLength(100)
  business_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  consultant_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  business_category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  // clients.address is a NOT-NULL Text column; defaulted to '' when omitted.
  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  languages?: string;

  // clients.whatsapp is an Int? in the new schema.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  whatsapp?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  commission_model?: string;

  @IsOptional()
  @IsString()
  agreement?: string;

  // YYYY-MM-DD — coerced to a Date for the @db.Date columns.
  @IsOptional()
  @IsString()
  start_date?: string;

  @IsOptional()
  @IsString()
  end_date?: string;

  // University / course id lists (legacy `university[]` / `course[]` POST,
  // stored json_encode'd in the clients.university / clients.course LongText).
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  university?: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  course?: number[];
}
