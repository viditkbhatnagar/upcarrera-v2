import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_SCOPE = 'https://graph.microsoft.com/.default';
// Refresh slightly before the real expiry to avoid edge-of-expiry failures.
const TOKEN_SKEW_MS = 60_000;
const DEFAULT_FROM_ADDRESS = 'hello@upcarrera.com';
const DEFAULT_FROM_NAME = 'upCarrera';

/** A single Graph fileAttachment (base64 contentBytes). Kept small (<= 3 MB). */
export interface EmailAttachment {
  filename: string;
  contentType: string;
  /** base64-encoded file contents. */
  contentBytes: string;
}

export interface SendEmailParams {
  /** recipient email address */
  to: string;
  /** recipient display name */
  name: string;
  subject: string;
  /** HTML body */
  html: string;
  /** Optional attachments (e.g. the submitted-application summary PDF). */
  attachments?: EmailAttachment[];
  /**
   * Whether Graph keeps a copy in the shared mailbox's Sent Items. Defaults to
   * true (unchanged for existing callers). The magic-link and reopened emails
   * pass FALSE so a tokenised link is never copied into hello@ Sent Items.
   */
  saveToSentItems?: boolean;
}

/** Max total attachment payload for Graph's simple sendMail (3 MB base64 budget). */
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

/**
 * Transactional email via Microsoft Graph (Office 365 / Exchange Online),
 * sending app-only as MAIL_FROM_ADDRESS — the `hello@upcarrera.com` shared
 * mailbox. Replaces the earlier Brevo transport; the public interface
 * (`sendEmail` + `isConfigured`) is unchanged, so all callers (session
 * invites, finance notices, the integrations endpoint) are untouched.
 *
 * Auth = OAuth2 client-credentials against the upCarrera Entra tenant; the
 * registered "upCarrera Mailer" app holds the Graph Mail.Send application
 * permission. Access tokens are cached in-process until just before expiry.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  private get tenantId(): string | undefined {
    return process.env.MS_TENANT_ID;
  }
  private get clientId(): string | undefined {
    return process.env.MS_CLIENT_ID;
  }
  private get clientSecret(): string | undefined {
    return process.env.MS_CLIENT_SECRET;
  }
  private get fromAddress(): string {
    return process.env.MAIL_FROM_ADDRESS ?? DEFAULT_FROM_ADDRESS;
  }
  private get fromName(): string {
    return process.env.MAIL_FROM_NAME ?? DEFAULT_FROM_NAME;
  }

  /** True when the Microsoft Graph mailer credentials are present. */
  get isConfigured(): boolean {
    return Boolean(this.tenantId && this.clientId && this.clientSecret);
  }

  /** Fetch (and cache) an app-only Graph access token via client credentials. */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    const url = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    const form = new URLSearchParams({
      client_id: this.clientId as string,
      client_secret: this.clientSecret as string,
      scope: TOKEN_SCOPE,
      grant_type: 'client_credentials',
    });

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
    } catch (err) {
      this.logger.error(`Token request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Email send failed');
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      this.logger.error(`Token endpoint ${res.status}: ${errBody}`);
      throw new ServiceUnavailableException('Email send failed');
    }

    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) {
      this.logger.error('Token endpoint returned no access_token');
      throw new ServiceUnavailableException('Email send failed');
    }

    this.cachedToken = data.access_token;
    this.tokenExpiresAt =
      now + Math.max(0, (data.expires_in ?? 3600) * 1000 - TOKEN_SKEW_MS);
    return this.cachedToken;
  }

  async sendEmail(params: SendEmailParams): Promise<{ messageId?: string }> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('Email not configured');
    }

    const token = await this.getAccessToken();
    const url = `${GRAPH_BASE}/users/${encodeURIComponent(
      this.fromAddress,
    )}/sendMail`;

    const attachments = this.buildAttachments(params.attachments);

    const payload = {
      message: {
        subject: params.subject,
        body: { contentType: 'HTML', content: params.html },
        toRecipients: [
          { emailAddress: { address: params.to, name: params.name } },
        ],
        from: {
          emailAddress: { address: this.fromAddress, name: this.fromName },
        },
        ...(attachments.length ? { attachments } : {}),
      },
      // Default true (unchanged for existing callers); magic-link / reopened pass
      // false so a tokenised link is never copied into the shared Sent Items.
      saveToSentItems: params.saveToSentItems ?? true,
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      this.logger.error(
        `Graph sendMail request failed: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException('Email send failed');
    }

    // Graph returns 202 Accepted with an empty body on success.
    if (res.status !== 202) {
      const errBody = await res.text().catch(() => '');
      this.logger.error(`Graph sendMail ${res.status}: ${errBody}`);
      throw new ServiceUnavailableException('Email send failed');
    }

    return {};
  }

  /**
   * Map our attachments to Graph fileAttachment objects, dropping any that would
   * push the total payload past the 3 MB budget (logged, never thrown — the email
   * body still goes out). Callers keep attachments small (the summary PDF).
   */
  private buildAttachments(
    attachments: EmailAttachment[] | undefined,
  ): Array<Record<string, string>> {
    if (!attachments?.length) return [];
    const out: Array<Record<string, string>> = [];
    let total = 0;
    for (const a of attachments) {
      total += a.contentBytes.length;
      if (total > MAX_ATTACHMENT_BYTES) {
        this.logger.warn(`Attachment "${a.filename}" skipped: over the 3 MB budget`);
        continue;
      }
      out.push({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.filename,
        contentType: a.contentType,
        contentBytes: a.contentBytes,
      });
    }
    return out;
  }
}
