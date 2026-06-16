import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Port of the legacy Visa_type form (only `title` was written). NOTE: the
 * `visa_type` table is NOT modelled in prisma/schema.prisma, so the service
 * cannot persist this yet — see AcademicsService visa-type methods (phase-3).
 */
export class CreateVisaTypeDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;
}
