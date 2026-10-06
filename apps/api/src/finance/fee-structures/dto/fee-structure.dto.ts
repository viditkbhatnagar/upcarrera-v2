import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  COMPONENT_BASES,
  COURSE_FEE_BASES,
  FEE_COLLECTION_MODELS,
  FEE_STATUSES,
} from '../fee-structure.money';

/** Hard cap on repeater rows so one payload cannot try to write thousands. */
const MAX_ITEMS = 50;
const MAX_INSTALMENTS = 60;

/** One "other fee" line (fee_structure_item). */
export class FeeStructureItemDto {
  @IsString()
  @MaxLength(120)
  label!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @IsIn(COMPONENT_BASES as unknown as string[])
  basis!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fee_type_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;
}

/** One custom-schedule row (fee_structure_instalment). */
export class FeeStructureInstalmentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seq!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @Type(() => Number)
  @IsInt()
  due_offset_days!: number;
}

export class CreateFeeStructureDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  university_id!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  course_id!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  intake_id!: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  registration_fee?: number;

  @IsOptional()
  @IsIn(COURSE_FEE_BASES as unknown as string[])
  course_fee_basis?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  course_fee_amount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  course_fee_periods?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  exam_fee?: number;

  @IsOptional()
  @IsIn(COMPONENT_BASES as unknown as string[])
  exam_fee_basis?: string;

  @IsOptional()
  @IsBoolean()
  discount_allowed?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discount_max_pct?: number;

  @IsOptional()
  @IsBoolean()
  allow_full?: boolean;

  @IsOptional()
  @IsBoolean()
  allow_per_year?: boolean;

  @IsOptional()
  @IsBoolean()
  allow_per_semester?: boolean;

  @IsOptional()
  @IsBoolean()
  allow_custom?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => FeeStructureItemDto)
  items?: FeeStructureItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_INSTALMENTS)
  @ValidateNested({ each: true })
  @Type(() => FeeStructureInstalmentDto)
  instalments?: FeeStructureInstalmentDto[];
}

/**
 * Edit payload. The key (university/course/intake) is immutable, so it is
 * omitted; change_reason is mandatory in the SERVICE when the row is Active.
 */
export class UpdateFeeStructureDto extends PartialType(
  OmitType(CreateFeeStructureDto, ['university_id', 'course_id', 'intake_id'] as const),
) {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  change_reason?: string;
}

/** Query DTO for GET /fee-structures and /fee-structures/export. */
export class ListFeeStructuresDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  university_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  course_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  intake_id?: number;

  @IsOptional()
  @IsIn(FEE_STATUSES as unknown as string[])
  status?: string;

  @IsOptional()
  @IsIn(FEE_COLLECTION_MODELS as unknown as string[])
  fee_collection_model?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fee_min?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fee_max?: number;

  @IsOptional()
  @IsString()
  @IsIn([
    'created_desc',
    'created_asc',
    'total_asc',
    'total_desc',
    'code_asc',
    'code_desc',
  ])
  sort?: string;

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

  /** Format toggle on the export endpoint. */
  @IsOptional()
  @IsString()
  format?: string;
}

/** GET /fee-structures/resolve — all three keys required. */
export class ResolveFeeStructureDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  university_id!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  course_id!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  intake_id!: number;
}

/** POST /fee-structures/:id/copy — optional explicit target, else next intake. */
export class CopyFeeStructureDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  intake_id?: number;
}

/** POST /fee-structures/copy-intake — bulk copy. */
export class CopyIntakeDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  from_intake_id!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  to_intake_id!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  university_id?: number;
}

/** POST /fee-structures/:id/expire — optional audited reason. */
export class ExpireFeeStructureDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** POST /fee-structures/:id/activate — optional audited note. */
export class ActivateFeeStructureDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
