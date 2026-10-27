import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListExternalRefereesDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
