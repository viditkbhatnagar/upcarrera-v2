import { ServiceUnavailableException } from '@nestjs/common';
import { EmailService } from '../src/integrations/email.service';

/**
 * Reliability proof for the "I had to click Send several times before the
 * application-form email actually went" report (Sharon). The Microsoft Graph
 * sendMail call (and the token endpoint) occasionally answer a single request
 * with a throttle (429) or a transient 5xx/timeout; EmailService now retries
 * those with backoff so one click reliably sends, while non-transient errors
 * still fail fast and a 202 never double-sends.
 *
 * Pure unit test: instantiates EmailService directly and stubs global.fetch, so
 * it needs no database and no Nest boot. Jest sets NODE_ENV=test, which zeroes
 * the backoff, so the retries run instantly.
 */

type FakeRes = {
  status: number;
  ok?: boolean;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
  headers?: { get: (k: string) => string | null };
  __throw?: boolean;
};

const hdrs = (retryAfter?: string) => ({
  get: (k: string) => (k.toLowerCase() === 'retry-after' ? (retryAfter ?? null) : null),
});

const tokenOk: FakeRes = {
  status: 200,
  ok: true,
  json: async () => ({ access_token: 'tok', expires_in: 3600 }),
  text: async () => '',
  headers: hdrs(),
};
const tokenBusy: FakeRes = { status: 503, ok: false, text: async () => 'busy', headers: hdrs() };
const send202: FakeRes = { status: 202, text: async () => '', headers: hdrs() };
const send503 = (retryAfter?: string): FakeRes => ({
  status: 503,
  text: async () => 'throttled',
  headers: hdrs(retryAfter),
});
const send401: FakeRes = { status: 401, text: async () => 'token expired', headers: hdrs() };
const send400: FakeRes = { status: 400, text: async () => 'bad request', headers: hdrs() };
const netErr: FakeRes = { status: 0, __throw: true };

/**
 * Stub global.fetch with ordered per-endpoint queues. Token calls go to the
 * Microsoft login host, send calls to Graph; each dequeues from its own list so
 * token refreshes and send retries can be asserted independently.
 */
function installFetch(tokenSeq: FakeRes[], sendSeq: FakeRes[]) {
  const tq = [...tokenSeq];
  const sq = [...sendSeq];
  const fn = jest.fn(async (url: string) => {
    const isToken = url.includes('login.microsoftonline.com');
    const next = (isToken ? tq : sq).shift();
    if (!next) throw new Error(`unexpected ${isToken ? 'token' : 'send'} fetch: ${url}`);
    if (next.__throw) throw new Error('ECONNRESET');
    return next as unknown as Response;
  });
  (global as unknown as { fetch: unknown }).fetch = fn;
  return fn;
}

describe('EmailService transient-failure retry (unit)', () => {
  const saved: Record<string, string | undefined> = {};
  const KEYS = ['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MAIL_FROM_ADDRESS', 'NODE_ENV'];
  let svc: EmailService;

  const params = { to: 'student@example.com', name: 'Student', subject: 'Your application form', html: '<p>hi</p>' };

  beforeAll(() => {
    for (const k of KEYS) saved[k] = process.env[k];
    process.env.NODE_ENV = 'test';
  });
  afterAll(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  beforeEach(() => {
    process.env.MS_TENANT_ID = 'tenant';
    process.env.MS_CLIENT_ID = 'client';
    process.env.MS_CLIENT_SECRET = 'secret';
    process.env.MAIL_FROM_ADDRESS = 'hello@upcarrera.com';
    svc = new EmailService();
    jest.spyOn((svc as unknown as { logger: { error: () => void } }).logger, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('retries a transient 503 from Graph and the caller sees success', async () => {
    const fn = installFetch([tokenOk], [send503(), send202]);
    await expect(svc.sendEmail(params)).resolves.toEqual({});
    expect(fn).toHaveBeenCalledTimes(3); // 1 token (cached) + 2 send attempts
  });

  it('retries a network error on the send and succeeds', async () => {
    const fn = installFetch([tokenOk], [netErr, send202]);
    await expect(svc.sendEmail(params)).resolves.toEqual({});
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('refreshes the token and retries once on a 401', async () => {
    const fn = installFetch([tokenOk, tokenOk], [send401, send202]);
    await expect(svc.sendEmail(params)).resolves.toEqual({});
    expect(fn).toHaveBeenCalledTimes(4); // token fetched twice (cache dropped) + 2 send
  });

  it('honours Retry-After on a 429/503 without the caller seeing an error', async () => {
    const fn = installFetch([tokenOk], [send503('1'), send202]);
    await expect(svc.sendEmail(params)).resolves.toEqual({});
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('gives up after the attempt cap on a persistent 503 and throws ServiceUnavailable', async () => {
    const fn = installFetch([tokenOk], [send503(), send503(), send503()]);
    await expect(svc.sendEmail(params)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fn).toHaveBeenCalledTimes(4); // 1 token + 3 send attempts
  });

  it('does not retry a non-retryable 4xx (fails fast)', async () => {
    const fn = installFetch([tokenOk], [send400]);
    await expect(svc.sendEmail(params)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fn).toHaveBeenCalledTimes(2); // 1 token + exactly 1 send, no retry
  });

  it('retries a transient failure from the token endpoint', async () => {
    const fn = installFetch([tokenBusy, tokenOk], [send202]);
    await expect(svc.sendEmail(params)).resolves.toEqual({});
    expect(fn).toHaveBeenCalledTimes(3); // 2 token + 1 send
  });

  it('reuses the cached token across consecutive sends', async () => {
    const fn = installFetch([tokenOk], [send202, send202]);
    await svc.sendEmail(params);
    await svc.sendEmail(params);
    expect(fn).toHaveBeenCalledTimes(3); // 1 token + 2 send
  });

  it('throws when the mailer is not configured', async () => {
    delete process.env.MS_CLIENT_SECRET;
    const unconfigured = new EmailService();
    await expect(unconfigured.sendEmail(params)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
