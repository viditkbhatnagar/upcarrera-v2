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

// Base URL for the Zoom REST API v2 (users management).
const ZOOM_API_BASE = 'https://api.zoom.us/v2';

// Zoom caps page_size at 300; the legacy lib used 30. Use 300 to minimise
// round-trips while staying within the documented maximum.
const ZOOM_USERS_PAGE_SIZE = 300;

// Safety cap so a misbehaving API can never spin the pagination loop forever.
const ZOOM_USERS_MAX_PAGES = 50;

/** Minimal shape of a Zoom user as returned by GET /users. */
export interface ZoomUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  status?: string;
  type?: number;
  [key: string]: unknown;
}

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

  /**
   * List Zoom users, following pagination until exhausted. Ports
   * Zoom.php::listUsers / listPendingUsers — pass status='pending' for the
   * pending-invite roster (omit for active users).
   */
  async listUsers(status?: 'active' | 'pending' | 'inactive'): Promise<ZoomUser[]> {
    const all: ZoomUser[] = [];

    for (let page = 1; page <= ZOOM_USERS_MAX_PAGES; page++) {
      const params = new URLSearchParams({
        page_size: String(ZOOM_USERS_PAGE_SIZE),
        page_number: String(page),
      });
      if (status) params.set('status', status);

      const data = (await this.zoomFetch(`/users?${params.toString()}`, {
        method: 'GET',
      })) as { users?: ZoomUser[] };

      const users = data.users ?? [];
      all.push(...users);

      // A short page means we've reached the end.
      if (users.length < ZOOM_USERS_PAGE_SIZE) break;
    }

    return all;
  }

  /**
   * Invite/create a Zoom user (action=create, type=1 basic). Ports
   * Zoom.php::addUser. Returns the created Zoom user payload (incl. its id).
   */
  async addUser(
    email: string,
    firstName: string,
    lastName: string,
  ): Promise<ZoomUser> {
    return (await this.zoomFetch('/users', {
      method: 'POST',
      body: JSON.stringify({
        action: 'create',
        user_info: {
          email,
          type: 1,
          first_name: firstName,
          last_name: lastName,
        },
      }),
    })) as ZoomUser;
  }

  /**
   * Delete a Zoom user by id or email. Ports Zoom.php::deleteUser. Zoom returns
   * 204 No Content on success, so there is no body to parse.
   */
  async deleteUser(userId: string): Promise<void> {
    await this.zoomFetch(`/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  }

  /**
   * Authenticated Zoom REST call. Acquires/reuses the S2S OAuth token, then
   * issues the request. Parses JSON when present (DELETE returns 204/empty) and
   * raises ServiceUnavailableException on any transport/HTTP failure so the
   * controller surfaces a clean 503 rather than leaking Zoom internals.
   */
  private async zoomFetch(
    path: string,
    init: { method: string; body?: string },
  ): Promise<unknown> {
    const token = await this.getAccessToken();

    let response: Response;
    try {
      response = await fetch(`${ZOOM_API_BASE}${path}`, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: init.body,
      });
    } catch (err) {
      this.logger.error(`Zoom API request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Zoom request failed');
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(`Zoom API ${init.method} ${path} ${response.status}: ${body}`);
      throw new ServiceUnavailableException('Zoom request failed');
    }

    if (response.status === 204) return null;

    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  }

  private base64UrlEncode(value: string): string {
    return Buffer.from(value)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}
