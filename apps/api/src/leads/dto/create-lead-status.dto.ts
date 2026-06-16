import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Body for POST /lead-statuses — port of Lead_status controller add(). */
export class CreateLeadStatusDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;
}
