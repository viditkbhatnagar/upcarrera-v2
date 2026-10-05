import type { INestApplication } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';
import type { applications } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { StudentsService } from '../src/students/students.service';
import { RecordAccessService } from '../src/workflow/record-access.service';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { effectiveStageWhere } from '../src/workflow/stages';

/**
 * End-to-end walk of an application through the Phase 1 stage engine on the real
 * DB + stack: accept -> record fee -> verify -> document review -> SA approve
 * (-> student + STU number), plus payment mismatch, send-back, hold/resume, a
 * duplicate transaction number (409) and the record-access denial matrix.
 *
 * Staff are created directly via Prisma (with a known bcrypt password) so the
 * test does not depend on the user-create endpoint, and roles use the seeded ids
 * (counsellor 6, accounts 103, student_affairs 104, telecaller 2, student 4).
 */
describe('Application workflow (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let prisma: PrismaService;

  const TAG = `e2e_wf_${Date.now()}`;
  const PASSWORD = 'Workflow@12345';
  let phoneSeq = 0;

  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};
  const appIds: number[] = [];
  const studentUserIds: number[] = [];

  const uniquePhone = () => `98${String(Date.now()).slice(-7)}${phoneSeq++ % 10}`;

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
        created_at: new Date(),
      },
    });
    tokens[key] = await loginAs(http, username, PASSWORD);
    ids[key] = u.id;
    return u.id;
  }

  /** Advance a fresh lead (stage lead_added) to counsellor_review: 1 -> 2 -> 3. */
  async function advanceToReview(token: string, appId: number): Promise<void> {
    const sent = await request(http)
      .post(`/api/applications/${appId}/send-form`)
      .set(authHeader(token))
      .send({});
    expect(sent.status).toBe(201);
    const received = await request(http)
      .post(`/api/applications/${appId}/mark-form-received`)
      .set(authHeader(token))
      .send({});
    expect(received.status).toBe(201);
  }

  /** Create a lead AND advance it to counsellor_review, for the stage-3+ cases. */
  async function createAtReview(token: string, label: string): Promise<number> {
    const id = await createApplication(token, label);
    await advanceToReview(token, id);
    return id;
  }

  /** Create an application AS a counsellor token and track it for cleanup. */
  async function createApplication(token: string, label: string): Promise<number> {
    const res = await request(http)
      .post('/api/applications')
      .set(authHeader(token))
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

  const PDF = Buffer.from('%PDF-1.4\n%e2e proof\n', 'utf8');
  const todayIso = new Date().toISOString().slice(0, 10);

  function recordPayment(token: string, appId: number, txnRef: string, amount = 5000) {
    return request(http)
      .post(`/api/applications/${appId}/payments`)
      .set(authHeader(token))
      .field('amount', String(amount))
      .field('paid_to', 'upcarrera')
      .field('payment_mode', 'upi')
      .field('txn_ref', txnRef)
      .field('paid_on', todayIso)
      .attach('proof', PDF, { filename: 'proof.pdf', contentType: 'application/pdf' });
  }

  const detail = (token: string, id: number) =>
    request(http).get(`/api/applications/${id}`).set(authHeader(token));

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    prisma = app.get(PrismaService);
    await cleanup();

    // Super Admin token (scope 'all') — retains visibility across every stage, so
    // it can exercise the conversion stage/claim guard directly (CRITIQUE #4).
    tokens.superadmin = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);

    // Resolve role ids through role_key (never hard-coded), as the app does.
    const roleRows = await prisma.user_role.findMany({
      where: {
        role_key: { in: ['counsellor', 'accounts', 'student_affairs', 'telecaller', 'student'] },
      },
      select: { id: true, role_key: true },
    });
    const roleId = (key: string): number => {
      const row = roleRows.find((r) => r.role_key === key);
      if (!row) throw new Error(`role_key ${key} not seeded — apply migration 002`);
      return row.id;
    };

    await mkStaff('counsellorA', roleId('counsellor'));
    await mkStaff('counsellorB', roleId('counsellor'));
    await mkStaff('accounts', roleId('accounts'));
    await mkStaff('sa', roleId('student_affairs'));
    await mkStaff('telecaller', roleId('telecaller'));
    await mkStaff('student', roleId('student'));
  }, 30000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup() {
    if (appIds.length) {
      await prisma.application_payment.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.application_document.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.application_stage_log.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.application_sa_review.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.audit_log.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.qualification.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.applications.deleteMany({ where: { application_id: { in: appIds } } });
    }
    if (studentUserIds.length) {
      await prisma.student_payments.deleteMany({ where: { student_id: { in: studentUserIds } } });
      await prisma.students.deleteMany({ where: { student_id: { in: studentUserIds } } });
      await prisma.users.deleteMany({ where: { id: { in: studentUserIds } } });
    }
    await prisma.users.deleteMany({ where: { username: { startsWith: TAG } } });
  }

  // ---- the happy-path walk, stages 3 -> 7 ----------------------------------

  it('walks a lead from lead_added through counsellor review to a converted student with an STU number', async () => {
    const appId = await createApplication(tokens.counsellorA, 'Walk');

    // Stage 1 (lead_added) for a freshly created lead (CRITIQUE #3).
    const d0 = await detail(tokens.counsellorA, appId);
    expect(d0.status).toBe(200);
    expect(d0.body.data.effective_stage).toBe('lead_added');
    expect(d0.body.data.allowed_actions).toEqual(expect.arrayContaining(['send_form']));

    // 1 -> 2 send the form (interim manual move until the magic link lands).
    const sent = await request(http)
      .post(`/api/applications/${appId}/send-form`)
      .set(authHeader(tokens.counsellorA))
      .send({});
    expect(sent.status).toBe(201);
    expect((await detail(tokens.counsellorA, appId)).body.data.effective_stage).toBe('form_pending');

    // 2 -> 3 mark the form received.
    const received = await request(http)
      .post(`/api/applications/${appId}/mark-form-received`)
      .set(authHeader(tokens.counsellorA))
      .send({});
    expect(received.status).toBe(201);
    const d3 = await detail(tokens.counsellorA, appId);
    expect(d3.body.data.effective_stage).toBe('counsellor_review');
    expect(d3.body.data.allowed_actions).toEqual(expect.arrayContaining(['accept']));

    // 3 -> 4 accept.
    const accept = await request(http)
      .post(`/api/applications/${appId}/accept`)
      .set(authHeader(tokens.counsellorA))
      .send({});
    expect(accept.status).toBe(201);
    expect((await detail(tokens.counsellorA, appId)).body.data.effective_stage).toBe('fee_pending');

    // 4 -> 5 record the registration fee (proof upload).
    const pay = await recordPayment(tokens.counsellorA, appId, 'UTR-WALK-001', 5000);
    expect(pay.status).toBe(201);
    const paymentId = pay.body.data.id as number;
    expect((await detail(tokens.counsellorA, appId)).body.data.effective_stage).toBe('fee_verification');

    // 5 -> 6 Accounts verifies; the verified values mirror into the legacy columns.
    const verify = await request(http)
      .post(`/api/application-payments/${paymentId}/verify`)
      .set(authHeader(tokens.accounts))
      .send({ bank_credit_date: todayIso, verify_note: 'seen on statement' });
    expect(verify.status).toBe(201);
    expect((await detail(tokens.sa, appId)).body.data.effective_stage).toBe('sa_verification');

    // The owner counsellor reads the fee tab (Accounts is now out of scope, since
    // the application has already moved past fee_verification — that is correct).
    const payTab = await request(http)
      .get(`/api/applications/${appId}/payments`)
      .set(authHeader(tokens.counsellorA));
    expect(payTab.status).toBe(200);
    expect(payTab.body.data.legacy_fee.amount).toBe(5000);

    // A document to review (uploaded by the form feature; inserted directly here).
    const doc = await prisma.application_document.create({
      data: {
        application_id: appId,
        label: 'ID proof',
        file_path: 'application_documents/e2e-id.pdf',
        verification_status: 'pending',
        created_at: new Date(),
      },
    });
    const review = await request(http)
      .post(`/api/applications/${appId}/documents/${doc.id}/review`)
      .set(authHeader(tokens.sa))
      .send({ status: 'verified' });
    expect(review.status).toBe(201);

    // 6 -> 7 Student Affairs approves -> conversion.
    const approve = await request(http)
      .post(`/api/applications/${appId}/sa-review`)
      .set(authHeader(tokens.sa))
      .send({
        identity_ok: true,
        eligibility_ok: true,
        legible_ok: true,
        program_ok: true,
        decision: 'approve',
      });
    expect(approve.status).toBe(201);
    expect(approve.body.data.student_user_id).toBeGreaterThan(0);
    expect(approve.body.data.student_no).toMatch(/^STU-\d{4}-\d{6}$/);
    studentUserIds.push(approve.body.data.student_user_id);

    // The application is converted; the student + STU number persist.
    expect((await detail(tokens.sa, appId)).body.data.effective_stage).toBe('converted');
    const studentRow = await prisma.students.findFirst({
      where: { student_id: approve.body.data.student_user_id },
    });
    expect(studentRow?.student_no).toBe(approve.body.data.student_no);

    // The timeline captured the moves.
    const timeline = await request(http)
      .get(`/api/applications/${appId}/timeline`)
      .set(authHeader(tokens.sa));
    expect(timeline.status).toBe(200);
    const events = timeline.body.data.items.map((i: { event: string }) => i.event);
    expect(events).toEqual(
      expect.arrayContaining(['created', 'form_received', 'accepted', 'fee_verified', 'converted']),
    );
  }, 30000);

  // ---- payment mismatch sends it back to the counsellor --------------------

  it('a payment mismatch returns the application to fee_pending', async () => {
    const appId = await createAtReview(tokens.counsellorA, 'Mismatch');
    await request(http).post(`/api/applications/${appId}/accept`).set(authHeader(tokens.counsellorA)).send({});
    const pay = await recordPayment(tokens.counsellorA, appId, 'UTR-MM-001');
    expect(pay.status).toBe(201);

    const mm = await request(http)
      .post(`/api/application-payments/${pay.body.data.id}/mismatch`)
      .set(authHeader(tokens.accounts))
      .send({ reason: 'Amount not received in bank' });
    expect(mm.status).toBe(201);
    expect((await detail(tokens.counsellorA, appId)).body.data.effective_stage).toBe('fee_pending');
  }, 30000);

  // ---- send-back from Student Affairs --------------------------------------

  it('Student Affairs can send an application back to counsellor review', async () => {
    const appId = await createAtReview(tokens.counsellorA, 'SendBack');
    await request(http).post(`/api/applications/${appId}/accept`).set(authHeader(tokens.counsellorA)).send({});
    const pay = await recordPayment(tokens.counsellorA, appId, 'UTR-SB-001');
    await request(http).post(`/api/application-payments/${pay.body.data.id}/verify`).set(authHeader(tokens.accounts)).send({});

    const back = await request(http)
      .post(`/api/applications/${appId}/sa-review`)
      .set(authHeader(tokens.sa))
      .send({ decision: 'send_back', reason: 'Please re-check the ID document' });
    expect(back.status).toBe(201);
    expect((await detail(tokens.counsellorA, appId)).body.data.effective_stage).toBe('counsellor_review');
  }, 30000);

  // ---- hold / resume --------------------------------------------------------

  it('hold then resume keeps the stage and toggles on_hold', async () => {
    const appId = await createAtReview(tokens.counsellorA, 'Hold');
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const hold = await request(http)
      .post(`/api/applications/${appId}/hold`)
      .set(authHeader(tokens.counsellorA))
      .send({ reason: 'Awaiting documents', followup_date: tomorrow });
    expect(hold.status).toBe(201);
    let d = await detail(tokens.counsellorA, appId);
    expect(d.body.data.on_hold).toBe(true);
    expect(d.body.data.effective_stage).toBe('counsellor_review');
    expect(d.body.data.allowed_actions).toEqual(['resume']);

    const resume = await request(http)
      .post(`/api/applications/${appId}/resume`)
      .set(authHeader(tokens.counsellorA))
      .send({});
    expect(resume.status).toBe(201);
    d = await detail(tokens.counsellorA, appId);
    expect(d.body.data.on_hold).toBe(false);
    expect(d.body.data.allowed_actions).toEqual(expect.arrayContaining(['accept']));
  }, 30000);

  // ---- duplicate transaction number ----------------------------------------

  it('rejects a duplicate transaction number with 409', async () => {
    const app1 = await createAtReview(tokens.counsellorA, 'Dup1');
    const app2 = await createAtReview(tokens.counsellorA, 'Dup2');
    await request(http).post(`/api/applications/${app1}/accept`).set(authHeader(tokens.counsellorA)).send({});
    await request(http).post(`/api/applications/${app2}/accept`).set(authHeader(tokens.counsellorA)).send({});

    const first = await recordPayment(tokens.counsellorA, app1, 'DUP-TXN-777');
    expect(first.status).toBe(201);

    // Same number, different spacing/case -> normalised to the same active key.
    const second = await recordPayment(tokens.counsellorA, app2, ' dup txn 777 ');
    expect(second.status).toBe(409);
    expect(String(second.body.message).toLowerCase()).toContain('duplicate transaction');
  }, 30000);

  // ---- record-access denial matrix -----------------------------------------

  it('a counsellor cannot open another counsellor\'s application (403 Access denied)', async () => {
    const appId = await createApplication(tokens.counsellorA, 'Private');
    const mine = await detail(tokens.counsellorA, appId);
    expect(mine.status).toBe(200);

    const theirs = await detail(tokens.counsellorB, appId);
    expect(theirs.status).toBe(403);
    expect(String(theirs.body.message)).toBe('Access denied');
  }, 30000);

  it('a missing application is 404 for an in-scope user', async () => {
    const res = await detail(tokens.counsellorA, 999999999);
    expect(res.status).toBe(404);
  });

  it('Student and Telecaller JWTs are refused on /applications (403)', async () => {
    for (const key of ['student', 'telecaller']) {
      const res = await request(http).get('/api/applications').set(authHeader(tokens[key]));
      expect(res.status).toBe(403);
      expect(String(res.body.message).toLowerCase()).toContain('permission');
    }
  });

  it('GET /auth/me/access describes a counsellor as owner-scoped', async () => {
    const res = await request(http).get('/api/auth/me/access').set(authHeader(tokens.counsellorA));
    expect(res.status).toBe(200);
    expect(res.body.data.role_key).toBe('counsellor');
    expect(res.body.data.scope).toBe('owners');
    expect(res.body.data.owner_ids_count).toBe(1);
  });

  // ---- CRITIQUE #1: PATCH /applications/documents/:id record access -----------

  it("a counsellor cannot edit another counsellor's application document (403)", async () => {
    const appId = await createApplication(tokens.counsellorA, 'DocAccess');
    const doc = await prisma.student_document.create({
      data: {
        label: 'Original label',
        application_id: appId,
        created_at: new Date(),
      },
    });

    // Owner can edit the label.
    const mine = await request(http)
      .patch(`/api/applications/documents/${doc.student_document_id}`)
      .set(authHeader(tokens.counsellorA))
      .send({ label: 'Updated by owner' });
    expect(mine.status).toBe(200);

    // Another counsellor is out of scope -> 403.
    const theirs = await request(http)
      .patch(`/api/applications/documents/${doc.student_document_id}`)
      .set(authHeader(tokens.counsellorB))
      .send({ label: 'Hijacked' });
    expect(theirs.status).toBe(403);
    expect(String(theirs.body.message)).toBe('Access denied');

    // A client-supplied file path is ignored (only metadata changes here).
    const withFile = await request(http)
      .patch(`/api/applications/documents/${doc.student_document_id}`)
      .set(authHeader(tokens.counsellorA))
      .send({ label: 'Keep', file: '/etc/passwd' });
    expect(withFile.status).toBe(200);
    const after = await prisma.student_document.findUnique({
      where: { student_document_id: doc.student_document_id },
    });
    expect(after?.file ?? null).toBeNull();
    expect(after?.label).toBe('Keep');

    await prisma.student_document.deleteMany({ where: { student_document_id: doc.student_document_id } });
  }, 30000);

  // ---- CRITIQUE #2: consultant performance is permission-gated + scoped ------

  it('consultant performance: own 200, another counsellor 403, Student 403', async () => {
    const own = await request(http)
      .get(`/api/consultants/${ids.counsellorA}/performance`)
      .set(authHeader(tokens.counsellorA));
    expect(own.status).toBe(200);

    const other = await request(http)
      .get(`/api/consultants/${ids.counsellorB}/performance`)
      .set(authHeader(tokens.counsellorA));
    expect(other.status).toBe(403);

    const asStudent = await request(http)
      .get(`/api/consultants/${ids.counsellorA}/performance`)
      .set(authHeader(tokens.student));
    expect(asStudent.status).toBe(403);
    expect(String(asStudent.body.message).toLowerCase()).toContain('permission');
  }, 30000);

  // ---- CRITIQUE #5: stage-ownership of hold/resume + held-action refusal -----

  it('a counsellor cannot hold an application at fee_verification (not its owner) -> 403', async () => {
    const appId = await createAtReview(tokens.counsellorA, 'HoldFeeVerif');
    await request(http).post(`/api/applications/${appId}/accept`).set(authHeader(tokens.counsellorA)).send({});
    const pay = await recordPayment(tokens.counsellorA, appId, 'UTR-HOLD-FV-1');
    expect(pay.status).toBe(201);
    expect((await detail(tokens.counsellorA, appId)).body.data.effective_stage).toBe('fee_verification');

    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const held = await request(http)
      .post(`/api/applications/${appId}/hold`)
      .set(authHeader(tokens.counsellorA))
      .send({ reason: 'Not my stage to hold', followup_date: tomorrow });
    expect(held.status).toBe(403);
  }, 30000);

  it('a counsellor cannot resume a hold Accounts placed at fee_verification -> 403', async () => {
    const appId = await createAtReview(tokens.counsellorA, 'ResumeFeeVerif');
    await request(http).post(`/api/applications/${appId}/accept`).set(authHeader(tokens.counsellorA)).send({});
    const pay = await recordPayment(tokens.counsellorA, appId, 'UTR-RESUME-FV-1');
    expect(pay.status).toBe(201);

    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const accountsHold = await request(http)
      .post(`/api/applications/${appId}/hold`)
      .set(authHeader(tokens.accounts))
      .send({ reason: 'Awaiting bank confirmation', followup_date: tomorrow });
    expect(accountsHold.status).toBe(201);

    const counsellorResume = await request(http)
      .post(`/api/applications/${appId}/resume`)
      .set(authHeader(tokens.counsellorA))
      .send({});
    expect(counsellorResume.status).toBe(403);
  }, 30000);

  it('an action on a held application is refused (409 resume first)', async () => {
    const appId = await createAtReview(tokens.counsellorA, 'HeldAction');
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const held = await request(http)
      .post(`/api/applications/${appId}/hold`)
      .set(authHeader(tokens.counsellorA))
      .send({ reason: 'Documents pending', followup_date: tomorrow });
    expect(held.status).toBe(201);

    const accept = await request(http)
      .post(`/api/applications/${appId}/accept`)
      .set(authHeader(tokens.counsellorA))
      .send({});
    expect(accept.status).toBe(409);
  }, 30000);

  // ---- CRITIQUE #4: a send_back landing first makes a racing approve 409 -----

  it('a send_back before approve makes the approve 409 (stage/claim guard)', async () => {
    const appId = await createAtReview(tokens.counsellorA, 'RaceConvert');
    await request(http).post(`/api/applications/${appId}/accept`).set(authHeader(tokens.counsellorA)).send({});
    const pay = await recordPayment(tokens.counsellorA, appId, 'UTR-RACE-001');
    await request(http).post(`/api/application-payments/${pay.body.data.id}/verify`).set(authHeader(tokens.accounts)).send({});
    expect((await detail(tokens.sa, appId)).body.data.effective_stage).toBe('sa_verification');

    const back = await request(http)
      .post(`/api/applications/${appId}/sa-review`)
      .set(authHeader(tokens.sa))
      .send({ decision: 'send_back', reason: 'Re-check documents before approval' });
    expect(back.status).toBe(201);

    // The app is now at counsellor_review. A racing approve (via Super Admin, which
    // keeps visibility across stages) is refused: it is no longer at sa_verification,
    // so the stage check — and, behind it, the stage-guarded conversion claim — 409s.
    const approve = await request(http)
      .post(`/api/applications/${appId}/sa-review`)
      .set(authHeader(tokens.superadmin))
      .send({ identity_ok: true, eligibility_ok: true, legible_ok: true, program_ok: true, decision: 'approve' });
    expect(approve.status).toBe(409);
  }, 30000);

  // ---- CRITIQUE #6: a zero-document application cannot be approved -----------

  it('approval requires a verified document: zero-document approve is 400, then converts once verified', async () => {
    const appId = await createAtReview(tokens.counsellorA, 'ZeroDoc');
    await request(http).post(`/api/applications/${appId}/accept`).set(authHeader(tokens.counsellorA)).send({});
    const pay = await recordPayment(tokens.counsellorA, appId, 'UTR-ZERODOC-1');
    await request(http).post(`/api/application-payments/${pay.body.data.id}/verify`).set(authHeader(tokens.accounts)).send({});
    expect((await detail(tokens.sa, appId)).body.data.effective_stage).toBe('sa_verification');

    // No documents at all -> approval refused (400), application stays at sa_verification.
    const zero = await request(http)
      .post(`/api/applications/${appId}/sa-review`)
      .set(authHeader(tokens.sa))
      .send({ identity_ok: true, eligibility_ok: true, legible_ok: true, program_ok: true, decision: 'approve' });
    expect(zero.status).toBe(400);
    expect(String(zero.body.message).toLowerCase()).toContain('document');
    expect((await detail(tokens.sa, appId)).body.data.effective_stage).toBe('sa_verification');

    // A pending (unverified) document still blocks approval.
    const doc = await prisma.application_document.create({
      data: {
        application_id: appId,
        label: 'ID proof',
        file_path: 'application_documents/zerodoc-id.pdf',
        verification_status: 'pending',
        created_at: new Date(),
      },
    });
    const stillPending = await request(http)
      .post(`/api/applications/${appId}/sa-review`)
      .set(authHeader(tokens.sa))
      .send({ identity_ok: true, eligibility_ok: true, legible_ok: true, program_ok: true, decision: 'approve' });
    expect(stillPending.status).toBe(400);

    // Verify it, then approval converts.
    await request(http)
      .post(`/api/applications/${appId}/documents/${doc.id}/review`)
      .set(authHeader(tokens.sa))
      .send({ status: 'verified' });
    const approve = await request(http)
      .post(`/api/applications/${appId}/sa-review`)
      .set(authHeader(tokens.sa))
      .send({ identity_ok: true, eligibility_ok: true, legible_ok: true, program_ok: true, decision: 'approve' });
    expect(approve.status).toBe(201);
    expect(approve.body.data.student_no).toMatch(/^STU-\d{4}-\d{6}$/);
    studentUserIds.push(approve.body.data.student_user_id);
  }, 30000);

  // ---- CRITIQUE #1 twin: record access on PATCH/DELETE /students/documents/:id --

  it("students/documents: counsellor B cannot PATCH/DELETE counsellor A's document (403); owner ok; client file ignored", async () => {
    const appId = await createApplication(tokens.counsellorA, 'StudentDocAccess');
    const doc = await prisma.student_document.create({
      data: { label: 'Original label', application_id: appId, created_at: new Date() },
    });
    const docId = doc.student_document_id;

    // Owner can edit the label.
    const ownerEdit = await request(http)
      .patch(`/api/students/documents/${docId}`)
      .set(authHeader(tokens.counsellorA))
      .send({ label: 'Updated by owner' });
    expect(ownerEdit.status).toBe(200);

    // Another counsellor is out of scope -> 403 on PATCH and DELETE.
    const otherPatch = await request(http)
      .patch(`/api/students/documents/${docId}`)
      .set(authHeader(tokens.counsellorB))
      .send({ label: 'Hijacked' });
    expect(otherPatch.status).toBe(403);
    expect(String(otherPatch.body.message)).toBe('Access denied');

    const otherDelete = await request(http)
      .delete(`/api/students/documents/${docId}`)
      .set(authHeader(tokens.counsellorB));
    expect(otherDelete.status).toBe(403);
    expect(String(otherDelete.body.message)).toBe('Access denied');

    // A client-supplied file path is ignored (only metadata changes here).
    const withFile = await request(http)
      .patch(`/api/students/documents/${docId}`)
      .set(authHeader(tokens.counsellorA))
      .send({ label: 'Keep', file: '/etc/passwd' });
    expect(withFile.status).toBe(200);
    const after = await prisma.student_document.findUnique({
      where: { student_document_id: docId },
    });
    expect(after?.file ?? null).toBeNull();
    expect(after?.label).toBe('Keep');

    // The owner can delete (soft delete).
    const ownerDelete = await request(http)
      .delete(`/api/students/documents/${docId}`)
      .set(authHeader(tokens.counsellorA));
    expect(ownerDelete.status).toBe(200);
    const afterDelete = await prisma.student_document.findUnique({
      where: { student_document_id: docId },
    });
    expect(afterDelete?.deleted_at).not.toBeNull();

    await prisma.student_document.deleteMany({ where: { student_document_id: docId } });
  }, 30000);

  // ---- stage-ownership of corrections (CRITIQUE #5): TL/manager cannot edit ------

  it("corrections: a Team Leader who can VIEW a team member's row cannot correct it (403); the owner can (200)", async () => {
    const tlRole = await prisma.user_role.findFirst({
      where: { role_key: 'team_leader' },
      select: { id: true },
    });
    if (!tlRole) throw new Error('role_key team_leader not seeded — apply migration 002');
    const reviewPerm = await prisma.permissions.findFirst({
      where: { slug: 'crm:applications.review', deleted_at: null },
      select: { id: true },
    });
    if (!reviewPerm) throw new Error('permission crm:applications.review not seeded');

    // A Team Leader needs the review slug to even reach the corrections route, so
    // grant it to the role for this test — the point under test is stage-OWNERSHIP,
    // which must refuse the TL AFTER the slug + view guards have passed.
    const existingGrant = await prisma.role_permissions.findFirst({
      where: { role_id: tlRole.id, permission_id: reviewPerm.id, deleted_at: null },
      select: { id: true },
    });
    let grantId: number | null = null;
    if (!existingGrant) {
      const created = await prisma.role_permissions.create({
        data: { role_id: tlRole.id, permission_id: reviewPerm.id, created_on: new Date() },
      });
      grantId = created.id;
    }
    PermissionsGuard.invalidateCache(tlRole.id);

    try {
      // A Team Leader who sees counsellorA through the reports_to hierarchy.
      await mkStaff('correctTL', tlRole.id);
      await prisma.users.update({
        where: { id: ids.counsellorA },
        data: { reports_to: ids.correctTL },
      });
      app.get(RecordAccessService, { strict: false }).invalidate();

      const appId = await createAtReview(tokens.counsellorA, 'CorrectOwnership');

      // The TL can VIEW the row (reports_to scope)...
      const view = await detail(tokens.correctTL, appId);
      expect(view.status).toBe(200);

      // ...but correcting applicant fields is refused — not the stage owner — and
      // specifically by the stage-ownership check, not the permission guard.
      const tlCorrect = await request(http)
        .patch(`/api/applications/${appId}/corrections`)
        .set(authHeader(tokens.correctTL))
        .send({ remarks: 'TL must not be able to write this' });
      expect(tlCorrect.status).toBe(403);
      expect(String(tlCorrect.body.message).toLowerCase()).toContain('not allowed');

      // The owning counsellor can correct.
      const ownerCorrect = await request(http)
        .patch(`/api/applications/${appId}/corrections`)
        .set(authHeader(tokens.counsellorA))
        .send({ remarks: 'Owner correction' });
      expect(ownerCorrect.status).toBe(200);
    } finally {
      await prisma.users.update({
        where: { id: ids.counsellorA },
        data: { reports_to: null },
      });
      if (grantId != null) {
        await prisma.role_permissions.delete({ where: { id: grantId } });
      }
      PermissionsGuard.invalidateCache(tlRole.id);
      app.get(RecordAccessService, { strict: false }).invalidate();
    }
  }, 30000);

  // ---- CRITIQUE #4: the conversion CLAIM guard itself, not just the precheck -----

  it('the conversion claim 409s on a row that is no longer an unheld sa_verification row', async () => {
    const studentsSvc = app.get(StudentsService, { strict: false });
    const saActor = { userId: ids.sa, roleId: null as number | null };
    const runClaim = (application: applications) =>
      prisma.$transaction((tx) =>
        studentsSvc.runConversion(tx, application, saActor, {
          hashedPassword: 'x',
          event: 'converted',
          claimStageWhere: effectiveStageWhere('sa_verification'),
        }),
      );

    // (a) Stage guard: a row at counsellor_review fails the sa_verification claim
    //     even though the SA-approve precheck is bypassed here (direct runConversion).
    const stageAppId = await createApplication(tokens.counsellorA, 'ClaimStage');
    const stageApp = await prisma.applications.update({
      where: { application_id: stageAppId },
      data: { stage: 'counsellor_review', is_archived: false, hold_at: null, is_converted: null },
    });
    await expect(runClaim(stageApp)).rejects.toBeInstanceOf(ConflictException);

    // (b) Hold guard: an sa_verification row that is ON HOLD fails the claim.
    const heldAppId = await createApplication(tokens.counsellorA, 'ClaimHold');
    const heldApp = await prisma.applications.update({
      where: { application_id: heldAppId },
      data: { stage: 'sa_verification', is_archived: false, hold_at: new Date(), is_converted: null },
    });
    await expect(runClaim(heldApp)).rejects.toBeInstanceOf(ConflictException);

    // Neither row was converted — the claim threw before any write.
    for (const id of [stageAppId, heldAppId]) {
      const row = await prisma.applications.findUnique({ where: { application_id: id } });
      expect(row?.is_converted ?? null).not.toBe(1);
    }
  }, 30000);
});
