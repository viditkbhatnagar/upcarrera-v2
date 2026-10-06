import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * WS6 Master Settings (e2e) on the real stack + DB.
 *
 * Covers:
 *   - document_requirement CRUD happy-path (+ soft-delete then revive) and the
 *     (course_level, document_type_id) 409;
 *   - course_admission_rule CRUD happy-path (+ revive) and the one-rule-per-course
 *     409;
 *   - validation (bad canonical level, missing document_type / course);
 *   - the catalog permission matrix (view vs manage): student 403 on reads+writes,
 *     counsellor 403 on writes (200 on reads), admin ok;
 *   - the SA approve gate honours a configured required document: with a required
 *     doc configured the approve is BLOCKED until that document is verified, then
 *     converts.
 *
 * Fixtures are TAG-prefixed and created via Prisma so nothing depends on seed
 * rows. Staff are minted directly (known bcrypt password) using the seeded role
 * ids resolved by role_key.
 */
describe('WS6 Master Settings (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let prisma: PrismaService;

  const TAG = `e2e_ms_${Date.now()}`;
  const PASSWORD = 'MasterSettings@12345';
  let phoneSeq = 0;
  const uniquePhone = () => `97${String(Date.now()).slice(-7)}${phoneSeq++ % 10}`;

  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};
  const appIds: number[] = [];
  const studentUserIds: number[] = [];

  // Catalog fixtures.
  let courseUg = 0; // level 'ug'   — admission-rule CRUD + a valid course
  let courseRuleB = 0; // a second course for the admission-rule 409
  let courseDoc = 0; // level 'Doctorate' — the SA-gate application's course
  const typeIds: number[] = [];
  let typeA = 0; // doc-req CRUD + revive
  let typeB = 0; // doc-req 409
  let typeC = 0; // permission-matrix admin write
  let typeReq = 0; // SA-gate required document
  let typeOther = 0; // SA-gate non-matching verified document

  const PDF = Buffer.from('%PDF-1.4\n%ws6 proof\n', 'utf8');
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
        created_at: new Date(),
      },
    });
    tokens[key] = await loginAs(http, username, PASSWORD);
    ids[key] = u.id;
    return u.id;
  }

  async function mkCourse(suffix: string, level: string): Promise<number> {
    const now = new Date();
    const row = await prisma.course.create({
      data: {
        title: `${TAG} Course ${suffix}`,
        short_name: `${TAG}-${suffix}`,
        stream: 'Management',
        total_duration: '2 Years',
        duration: '2 Years',
        study_mode: 'Online',
        level,
        total_amount: 0,
        created_at: now,
        updated_at: now,
      },
    });
    return row.id;
  }

  async function mkDocType(suffix: string): Promise<number> {
    const row = await prisma.document_type.create({
      data: { title: `${TAG} ${suffix}`, created_at: new Date() },
    });
    typeIds.push(row.id);
    return row.id;
  }

  /** Create a lead AS the counsellor and track it for cleanup. */
  async function createApplication(label: string, courseId: number | null): Promise<number> {
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
    if (courseId != null) {
      await prisma.applications.update({
        where: { application_id: id },
        data: { course_id: courseId },
      });
    }
    return id;
  }

  /** Drive a fresh lead all the way to sa_verification (stages 1 -> 6). */
  async function driveToSaVerification(appId: number): Promise<void> {
    const post = (path: string, token: string) =>
      request(http).post(`/api/applications/${appId}/${path}`).set(authHeader(token)).send({});
    expect((await post('send-form', tokens.counsellor)).status).toBe(201);
    expect((await post('mark-form-received', tokens.counsellor)).status).toBe(201);
    expect((await post('accept', tokens.counsellor)).status).toBe(201);

    const pay = await request(http)
      .post(`/api/applications/${appId}/payments`)
      .set(authHeader(tokens.counsellor))
      .field('amount', '5000')
      .field('paid_to', 'upcarrera')
      .field('payment_mode', 'upi')
      .field('txn_ref', `UTR-${TAG}-${appId}`)
      .field('paid_on', todayIso)
      .attach('proof', PDF, { filename: 'proof.pdf', contentType: 'application/pdf' });
    expect(pay.status).toBe(201);
    const paymentId = pay.body.data.id as number;

    const verify = await request(http)
      .post(`/api/application-payments/${paymentId}/verify`)
      .set(authHeader(tokens.accounts))
      .send({ bank_credit_date: todayIso, verify_note: 'seen on statement' });
    expect(verify.status).toBe(201);

    const detail = await request(http)
      .get(`/api/applications/${appId}`)
      .set(authHeader(tokens.sa));
    expect(detail.body.data.effective_stage).toBe('sa_verification');
  }

  const createReq = (token: string, body: object) =>
    request(http).post('/api/document-requirements').set(authHeader(token)).send(body);
  const listReq = (token: string, query = '') =>
    request(http).get(`/api/document-requirements${query}`).set(authHeader(token));
  const createRule = (token: string, body: object) =>
    request(http).post('/api/course-admission-rules').set(authHeader(token)).send(body);
  const listRules = (token: string, query = '') =>
    request(http).get(`/api/course-admission-rules${query}`).set(authHeader(token));

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    prisma = app.get(PrismaService);
    await cleanup();

    tokens.superadmin = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);

    const roleRows = await prisma.user_role.findMany({
      where: { role_key: { in: ['admin', 'counsellor', 'student', 'accounts', 'student_affairs'] } },
      select: { id: true, role_key: true },
    });
    const roleId = (key: string): number => {
      const r = roleRows.find((x) => x.role_key === key);
      if (!r) throw new Error(`role_key ${key} not seeded — apply migration 002`);
      return r.id;
    };
    await mkStaff('admin', roleId('admin'));
    await mkStaff('counsellor', roleId('counsellor'));
    await mkStaff('student', roleId('student'));
    await mkStaff('accounts', roleId('accounts'));
    await mkStaff('sa', roleId('student_affairs'));

    courseUg = await mkCourse('UG', 'ug');
    courseRuleB = await mkCourse('RuleB', 'ug');
    courseDoc = await mkCourse('Doc', 'Doctorate');
    typeA = await mkDocType('Type A');
    typeB = await mkDocType('Type B');
    typeC = await mkDocType('Type C');
    typeReq = await mkDocType('Required Doc');
    typeOther = await mkDocType('Other Doc');
  }, 60000);

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
    // Master-settings rows: scope by the fixture document types / courses.
    const courses = await prisma.course.findMany({
      where: { title: { startsWith: TAG } },
      select: { id: true },
    });
    const courseIds = courses.map((c) => c.id);
    const docTypes = await prisma.document_type.findMany({
      where: { title: { startsWith: TAG } },
      select: { id: true },
    });
    const docTypeIds = docTypes.map((d) => d.id);
    if (docTypeIds.length) {
      await prisma.document_requirement.deleteMany({ where: { document_type_id: { in: docTypeIds } } });
    }
    if (courseIds.length) {
      await prisma.course_admission_rule.deleteMany({ where: { course_id: { in: courseIds } } });
    }
    // MEDIUM 5: cleanup is scoped to THIS run's fixture rows only (via the
    // TAG-prefixed document_type / course ids above). It MUST NOT wipe the shared
    // 'doctorate' checklist — that would destroy any real config in the dev DB. The
    // SA-gate test is instead written to tolerate pre-existing doctorate rows.
    if (courseIds.length) await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
    if (docTypeIds.length) await prisma.document_type.deleteMany({ where: { id: { in: docTypeIds } } });
    await prisma.users.deleteMany({ where: { username: { startsWith: TAG } } });
  }

  // ===========================================================================
  // document_requirement CRUD
  // ===========================================================================

  describe('document_requirement CRUD', () => {
    let reqId = 0;

    it('creates a requirement, lists it (filtered by level) with its document_type_title', async () => {
      const res = await createReq(tokens.admin, {
        course_level: 'ug',
        document_type_id: typeA,
        is_required: true,
        applies_when: 'always',
        max_files: 2,
        help_text: 'Upload your UG marksheet',
        sort_order: 1,
      });
      expect(res.status).toBe(201);
      reqId = res.body.data.id as number;
      expect(res.body.data.course_level).toBe('ug');
      expect(res.body.data.applies_when).toBeNull(); // 'always' normalises to NULL

      const list = await listReq(tokens.admin, '?course_level=ug');
      expect(list.status).toBe(200);
      const row = list.body.data.items.find((r: { id: number }) => r.id === reqId);
      expect(row).toBeTruthy();
      expect(row.document_type_title).toBe(`${TAG} Type A`);
    });

    it('patches a requirement', async () => {
      const res = await request(http)
        .patch(`/api/document-requirements/${reqId}`)
        .set(authHeader(tokens.admin))
        .send({ sort_order: 5, help_text: 'Updated help', applies_when: 'employment' });
      expect(res.status).toBe(200);
      expect(res.body.data.sort_order).toBe(5);
      expect(res.body.data.applies_when).toBe('employment');
    });

    it('409 on a duplicate (course_level, document_type_id)', async () => {
      const first = await createReq(tokens.admin, { course_level: 'ug', document_type_id: typeB });
      expect(first.status).toBe(201);
      const dup = await createReq(tokens.admin, { course_level: 'ug', document_type_id: typeB });
      expect(dup.status).toBe(409);
    });

    it('soft-deletes then revives on re-create', async () => {
      const del = await request(http)
        .delete(`/api/document-requirements/${reqId}`)
        .set(authHeader(tokens.admin));
      expect(del.status).toBe(200);
      // Gone from the list.
      const afterDelete = await listReq(tokens.admin, '?course_level=ug');
      expect(afterDelete.body.data.items.some((r: { id: number }) => r.id === reqId)).toBe(false);
      // Re-create the same (ug, typeA) -> revives the soft-deleted row (no 409).
      const revive = await createReq(tokens.admin, { course_level: 'ug', document_type_id: typeA });
      expect(revive.status).toBe(201);
      expect(revive.body.data.id).toBe(reqId);
    });

    it('400 on a non-canonical course_level', async () => {
      const res = await createReq(tokens.admin, { course_level: 'masters', document_type_id: typeA });
      expect(res.status).toBe(400);
    });

    it('400 on an unknown document_type_id', async () => {
      const res = await createReq(tokens.admin, { course_level: 'ug', document_type_id: 999999999 });
      expect(res.status).toBe(400);
    });

    it('MEDIUM 1: 409 (not a raw 500) patching onto a pair held by a SOFT-DELETED row', async () => {
      const level = 'diploma'; // isolated from the 'ug' rows above
      const typeP = await mkDocType('SoftClashP');
      const typeQ = await mkDocType('SoftClashQ');

      // typeP occupies (diploma, typeP) then is soft-deleted — the unique key
      // uq_docreq_level_type still covers that soft-deleted row.
      const p = await createReq(tokens.admin, { course_level: level, document_type_id: typeP });
      expect(p.status).toBe(201);
      const delP = await request(http)
        .delete(`/api/document-requirements/${p.body.data.id}`)
        .set(authHeader(tokens.admin));
      expect(delP.status).toBe(200);

      // typeQ is a LIVE row at the same level.
      const q = await createReq(tokens.admin, { course_level: level, document_type_id: typeQ });
      expect(q.status).toBe(201);

      // Moving q onto typeP collides with the soft-deleted row's key -> clean 409,
      // never a leaked Prisma P2002 / 500.
      const clash = await request(http)
        .patch(`/api/document-requirements/${q.body.data.id}`)
        .set(authHeader(tokens.admin))
        .send({ document_type_id: typeP });
      expect(clash.status).toBe(409);
    });

    it('MEDIUM 2: reorder renumbers a level 1..n atomically (works when sort_order ties)', async () => {
      const level = 'certification'; // isolated level
      const t1 = await mkDocType('OrderA');
      const t2 = await mkDocType('OrderB');
      const t3 = await mkDocType('OrderC');
      // No sort_order -> all default to 0 (tied): the exact case the old two-PATCH
      // swap could not move.
      const r1 = (await createReq(tokens.admin, { course_level: level, document_type_id: t1 })).body.data.id as number;
      const r2 = (await createReq(tokens.admin, { course_level: level, document_type_id: t2 })).body.data.id as number;
      const r3 = (await createReq(tokens.admin, { course_level: level, document_type_id: t3 })).body.data.id as number;

      const reorder = await request(http)
        .patch('/api/document-requirements/reorder')
        .set(authHeader(tokens.admin))
        .send({ course_level: level, ids: [r3, r2, r1] });
      expect(reorder.status).toBe(200);

      const list = await listReq(tokens.admin, `?course_level=${level}`);
      const items = list.body.data.items as Array<{ id: number; sort_order: number }>;
      const sortOrderOf = (id: number) => items.find((r) => r.id === id)?.sort_order;
      // Clean 1..n in the requested order.
      expect(sortOrderOf(r3)).toBe(1);
      expect(sortOrderOf(r2)).toBe(2);
      expect(sortOrderOf(r1)).toBe(3);

      // A foreign id fails the WHOLE reorder (400), leaving numbering untouched.
      const bad = await request(http)
        .patch('/api/document-requirements/reorder')
        .set(authHeader(tokens.admin))
        .send({ course_level: level, ids: [r1, 999999999] });
      expect(bad.status).toBe(400);

      // Reorder is a write -> crm:catalog.manage (counsellor 403).
      const forbidden = await request(http)
        .patch('/api/document-requirements/reorder')
        .set(authHeader(tokens.counsellor))
        .send({ course_level: level, ids: [r1, r2, r3] });
      expect(forbidden.status).toBe(403);
    });
  });

  // ===========================================================================
  // course_admission_rule CRUD
  // ===========================================================================

  describe('course_admission_rule CRUD', () => {
    let ruleId = 0;

    it('creates a rule, reads it by course_id (Decimals as numbers, course_title resolved)', async () => {
      const res = await createRule(tokens.admin, {
        course_id: courseUg,
        min_qualification: 'ug',
        min_percentage: 50,
        requires_employment: true,
        min_experience_months: 12,
        notes: 'Needs 1 year experience',
      });
      expect(res.status).toBe(201);
      ruleId = res.body.data.id as number;
      expect(res.body.data.min_percentage).toBe(50); // number, not a Decimal string
      expect(res.body.data.requires_employment).toBe(true);
      expect(res.body.data.course_title).toBe(`${TAG} Course UG`);

      const byCourse = await listRules(tokens.admin, `?course_id=${courseUg}`);
      expect(byCourse.status).toBe(200);
      expect(byCourse.body.data.items).toHaveLength(1);
      expect(byCourse.body.data.items[0].id).toBe(ruleId);
    });

    it('patches a rule', async () => {
      const res = await request(http)
        .patch(`/api/course-admission-rules/${ruleId}`)
        .set(authHeader(tokens.admin))
        .send({ min_percentage: 60, requires_employment: false });
      expect(res.status).toBe(200);
      expect(res.body.data.min_percentage).toBe(60);
      expect(res.body.data.requires_employment).toBe(false);
    });

    it('409 on a second rule for the same course', async () => {
      const dup = await createRule(tokens.admin, { course_id: courseUg });
      expect(dup.status).toBe(409);
    });

    it('soft-deletes then revives on re-create', async () => {
      const del = await request(http)
        .delete(`/api/course-admission-rules/${ruleId}`)
        .set(authHeader(tokens.admin));
      expect(del.status).toBe(200);
      const revive = await createRule(tokens.admin, { course_id: courseUg });
      expect(revive.status).toBe(201);
      expect(revive.body.data.id).toBe(ruleId);
    });

    it('supports a distinct rule per course (courseRuleB)', async () => {
      const res = await createRule(tokens.admin, { course_id: courseRuleB, min_cgpa: 7.5 });
      expect(res.status).toBe(201);
      expect(res.body.data.min_cgpa).toBe(7.5);
    });

    it('400 on an unknown course_id', async () => {
      const res = await createRule(tokens.admin, { course_id: 999999999 });
      expect(res.status).toBe(400);
    });
  });

  // ===========================================================================
  // permission matrix (crm:catalog.view / crm:catalog.manage)
  // ===========================================================================

  describe('permission matrix', () => {
    it('writes require crm:catalog.manage (admin ok; counsellor + student 403)', async () => {
      const counsellor = await createReq(tokens.counsellor, { course_level: 'ug', document_type_id: typeC });
      expect(counsellor.status).toBe(403);
      const student = await createReq(tokens.student, { course_level: 'ug', document_type_id: typeC });
      expect(student.status).toBe(403);
      const admin = await createReq(tokens.admin, { course_level: 'ug', document_type_id: typeC });
      expect(admin.status).toBe(201);

      // The admission-rule write set is gated identically.
      const counsellorRule = await createRule(tokens.counsellor, { course_id: courseUg });
      expect(counsellorRule.status).toBe(403);
      const studentRule = await createRule(tokens.student, { course_id: courseUg });
      expect(studentRule.status).toBe(403);
    });

    it('reads require crm:catalog.view (admin + counsellor ok; student 403)', async () => {
      expect((await listReq(tokens.admin)).status).toBe(200);
      expect((await listReq(tokens.counsellor)).status).toBe(200);
      expect((await listReq(tokens.student)).status).toBe(403);

      expect((await listRules(tokens.admin)).status).toBe(200);
      expect((await listRules(tokens.counsellor)).status).toBe(200);
      expect((await listRules(tokens.student)).status).toBe(403);
    });
  });

  // ===========================================================================
  // document_type catalog permission matrix (MEDIUM 3)
  // ===========================================================================

  describe('document-types catalog permission matrix (MEDIUM 3)', () => {
    const mkType = (token: string) =>
      request(http)
        .post('/api/document-types')
        .set(authHeader(token))
        .send({ title: `${TAG} DT ${phoneSeq++}` });

    it('writes require crm:catalog.manage (student + counsellor 403; admin 201)', async () => {
      expect((await mkType(tokens.student)).status).toBe(403);
      expect((await mkType(tokens.counsellor)).status).toBe(403);

      const admin = await mkType(tokens.admin);
      expect(admin.status).toBe(201);
      const id = admin.body.data.id as number; // TAG-titled -> cleaned up by title

      // PATCH + DELETE are gated identically.
      expect(
        (await request(http).patch(`/api/document-types/${id}`).set(authHeader(tokens.student)).send({ title: 'x' })).status,
      ).toBe(403);
      expect(
        (await request(http).patch(`/api/document-types/${id}`).set(authHeader(tokens.counsellor)).send({ title: 'x' })).status,
      ).toBe(403);
      expect(
        (await request(http).delete(`/api/document-types/${id}`).set(authHeader(tokens.student))).status,
      ).toBe(403);
      // Admin can actually PATCH it.
      expect(
        (await request(http).patch(`/api/document-types/${id}`).set(authHeader(tokens.admin)).send({ title: `${TAG} DT renamed` })).status,
      ).toBe(200);
    });

    it('reads require crm:catalog.view (admin + counsellor ok; student 403)', async () => {
      const get = (token: string) => request(http).get('/api/document-types').set(authHeader(token));
      expect((await get(tokens.admin)).status).toBe(200);
      expect((await get(tokens.counsellor)).status).toBe(200); // staff master, open to staff
      expect((await get(tokens.student)).status).toBe(403); // LMS student role has no catalog.view
    });
  });

  // ===========================================================================
  // eligibility enforces min_experience_months (MEDIUM 4)
  // ===========================================================================

  describe('eligibility enforces min_experience_months (MEDIUM 4)', () => {
    it('needs_review without experience, not_eligible below the minimum, eligible at/above it', async () => {
      const courseElig = await mkCourse('Elig', 'ug');
      // UG minimum + requires employment + 24 months experience.
      const rule = await createRule(tokens.admin, {
        course_id: courseElig,
        min_qualification: 'ug',
        requires_employment: true,
        min_experience_months: 24,
      });
      expect(rule.status).toBe(201);

      const appId = await createApplication('elig', courseElig);
      // Drive lead -> counsellor_review so the staff 'correct' action is allowed (LOW 8).
      const advance = (path: string) =>
        request(http).post(`/api/applications/${appId}/${path}`).set(authHeader(tokens.counsellor)).send({});
      expect((await advance('send-form')).status).toBe(201);
      expect((await advance('mark-form-received')).status).toBe(201);

      // The staff read is non-creating (LOW 8): row_version is 0 with no form row yet.
      const read0 = await request(http).get(`/api/applications/${appId}/form`).set(authHeader(tokens.admin));
      expect(read0.status).toBe(200);
      let rv = read0.body.data.row_version as number;

      // Education meets the UG minimum. No experience captured yet -> needs_review.
      const edu = await request(http)
        .patch(`/api/applications/${appId}/form/education`)
        .set(authHeader(tokens.admin))
        .send({
          data: {
            highest_qualification: 'ug',
            records: [{ level_code: 'ug', label: 'B.Com', score_type: 'percentage', score_value: 75 }],
          },
          row_version: rv,
        });
      expect(edu.status).toBe(200);
      expect(edu.body.data.eligibility.status).toBe('needs_review');
      rv = edu.body.data.row_version as number;

      // Employment below the minimum (12 < 24) -> not_eligible.
      const low = await request(http)
        .patch(`/api/applications/${appId}/form/employment`)
        .set(authHeader(tokens.admin))
        .send({ data: { employment_status: 'employed', total_experience_months: 12 }, row_version: rv });
      expect(low.status).toBe(200);
      expect(low.body.data.eligibility.status).toBe('not_eligible');
      rv = low.body.data.row_version as number;

      // At/above the minimum (36 >= 24) -> eligible.
      const ok = await request(http)
        .patch(`/api/applications/${appId}/form/employment`)
        .set(authHeader(tokens.admin))
        .send({ data: { total_experience_months: 36 }, row_version: rv });
      expect(ok.status).toBe(200);
      expect(ok.body.data.eligibility.status).toBe('eligible');
    }, 60000);
  });

  // ===========================================================================
  // the SA approve gate honours a configured required document
  // ===========================================================================

  describe('SA approve gate + configured required document', () => {
    it('blocks approve until the configured required document is verified, then converts', async () => {
      const appId = await createApplication('sagate', courseDoc);
      await driveToSaVerification(appId);

      // Configure OUR required 'doctorate' requirement (fixture typeReq).
      const reqRes = await createReq(tokens.admin, {
        course_level: 'doctorate',
        document_type_id: typeReq,
        is_required: true,
      });
      expect(reqRes.status).toBe(201);

      // MEDIUM 5: the cleanup no longer wipes the shared 'doctorate' checklist, so
      // this test must tolerate ANY pre-existing doctorate requirement. Resolve every
      // required doctorate type that APPLIES to this application (courseDoc has no
      // admission rule -> requires_employment is false, so 'employment' rows are
      // skipped, mirroring the SA gate). We satisfy all of them EXCEPT our fixture
      // typeReq, so the block is attributable to typeReq alone.
      const requiredRows = await prisma.document_requirement.findMany({
        where: { course_level: 'doctorate', is_required: true, deleted_at: null },
        select: { document_type_id: true, applies_when: true },
      });
      const applicableTypeIds = requiredRows
        .filter((r) => r.applies_when !== 'employment') // null/always + fail-closed unknowns
        .map((r) => r.document_type_id);

      // Verified docs for every applicable required type EXCEPT typeReq.
      for (const typeId of applicableTypeIds.filter((t) => t !== typeReq)) {
        await prisma.application_document.create({
          data: {
            application_id: appId,
            document_type_id: typeId,
            label: `Pre-existing required ${typeId}`,
            file_path: `application_documents/${TAG}-pre-${typeId}.pdf`,
            verification_status: 'verified',
            reviewed_by: ids.sa,
            reviewed_at: new Date(),
            created_at: new Date(),
          },
        });
      }

      // A verified document of a NON-required type satisfies "all uploaded verified"
      // and "at least one verified", but NOT our typeReq requirement.
      await prisma.application_document.create({
        data: {
          application_id: appId,
          document_type_id: typeOther,
          label: 'Other doc',
          file_path: `application_documents/${TAG}-other.pdf`,
          verification_status: 'verified',
          reviewed_by: ids.sa,
          reviewed_at: new Date(),
          created_at: new Date(),
        },
      });

      const blocked = await request(http)
        .post(`/api/applications/${appId}/sa-review`)
        .set(authHeader(tokens.sa))
        .send({ identity_ok: true, eligibility_ok: true, legible_ok: true, program_ok: true, decision: 'approve' });
      expect(blocked.status).toBe(400); // required document missing -> blocked
      // LOW 7: the block is the missing-required-document error, not some other 400.
      expect(String(blocked.body.message)).toMatch(/required document is missing or unverified/i);
      expect((await request(http).get(`/api/applications/${appId}`).set(authHeader(tokens.sa))).body.data.effective_stage).toBe('sa_verification');

      // Upload the required-type document (pending) and verify it.
      const reqDoc = await prisma.application_document.create({
        data: {
          application_id: appId,
          document_type_id: typeReq,
          label: 'Required doc',
          file_path: `application_documents/${TAG}-req.pdf`,
          verification_status: 'pending',
          created_at: new Date(),
        },
      });
      const review = await request(http)
        .post(`/api/applications/${appId}/documents/${reqDoc.id}/review`)
        .set(authHeader(tokens.sa))
        .send({ status: 'verified' });
      expect(review.status).toBe(201);

      // Now every applicable required document (incl. our fixture) is verified ->
      // approve proceeds to conversion.
      const approve = await request(http)
        .post(`/api/applications/${appId}/sa-review`)
        .set(authHeader(tokens.sa))
        .send({ identity_ok: true, eligibility_ok: true, legible_ok: true, program_ok: true, decision: 'approve' });
      expect(approve.status).toBe(201);
      expect(approve.body.data.student_no).toMatch(/^STU-\d{4}-\d{6}$/);
      if (approve.body.data.student_user_id) studentUserIds.push(approve.body.data.student_user_id);

      expect((await request(http).get(`/api/applications/${appId}`).set(authHeader(tokens.sa))).body.data.effective_stage).toBe('converted');
    }, 60000);
  });
});
