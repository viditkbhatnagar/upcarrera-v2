import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Body for POST /lead-sources — port of Lead_source controller add(). */
export class CreateLeadSourceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;
}
