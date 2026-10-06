import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { FeeStructuresService } from '../src/finance/fee-structures/fee-structures.service';

/**
 * End-to-end coverage of WS2 (Fee Structure master) on the real stack + DB:
 * the unique-key 409, Draft-only delete, Expired read-only, the activation race
 * (one winner), copy + bulk-copy idempotency, resolve, the Rs0 activation guard,
 * and the permission matrix (index vs manage vs catalog.view).
 *
 * Each test allocates its OWN intakes via freshIntake() so the
 * (university, course, intake) unique key never collides between cases. The 57
 * seed intakes have NULL start_date, and fresh intakes use consecutive
 * far-future dates, so "next intake" is deterministic.
 */
describe('Fee structures / WS2 (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let prisma: PrismaService;

  const TAG = `e2e_fs_${Date.now()}`;
  const PASSWORD = 'FeeStruct@12345';
  let phoneSeq = 0;
  const uniquePhone = () => `97${String(Date.now()).slice(-7)}${phoneSeq++ % 10}`;

  const tokens: Record<string, string> = {};
  let uniId = 0; // has fee_collection_model
  let uniNoModelId = 0; // fee_collection_model NULL
  let courseId = 0;
  let courseNoModelId = 0;

  /** Monotonic intake-date allocator: day N of a far-future window, so picks are deterministic. */
  let intakeSeq = 0;
  async function freshIntake(suffix = ''): Promise<number> {
    const day = intakeSeq++;
    const start = new Date(Date.UTC(2090, 0, 1 + day * 2));
    const closing = new Date(Date.UTC(2090, 0, 2 + day * 2));
    const now = new Date();
    const row = await prisma.intake.create({
      data: {
        name: `${TAG} intake ${day} ${suffix}`.trim(),
        start_date: start,
        closing_date: closing,
        created_at: now,
        updated_at: now,
      },
    });
    return row.id;
  }

  async function mkStaff(key: string, roleId: number): Promise<void> {
    const username = `${TAG}_${key}`;
    const hash = await bcrypt.hash(PASSWORD, 10);
    await prisma.users.create({
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
  }

  function validBody(intake: number, overrides: Record<string, unknown> = {}) {
    return {
      university_id: uniId,
      course_id: courseId,
      intake_id: intake,
      registration_fee: 5000,
      course_fee_basis: 'total',
      course_fee_amount: 200000,
      exam_fee: 0,
      allow_full: true,
      ...overrides,
    };
  }

  const create = (token: string, body: Record<string, unknown>) =>
    request(http).post('/api/fee-structures').set(authHeader(token)).send(body);
  const activate = (token: string, id: number) =>
    request(http).post(`/api/fee-structures/${id}/activate`).set(authHeader(token)).send({});

  async function createActive(intake: number, overrides: Record<string, unknown> = {}): Promise<number> {
    const res = await create(tokens.admin, validBody(intake, overrides));
    expect(res.status).toBe(201);
    const id = res.body.data.id as number;
    const act = await activate(tokens.admin, id);
    expect(act.status).toBe(201);
    return id;
  }

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    prisma = app.get(PrismaService);
    await cleanup();

    tokens.superadmin = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);

    const roles = await prisma.user_role.findMany({
      where: { role_key: { in: ['admin', 'accounts', 'counsellor'] } },
      select: { id: true, role_key: true },
    });
    const roleId = (key: string): number => {
      const r = roles.find((x) => x.role_key === key);
      if (!r) throw new Error(`role_key ${key} not seeded — apply migration 002`);
      return r.id;
    };
    await mkStaff('admin', roleId('admin'));
    await mkStaff('accounts', roleId('accounts'));
    await mkStaff('counsellor', roleId('counsellor'));

    const now = new Date();
    const uni = await prisma.university.create({
      data: {
        title: `${TAG} University`,
        country_id: '',
        website: '',
        phone: '',
        email: '',
        fee_collection_model: 'upcarrera_collects',
        created_at: now,
        updated_at: now,
      },
    });
    uniId = uni.id;
    const uni2 = await prisma.university.create({
      data: {
        title: `${TAG} University NoModel`,
        country_id: '',
        website: '',
        phone: '',
        email: '',
        fee_collection_model: null,
        created_at: now,
        updated_at: now,
      },
    });
    uniNoModelId = uni2.id;

    const course = await prisma.course.create({
      data: {
        title: `${TAG} Course`,
        short_name: `${TAG}-C`,
        stream: 'Management',
        total_duration: '2 Years',
        duration: '2 Years',
        study_mode: 'Online',
        university_id: uniId,
        total_amount: 0,
        created_at: now,
        updated_at: now,
      },
    });
    courseId = course.id;
    const course2 = await prisma.course.create({
      data: {
        title: `${TAG} Course NoModel`,
        short_name: `${TAG}-C2`,
        stream: 'Management',
        total_duration: '2 Years',
        duration: '2 Years',
        study_mode: 'Online',
        university_id: uniNoModelId,
        total_amount: 0,
        created_at: now,
        updated_at: now,
      },
    });
    courseNoModelId = course2.id;
  }, 30000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup() {
    const [unis, courses, intakes] = await Promise.all([
      prisma.university.findMany({ where: { title: { startsWith: TAG } }, select: { id: true } }),
      prisma.course.findMany({ where: { title: { startsWith: TAG } }, select: { id: true } }),
      prisma.intake.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } }),
    ]);
    const uniIds = unis.map((u) => u.id);
    const courseIds = courses.map((c) => c.id);
    const intakeIds = intakes.map((i) => i.id);
    const or = [
      ...(uniIds.length ? [{ university_id: { in: uniIds } }] : []),
      ...(courseIds.length ? [{ course_id: { in: courseIds } }] : []),
      ...(intakeIds.length ? [{ intake_id: { in: intakeIds } }] : []),
    ];
    if (or.length) {
      const feeRows = await prisma.fee_structure.findMany({ where: { OR: or }, select: { id: true } });
      const feeIds = feeRows.map((r) => r.id);
      if (feeIds.length) {
        await prisma.fee_structure_item.deleteMany({ where: { fee_structure_id: { in: feeIds } } });
        await prisma.fee_structure_instalment.deleteMany({ where: { fee_structure_id: { in: feeIds } } });
        await prisma.audit_log.deleteMany({
          where: { entity: 'fee_structure', entity_id: { in: feeIds.map(String) } },
        });
        await prisma.fee_structure.deleteMany({ where: { id: { in: feeIds } } });
      }
    }
    if (intakeIds.length) await prisma.intake.deleteMany({ where: { id: { in: intakeIds } } });
    if (courseIds.length) await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
    if (uniIds.length) await prisma.university.deleteMany({ where: { id: { in: uniIds } } });
    await prisma.users.deleteMany({ where: { username: { startsWith: TAG } } });
  }

  // ---- create + unique key ---------------------------------------------------

  it('creates a Draft with a FEE- code and a recomputed total, then 409s on the duplicate key', async () => {
    const intake = await freshIntake();
    const res = await create(tokens.admin, validBody(intake, { exam_fee: 1000, exam_fee_basis: 'one_time' }));
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.code).toMatch(/^FEE-\d{5}$/);
    expect(res.body.data.total_fee).toBe(201000); // 200000 course + 1000 exam
    expect(res.body.data.intake_status).toBe('Upcoming'); // 2090 start

    const dup = await create(tokens.admin, validBody(intake));
    expect(dup.status).toBe(409);
    expect(dup.body.message).toMatch(/already exists for this university, course and intake/i);
  });

  it('rejects a course that is not tagged to the university', async () => {
    const intake = await freshIntake();
    const res = await create(tokens.admin, {
      ...validBody(intake),
      course_id: courseNoModelId, // belongs to uniNoModel, not uni
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not tagged to the selected university/i);
  });

  // ---- Rs0 activation guard --------------------------------------------------

  it('blocks activation of a ₹0 course fee (the spec Rs0 rule)', async () => {
    const intake = await freshIntake();
    const draft = await create(tokens.admin, validBody(intake, { course_fee_amount: 0 }));
    expect(draft.status).toBe(201);
    expect(draft.body.data.activation.ok).toBe(false);

    const act = await activate(tokens.admin, draft.body.data.id);
    expect(act.status).toBe(422);
    expect(act.body.message).toMatch(/Course fee is ₹0/);
  });

  it('names the missing collection model as an activation blocker', async () => {
    const intake = await freshIntake();
    const now = new Date();
    const row = await prisma.fee_structure.create({
      data: {
        university_id: uniNoModelId,
        course_id: courseNoModelId,
        intake_id: intake,
        status: 'draft',
        registration_fee: '5000.00',
        course_fee_basis: 'total',
        course_fee_amount: '100000.00',
        course_fee_total: '100000.00',
        other_fees_total: '0.00',
        total_fee: '100000.00',
        allow_full: true,
        created_by: 1,
        created_at: now,
        updated_at: now,
      },
    });
    const detail = await request(http)
      .get(`/api/fee-structures/${row.id}`)
      .set(authHeader(tokens.admin));
    expect(detail.status).toBe(200);
    expect(detail.body.data.activation.ok).toBe(false);
    expect(detail.body.data.activation.reasons.join(' ')).toMatch(/collection model is not set/i);

    const act = await activate(tokens.admin, row.id);
    expect(act.status).toBe(422);
    expect(act.body.message).toMatch(/collection model is not set/i);
  });

  // ---- activation race -------------------------------------------------------

  it('leaves exactly one winner when two activates race', async () => {
    const intake = await freshIntake();
    const draft = await create(tokens.admin, validBody(intake));
    const id = draft.body.data.id as number;

    const [r1, r2] = await Promise.all([activate(tokens.admin, id), activate(tokens.admin, id)]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);

    const detail = await request(http).get(`/api/fee-structures/${id}`).set(authHeader(tokens.admin));
    expect(detail.body.data.status).toBe('active');
  });

  // ---- lifecycle: active edit, expire, read-only -----------------------------

  it('requires a change reason to edit an Active structure, then audits the change', async () => {
    const id = await createActive(await freshIntake());

    const noReason = await request(http)
      .patch(`/api/fee-structures/${id}`)
      .set(authHeader(tokens.admin))
      .send({ registration_fee: 6000 });
    expect(noReason.status).toBe(422);
    expect(noReason.body.message).toMatch(/change reason is required/i);

    const withReason = await request(http)
      .patch(`/api/fee-structures/${id}`)
      .set(authHeader(tokens.admin))
      .send({ registration_fee: 6000, change_reason: 'Fee revised for 2090 intake' });
    expect(withReason.status).toBe(200);
    expect(withReason.body.data.registration_fee).toBe(6000);

    // The edit is audited with the reason.
    const audits = await prisma.audit_log.count({
      where: { entity: 'fee_structure', entity_id: String(id), action: 'update' },
    });
    expect(audits).toBeGreaterThanOrEqual(1);
  });

  it('cannot drop an Active course fee to ₹0', async () => {
    const id = await createActive(await freshIntake());
    const res = await request(http)
      .patch(`/api/fee-structures/${id}`)
      .set(authHeader(tokens.admin))
      .send({ course_fee_amount: 0, change_reason: 'oops' });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/cannot drop to ₹0/i);
  });

  it('expires an Active structure, after which it is read-only (PATCH + DELETE 409)', async () => {
    const id = await createActive(await freshIntake());

    const expire = await request(http)
      .post(`/api/fee-structures/${id}/expire`)
      .set(authHeader(tokens.admin))
      .send({ reason: 'intake closed' });
    expect(expire.status).toBe(201);
    expect(expire.body.data.status).toBe('expired');

    const patch = await request(http)
      .patch(`/api/fee-structures/${id}`)
      .set(authHeader(tokens.admin))
      .send({ registration_fee: 7000, change_reason: 'x' });
    expect(patch.status).toBe(409);
    expect(patch.body.message).toMatch(/read-only/i);

    const del = await request(http).delete(`/api/fee-structures/${id}`).set(authHeader(tokens.admin));
    expect(del.status).toBe(409);
  });

  // ---- Draft-only delete -----------------------------------------------------

  it('deletes a Draft, but refuses to delete an Active structure', async () => {
    const draft = await create(tokens.admin, validBody(await freshIntake()));
    const del = await request(http)
      .delete(`/api/fee-structures/${draft.body.data.id}`)
      .set(authHeader(tokens.admin));
    expect(del.status).toBe(200);
    expect(del.body.data.deleted).toBe(true);

    const activeId = await createActive(await freshIntake());
    const delActive = await request(http)
      .delete(`/api/fee-structures/${activeId}`)
      .set(authHeader(tokens.admin));
    expect(delActive.status).toBe(409);
    expect(delActive.body.message).toMatch(/Only Draft/i);
  });

  // ---- copy + bulk copy ------------------------------------------------------

  it('copies to the next intake by default and is idempotent on the unique key', async () => {
    // Two consecutive fresh intakes: target is the immediate next after source.
    const source = await freshIntake('copy-src');
    const target = await freshIntake('copy-dst');
    const sourceId = await createActive(source);

    const copy = await request(http)
      .post(`/api/fee-structures/${sourceId}/copy`)
      .set(authHeader(tokens.admin))
      .send({});
    expect(copy.status).toBe(201);
    expect(copy.body.data.intake_id).toBe(target);
    expect(copy.body.data.status).toBe('draft');
    expect(copy.body.data.copied_from_id).toBe(sourceId);
    expect(copy.body.data.copied_from_code).toMatch(/^FEE-\d{5}$/);

    // Copying to the same target again collides on the unique key -> 409.
    const again = await request(http)
      .post(`/api/fee-structures/${sourceId}/copy`)
      .set(authHeader(tokens.admin))
      .send({ intake_id: target });
    expect(again.status).toBe(409);
  });

  it('bulk copy-intake is idempotent: a second run creates nothing', async () => {
    const from = await freshIntake('bulk-from');
    const to = await freshIntake('bulk-to');
    await createActive(from);

    const first = await request(http)
      .post('/api/fee-structures/copy-intake')
      .set(authHeader(tokens.admin))
      .send({ from_intake_id: from, to_intake_id: to, university_id: uniId });
    expect(first.status).toBe(201);
    expect(first.body.data.created).toBeGreaterThanOrEqual(1);

    const second = await request(http)
      .post('/api/fee-structures/copy-intake')
      .set(authHeader(tokens.admin))
      .send({ from_intake_id: from, to_intake_id: to, university_id: uniId });
    expect(second.status).toBe(201);
    expect(second.body.data.created).toBe(0);
    expect(second.body.data.skipped.length).toBeGreaterThanOrEqual(1);
    expect(second.body.data.skipped[0].university).toContain(TAG);
  });

  // ---- resolve ---------------------------------------------------------------

  it('resolves the active structure for stage 4, and 404s when none is active', async () => {
    const active = await freshIntake();
    const empty = await freshIntake();
    const id = await createActive(active);

    const resolved = await request(http)
      .get('/api/fee-structures/resolve')
      .query({ university_id: uniId, course_id: courseId, intake_id: active })
      .set(authHeader(tokens.admin));
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.id).toBe(id);
    expect(resolved.body.data.registration_fee).toBe(5000);
    expect(resolved.body.data.fee_collection_model).toBe('upcarrera_collects');

    const missing = await request(http)
      .get('/api/fee-structures/resolve')
      .query({ university_id: uniId, course_id: courseId, intake_id: empty })
      .set(authHeader(tokens.admin));
    expect(missing.status).toBe(404);
    expect(missing.body.message).toMatch(/No active fee structure/i);
  });

  it('exports the filtered list as CSV', async () => {
    const res = await request(http)
      .get('/api/fee-structures/export')
      .query({ university_id: uniId })
      .set(authHeader(tokens.admin));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text.split('\r\n')[0]).toContain('Code');
  });

  // ---- permissions -----------------------------------------------------------

  it('lets Accounts read the list but not manage it', async () => {
    const list = await request(http).get('/api/fee-structures').set(authHeader(tokens.accounts));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveProperty('counts');

    const create403 = await create(tokens.accounts, validBody(await freshIntake()));
    expect(create403.status).toBe(403);
  });

  it('lets a Counsellor resolve (catalog.view) but not read the index', async () => {
    const intake = await freshIntake();
    await createActive(intake);
    const resolve = await request(http)
      .get('/api/fee-structures/resolve')
      .query({ university_id: uniId, course_id: courseId, intake_id: intake })
      .set(authHeader(tokens.counsellor));
    expect(resolve.status).toBe(200);

    const list = await request(http).get('/api/fee-structures').set(authHeader(tokens.counsellor));
    expect(list.status).toBe(403);
  });

  it('exposes the list counts and status filter', async () => {
    await createActive(await freshIntake());
    const list = await request(http)
      .get('/api/fee-structures')
      .query({ university_id: uniId, status: 'active' })
      .set(authHeader(tokens.admin));
    expect(list.status).toBe(200);
    expect(typeof list.body.data.counts.active).toBe('number');
    for (const item of list.body.data.items) {
      expect(item.status).toBe('active');
    }
  });

  // ---- HIGH-1: active edit must stay activatable ------------------------------

  it('refuses an edit that would make an Active structure unactivatable (HIGH-1)', async () => {
    const id = await createActive(await freshIntake());

    // Turning off every instalment plan fails the full activation guard.
    const allPlansOff = await request(http)
      .patch(`/api/fee-structures/${id}`)
      .set(authHeader(tokens.admin))
      .send({ allow_full: false, change_reason: 'disable all plans' });
    expect(allPlansOff.status).toBe(422);
    expect(allPlansOff.body.message).toMatch(/unactivatable|at least one instalment/i);

    // A custom plan that no longer sums to the total is also rejected.
    const badCustom = await request(http)
      .patch(`/api/fee-structures/${id}`)
      .set(authHeader(tokens.admin))
      .send({
        allow_full: false,
        allow_custom: true,
        instalments: [{ seq: 1, amount: 100, due_offset_days: 0 }], // ₹100 of ₹2,00,000
        change_reason: 'bad custom plan',
      });
    expect(badCustom.status).toBe(422);
    expect(badCustom.body.message).toMatch(/custom plan sums|unactivatable/i);

    // Neither failed edit was applied: the row is still Active with its plan intact.
    const detail = await request(http).get(`/api/fee-structures/${id}`).set(authHeader(tokens.admin));
    expect(detail.body.data.status).toBe('active');
    expect(detail.body.data.allow_full).toBe(true);
    expect(detail.body.data.allow_custom).toBe(false);
  });

  // ---- MEDIUM-2: atomic status guards (races) --------------------------------

  it('a DELETE racing an activate never leaves an active-and-deleted row (MEDIUM-2)', async () => {
    const draft = await create(tokens.admin, validBody(await freshIntake()));
    const id = draft.body.data.id as number;

    const [del, act] = await Promise.all([
      request(http).delete(`/api/fee-structures/${id}`).set(authHeader(tokens.admin)),
      activate(tokens.admin, id),
    ]);
    expect(del.status).not.toBe(500);
    expect(act.status).not.toBe(500);

    const detail = await request(http).get(`/api/fee-structures/${id}`).set(authHeader(tokens.admin));
    if (detail.status === 200) {
      // The row survived -> activate won, and the delete must have been rejected (409).
      expect(detail.body.data.status).toBe('active');
      expect(del.status).toBe(409);
    } else {
      // The row is gone -> delete won, and activate must not report success.
      expect(detail.status).toBe(404);
      expect(act.status).not.toBe(201);
    }
  });

  it('a PATCH racing an expire is serialized and never edits an Expired row (MEDIUM-2)', async () => {
    const id = await createActive(await freshIntake());

    const [patch, expire] = await Promise.all([
      request(http)
        .patch(`/api/fee-structures/${id}`)
        .set(authHeader(tokens.admin))
        .send({ registration_fee: 9123, change_reason: 'race' }),
      request(http)
        .post(`/api/fee-structures/${id}/expire`)
        .set(authHeader(tokens.admin))
        .send({ reason: 'race' }),
    ]);
    expect(patch.status).not.toBe(500);
    expect(expire.status).toBe(201);

    const detail = await request(http).get(`/api/fee-structures/${id}`).set(authHeader(tokens.admin));
    expect(detail.body.data.status).toBe('expired');
    // The PATCH either applied while the row was still Active, or was rejected with a 409.
    if (patch.status !== 200) expect(patch.status).toBe(409);
    if (detail.body.data.registration_fee === 9123) expect(patch.status).toBe(200);
  });

  // ---- MEDIUM-3: intake ordering with NULL start_date ------------------------

  it('copy-to-next-intake resolves across dateless intakes by (year, month) (MEDIUM-3)', async () => {
    const now = new Date();
    // Two intakes with NULL start_date — the production shape — far enough in the
    // future (year 2099) that nothing else sorts between them.
    const src = await prisma.intake.create({
      data: { name: `${TAG} dateless src`, year: 2099, month: 'January', created_at: now, updated_at: now },
    });
    const dst = await prisma.intake.create({
      data: { name: `${TAG} dateless dst`, year: 2099, month: 'February', created_at: now, updated_at: now },
    });

    // nextIntakeFor picks dst even though neither intake has a start_date.
    const next = await app.get(FeeStructuresService).nextIntakeFor(src.id);
    expect(next).toBe(dst.id);

    // End-to-end: a copy with no explicit target lands on dst as a Draft.
    const srcId = await createActive(src.id);
    const copy = await request(http)
      .post(`/api/fee-structures/${srcId}/copy`)
      .set(authHeader(tokens.admin))
      .send({});
    expect(copy.status).toBe(201);
    expect(copy.body.data.intake_id).toBe(dst.id);
    expect(copy.body.data.status).toBe('draft');
    // The dateless intake still gets a sensible status badge from (year, month).
    expect(copy.body.data.intake_status).toBe('Upcoming');
  });

  // ---- MEDIUM-4: fee_collection_model cannot be cleared ----------------------

  it('refuses to clear a university fee_collection_model, but allows setting it (MEDIUM-4)', async () => {
    const cleared = await request(http)
      .patch(`/api/universities/${uniId}`)
      .set(authHeader(tokens.superadmin))
      .send({ fee_collection_model: null });
    expect(cleared.status).toBe(400);
    expect(cleared.body.message).toMatch(/cannot be cleared/i);

    // Empty string is rejected too (DTO validation or the service guard).
    const emptied = await request(http)
      .patch(`/api/universities/${uniId}`)
      .set(authHeader(tokens.superadmin))
      .send({ fee_collection_model: '' });
    expect(emptied.status).toBe(400);

    // An edit that omits the key leaves the stored model intact.
    const other = await request(http)
      .patch(`/api/universities/${uniId}`)
      .set(authHeader(tokens.superadmin))
      .send({ ranking: 'Top 100' });
    expect(other.status).toBe(200);
    expect(other.body.data.fee_collection_model).toBe('upcarrera_collects');

    // Setting a university that has none (unset -> a valid value) works.
    const now = new Date();
    const blank = await prisma.university.create({
      data: {
        title: `${TAG} SetModel Uni`,
        country_id: '',
        website: '',
        phone: '',
        email: '',
        fee_collection_model: null,
        created_at: now,
        updated_at: now,
      },
    });
    const set = await request(http)
      .patch(`/api/universities/${blank.id}`)
      .set(authHeader(tokens.superadmin))
      .send({ fee_collection_model: 'university_collects' });
    expect(set.status).toBe(200);
    expect(set.body.data.fee_collection_model).toBe('university_collects');
  });

  // ---- FS05: per-year / per-semester components need a period count ----------

  it('rejects a per-year fee when the course duration cannot be resolved (FS05)', async () => {
    const now = new Date();
    const noDuration = await prisma.course.create({
      data: {
        title: `${TAG} NoDuration Course`,
        short_name: `${TAG}-ND`,
        stream: 'Management',
        total_duration: 'N/A',
        duration: null,
        study_mode: 'Online',
        university_id: uniId,
        total_amount: 0,
        created_at: now,
        updated_at: now,
      },
    });

    const rejected = await create(tokens.admin, {
      university_id: uniId,
      course_id: noDuration.id,
      intake_id: await freshIntake(),
      registration_fee: 5000,
      course_fee_basis: 'total',
      course_fee_amount: 200000,
      exam_fee: 2000,
      exam_fee_basis: 'per_year', // per-year, but the course has no resolvable duration
      allow_full: true,
    });
    expect(rejected.status).toBe(422);
    expect(rejected.body.message).toMatch(
      /per-year or per-semester|course duration could not be determined/i,
    );

    // With an explicit course-fee period count the same shape resolves and saves.
    const ok = await create(tokens.admin, {
      university_id: uniId,
      course_id: noDuration.id,
      intake_id: await freshIntake(),
      registration_fee: 5000,
      course_fee_basis: 'per_year',
      course_fee_amount: 100000,
      course_fee_periods: 2,
      exam_fee: 2000,
      exam_fee_basis: 'per_year',
      allow_full: true,
    });
    expect(ok.status).toBe(201);
    expect(ok.body.data.total_fee).toBe(100000 * 2 + 2000 * 2); // course 2y + exam 2y
  });

  it('expands a per-year exam fee over the course duration even for a flat total course fee (FS05)', async () => {
    const res = await create(
      tokens.admin,
      validBody(await freshIntake(), {
        course_fee_basis: 'total',
        course_fee_amount: 200000,
        exam_fee: 3000,
        exam_fee_basis: 'per_year', // the fixture course is "2 Years"
      }),
    );
    expect(res.status).toBe(201);
    // 200000 flat course + 3000 × 2 years = 206000 (not 203000).
    expect(res.body.data.total_fee).toBe(206000);
  });

  // ---- FS06: a ₹0 registration fee is activatable ----------------------------

  it('activates with a ₹0 registration fee — only the course fee has the Rs0 guard (FS06)', async () => {
    const draft = await create(tokens.admin, validBody(await freshIntake(), { registration_fee: 0 }));
    expect(draft.status).toBe(201);
    expect(draft.body.data.activation.ok).toBe(true);
    expect(draft.body.data.activation.reasons.join(' ')).not.toMatch(/registration/i);

    const act = await activate(tokens.admin, draft.body.data.id);
    expect(act.status).toBe(201);
    expect(act.body.data.status).toBe('active');
  });

  // ---- LOW-9: the list carries the per-row activation check -------------------

  it('includes the per-row activation {ok, reasons} in the list response (LOW-9)', async () => {
    const intake = await freshIntake();
    const draft = await create(tokens.admin, validBody(intake, { course_fee_amount: 0 }));
    expect(draft.status).toBe(201);

    const list = await request(http)
      .get('/api/fee-structures')
      .query({ university_id: uniId, intake_id: intake })
      .set(authHeader(tokens.admin));
    expect(list.status).toBe(200);
    const row = list.body.data.items.find(
      (r: { id: number }) => r.id === draft.body.data.id,
    );
    expect(row).toBeDefined();
    expect(row.activation.ok).toBe(false);
    expect(row.activation.reasons.join(' ')).toMatch(/Course fee is ₹0/);
  });
});
