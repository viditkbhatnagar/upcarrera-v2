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

/**
 * Consultant targets (e2e) — QA TG01, TG02.
 *
 *  - TG01: Assign (POST), View (GET :id) and Edit (PATCH, partial) work end to
 *    end, with the validation the screen relies on: type 1|2 only, a positive
 *    value, real calendar dates, an ordered window, a live counsellor, and the
 *    overlap guard on BOTH create and edit.
 *  - TG02: the list is ordered by the target window (newest first), not by
 *    insertion order, and each row carries the counsellor's employee_code so
 *    the screen can show a display id instead of the bare users.id.
 *
 * Every fixture is created here with an `e2e_tgt_` prefix and removed after.
 */
describe('Consultant targets (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let token: string;
  let prisma: PrismaService;

  const P = 'e2e_tgt_';
  const U_MAIN = `${P}main`;
  const U_PLAIN = `${P}plain`;
  const U_STUDENT = `${P}student`;
  const CODE_MAIN = 'E2E-TGT-1';
  const usernames = [U_MAIN, U_PLAIN, U_STUDENT];

  let mainId: number;
  let plainId: number;
  let studentUserId: number;

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
    for (const u of usernames) await purgeUsersByUsername(app, u);
  }

  const post = (body: Record<string, unknown>) =>
    request(http).post('/api/consultant-targets').set(authHeader(token)).send(body);
  const patch = (id: number, body: Record<string, unknown>) =>
    request(http).patch(`/api/consultant-targets/${id}`).set(authHeader(token)).send(body);
  const getOne = (id: number) =>
    request(http).get(`/api/consultant-targets/${id}`).set(authHeader(token));

  const iso = (d: Date) => d.toISOString().slice(0, 10);

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    token = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);
    prisma = app.get(PrismaService);
    await cleanup();

    const now = new Date();
    const main = await prisma.users.create({
      data: {
        name: 'E2E Tgt Main',
        username: U_MAIN,
        role_id: 6,
        employee_code: CODE_MAIN,
        status: 1,
        created_at: now,
      },
    });
    mainId = main.id;
    const plain = await prisma.users.create({
      data: { name: 'E2E Tgt Plain', username: U_PLAIN, role_id: 6, status: 1, created_at: now },
    });
    plainId = plain.id;
    const student = await prisma.users.create({
      data: { name: 'E2E Tgt Student', username: U_STUDENT, role_id: 4, created_at: now },
    });
    studentUserId = student.id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  const base = () => ({
    consultant_id: mainId,
    type: 2,
    from_date: '2030-04-01',
    to_date: '2030-04-30',
    value: 12,
  });

  describe('POST /consultant-targets (Assign Target)', () => {
    let aprilAdmissionsId: number;

    it('creates a month-long admissions target', async () => {
      const res = await post(base());
      expect(res.status).toBe(201);
      aprilAdmissionsId = res.body.data.consultant_target_id;
      expect(res.body.data).toMatchObject({
        consultant_id: mainId,
        type: 2,
        value: 12,
      });
      expect(res.body.data.from_date.slice(0, 10)).toBe('2030-04-01');
      expect(res.body.data.to_date.slice(0, 10)).toBe('2030-04-30');
      expect(aprilAdmissionsId).toBeGreaterThan(0);
    });

    it('409s on an overlapping window for the same counsellor and type, naming the clash', async () => {
      const res = await post({ ...base(), from_date: '2030-04-15', to_date: '2030-05-15' });
      expect(res.status).toBe(409);
      expect(res.body.message).toContain('2030-04-01 to 2030-04-30');
    });

    it('allows the same window for the other type (points)', async () => {
      const res = await post({ ...base(), type: 1, value: 300 });
      expect(res.status).toBe(201);
      expect(res.body.data.type).toBe(1);
    });

    it.each([
      ['a revenue/unknown type', { type: 3 }],
      ['a zero value', { value: 0 }],
      ['a negative value', { value: -5 }],
      ['a non-ISO date', { from_date: '01/04/2030' }],
      ['an impossible calendar day', { from_date: '2030-02-30', to_date: '2030-03-05' }],
      ['a window that ends before it starts', { from_date: '2030-07-31', to_date: '2030-07-01' }],
    ])('400s on %s', async (_label, override) => {
      const res = await post({ ...base(), from_date: '2031-01-01', to_date: '2031-01-31', ...override });
      expect(res.status).toBe(400);
    });

    it('404s for a consultant_id that is not a counsellor (a student user)', async () => {
      const res = await post({ ...base(), consultant_id: studentUserId, from_date: '2031-02-01', to_date: '2031-02-28' });
      expect(res.status).toBe(404);
    });

    it('404s for a consultant_id that does not exist', async () => {
      const res = await post({ ...base(), consultant_id: 2_000_000_000 });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /consultant-targets (TG02 ordering + display id)', () => {
    it('orders by the target window, newest first, regardless of insertion order', async () => {
      // Inserted deliberately out of order: Mar 2030, then Oct 2029, then Jun 2030.
      for (const [from, to] of [
        ['2030-03-01', '2030-03-31'],
        ['2029-10-01', '2029-10-31'],
        ['2030-06-01', '2030-06-30'],
      ]) {
        const r = await post({ ...base(), consultant_id: plainId, from_date: from, to_date: to, value: 3 });
        expect(r.status).toBe(201);
      }

      const res = await request(http)
        .get('/api/consultant-targets')
        .query({ limit: 1000 })
        .set(authHeader(token));
      expect(res.status).toBe(200);

      const mine = (res.body.data.items as Array<Record<string, unknown>>).filter((t) =>
        [mainId, plainId].includes(t.consultant_id as number),
      );
      const froms = mine.map((t) => String(t.from_date).slice(0, 10));
      expect(froms).toEqual([...froms].sort().reverse());
      expect(new Set(froms)).toEqual(
        new Set(['2030-06-01', '2030-04-01', '2030-03-01', '2029-10-01']),
      );

      // The server-wide order holds too, not just within this spec's rows.
      const all = (res.body.data.items as Array<{ from_date: string | null }>)
        .map((t) => t.from_date)
        .filter((d): d is string => d != null);
      expect(all).toEqual([...all].sort().reverse());
    });

    it('carries consultant_name, consultant_employee_code and is_active on every row', async () => {
      const res = await request(http)
        .get('/api/consultant-targets')
        .query({ limit: 1000 })
        .set(authHeader(token));
      const items = res.body.data.items as Array<Record<string, unknown>>;
      const main = items.find((t) => t.consultant_id === mainId)!;
      const plain = items.find((t) => t.consultant_id === plainId)!;
      expect(main.consultant_name).toBe('E2E Tgt Main');
      expect(main.consultant_employee_code).toBe(CODE_MAIN);
      expect(plain.consultant_employee_code).toBeNull();
      expect(main.is_active).toBe(false); // 2030 window, not running today
    });

    it('search matches the employee code', async () => {
      const res = await request(http)
        .get('/api/consultant-targets')
        .query({ limit: 1000, search: CODE_MAIN })
        .set(authHeader(token));
      const items = res.body.data.items as Array<{ consultant_id: number }>;
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((t) => t.consultant_id === mainId)).toBe(true);
    });
  });

  describe('GET /consultant-targets/:id (View) and PATCH (Edit)', () => {
    let currentId: number;
    let juneId: number;

    beforeAll(async () => {
      const today = new Date();
      const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
      const res = await post({
        consultant_id: mainId,
        type: 2,
        from_date: iso(from),
        to_date: iso(to),
        value: 4,
      });
      expect(res.status).toBe(201);
      currentId = res.body.data.consultant_target_id;

      // One admission inside the window -> achieved 1 of 4.
      await prisma.students.create({
        data: {
          student_id: studentUserId,
          consultant_id: mainId,
          address: '-',
          enrollment_date: today,
        },
      });

      const june = await prisma.consultant_target.findFirst({
        where: { consultant_id: plainId, from_date: new Date('2030-06-01') },
      });
      juneId = june!.consultant_target_id;
    });

    it('returns one target with performance, display fields and is_active', async () => {
      const res = await getOne(currentId);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        consultant_target_id: currentId,
        consultant_name: 'E2E Tgt Main',
        consultant_employee_code: CODE_MAIN,
        is_active: true,
        achieved: 1,
        performance: '25%',
        value: 4,
      });
    });

    it('404s on an unknown id', async () => {
      expect((await getOne(2_000_000_000)).status).toBe(404);
      expect((await patch(2_000_000_000, { value: 5 })).status).toBe(404);
    });

    it('a value-only PATCH changes only the value', async () => {
      const before = (await getOne(juneId)).body.data;
      const res = await patch(juneId, { value: 9 });
      expect(res.status).toBe(200);
      const after = (await getOne(juneId)).body.data;
      expect(after.value).toBe(9);
      expect(after.type).toBe(before.type);
      expect(after.from_date).toBe(before.from_date);
      expect(after.to_date).toBe(before.to_date);
      expect(after.consultant_id).toBe(plainId);
    });

    it('re-saving its own window is not a conflict with itself', async () => {
      const res = await patch(juneId, { from_date: '2030-06-01', to_date: '2030-06-30' });
      expect(res.status).toBe(200);
    });

    it('409s when an edit moves the window onto another same-type target', async () => {
      // plain has Mar 2030 (type 2); moving June onto March must be refused.
      const res = await patch(juneId, { from_date: '2030-03-10', to_date: '2030-03-20' });
      expect(res.status).toBe(409);
      const after = (await getOne(juneId)).body.data;
      expect(after.from_date.slice(0, 10)).toBe('2030-06-01');
    });

    it('409s when an edit changes the type onto an overlapping target of that type', async () => {
      // main has April 2030 as both type 2 and type 1: flipping the type-1 row to 2 clashes.
      const points = await prisma.consultant_target.findFirst({
        where: { consultant_id: mainId, type: 1, from_date: new Date('2030-04-01') },
      });
      const res = await patch(points!.consultant_target_id, { type: 2 });
      expect(res.status).toBe(409);
    });

    it('400s when only to_date moves before the stored from_date', async () => {
      const res = await patch(juneId, { to_date: '2030-05-15' });
      expect(res.status).toBe(400);
    });

    it.each([
      ['an impossible day', { to_date: '2030-06-31' }],
      ['an unknown type', { type: 3 }],
      ['a zero value', { value: 0 }],
    ])('400s on %s', async (_label, body) => {
      const res = await patch(juneId, body);
      expect(res.status).toBe(400);
    });

    it('moves a window to a free month', async () => {
      const res = await patch(juneId, { from_date: '2030-08-01', to_date: '2030-08-31' });
      expect(res.status).toBe(200);
      expect(res.body.data.from_date.slice(0, 10)).toBe('2030-08-01');
      expect(res.body.data.to_date.slice(0, 10)).toBe('2030-08-31');
    });
  });
});
