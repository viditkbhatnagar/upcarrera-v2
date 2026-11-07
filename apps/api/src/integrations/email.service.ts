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

// RELIABILITY: Graph (and the token endpoint) occasionally answer a single call
// with a throttle (429) or a transient 5xx/timeout. Without a retry the caller
// just sees "Email send failed", which is why staff reported having to click
// "Send link" several times before the application-form email actually went.
// We retry transient failures a few times with exponential backoff + jitter so
// one click reliably sends. A 202 returns immediately (no double-send on
// success), and non-transient errors (bad config, 4xx) fail fast.
const MAX_SEND_ATTEMPTS = 3;
const MAX_TOKEN_ATTEMPTS = 3;
const RETRY_BASE_MS = 400;
const RETRY_MAX_MS = 4_000;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/** Internal marker for a transient Graph/token failure that is worth retrying. */
class TransientEmailError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'TransientEmailError';
  }
}

/** Internal marker: Graph rejected the (cached) token — retry once with a fresh one. */
class AuthExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

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

  /**
   * Fetch (and cache) an app-only Graph access token via client credentials.
   * Transient failures (network, 429, 5xx) are retried with backoff; a stale
   * cached token is refreshed when `forceRefresh` is set (after a 401 on send).
   */
  private async getAccessToken(forceRefresh = false): Promise<string> {
    const now = Date.now();
    if (!forceRefresh && this.cachedToken && now < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_TOKEN_ATTEMPTS; attempt++) {
      try {
        return await this.fetchToken();
      } catch (err) {
        lastError = err;
        if (err instanceof TransientEmailError && attempt < MAX_TOKEN_ATTEMPTS) {
          await this.sleep(this.backoffMs(attempt, err.retryAfterMs));
          continue;
        }
        break;
      }
    }
    this.logger.error(
      `Token request gave up after ${MAX_TOKEN_ATTEMPTS} attempt(s): ${
        (lastError as Error)?.message ?? 'unknown'
      }`,
    );
    throw new ServiceUnavailableException('Email send failed');
  }

  /** One token request. Throws TransientEmailError on a retryable failure. */
  private async fetchToken(): Promise<string> {
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
      throw new TransientEmailError(`token network: ${(err as Error).message}`);
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      this.logger.error(`Token endpoint ${res.status}: ${errBody}`);
      if (RETRYABLE_STATUS.has(res.status)) {
        throw new TransientEmailError(`token ${res.status}`, this.parseRetryAfter(res));
      }
      throw new Error(`token ${res.status}`);
    }

    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) {
      throw new Error('token endpoint returned no access_token');
    }

    this.cachedToken = data.access_token;
    this.tokenExpiresAt =
      Date.now() + Math.max(0, (data.expires_in ?? 3600) * 1000 - TOKEN_SKEW_MS);
    return this.cachedToken;
  }

  async sendEmail(params: SendEmailParams): Promise<{ messageId?: string }> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('Email not configured');
    }

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
    const body = JSON.stringify(payload);

    let forceTokenRefresh = false;
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
      const token = await this.getAccessToken(forceTokenRefresh);
      forceTokenRefresh = false;
      try {
        await this.postSendMail(url, token, body);
        return {};
      } catch (err) {
        lastError = err;
        // Cached token rejected: drop it and retry immediately with a fresh one.
        if (err instanceof AuthExpiredError && attempt < MAX_SEND_ATTEMPTS) {
          this.cachedToken = null;
          this.tokenExpiresAt = 0;
          forceTokenRefresh = true;
          continue;
        }
        if (err instanceof TransientEmailError && attempt < MAX_SEND_ATTEMPTS) {
          await this.sleep(this.backoffMs(attempt, err.retryAfterMs));
          continue;
        }
        break;
      }
    }

    this.logger.error(
      `Graph sendMail gave up after ${MAX_SEND_ATTEMPTS} attempt(s): ${
        (lastError as Error)?.message ?? 'unknown'
      }`,
    );
    throw new ServiceUnavailableException('Email send failed');
  }

  /**
   * One Graph sendMail POST. Returns on 202 (success, empty body). Throws
   * AuthExpiredError on 401 (retry with a fresh token), TransientEmailError on a
   * network error / 429 / 5xx (retry with backoff), or a plain Error otherwise
   * (fail fast — e.g. a malformed request).
   */
  private async postSendMail(url: string, token: string, body: string): Promise<void> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body,
      });
    } catch (err) {
      throw new TransientEmailError(`network: ${(err as Error).message}`);
    }

    // Graph returns 202 Accepted with an empty body on success.
    if (res.status === 202) return;

    const errBody = await res.text().catch(() => '');
    this.logger.error(`Graph sendMail ${res.status}: ${errBody}`);
    if (res.status === 401) {
      throw new AuthExpiredError(`401: ${errBody}`);
    }
    if (RETRYABLE_STATUS.has(res.status)) {
      throw new TransientEmailError(`${res.status}`, this.parseRetryAfter(res));
    }
    throw new Error(`Graph sendMail ${res.status}`);
  }

  /** Parse a Retry-After header (delta-seconds) into ms, capped at RETRY_MAX_MS. */
  private parseRetryAfter(res: Response): number | undefined {
    const raw = res.headers?.get?.('retry-after');
    if (!raw) return undefined;
    const secs = Number(raw);
    if (!Number.isFinite(secs) || secs < 0) return undefined;
    return Math.min(RETRY_MAX_MS, secs * 1000);
  }

  /** Exponential backoff (ms) with jitter; honours Retry-After; 0 under test. */
  private backoffMs(attempt: number, retryAfterMs?: number): number {
    if (process.env.NODE_ENV === 'test') return 0;
    const exp = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (attempt - 1));
    const jitter = Math.floor(Math.random() * 150);
    return Math.max(retryAfterMs ?? 0, exp + jitter);
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
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
