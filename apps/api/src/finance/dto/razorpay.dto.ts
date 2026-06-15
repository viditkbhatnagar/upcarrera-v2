import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * Body for POST /payments/razorpay/order.
 * `amount` is in the smallest currency unit (paise for INR), matching the
 * Razorpay Orders API contract used by the legacy Payment_model::create_order.
 */
export class CreateRazorpayOrderDto {
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsString()
  receipt!: string;

  @IsOptional()
  @IsString()
  currency?: string;

  // Optional linkage to a local invoice — recorded for audit, not required.
  @IsOptional()
  @IsInt()
  invoice_id?: number;
}

/**
 * Body for POST /payments/razorpay/verify.
 * Field names mirror the values Razorpay returns to the checkout callback.
 */
export class VerifyRazorpayPaymentDto {
  @IsString()
  razorpay_order_id!: string;

  @IsString()
  razorpay_payment_id!: string;

  @IsString()
  razorpay_signature!: string;
}
