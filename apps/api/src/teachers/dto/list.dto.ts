import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/** Shared pagination — @Type coerces query strings under the global transform pipe. */
class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class TeacherListDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search_key?: string;
}

export class TeacherIdListDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  teacher_id?: number;
}

export class UserIdListDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  user_id?: number;
}
