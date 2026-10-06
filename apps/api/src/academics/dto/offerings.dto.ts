import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';

/** One (university, course) pair offered in an intake. */
export class OfferingPairDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  university_id!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  course_id!: number;
}

/**
 * Body for PUT /intakes/:id/offerings — replace the whole set of offerings for an
 * intake. An empty array clears every offering, so there is no ArrayMinSize.
 */
export class ReplaceOfferingsDto {
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => OfferingPairDto)
  offerings!: OfferingPairDto[];
}

/** Body for POST /intakes/:id/offerings/copy — copy offerings from another intake. */
export class CopyOfferingsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  from_intake_id!: number;
}
