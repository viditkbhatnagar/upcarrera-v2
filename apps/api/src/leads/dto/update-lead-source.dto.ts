import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Body for PATCH /lead-sources/:id — port of Lead_source controller edit(). */
export class UpdateLeadSourceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title?: string;
}
