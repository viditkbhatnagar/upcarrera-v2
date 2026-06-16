import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Port of Sales::edit — partial update. Field set mirrors CreateSalesTeamDto
 * (declared standalone to avoid a @nestjs/mapped-types dependency). When
 * `members` is supplied the service re-stringifies it to the JSON column.
 */
export class UpdateSalesTeamDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  leader?: string;

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
