import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Body for POST /student/plans/initiate-payment.
 *
 * Legacy User/Plans::generate_payment took a package_id and built an EaseBuzz
 * redirect URL. The `package`/`subject_package` tables are ABSENT from the v2
 * schema, so this returns a documented "not configured" stub rather than a live
 * gateway init. See TODO(prod-table) in the service.
 */
export class InitiatePaymentDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  courseId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  planId?: number;
}
