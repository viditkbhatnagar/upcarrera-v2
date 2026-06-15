import { Injectable, Logger } from '@nestjs/common';

const TWO_FACTOR_BASE_URL = 'https://2factor.in/API/V1';

export interface SendOtpResult {
  sent: boolean;
  /** present only when not sent */
  reason?: string;
  /** 2factor session id, present on success */
  sessionId?: string;
}

/**
 * OTP SMS via 2factor.in.
 * Ports app/Services/Otp_service.php::send_sms_otp — same ApplicationOTP
 * endpoint — using the global fetch.
 *
 * Unlike the other providers this NEVER throws when unconfigured: the OTP flow
 * must keep working in dev (the OTP is still generated and stored), so a missing
 * OTP_API_KEY simply returns { sent: false, reason }. The legacy hardcoded
 * bypass numbers and the '1234' shortcut have been intentionally removed.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  /** True when the 2factor API key is present. */
  get isConfigured(): boolean {
    return Boolean(process.env.OTP_API_KEY);
  }

  async sendOtp(phone: string, otp: string): Promise<SendOtpResult> {
    if (!this.isConfigured) {
      return { sent: false, reason: 'SMS not configured' };
    }

    const apiKey = process.env.OTP_API_KEY as string;
    const url = `${TWO_FACTOR_BASE_URL}/${encodeURIComponent(
      apiKey,
    )}/SMS/${encodeURIComponent(phone)}/${encodeURIComponent(
      otp,
    )}/ApplicationOTP`;

    let response: Response;
    try {
      response = await fetch(url, { method: 'GET' });
    } catch (err) {
      this.logger.error(`2factor request failed: ${(err as Error).message}`);
      return { sent: false, reason: 'SMS send failed' };
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(`2factor ${response.status}: ${body}`);
      return { sent: false, reason: 'SMS send failed' };
    }

    const data = (await response.json().catch(() => ({}))) as {
      Status?: string;
      Details?: string;
    };

    if (data.Status && data.Status !== 'Success') {
      this.logger.warn(`2factor returned status ${data.Status}`);
      return { sent: false, reason: data.Status };
    }

    return { sent: true, sessionId: data.Details };
  }
}
