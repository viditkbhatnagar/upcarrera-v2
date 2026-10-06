import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { bootApp, loginAs, authHeader, ADMIN_CREDENTIALS } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailService, type SendEmailParams } from '../src/integrations/email.service';
import { PlatformService } from '../src/platform/platform.service';

/**
 * Self-serve password reset (migration 004) + session invalidation.
 *
 * forgot-password runs in the BACKGROUND (constant-time response, anti-enumeration),
 * so the code only appears in the emailed HTML a moment after the 200. We spy on
 * EmailService.sendEmail (never real SMTP), wait for the send, and lift the code
 * out of the HTML — exactly what a recipient reads. Asserts the security
 * invariants: no enumeration, a working happy path, attempt-burning, expiry, and
 * that a reset (self-serve OR admin) kills tokens issued before it.
 */
describe('Password reset (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let prisma: PrismaService;
  let sendSpy: jest.SpyInstance<Promise<{ messageId?: string }>, [SendEmailParams]>;

  const TAG = `e2e_pwr_${Date.now()}`;
  const PASSWORD = 'InitialPw@123';
  const NON_STUDENT_ROLE = 101; // seeded by migration 002 (never the student role)
  let phoneSeq = 0;
  const uniquePhone = () => `96${String(Date.now()).slice(-7)}${phoneSeq++ % 10}`;

  const userIds: number[] = [];

  async function mkUser(key: string): Promise<{ id: number; username: string; email: string }> {
    const username = `${TAG}_${key}`;
    const email = `${username}@e2e.local`.toLowerCase();
    const hash = await bcrypt.hash(PASSWORD, 10);
    const u = await prisma.users.create({
      data: {
        name: `${TAG} ${key}`,
        username,
        email,
        role_id: NON_STUDENT_ROLE,
        status: 1,
        password: hash,
        phone: uniquePhone(),
        created_at: new Date(),
      },
    });
    userIds.push(u.id);
    return { id: u.id, username, email };
  }

  /** Wait for the next background reset email, then return its 6-digit code. */
  async function waitForCode(fromCount: number): Promise<string> {
    for (let i = 0; i < 100; i++) {
      if (sendSpy.mock.calls.length > fromCount) {
        const html = sendSpy.mock.calls[sendSpy.mock.calls.length - 1][0].html;
        const m = html.match(/\b(\d{6})\b/);
        if (m) return m[1];
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('reset email was not sent within the wait window');
  }

  const forgot = (identifier: string) =>
    request(http).post('/api/public/auth/forgot-password').send({ identifier });
  const reset = (identifier: string, otp: string, password: string) =>
    request(http).post('/api/public/auth/reset-password').send({ identifier, otp, password });

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    prisma = app.get(PrismaService);
    const email = app.get(EmailService);
    jest.spyOn(email, 'isConfigured', 'get').mockReturnValue(true);
    sendSpy = jest.spyOn(email, 'sendEmail').mockResolvedValue({ messageId: 'test' });
    await cleanup();
  }, 30000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup() {
    if (userIds.length) {
      await prisma.password_reset.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.audit_log.deleteMany({ where: { actor_id: { in: userIds } } });
    }
    await prisma.users.deleteMany({ where: { username: { startsWith: TAG } } });
  }

  it('does not enumerate: unknown and known identifiers both return the same 200', async () => {
    const user = await mkUser('enum');
    sendSpy.mockClear();
    const unknown = await forgot(`${TAG}_nobody@e2e.local`);
    const known = await forgot(user.email);
    expect(unknown.status).toBe(200);
    expect(known.status).toBe(200);
    expect(unknown.body.message).toBe(known.body.message);
    expect(unknown.body.data).toEqual(known.body.data);
    await waitForCode(0); // let the known-user background send settle
  }, 30000);

  it('happy path: emailed code resets the password and the new one logs in', async () => {
    const user = await mkUser('happy');
    sendSpy.mockClear();
    expect((await forgot(user.email)).status).toBe(200);
    const code = await waitForCode(0);

    const newPw = 'BrandNew@456';
    expect((await reset(user.email, code, newPw)).status).toBe(200);

    await expect(loginAs(http, user.username, PASSWORD)).rejects.toBeDefined();
    expect(typeof (await loginAs(http, user.username, newPw))).toBe('string');
  }, 30000);

  it('wrong code is rejected generically and burns after 5 attempts', async () => {
    const user = await mkUser('brute');
    sendSpy.mockClear();
    await forgot(user.email);
    const good = await waitForCode(0);
    const wrong = good === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i++) {
      expect((await reset(user.email, wrong, 'Whatever@789')).status).toBe(400);
    }
    // Code is now burned — even the CORRECT code no longer works.
    expect((await reset(user.email, good, 'Whatever@789')).status).toBe(400);
  }, 30000);

  it('expired code is rejected', async () => {
    const user = await mkUser('expired');
    sendSpy.mockClear();
    await forgot(user.email);
    const code = await waitForCode(0);
    await prisma.password_reset.updateMany({
      where: { user_id: user.id, consumed_at: null, revoked_at: null },
      data: { expires_at: new Date(Date.now() - 60_000) },
    });
    expect((await reset(user.email, code, 'TooLate@123')).status).toBe(400);
  }, 30000);

  it('self-serve reset invalidates tokens issued before it', async () => {
    const user = await mkUser('session');
    const oldToken = await loginAs(http, user.username, PASSWORD);
    expect((await request(http).get('/api/auth/me').set(authHeader(oldToken))).status).toBe(200);

    // Ensure the reset lands in a strictly later second than the token's iat.
    await new Promise((r) => setTimeout(r, 1200));
    sendSpy.mockClear();
    await forgot(user.email);
    const code = await waitForCode(0);
    expect((await reset(user.email, code, 'Rotated@999')).status).toBe(200);

    // The pre-reset token is now dead.
    expect((await request(http).get('/api/auth/me').set(authHeader(oldToken))).status).toBe(401);
  }, 30000);

  it('admin reset sets a new password and invalidates the user’s old sessions', async () => {
    const user = await mkUser('admin');
    const oldToken = await loginAs(http, user.username, PASSWORD);
    expect((await request(http).get('/api/auth/me').set(authHeader(oldToken))).status).toBe(200);

    const adminToken = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);
    await new Promise((r) => setTimeout(r, 1200));
    const newPw = 'AdminSet@321';
    const res = await request(http)
      .post(`/api/users/${user.id}/reset-password`)
      .set(authHeader(adminToken))
      .send({ password: newPw });
    expect(res.status).toBe(201);

    expect((await request(http).get('/api/auth/me').set(authHeader(oldToken))).status).toBe(401);
    expect(typeof (await loginAs(http, user.username, newPw))).toBe('string');
  }, 30000);

  it('M3: only a Super Admin can reset a Super Admin account', async () => {
    const platform = app.get(PlatformService);
    // A DISPOSABLE super-admin (role 1) target — never the shared seed admin,
    // whose password other suites depend on.
    const saTarget = await prisma.users.create({
      data: {
        name: `${TAG} saTarget`,
        username: `${TAG}_saTarget`,
        email: `${TAG}_satarget@e2e.local`,
        role_id: 1,
        status: 1,
        password: await bcrypt.hash(PASSWORD, 10),
        phone: uniquePhone(),
        created_at: new Date(),
      },
    });
    userIds.push(saTarget.id);
    const normal = await mkUser('m3normal');
    const NON_SUPER_ADMIN = 102;

    // A non-super-admin is refused on a super-admin target...
    await expect(
      platform.resetPassword(saTarget.id, { password: 'Blocked@1234' }, NON_SUPER_ADMIN),
    ).rejects.toThrow('Only a Super Admin can reset a Super Admin account.');
    // ...but may reset a normal user...
    await expect(
      platform.resetPassword(normal.id, { password: 'NormalOk@123' }, NON_SUPER_ADMIN),
    ).resolves.toBeDefined();
    // ...and a Super Admin may reset a Super Admin.
    await expect(
      platform.resetPassword(saTarget.id, { password: 'SAOnly@1234' }, 1),
    ).resolves.toBeDefined();
  }, 30000);
});
