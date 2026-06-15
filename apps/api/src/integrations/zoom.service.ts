import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';

/** Cached Server-to-Server OAuth access token. */
interface CachedToken {
  token: string;
  /** epoch ms after which the token must be refreshed */
  expiresAt: number;
}

/**
 * Zoom Meeting SDK roles.
 *   0 = attendee/participant, 1 = host/co-host.
 */
const VALID_SDK_ROLES = [0, 1] as const;

const ZOOM_OAUTH_URL = 'https://zoom.us/oauth/token';

// Zoom S2S tokens live 1 hour; refresh a little early to avoid edge expiry.
const TOKEN_TTL_MS = 55 * 60 * 1000;

// Meeting SDK signature window: valid from now, expires in ~2h (per Zoom docs).
const SDK_SIGNATURE_TTL_SECONDS = 2 * 60 * 60;

/**
 * Zoom integration. Ports app/Libraries/Zoom.php (Server-to-Server OAuth) and
 * the Meeting SDK signature flow that app/Controllers/Api/Student/Sessions.php
 * previously proxied to an external PHP endpoint — reimplemented natively with
 * node:crypto so there is no third-party hop.
 *
 * All methods are env-gated: when the required credentials are absent we throw
 * ServiceUnavailableException rather than attempting an un-authenticated call.
 */
@Injectable()
export class ZoomService {
  private readonly logger = new Logger(ZoomService.name);
  private cachedToken: CachedToken | null = null;

  /** True when Server-to-Server OAuth env credentials are all present. */
  get isOAuthConfigured(): boolean {
    return Boolean(
      process.env.ZOOM_CLIENT_ID &&
        process.env.ZOOM_CLIENT_SECRET &&
        process.env.ZOOM_ACCOUNT_ID,
    );
  }

  /** True when the Meeting SDK env credentials are present. */
  get isSdkConfigured(): boolean {
    return Boolean(process.env.ZOOM_SDK_KEY && process.env.ZOOM_SDK_SECRET);
  }

  /** Health flag: any Zoom capability configured. */
  get isConfigured(): boolean {
    return this.isOAuthConfigured || this.isSdkConfigured;
  }

  /**
   * Server-to-Server OAuth access token, cached for ~55 minutes.
   * Mirrors Zoom.php::getAccessToken (Basic auth + account_credentials grant).
   */
  async getAccessToken(): Promise<string> {
    if (!this.isOAuthConfigured) {
      throw new ServiceUnavailableException('Zoom not configured');
    }

    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now) {
      return this.cachedToken.token;
    }

    const clientId = process.env.ZOOM_CLIENT_ID as string;
    const clientSecret = process.env.ZOOM_CLIENT_SECRET as string;
    const accountId = process.env.ZOOM_ACCOUNT_ID as string;

    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const url = `${ZOOM_OAUTH_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(
      accountId,
    )}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
    } catch (err) {
      this.logger.error(`Zoom OAuth request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Zoom token request failed');
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(`Zoom OAuth ${response.status}: ${body}`);
      throw new ServiceUnavailableException('Zoom token request failed');
    }

    const data = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };

    if (!data.access_token) {
      throw new ServiceUnavailableException('Zoom token request failed');
    }

    this.cachedToken = {
      token: data.access_token,
      expiresAt: now + TOKEN_TTL_MS,
    };

    return data.access_token;
  }

  /**
   * HMAC-SHA256 (HS256) JWT for the Zoom Meeting SDK.
   * Replaces the legacy call_jwt_api() external proxy in settings_helper.php.
   *
   * @param meetingNumber the Zoom meeting number the client will join
   * @param role 0 = attendee, 1 = host
   */
  getMeetingSdkSignature(meetingNumber: string | number, role: number): string {
    if (!this.isSdkConfigured) {
      throw new ServiceUnavailableException('Zoom not configured');
    }

    if (!VALID_SDK_ROLES.includes(role as (typeof VALID_SDK_ROLES)[number])) {
      throw new ServiceUnavailableException('Invalid Zoom SDK role (expected 0 or 1)');
    }

    const sdkKey = process.env.ZOOM_SDK_KEY as string;
    const sdkSecret = process.env.ZOOM_SDK_SECRET as string;

    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + SDK_SIGNATURE_TTL_SECONDS;

    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      appKey: sdkKey,
      sdkKey,
      mn: String(meetingNumber),
      role,
      iat,
      exp,
      tokenExp: exp,
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const signature = createHmac('sha256', sdkSecret)
      .update(signingInput)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    return `${signingInput}.${signature}`;
  }

  private base64UrlEncode(value: string): string {
    return Buffer.from(value)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}
