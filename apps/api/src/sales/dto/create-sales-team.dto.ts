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
 * Port of Sales::add. `members` arrives as an array of user ids and is stored
 * as a JSON string in the sales_team.members LongText column (the service
 * stringifies it). leader/university_id/course_id are VarChar columns, so they
 * are strings here. `status` is the only Int column.
 */
export class CreateSalesTeamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  leader?: string;

  // Stored as a JSON string of user ids in the members LongText column.
  @IsOptional()
  @IsArray()
  members?: (string | number)[];

  @IsOptional()
  @IsString()
  @MaxLength(10)
  university_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  course_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;
}
