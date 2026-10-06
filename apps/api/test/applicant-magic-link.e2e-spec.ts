import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailService, type SendEmailParams } from '../src/integrations/email.service';

/**
 * WS5 (AP03) — magic link + public student application form.
 *
 * Exercises the full lifecycle on the real DB + stack and the NON-NEGOTIABLE
 * security properties: hash-only token storage, the revocable session (CRITIQUE
 * #1), the 5/24h cap, per-IP throttling (429), magic-byte / size / quota upload
 * rejection, forbidNonWhitelisted on the public DTO, the applicant-actor submit
 * that does NOT create a student, and cross-application session isolation.
 *
 * EmailService.sendEmail is stubbed so issuing works without a live mailer and so
 * the raw token can be read from the rendered email HTML (it is never returned by
 * the API nor stored in the DB).
 */
describe('Applicant magic link + public form (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let prisma: PrismaService;

  const TAG = `e2e_aml_${Date.now()}`;
  const PASSWORD = 'Applicant@12345';
  let phoneSeq = 0;
  const uniquePhone = () => `98${String(Date.now()).slice(-7)}${phoneSeq++ % 10}`;

  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};
  const appIds: number[] = [];
  let courseId: number;
  let documentTypeId: number;
  let requirementId: number;

  let lastEmail: SendEmailParams | null = null;

  const APPLICANT_HEADER = 'X-Applicant-Session';
  const PDF_BYTES = Buffer.from('%PDF-1.4\n% e2e\n1 0 obj<<>>endobj\n', 'utf8');
  const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

  function sha256(s: string): string {
    return createHash('sha256').update(s).digest('hex');
  }

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
        email: `${username}@e2e.local`,
        created_at: new Date(),
      },
    });
    tokens[key] = await loginAs(http, username, PASSWORD);
    ids[key] = u.id;
    return u.id;
  }

  async function createApplication(label: string, courseIdToSet?: number): Promise<number> {
    const res = await request(http)
      .post('/api/applications')
      .set(authHeader(tokens.counsellorA))
      .send({
        name: `${TAG} ${label}`,
        phone: uniquePhone(),
        email: `${TAG}.${label}@e2e.local`.toLowerCase(),
        address: 'E2E Street',
      });
    expect(res.status).toBe(201);
    const id = res.body.data.application_id as number;
    appIds.push(id);
    if (courseIdToSet != null) {
      await prisma.applications.update({
        where: { application_id: id },
        data: { course_id: courseIdToSet },
      });
    }
    return id;
  }

  function issueLink(appId: number, body: Record<string, unknown> = {}) {
    lastEmail = null;
    return request(http)
      .post(`/api/applications/${appId}/magic-link`)
      .set(authHeader(tokens.counsellorA))
      .send(body);
  }

  function tokenFromLastEmail(): string {
    const html = lastEmail?.html ?? '';
    const m = html.match(/#t=([A-Za-z0-9_-]+)/);
    if (!m) throw new Error(`no magic token in email html: ${html.slice(0, 120)}`);
    return m[1];
  }

  const exchange = (rawToken: string) =>
    request(http).post('/api/public/application/session').send({ token: rawToken });

  const publicGet = (session: string) =>
    request(http).get('/api/public/application').set(APPLICANT_HEADER, session);

  function resetThrottle(): void {
    // ThrottlerStorage is provided by the @Global ThrottlerModule, not the root
    // module, so app.get must be non-strict. The v6 in-memory store tracks counts
    // in BOTH `storage` and the private `hitExpirations` (the latter rebuilds the
    // count on the next hit), so both must be cleared to truly reset counters.
    const store = app.get<ThrottlerStorage>(ThrottlerStorage, { strict: false }) as unknown as {
      storage?: Map<string, unknown>;
      hitExpirations?: Map<string, unknown>;
    };
    if (!store?.storage) {
      throw new Error('ThrottlerStorage.storage not reachable — cannot reset throttle counters');
    }
    store.storage.clear();
    store.hitExpirations?.clear();
  }

  /** Drive a no-course application through every section and submit it. */
  async function completeAndSubmit(session: string) {
    let rv = 0;
    const save = async (section: string, data: Record<string, unknown>) => {
      const res = await request(http)
        .put(`/api/public/application/sections/${section}`)
        .set(APPLICANT_HEADER, session)
        .send({ data, complete: true, row_version: rv });
      expect(res.status).toBe(200);
      rv = res.body.data.row_version as number;
      return res;
    };
    await save('personal', { name_on_certificate: 'Asha Menon', dob: '2000-05-01', gender: 'female' });
    // email is READ-ONLY (SECURITY MEDIUM 4) — owned at Add Lead, never sent here.
    await save('contact', { address: '42 MG Road' });
    const prog = await request(http)
      .post('/api/public/application/program/confirm')
      .set(APPLICANT_HEADER, session)
      .send({ row_version: rv });
    expect(prog.status).toBe(201);
    rv = prog.body.data.row_version as number;
    await save('education', {
      highest_qualification: 'ug',
      records: [{ level_code: 'ug', score_type: 'percentage', score_value: 72.5 }],
    });
    return request(http)
      .post('/api/public/application/submit')
      .set(APPLICANT_HEADER, session)
      .send({ accept_accuracy: true, accept_terms: true, row_version: rv });
  }

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    prisma = app.get(PrismaService);

    jest
      .spyOn(app.get(EmailService), 'sendEmail')
      .mockImplementation(async (params: SendEmailParams) => {
        lastEmail = params;
        return {};
      });

    await cleanup();

    tokens.superadmin = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);

    const roleRows = await prisma.user_role.findMany({
      where: { role_key: { in: ['counsellor'] } },
      select: { id: true, role_key: true },
    });
    const counsellorRole = roleRows.find((r) => r.role_key === 'counsellor');
    if (!counsellorRole) throw new Error('role_key counsellor not seeded — apply migration 002');

    await mkStaff('counsellorA', counsellorRole.id);
    await mkStaff('counsellorB', counsellorRole.id);

    // Seed a course (level 'ug') + document checklist for the upload tests.
    const course = await prisma.course.create({
      data: {
        title: `${TAG} Course`,
        short_name: `${TAG}`.slice(0, 40),
        stream: 'Test',
        total_duration: '2y',
        study_mode: 'online',
        level: 'ug',
        created_at: new Date(),
      },
    });
    courseId = course.id;
    const docType = await prisma.document_type.create({
      data: { title: `${TAG} Photo`, created_at: new Date() },
    });
    documentTypeId = docType.id;
    const requirement = await prisma.document_requirement.create({
      data: {
        course_level: 'ug',
        document_type_id: documentTypeId,
        is_required: true,
        max_files: 1,
        sort_order: 0,
        created_at: new Date(),
      },
    });
    requirementId = requirement.id;
  }, 60000);

  afterAll(async () => {
    await cleanup();
    if (courseId) await prisma.course.deleteMany({ where: { id: courseId } });
    if (documentTypeId) await prisma.document_requirement.deleteMany({ where: { document_type_id: documentTypeId } });
    if (documentTypeId) await prisma.document_type.deleteMany({ where: { id: documentTypeId } });
    await app.close();
  });

  beforeEach(() => resetThrottle());

  async function cleanup() {
    // Conversion artifacts first (the doc-copy test converts an application):
    // converted students carry name startsWith TAG and the student role (4).
    const convStudents = await prisma.users.findMany({
      where: { name: { startsWith: TAG }, role_id: 4 },
      select: { id: true },
    });
    const convIds = convStudents.map((u) => u.id);
    if (convIds.length) {
      await prisma.student_document.deleteMany({ where: { student_id: { in: convIds } } });
      await prisma.student_payments.deleteMany({ where: { student_id: { in: convIds } } });
      await prisma.students.deleteMany({ where: { student_id: { in: convIds } } });
      await prisma.users.deleteMany({ where: { id: { in: convIds } } });
    }
    if (appIds.length) {
      await prisma.student_document.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.application_magic_link.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.application_document.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.application_form.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.application_stage_log.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.audit_log.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.qualification.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.applications.deleteMany({ where: { application_id: { in: appIds } } });
    }
    await prisma.users.deleteMany({ where: { username: { startsWith: TAG } } });
  }

  // ---- hash-only storage ----------------------------------------------------

  it('stores ONLY the SHA-256 hash of the token; the raw token is never persisted or returned', async () => {
    const appId = await createApplication('Hash');
    const res = await issueLink(appId);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email_status: 'sent' });
    // The response must NEVER carry the token or a URL.
    expect(JSON.stringify(res.body)).not.toMatch(/#t=/);

    const raw = tokenFromLastEmail();
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const link = await prisma.application_magic_link.findFirst({
      where: { application_id: appId },
      orderBy: { id: 'desc' },
    });
    expect(link).toBeTruthy();
    expect(link!.token_hash).toBe(sha256(raw));
    expect(link!.token_hash).not.toBe(raw);
    // No column holds the raw token.
    expect(JSON.stringify(link)).not.toContain(raw);
  }, 30000);

  // ---- session works, then dies on revoke / resend / submit (CRITIQUE #1) ---

  it('a session works, then is REJECTED after the link is revoked', async () => {
    const appId = await createApplication('Revoke');
    await issueLink(appId);
    const session = (await exchange(tokenFromLastEmail())).body.data.session as string;
    expect((await publicGet(session)).status).toBe(200);

    const del = await request(http)
      .delete(`/api/applications/${appId}/magic-link`)
      .set(authHeader(tokens.counsellorA));
    expect(del.status).toBe(200);

    expect((await publicGet(session)).status).toBe(401);
  }, 30000);

  it('a session is REJECTED after a resend replaces the link; the new link works', async () => {
    const appId = await createApplication('Resend');
    await issueLink(appId);
    const oldToken = tokenFromLastEmail();
    const sessionOld = (await exchange(oldToken)).body.data.session as string;
    expect((await publicGet(sessionOld)).status).toBe(200);

    const resend = await issueLink(appId, { resend: true });
    expect(resend.status).toBe(201);
    const newToken = tokenFromLastEmail();
    expect(newToken).not.toBe(oldToken);

    // Old session dies immediately (its link was revoked with reason 'resend').
    expect((await publicGet(sessionOld)).status).toBe(401);
    // The old token now reports it was replaced (410 LINK_REPLACED).
    const oldExchange = await exchange(oldToken);
    expect(oldExchange.status).toBe(410);
    expect(oldExchange.body.code).toBe('LINK_REPLACED');

    // The freshly-sent link mints a working session.
    const sessionNew = (await exchange(newToken)).body.data.session as string;
    expect((await publicGet(sessionNew)).status).toBe(200);
  }, 30000);

  it('submit consumes the link and ends the session; reopen issues a working new link with the reason', async () => {
    const appId = await createApplication('Submit');
    await issueLink(appId);
    const session = (await exchange(tokenFromLastEmail())).body.data.session as string;

    const submit = await completeAndSubmit(session);
    expect(submit.status).toBe(201);
    expect(submit.body.data.submitted).toBe(true);

    // The session is dead the instant the link is consumed.
    expect((await publicGet(session)).status).toBe(401);

    // Stage moved to counsellor_review by an APPLICANT actor (NULL staff id).
    const appRow = await prisma.applications.findUnique({ where: { application_id: appId } });
    expect(appRow!.stage).toBe('counsellor_review');
    const evt = await prisma.application_stage_log.findFirst({
      where: { application_id: appId, event: 'form_received' },
      orderBy: { id: 'desc' },
    });
    expect(evt!.actor_type).toBe('applicant');
    expect(evt!.actor_id).toBeNull();

    // No student was created by submit (that is SA approve in WS1).
    expect(appRow!.is_converted ?? 0).not.toBe(1);
    const students = await prisma.students.count({
      where: { application_id: appRow!.custom_application_id ?? `none-${appId}` },
    });
    expect(students).toBe(0);

    // Reopen: a new link + stage back to form_pending + the reason as a banner.
    const reopen = await request(http)
      .post(`/api/applications/${appId}/form/reopen`)
      .set(authHeader(tokens.counsellorA))
      .send({ reason: 'Please re-upload a clearer photo of your marksheet.' });
    expect(reopen.status).toBe(201);
    const sessionNew = (await exchange(tokenFromLastEmail())).body.data.session as string;
    const read = await publicGet(sessionNew);
    expect(read.status).toBe(200);
    expect(read.body.data.reopen_reason).toContain('clearer photo');
  }, 45000);

  // ---- 5-link / 24h cap -----------------------------------------------------

  it('enforces the cap of 5 links per application per 24h', async () => {
    const appId = await createApplication('Cap');
    for (let i = 0; i < 5; i++) {
      const res = await issueLink(appId, i === 0 ? {} : { resend: true });
      expect(res.status).toBe(201);
    }
    const sixth = await issueLink(appId, { resend: true });
    expect(sixth.status).toBe(409);
    expect(String(sixth.body.message).toLowerCase()).toContain('limit');
  }, 45000);

  // ---- per-IP throttle (429) ------------------------------------------------

  it('throttles the public session route per IP and returns 429 past the limit', async () => {
    resetThrottle();
    const bogus = 'z'.repeat(43);
    let got429 = false;
    let last = 0;
    for (let i = 0; i < 13; i++) {
      const res = await exchange(bogus);
      last = res.status;
      if (res.status === 429) got429 = true;
    }
    expect(got429).toBe(true);
    expect(last).toBe(429);
  }, 30000);

  // ---- upload hardening -----------------------------------------------------

  async function sessionForCourseApp(label: string): Promise<{ appId: number; session: string }> {
    const appId = await createApplication(label, courseId);
    await issueLink(appId);
    const session = (await exchange(tokenFromLastEmail())).body.data.session as string;
    return { appId, session };
  }

  it('rejects an upload whose magic bytes are not PDF/JPG/PNG (415)', async () => {
    const { session } = await sessionForCourseApp('UploadBadBytes');
    const res = await request(http)
      .post('/api/public/application/documents')
      .set(APPLICANT_HEADER, session)
      .field('requirement_id', String(requirementId))
      .attach('file', Buffer.from('<html>not a pdf</html>'), {
        filename: 'evil.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(415);
  }, 30000);

  it('rejects an upload larger than 5 MB (413)', async () => {
    const { session } = await sessionForCourseApp('UploadBig');
    const big = Buffer.concat([PDF_BYTES, Buffer.alloc(6 * 1024 * 1024, 0x20)]);
    const res = await request(http)
      .post('/api/public/application/documents')
      .set(APPLICANT_HEADER, session)
      .field('requirement_id', String(requirementId))
      .attach('file', big, { filename: 'big.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(413);
  }, 30000);

  it('rejects an upload once the per-application document quota is reached (409)', async () => {
    const { appId, session } = await sessionForCourseApp('UploadQuota');
    // Pre-seed 30 live documents directly (bypassing the upload path) to hit the cap.
    await prisma.application_document.createMany({
      data: Array.from({ length: 30 }, (_, i) => ({
        application_id: appId,
        file_path: `application_documents/seed-${appId}-${i}.pdf`,
        size_bytes: 1024,
        verification_status: 'pending',
        created_at: new Date(),
      })),
    });
    const res = await request(http)
      .post('/api/public/application/documents')
      .set(APPLICANT_HEADER, session)
      .field('requirement_id', String(requirementId))
      .attach('file', PNG_BYTES, { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(409);
  }, 30000);

  it('accepts a valid upload against a checklist requirement', async () => {
    const { session } = await sessionForCourseApp('UploadOk');
    const res = await request(http)
      .post('/api/public/application/documents')
      .set(APPLICANT_HEADER, session)
      .field('requirement_id', String(requirementId))
      .attach('file', PNG_BYTES, { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.data.document.id).toBeGreaterThan(0);
  }, 30000);

  // ---- forbidNonWhitelisted on the public write DTO -------------------------

  it('rejects an unknown field in a public section save (forbidNonWhitelisted)', async () => {
    const appId = await createApplication('Strict');
    await issueLink(appId);
    const session = (await exchange(tokenFromLastEmail())).body.data.session as string;
    const res = await request(http)
      .put('/api/public/application/sections/personal')
      .set(APPLICANT_HEADER, session)
      .send({ data: { name_on_certificate: 'A', injected_admin_flag: true }, complete: false, row_version: 0 });
    expect(res.status).toBe(400);
  }, 30000);

  // ---- cross-application isolation ------------------------------------------

  it("a session minted for application A cannot reach application B's document", async () => {
    const appA = await createApplication('IsoA');
    const appB = await createApplication('IsoB');
    await issueLink(appA);
    const sessionA = (await exchange(tokenFromLastEmail())).body.data.session as string;
    await issueLink(appB);
    await exchange(tokenFromLastEmail()); // mint B's session too (unused)

    // Seed a document on B; A's session must not reach it (scoped by session, not URL).
    const docB = await prisma.application_document.create({
      data: {
        application_id: appB,
        file_path: `application_documents/isob-${appB}.pdf`,
        verification_status: 'pending',
        created_at: new Date(),
      },
    });

    const readA = await publicGet(sessionA);
    expect(readA.status).toBe(200);

    const fileRes = await request(http)
      .get(`/api/public/application/documents/${docB.id}/file`)
      .set(APPLICANT_HEADER, sessionA);
    expect(fileRes.status).toBe(404);

    const delRes = await request(http)
      .delete(`/api/public/application/documents/${docB.id}`)
      .set(APPLICANT_HEADER, sessionA);
    expect(delRes.status).toBe(404);
  }, 30000);

  // ---- resend whose email fails leaves the OLD link live (LOW 5 / critique #20)

  it('a resend whose email send FAILS leaves the OLD link usable', async () => {
    const appId = await createApplication('ResendFail');
    await issueLink(appId);
    const oldToken = tokenFromLastEmail();
    const sessionOld = (await exchange(oldToken)).body.data.session as string;
    expect((await publicGet(sessionOld)).status).toBe(200);

    // The NEXT send throws: the resend must fail WITHOUT revoking the old link.
    jest
      .spyOn(app.get(EmailService), 'sendEmail')
      .mockImplementationOnce(async () => {
        throw new Error('mailer down');
      });
    const resend = await issueLink(appId, { resend: true });
    expect(resend.status).toBe(503);

    // The OLD link + its session still work, and the OLD token still exchanges.
    expect((await publicGet(sessionOld)).status).toBe(200);
    expect((await exchange(oldToken)).status).toBe(200);
  }, 30000);

  // ---- a session dies once the link has expired (LOW 7) ---------------------

  it('a session is REJECTED once the link has expired (expires_at in the past)', async () => {
    const appId = await createApplication('Expiry');
    await issueLink(appId);
    const session = (await exchange(tokenFromLastEmail())).body.data.session as string;
    expect((await publicGet(session)).status).toBe(200);

    // The guard re-reads the link on every request, so moving expiry into the past
    // ends the session immediately — without touching the (still-signed) JWT.
    await prisma.application_magic_link.updateMany({
      where: { application_id: appId },
      data: { expires_at: new Date(Date.now() - 1000) },
    });
    expect((await publicGet(session)).status).toBe(401);
  }, 30000);

  // ---- a non-owning counsellor is refused on the staff routes (LOW 7) -------

  it('a non-owning counsellor gets 403 on the staff magic-link + form routes', async () => {
    const appId = await createApplication('OwnerScope'); // owned by counsellorA
    await issueLink(appId);

    const getForm = await request(http)
      .get(`/api/applications/${appId}/form`)
      .set(authHeader(tokens.counsellorB));
    expect(getForm.status).toBe(403);

    const patch = await request(http)
      .patch(`/api/applications/${appId}/form/personal`)
      .set(authHeader(tokens.counsellorB))
      .send({ data: { name_on_certificate: 'X' }, row_version: 0 });
    expect(patch.status).toBe(403);

    const del = await request(http)
      .delete(`/api/applications/${appId}/magic-link`)
      .set(authHeader(tokens.counsellorB));
    expect(del.status).toBe(403);
  }, 30000);

  // ---- conversion carries public-form documents to the student (LOW 7) ------

  it('conversion copies application_document rows into student_document', async () => {
    const appId = await createApplication('ConvDoc');
    await prisma.application_document.create({
      data: {
        application_id: appId,
        file_path: `application_documents/convdoc-${appId}.pdf`,
        original_name: 'marksheet.pdf',
        label: 'Marksheet',
        verification_status: 'verified',
        created_at: new Date(),
      },
    });
    const onCert = `${TAG} OnCert`.slice(0, 100);
    await prisma.application_form.upsert({
      where: { application_id: appId },
      update: { name_on_certificate: onCert },
      create: { application_id: appId, name_on_certificate: onCert, created_at: new Date() },
    });
    // Put the application at Student-Affairs review so the Super-Admin convert is
    // eligible (a fresh lead sits at lead_added).
    await prisma.applications.update({
      where: { application_id: appId },
      data: { stage: 'sa_verification', is_archived: false },
    });

    // Super-Admin legacy convert (an sa_verification row is eligible).
    const res = await request(http)
      .post(`/api/applications/${appId}/convert`)
      .set(authHeader(tokens.superadmin));
    expect(res.status).toBe(201);
    const userId = res.body.data.user_id as number;
    expect(userId).toBeGreaterThan(0);

    // users.name prefers application_form.name_on_certificate.
    const user = await prisma.users.findUnique({ where: { id: userId } });
    expect(user!.name).toBe(onCert);

    // The public-form document is now a student_document for the new student,
    // with the file + label carried over and the source row linked back.
    const copied = await prisma.student_document.findMany({
      where: { student_id: userId, application_id: appId },
    });
    expect(copied).toHaveLength(1);
    expect(copied[0].file).toBe(`application_documents/convdoc-${appId}.pdf`);
    expect(copied[0].label).toBe('Marksheet');

    const src = await prisma.application_document.findFirst({ where: { application_id: appId } });
    expect(src!.student_document_id).toBe(copied[0].student_document_id);
  }, 45000);

  // ---- an applicant session is refused on a staff route ---------------------

  it('an applicant session is not accepted as a staff identity', async () => {
    const appId = await createApplication('WrongAud');
    await issueLink(appId);
    const session = (await exchange(tokenFromLastEmail())).body.data.session as string;
    // Using the applicant JWT as a staff Bearer must NOT authorize staff routes.
    const res = await request(http)
      .get('/api/applications')
      .set('Authorization', `Bearer ${session}`);
    expect([401, 403]).toContain(res.status);
  }, 30000);
});
