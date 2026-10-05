import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import {
  ADMIN_CREDENTIALS,
  authHeader,
  bootApp,
  loginAs,
  purgeUsersByUsername,
} from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { USER_SECRET_FIELDS } from '../src/consultants/consultants.service';

/**
 * Consultants module hardening (e2e) — QA round 4 review findings.
 *
 *  - SECURITY: no consultants endpoint returns a credential column
 *    (password, prev_password, otp, zoom_password), at any nesting depth.
 *  - GET /consultant-targets computes achieved/performance in a fixed number of
 *    queries (batched), with the same results the per-target version gave, and
 *    a `summary` over every matching target (not just the page).
 *  - GET /consultants carries each counsellor's active targets.
 *  - GET /consultants/:id/performance keeps the active target even when 24+
 *    future targets exist.
 *  - Group codes: a code held by a soft-deleted group is a 409, never a 500.
 *
 * Every fixture is created here with an `e2e_chard_` / "E2E CHard" prefix and
 * removed after.
 */
describe('Consultants hardening (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let token: string;
  let prisma: PrismaService;

  const P = 'e2e_chard_';
  const NAME = 'E2E CHard';
  const U_A = `${P}a`;
  const U_B = `${P}b`;
  const U_STUDENT = `${P}student`;
  const usernames = [U_A, U_B, U_STUDENT];
  /** A course id far outside the seed range, for the specialisation points. */
  const COURSE = 2_000_000_001;
  const GROUP_CODE = 'E2E-CHARD-GR';

  let aId: number;
  let bId: number;
  let studentUserId: number;

  const DAY = 24 * 60 * 60 * 1000;
  const utcMidnight = (offsetDays: number) => {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + offsetDays * DAY,
    );
  };

  const get = (path: string, query: Record<string, unknown> = {}) =>
    request(http).get(`/api${path}`).query(query).set(authHeader(token));

  async function cleanup(): Promise<void> {
    const users = await prisma.users.findMany({
      where: { username: { in: usernames } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    if (ids.length) {
      await prisma.students.deleteMany({ where: { consultant_id: { in: ids } } });
      await prisma.consultant_target.deleteMany({ where: { consultant_id: { in: ids } } });
    }
    await prisma.specialisations.deleteMany({ where: { course_id: COURSE } });
    await prisma.counsellor_group.deleteMany({ where: { name: { startsWith: NAME } } });
    for (const u of usernames) await purgeUsersByUsername(app, u);
  }

  /** Every key at every depth of a JSON value. */
  function allKeys(value: unknown, out = new Set<string>()): Set<string> {
    if (Array.isArray(value)) {
      for (const v of value) allKeys(v, out);
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        out.add(k);
        allKeys(v, out);
      }
    }
    return out;
  }

  function expectNoSecrets(body: unknown): void {
    const keys = allKeys(body);
    for (const field of USER_SECRET_FIELDS) expect(keys.has(field)).toBe(false);
  }

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    token = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);
    prisma = app.get(PrismaService);
    await cleanup();

    const now = new Date();
    // Every credential column populated, so a leak would show.
    const secrets = {
      password: '$2a$10$e2echardhashhashhashhashhashhashhashhashhashhashhas',
      prev_password: '$2a$10$e2echardprevprevprevprevprevprevprevprevprevprevpre',
      otp: '123456',
      zoom_password: 'zoom-secret',
    };
    aId = (
      await prisma.users.create({
        data: { name: `${NAME} A`, username: U_A, role_id: 6, status: 1, created_at: now, ...secrets },
      })
    ).id;
    bId = (
      await prisma.users.create({
        data: { name: `${NAME} B`, username: U_B, role_id: 6, status: 1, created_at: now, ...secrets },
      })
    ).id;
    studentUserId = (
      await prisma.users.create({
        data: { name: `${NAME} Student`, username: U_STUDENT, role_id: 4, created_at: now, ...secrets },
      })
    ).id;

    // 5 + 2.5 = 7.5 points per student on COURSE.
    await prisma.specialisations.createMany({
      data: [
        { course_id: COURSE, title: `${NAME} spec 1`, point: '5' },
        { course_id: COURSE, title: `${NAME} spec 2`, point: '2.5' },
      ],
    });

    const student = (consultant_id: number, enrollment_date: Date | null, course_id: number | null) => ({
      student_id: studentUserId,
      consultant_id,
      address: '-',
      enrollment_date,
      course_id,
    });
    await prisma.students.createMany({
      data: [
        // A: three enrolled today, one two years ago, one with no date.
        student(aId, utcMidnight(0), COURSE),
        student(aId, utcMidnight(0), COURSE),
        student(aId, utcMidnight(-1), COURSE),
        student(aId, utcMidnight(-730), COURSE),
        student(aId, null, COURSE),
        // B: two enrolled today, no course.
        student(bId, utcMidnight(0), null),
        student(bId, utcMidnight(-3), null),
      ],
    });

    await prisma.consultant_target.createMany({
      data: [
        // A, active admissions: the 3 students in the window -> 3/6 = 50%.
        { consultant_id: aId, type: 2, value: 6, from_date: utcMidnight(-10), to_date: utcMidnight(10) },
        // A, active points: 3 x 7.5 = 22.5 of 30 = 75%.
        { consultant_id: aId, type: 1, value: 30, from_date: utcMidnight(-10), to_date: utcMidnight(10) },
        // A, ended admissions around two years ago: the 1 old student.
        { consultant_id: aId, type: 2, value: 1, from_date: utcMidnight(-735), to_date: utcMidnight(-725) },
        // B, no window at all: every student counts -> 2 of 4.
        { consultant_id: bId, type: 2, value: 4, from_date: null, to_date: null },
      ],
    });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('no credential column ever leaves the API', () => {
    it('GET /consultants', async () => {
      const res = await get('/consultants', { limit: 1000, search: NAME });
      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(2);
      expectNoSecrets(res.body);
    });

    it('GET /consultants/:id (with nested student users)', async () => {
      const res = await get(`/consultants/${aId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.students.length).toBe(5);
      expect(res.body.data.students[0].user).not.toBeNull();
      expectNoSecrets(res.body);
    });

    it('GET /consultants/:id/performance', async () => {
      const res = await get(`/consultants/${aId}/performance`);
      expect(res.status).toBe(200);
      expectNoSecrets(res.body);
    });

    it('GET /consultants/performance', async () => {
      const res = await get('/consultants/performance', { search: NAME });
      expect(res.status).toBe(200);
      expectNoSecrets(res.body);
    });

    it('GET /consultants/admissions and /admissions/:student_id', async () => {
      const list = await get('/consultants/admissions', { search: `${NAME} Student`, limit: 5 });
      expect(list.status).toBe(200);
      expect(list.body.data.items.length).toBeGreaterThan(0);
      expectNoSecrets(list.body);

      const one = await get(`/consultants/admissions/${studentUserId}`);
      expect(one.status).toBe(200);
      expectNoSecrets(one.body);
    });

    it('PATCH /consultants/:id and PATCH /consultants/:id/team responses', async () => {
      const upd = await request(http)
        .patch(`/api/consultants/${aId}`)
        .set(authHeader(token))
        .send({ name: `${NAME} A` });
      expect(upd.status).toBe(200);
      expectNoSecrets(upd.body);

      const team = await request(http)
        .patch(`/api/consultants/${aId}/team`)
        .set(authHeader(token))
        .send({ team_id: null });
      expect(team.status).toBe(200);
      expectNoSecrets(team.body);
    });

    it('still stores the secrets (stripped on the way out, not erased)', async () => {
      const row = await prisma.users.findUnique({ where: { id: aId } });
      expect(row?.otp).toBe('123456');
      expect(row?.zoom_password).toBe('zoom-secret');
    });
  });

  describe('GET /consultant-targets — batched performance + summary', () => {
    type Row = {
      consultant_id: number;
      type: number;
      value: number;
      achieved: number;
      performance: string;
      is_active: boolean;
    };
    const find = (rows: Row[], consultantId: number, type: number, value: number) =>
      rows.find((r) => r.consultant_id === consultantId && r.type === type && r.value === value);

    it('computes the same achieved/performance as the per-target rules', async () => {
      const res = await get('/consultant-targets', { search: NAME, limit: 1000 });
      expect(res.status).toBe(200);
      const rows = res.body.data.items as Row[];
      expect(res.body.data.total).toBe(4);

      expect(find(rows, aId, 2, 6)).toMatchObject({ achieved: 3, performance: '50%', is_active: true });
      expect(find(rows, aId, 1, 30)).toMatchObject({ achieved: 22.5, performance: '75%', is_active: true });
      expect(find(rows, aId, 2, 1)).toMatchObject({ achieved: 1, performance: '100%', is_active: false });
      expect(find(rows, bId, 2, 4)).toMatchObject({ achieved: 2, performance: '50%', is_active: true });
    });

    it('issues one students query for the whole page, not one per target', async () => {
      const spy = jest.spyOn(prisma.students, 'findMany');
      try {
        const res = await get('/consultant-targets', { search: NAME, limit: 1000 });
        expect(res.status).toBe(200);
        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        spy.mockRestore();
      }
    });

    it('summarises every matching target, independent of the page', async () => {
      const res = await get('/consultant-targets', { search: NAME, limit: 1, page: 2 });
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.total).toBe(4);
      const summary = res.body.data.summary;
      expect(summary).toMatchObject({ active: 3, upcoming: 0, ended: 1 });
      expect(summary.consultant_ids).toEqual([aId, bId].sort((x, y) => x - y));
      expect(summary.months).toContain(utcMidnight(-10).toISOString().slice(0, 7));
    });

    it('GET /consultant-targets/:id agrees with the list', async () => {
      const target = await prisma.consultant_target.findFirst({
        where: { consultant_id: aId, type: 1, value: 30 },
      });
      const res = await get(`/consultant-targets/${target!.consultant_target_id}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ achieved: 22.5, performance: '75%' });
    });
  });

  describe('GET /consultants — active target summary', () => {
    it('lists each counsellor’s active targets with achieved', async () => {
      const res = await get('/consultants', { limit: 1000, search: NAME });
      const items = res.body.data.items as Array<{
        id: number;
        active_targets: Array<{ type: number; value: number; achieved: number }>;
      }>;
      const a = items.find((i) => i.id === aId)!;
      const b = items.find((i) => i.id === bId)!;

      expect(a.active_targets).toHaveLength(2);
      expect(a.active_targets.find((t) => t.type === 2)).toMatchObject({ value: 6, achieved: 3 });
      expect(a.active_targets.find((t) => t.type === 1)).toMatchObject({ value: 30, achieved: 22.5 });
      // A window with no ends contains today.
      expect(b.active_targets).toEqual([expect.objectContaining({ type: 2, value: 4, achieved: 2 })]);
    });
  });

  describe('GET /consultants/:id/performance — active target survives 24+ future ones', () => {
    beforeAll(async () => {
      await prisma.consultant_target.createMany({
        data: Array.from({ length: 26 }, (_, i) => ({
          consultant_id: aId,
          type: 1,
          value: 10,
          from_date: utcMidnight(400 + i * 31),
          to_date: utcMidnight(400 + i * 31 + 30),
        })),
      });
    });

    it('still returns both active targets', async () => {
      const res = await get(`/consultants/${aId}/performance`);
      expect(res.status).toBe(200);
      const targets = res.body.data.targets as Array<{ type: number; is_active: boolean }>;
      const active = targets.filter((t) => t.is_active);
      expect(active.map((t) => t.type).sort()).toEqual([1, 2]);
      // The 24 most recent windows, plus the active ones.
      expect(targets.length).toBe(26);
    });
  });

  describe('group codes held by soft-deleted groups', () => {
    let deletedGroupId: number;
    let liveGroupId: number;

    it('409s (not 500) when creating with a code a deleted group still holds', async () => {
      const created = await request(http)
        .post('/api/consultants/groups')
        .set(authHeader(token))
        .send({ code: GROUP_CODE, name: `${NAME} Group Old` });
      expect(created.status).toBe(201);
      deletedGroupId = created.body.data.id;

      const del = await request(http)
        .delete(`/api/consultants/groups/${deletedGroupId}`)
        .set(authHeader(token));
      expect(del.status).toBe(200);

      const reuse = await request(http)
        .post('/api/consultants/groups')
        .set(authHeader(token))
        .send({ code: GROUP_CODE, name: `${NAME} Group New` });
      expect(reuse.status).toBe(409);
      expect(reuse.body.message).toMatch(/deleted group/);
    });

    it('409s (not 500) when an edit moves onto a deleted group’s code', async () => {
      const created = await request(http)
        .post('/api/consultants/groups')
        .set(authHeader(token))
        .send({ code: `${GROUP_CODE}-2`, name: `${NAME} Group Live` });
      expect(created.status).toBe(201);
      liveGroupId = created.body.data.id;

      const res = await request(http)
        .patch(`/api/consultants/groups/${liveGroupId}`)
        .set(authHeader(token))
        .send({ code: GROUP_CODE });
      expect(res.status).toBe(409);
    });

    it('treats a blank code as no code, so two code-less groups do not clash', async () => {
      const one = await request(http)
        .post('/api/consultants/groups')
        .set(authHeader(token))
        .send({ code: '  ', name: `${NAME} Group Blank 1` });
      const two = await request(http)
        .post('/api/consultants/groups')
        .set(authHeader(token))
        .send({ code: '', name: `${NAME} Group Blank 2` });
      expect(one.status).toBe(201);
      expect(two.status).toBe(201);
      expect(one.body.data.code).toBeNull();
      expect(two.body.data.code).toBeNull();
    });

    it('clears a code with "" on update', async () => {
      const res = await request(http)
        .patch(`/api/consultants/groups/${liveGroupId}`)
        .set(authHeader(token))
        .send({ code: '' });
      expect(res.status).toBe(200);
      expect(res.body.data.code).toBeNull();
    });
  });
});
