import { IsOptional, IsString } from 'class-validator';

/** Create payload for the `fee_type` lookup model. */
export class CreateFeeTypeDto {
  @IsOptional()
  @IsString()
  title?: string;
}
