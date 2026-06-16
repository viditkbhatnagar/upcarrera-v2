import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Query params for GET /sales-teams. Pagination + the legacy Sales::index
 * filters (course_id / university_id / consultant_id->leader). The sales_team
 * columns leader/university_id/course_id are VarChar in the schema, so these
 * filters are strings, not ints.
 */
export class ListSalesTeamsDto {
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

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  course_id?: string;

  @IsOptional()
  @IsString()
  university_id?: string;

  // Legacy `consultant_id` GET param filters on sales_team.leader.
  @IsOptional()
  @IsString()
  leader?: string;
}
