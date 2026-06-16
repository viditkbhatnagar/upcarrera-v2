import { IsInt, IsOptional } from 'class-validator';

/**
 * POST /university-commission/collect — accumulates the collected university
 * commission onto invoice.collected_commission_of_university (Decimal(10,0)).
 * Ported from University_commission::collect: null => set; else add.
 */
export class CollectUniversityCommissionDto {
  @IsInt()
  invoice_id!: number;

  // Amount being collected now (added to the running total). Money column.
  @IsOptional()
  collected_commison?: string | number;
}
