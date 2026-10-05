import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { LEADER_ID_MESSAGE, LEADER_ID_PATTERN } from './sales-team-ids';

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

  // A users.id as a digit string (the column is a VarChar(10) id). Rejects a
  // display name such as "Priya Sharma" (QA T01). `null` clears the leader.
  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Matches(LEADER_ID_PATTERN, { message: LEADER_ID_MESSAGE })
  leader?: string | null;

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
