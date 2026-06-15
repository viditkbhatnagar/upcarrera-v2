import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';

const RAZORPAY_ORDERS_URL = 'https://api.razorpay.com/v1/orders';
const DEFAULT_CURRENCY = 'INR';

export interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number | string;
  amount_paid: number | string;
  amount_due: number | string;
  currency: string;
  receipt: string | null;
  status: string;
  attempts: number;
  created_at: number;
}

/**
 * Thin adapter over the Razorpay Orders REST API + signature verification.
 *
 * Port of legacy Payment_model::create_order / verify_payment_signature
 * (application/app/Models/Payment_model.php), which used the razorpay/razorpay
 * PHP SDK. Here we use the built-in fetch (Node 24) + node:crypto so NO extra
 * package is required.
 *
 * Credentials are read from process.env (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).
 * When they are absent the provider throws ServiceUnavailableException rather
 * than blocking — the rest of the app keeps working without live gateway keys.
 */
@Injectable()
export class RazorpayProvider {
  private get keyId(): string | undefined {
    return process.env.RAZORPAY_KEY_ID;
  }

  private get keySecret(): string | undefined {
    return process.env.RAZORPAY_KEY_SECRET;
  }

  /** True only when BOTH credentials are present. */
  isConfigured(): boolean {
    return Boolean(this.keyId && this.keySecret);
  }

  private requireCreds(): { keyId: string; keySecret: string } {
    if (!this.keyId || !this.keySecret) {
      throw new ServiceUnavailableException('Razorpay not configured');
    }
    return { keyId: this.keyId, keySecret: this.keySecret };
  }

  /**
   * Creates a Razorpay order. `amount` is in the smallest currency unit
   * (paise for INR) — the caller is responsible for that conversion, matching
   * the legacy SDK contract.
   */
  async createOrder(
    amount: number,
    receipt: string,
    currency: string = DEFAULT_CURRENCY,
  ): Promise<RazorpayOrder> {
    const { keyId, keySecret } = this.requireCreds();

    const basic = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

    let response: Response;
    try {
      response = await fetch(RAZORPAY_ORDERS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount, currency, receipt }),
      });
    } catch (err) {
      throw new ServiceUnavailableException(
        `Razorpay order request failed: ${(err as Error).message}`,
      );
    }

    const payload = (await response.json().catch(() => null)) as
      | (RazorpayOrder & { error?: { description?: string } })
      | null;

    if (!response.ok) {
      const description =
        payload?.error?.description ?? `HTTP ${response.status}`;
      throw new ServiceUnavailableException(
        `Razorpay order creation failed: ${description}`,
      );
    }

    return payload as RazorpayOrder;
  }

  /**
   * Verifies the Razorpay payment signature.
   *
   * Razorpay signs `${orderId}|${paymentId}` with HMAC-SHA256 keyed by the
   * API secret. We recompute it and compare with a timing-safe equality check.
   * Returns true on match; never throws on mismatch.
   */
  verifyPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string,
  ): boolean {
    const { keySecret } = this.requireCreds();

    const expected = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'utf8');
    const providedBuf = Buffer.from(signature ?? '', 'utf8');

    // timingSafeEqual requires equal-length buffers; unequal length => no match.
    if (expectedBuf.length !== providedBuf.length) return false;

    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  }
}
