import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

const BREVO_SMTP_URL = 'https://api.brevo.com/v3/smtp/email';

export interface SendEmailParams {
  /** recipient email address */
  to: string;
  /** recipient display name */
  name: string;
  subject: string;
  /** HTML body */
  html: string;
}

/**
 * Transactional email via Brevo (formerly Sendinblue).
 * Ports app/Helpers/brevo_helper.php::sendEmail — same endpoint, same
 * `api-key` header — using the global fetch instead of Guzzle.
 *
 * The sender address is read from BREVO_SENDER_EMAIL / BREVO_SENDER_NAME with
 * safe fallbacks, since the legacy helper expected the caller to supply it.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  /** True when the Brevo API key is present. */
  get isConfigured(): boolean {
    return Boolean(process.env.BREVO_API_KEY);
  }

  async sendEmail(params: SendEmailParams): Promise<{ messageId?: string }> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('Email not configured');
    }

    const senderEmail =
      process.env.BREVO_SENDER_EMAIL ?? 'no-reply@upcarrera.com';
    const senderName = process.env.BREVO_SENDER_NAME ?? 'UpCarrera';

    const body = {
      sender: { email: senderEmail, name: senderName },
      to: [{ email: params.to, name: params.name }],
      subject: params.subject,
      htmlContent: params.html,
    };

    let response: Response;
    try {
      response = await fetch(BREVO_SMTP_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': process.env.BREVO_API_KEY as string,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.logger.error(`Brevo request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Email send failed');
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      this.logger.error(`Brevo ${response.status}: ${errBody}`);
      throw new ServiceUnavailableException('Email send failed');
    }

    const data = (await response
      .json()
      .catch(() => ({}))) as { messageId?: string };
    return { messageId: data.messageId };
  }
}
