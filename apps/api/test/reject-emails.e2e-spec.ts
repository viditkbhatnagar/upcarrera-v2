import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailService, type SendEmailParams } from '../src/integrations/email.service';
import { escapeHtml } from '../src/common/html-escape';

/**
 * Regression for the reject/mismatch emails that were NEVER delivered: both call
 * sites passed only { reason }, so EmailTemplatesService.render() threw on the
 * other required placeholders and the catch swallowed it. These specs drive a real
 * application to the reject (SA) and mismatch (Accounts) actions and assert, via
 * the EmailService test seam (isConfigured + a sendEmail spy — never real SMTP),
 * that:
 *   - application-rejected / payment-rejected ARE sent (subject + html), and
 *   - a staff reason containing markup is HTML-escaped in the body (SECURITY MEDIUM 2),
 *   - the real counsellor / fee / program values are resolved into the email.
 */
describe('Reject + mismatch emails (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let prisma: PrismaService;
  let sendSpy: jest.SpyInstance<Promise<{ messageId?: string }>, [SendEmailParams]>;

  const TAG = `e2e_re_${Date.now()}`;
  const PASSWORD = 'Reject@12345';
  let phoneSeq = 0;
  const uniquePhone = () => `97${String(Date.now()).slice(-7)}${phoneSeq++ % 10}`;

  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};
  const appIds: number[] = [];

  const todayIso = new Date().toISOString().slice(0, 10);

  async function mkStaff(key: string, roleId: number): Promise<number> {
    const username = `${TAG}_${key}`;
    const hash = await bcrypt.hash(PASSWORD, 10);
    const u = await prisma.users.create({
      data: {
        name: `${TAG} ${key}`,
        username,
        role_id: roleId,
        status: 1,
        password: hash,
        phone: uniquePhone(),
        email: `${username}@e2e.local`.toLowerCase(),
        created_at: new Date(),
      },
    });
    tokens[key] = await loginAs(http, username, PASSWORD);
    ids[key] = u.id;
    return u.id;
  }

  async function createApplication(label: string): Promise<number> {
    const res = await request(http)
      .post('/api/applications')
      .set(authHeader(tokens.counsellor))
      .send({
        name: `${TAG} ${label}`,
        phone: uniquePhone(),
        email: `${TAG}.${label}@e2e.local`.toLowerCase(),
        address: 'E2E Street',
      });
    expect(res.status).toBe(201);
    const id = res.body.data.application_id as number;
    appIds.push(id);
    return id;
  }

  async function advanceToFeePending(appId: number): Promise<void> {
    await request(http).post(`/api/applications/${appId}/send-form`).set(authHeader(tokens.counsellor)).send({});
    await request(http).post(`/api/applications/${appId}/mark-form-received`).set(authHeader(tokens.counsellor)).send({});
    const accept = await request(http).post(`/api/applications/${appId}/accept`).set(authHeader(tokens.counsellor)).send({});
    expect(accept.status).toBe(201);
  }

  function recordPayment(appId: number, txnRef: string, amount: number) {
    return request(http)
      .post(`/api/applications/${appId}/payments`)
      .set(authHeader(tokens.counsellor))
      .field('amount', String(amount))
      .field('paid_to', 'upcarrera')
      .field('payment_mode', 'upi')
      .field('txn_ref', txnRef)
      .field('paid_on', todayIso)
      .attach('proof', Buffer.from('%PDF-1.4\n%e2e\n', 'utf8'), {
        filename: 'proof.pdf',
        contentType: 'application/pdf',
      });
  }

  /** Stamp a seeded program onto the application so program-label resolution runs. */
  async function attachProgram(appId: number): Promise<{ university?: string; course?: string; intake?: string }> {
    const [university, course, intake] = await Promise.all([
      prisma.university.findFirst({ where: { deleted_at: null }, select: { id: true, title: true } }),
      prisma.course.findFirst({ where: { deleted_at: null }, select: { id: true, title: true } }),
      prisma.intake.findFirst({ where: { deleted_at: null }, select: { id: true, name: true } }),
    ]);
    await prisma.applications.update({
      where: { application_id: appId },
      data: {
        university_id: university?.id ?? null,
        course_id: course?.id ?? null,
        intake_id: intake?.id ?? null,
      },
    });
    return {
      university: university?.title?.trim() || undefined,
      course: course?.title?.trim() || undefined,
      intake: intake?.name?.trim() || undefined,
    };
  }

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    prisma = app.get(PrismaService);
    await cleanup();

    // EmailService test seam: pretend Graph is configured and capture every send
    // instead of hitting SMTP. render() still runs for real against the HTML files.
    const email = app.get(EmailService);
    jest.spyOn(email, 'isConfigured', 'get').mockReturnValue(true);
    sendSpy = jest.spyOn(email, 'sendEmail').mockResolvedValue({ messageId: 'test' });

    tokens.superadmin = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);

    const roleRows = await prisma.user_role.findMany({
      where: { role_key: { in: ['counsellor', 'accounts', 'student_affairs'] } },
      select: { id: true, role_key: true },
    });
    const roleId = (key: string): number => {
      const row = roleRows.find((r) => r.role_key === key);
      if (!row) throw new Error(`role_key ${key} not seeded — apply migration 002`);
      return row.id;
    };

    await mkStaff('counsellor', roleId('counsellor'));
    await mkStaff('accounts', roleId('accounts'));
    await mkStaff('sa', roleId('student_affairs'));
  }, 30000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup() {
    if (appIds.length) {
      await prisma.application_payment.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.application_stage_log.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.application_sa_review.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.audit_log.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.applications.deleteMany({ where: { application_id: { in: appIds } } });
    }
    await prisma.users.deleteMany({ where: { username: { startsWith: TAG } } });
  }

  it('SA reject sends application-rejected with resolved vars and an ESCAPED reason', async () => {
    const appId = await createApplication('Reject');
    const program = await attachProgram(appId);
    await advanceToFeePending(appId);
    const pay = await recordPayment(appId, `UTR-RE-RJ-${Date.now()}`, 5000);
    expect(pay.status).toBe(201);
    const verify = await request(http)
      .post(`/api/application-payments/${pay.body.data.id}/verify`)
      .set(authHeader(tokens.accounts))
      .send({ bank_credit_date: todayIso });
    expect(verify.status).toBe(201);

    sendSpy.mockClear();
    const evil = '<script>alert(1)</script> documents illegible';
    const reject = await request(http)
      .post(`/api/applications/${appId}/sa-review`)
      .set(authHeader(tokens.sa))
      .send({ decision: 'reject', reason: evil });
    expect(reject.status).toBe(201);
    expect(reject.body.data.decision).toBe('rejected');

    // The email WAS sent (the bug was that render() threw and it never was).
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const sent = sendSpy.mock.calls[0][0];
    expect(sent.subject.length).toBeGreaterThan(0);
    expect(sent.subject).not.toContain('{{');
    expect(sent.html.length).toBeGreaterThan(0);
    expect(sent.html).not.toMatch(/\{\{[^}]+\}\}/); // no unfilled placeholder

    // The staff reason is HTML-escaped, never live markup.
    expect(sent.html).not.toContain('<script>alert(1)</script>');
    expect(sent.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');

    // Resolved counsellor + program labels made it into the body.
    expect(sent.html).toContain(TAG); // counsellor name first token
    if (program.university) expect(sent.html).toContain(escapeHtml(program.university));
    if (program.course) expect(sent.html).toContain(escapeHtml(program.course));
  }, 30000);

  it('payment mismatch sends payment-rejected with real fee/counsellor values and an ESCAPED reason', async () => {
    const appId = await createApplication('Mismatch');
    const program = await attachProgram(appId);
    await advanceToFeePending(appId);
    const txn = `UTR-RE-MM-${Date.now()}`;
    const pay = await recordPayment(appId, txn, 7500);
    expect(pay.status).toBe(201);

    sendSpy.mockClear();
    const evil = '<img src=x onerror=alert(2)> amount not received';
    const mm = await request(http)
      .post(`/api/application-payments/${pay.body.data.id}/mismatch`)
      .set(authHeader(tokens.accounts))
      .send({ reason: evil });
    expect(mm.status).toBe(201);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const sent = sendSpy.mock.calls[0][0];
    expect(sent.subject.length).toBeGreaterThan(0);
    expect(sent.html).not.toMatch(/\{\{[^}]+\}\}/);

    // Escaped reason — not live markup.
    expect(sent.html).not.toContain('<img src=x onerror=alert(2)>');
    expect(sent.html).toContain('&lt;img src=x onerror=alert(2)&gt;');

    // Real fee values from the payment row being rejected.
    expect(sent.html).toContain('7,500'); // fee_amount formatted
    expect(sent.html).toContain(txn); // payment_reference
    expect(sent.html).toContain('upi'); // payment_mode
    // Real counsellor value (first token of the owning counsellor's name).
    expect(sent.html).toContain(TAG);
    if (program.course) expect(sent.html).toContain(escapeHtml(program.course));
  }, 30000);

  it('payment verify sends fee-verified to the counsellor with resolved vars (not the student)', async () => {
    const appId = await createApplication('Verify');
    const program = await attachProgram(appId);
    await advanceToFeePending(appId);
    const txn = `UTR-RE-VF-${Date.now()}`;
    const pay = await recordPayment(appId, txn, 6500);
    expect(pay.status).toBe(201);

    sendSpy.mockClear();
    const verify = await request(http)
      .post(`/api/application-payments/${pay.body.data.id}/verify`)
      .set(authHeader(tokens.accounts))
      .send({ bank_credit_date: todayIso });
    expect(verify.status).toBe(201);

    // fee-verified is a counsellor-facing notice; it must render (the bug was that
    // it threw on missing vars) and go to the OWNING COUNSELLOR, never the student.
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const sent = sendSpy.mock.calls[0][0];
    expect(sent.subject.length).toBeGreaterThan(0);
    expect(sent.html).not.toMatch(/\{\{[^}]+\}\}/); // no unfilled placeholder
    expect(sent.html).toContain('6,500'); // fee_amount formatted
    expect(sent.html).toContain(txn); // payment_reference
    expect(sent.html).toContain(TAG); // counsellor name first token
    // Delivered to the owning counsellor (mkStaff emails are `${TAG}_<key>@e2e.local`),
    // never to the applicant.
    expect(sent.to).toBe(`${TAG}_counsellor@e2e.local`);
  }, 30000);
});
