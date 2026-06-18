import { Injectable, Logger } from '@nestjs/common';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';

/**
 * Ainvox cloud-telephony provider (same account/number as TTII). All REST calls
 * are made server-side with HTTP Basic `PUBLIC_KEY:SECRET_KEY`; the secret key
 * NEVER reaches the browser. Recordings are proxied through our API.
 *
 * Config comes from the environment (loaded by @nestjs/config), mirroring the
 * EmailService pattern — the service is "dark" (isConfigured=false) until the
 * keys are present, so the app boots fine without them.
 *
 *   AINVOX_PROVIDER=ainvox
 *   AINVOX_BASE_URL=https://app.ainvox.com
 *   AINVOX_ACCOUNT_ID, AINVOX_VIRTUAL_NUMBER, AINVOX_LOGIN_EMAIL
 *   AINVOX_PUBLIC_KEY, AINVOX_SECRET_KEY (server-only), AINVOX_LOGIN_PASSWORD (server-only)
 *   AINVOX_TIMEOUT_MS, AINVOX_FLOW_TOKEN, AINVOX_PUBLIC_BASE_URL, AINVOX_DEFAULT_AGENT_PHONE
 */
export type AinvoxErrorCode =
  | 'not_configured'
  | 'unauthorized'
  | 'bad_request'
  | 'not_found'
  | 'network'
  | 'unknown';

export class AinvoxError extends Error {
  constructor(
    public readonly code: AinvoxErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'AinvoxError';
  }
}

const asString = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;
const asNumber = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string' && v.trim() && Number.isFinite(Number(v))
      ? Number(v)
      : null;

export interface AinvoxCallLogRow {
  uuid: string;
  direction: string | null;
  phoneNumber: string | null;
  virtualNumber: string | null;
  status: string | null;
  durationSeconds: number | null;
  recordingUrl: string | null;
  startedAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  hangupCause: string | null;
  cost: number | null;
}

@Injectable()
export class AinvoxService {
  private readonly logger = new Logger(AinvoxService.name);

  private get baseUrl(): string {
    return process.env.AINVOX_BASE_URL ?? 'https://app.ainvox.com';
  }
  private get publicKey(): string | undefined {
    return process.env.AINVOX_PUBLIC_KEY;
  }
  private get secretKey(): string | undefined {
    return process.env.AINVOX_SECRET_KEY;
  }
  get accountId(): string | undefined {
    return process.env.AINVOX_ACCOUNT_ID;
  }
  get virtualNumber(): string | null {
    return process.env.AINVOX_VIRTUAL_NUMBER ?? null;
  }
  private get timeoutMs(): number {
    return asNumber(process.env.AINVOX_TIMEOUT_MS) ?? 15000;
  }
  private get loginEmail(): string | null {
    return process.env.AINVOX_LOGIN_EMAIL ?? null;
  }
  private get loginPassword(): string | null {
    return process.env.AINVOX_LOGIN_PASSWORD ?? null;
  }

  /** True only when the provider + the keys needed for REST calls are present. */
  get isConfigured(): boolean {
    return (
      process.env.AINVOX_PROVIDER === 'ainvox' &&
      Boolean(this.publicKey && this.secretKey && this.accountId)
    );
  }

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.publicKey}:${this.secretKey}`).toString('base64')}`;
  }

  private async request(
    path: string,
    init?: { method?: string; body?: string },
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method: init?.method ?? 'GET',
        headers: {
          Authorization: this.authHeader(),
          'Content-Type': 'application/json',
        },
        ...(init?.body ? { body: init.body } : {}),
        signal: controller.signal,
      });
    } catch (err) {
      throw new AinvoxError(
        'network',
        err instanceof Error ? err.message : 'network error',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private failFor(status: number): never {
    if (status === 401) throw new AinvoxError('unauthorized', 'Invalid Ainvox keys', status);
    if (status === 400) throw new AinvoxError('bad_request', 'Ainvox rejected the request', status);
    if (status === 404) throw new AinvoxError('not_found', 'Not found', status);
    throw new AinvoxError('unknown', `Ainvox returned status ${status}`, status);
  }

  /** Server click-to-call: rings phoneNumber (the agent); on answer Ainvox fetches flowUrl. */
  async createCall(input: {
    phoneNumber: string;
    callerId: string;
    flowUrl: string;
    callStatusUrl: string;
  }): Promise<{ uuid: string | null; message: string | null }> {
    if (!this.isConfigured) throw new AinvoxError('not_configured', 'Ainvox not configured');
    const res = await this.request('/api/calls', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    if (!res.ok) this.failFor(res.status);
    const p = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { uuid: asString(p.uuid), message: asString(p.message) };
  }

  /** Call log — accountId is REQUIRED by Ainvox (400 without it); phone must be +E.164. */
  async listCallLogs(
    q: {
      phoneNumber?: string;
      direction?: 'inbound' | 'outbound';
      pageNumber?: number;
      perPage?: number;
    } = {},
  ) {
    if (!this.isConfigured) throw new AinvoxError('not_configured', 'Ainvox not configured');
    const params = new URLSearchParams();
    params.set('accountId', this.accountId as string);
    params.set('pageNumber', String(q.pageNumber ?? 1));
    params.set('perPage', String(q.perPage ?? 20));
    if (q.phoneNumber) params.set('phoneNumber', q.phoneNumber);
    if (q.direction) params.set('direction', q.direction);

    const res = await this.request(`/api/calls/log?${params.toString()}`);
    if (!res.ok) this.failFor(res.status);
    const p = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const rows = Array.isArray(p.data) ? (p.data as Record<string, unknown>[]) : [];
    return {
      pageNumber: asNumber(p.currentPage) ?? q.pageNumber ?? 1,
      perPage: asNumber(p.perPage) ?? q.perPage ?? 20,
      totalRows: asNumber(p.totalRows),
      data: rows.map(
        (row): AinvoxCallLogRow => ({
          uuid: asString(row.uuid) ?? '',
          direction: asString(row.direction),
          phoneNumber: asString(row.phoneNumber),
          virtualNumber: asString(row.virtualNumber),
          status: asString(row.status),
          durationSeconds: asNumber(row.duration),
          recordingUrl: asString(row.recordingUrl),
          startedAt: asString(row.startTime) ?? asString(row.dateTime),
          answeredAt: asString(row.answerTime),
          endedAt: asString(row.endTime),
          hangupCause: asString(row.hangupCause),
          cost: asNumber(row.cost),
        }),
      ),
    };
  }

  /** Recording stream — proxied so the secret never reaches the browser. */
  async getRecordingStream(path: string): Promise<{
    body: Readable;
    contentType: string;
    contentLength: number | null;
  }> {
    if (!this.isConfigured) throw new AinvoxError('not_configured', 'Ainvox not configured');
    const res = await this.request(`/api/media/file?path=${encodeURIComponent(path)}`);
    if (!res.ok) this.failFor(res.status);
    if (!res.body) throw new AinvoxError('not_found', 'Empty recording stream');
    const len = res.headers.get('content-length');
    return {
      body: Readable.fromWeb(res.body as unknown as NodeWebReadableStream<Uint8Array>),
      contentType: res.headers.get('content-type') ?? 'audio/wav',
      contentLength: len ? Number(len) : null,
    };
  }
}
