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
 * Counsellor create/edit + profile performance (e2e) — QA C03, C06, C07, C08.
 *
 *  - C08: phones are normalised on save ("87146 89444" -> "8714689444", code 91),
 *    invalid ones are rejected, and the duplicate guard sees legacy shapes.
 *  - C06/C03: employee_code is accepted on create and update, unique (409), and
 *    a partial PATCH leaves untouched fields alone.
 *  - C07: GET /consultants/:id/performance reports counts over the counsellor's
 *    COMPLETE set (applications via pipeline_user ?? created_by), plus targets
 *    with an is_active flag and the team hierarchy.
 *
 * Every fixture is created here with an `e2e_cprof_` prefix and removed after.
 */
describe('Consultants profile + edit (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let token: string;
  let prisma: PrismaService;

  const P = 'e2e_cprof_';
  const U_MAIN = `${P}main`;
  const U_SECOND = `${P}second`;
  const U_INTL = `${P}intl`;
  const U_LEGACY = `${P}legacy`;
  const U_STUDENT = `${P}student`;
  const U_OTHER = `${P}other`;
  const TEAM = 'E2E CProf Team';
  const CODE_A = 'E2E-CPROF-1';
  const CODE_B = 'E2E-CPROF-2';

  // Numbers in the 6xxxx range so they never collide with seed rows.
  const PHONE_MAIN_TYPED = '60000 11101';
  const PHONE_MAIN = '6000011101';
  const PHONE_LEGACY_STORED = '60000 11109';

  const usernames = [
    U_MAIN,
    U_SECOND,
    U_INTL,
    U_LEGACY,
    U_STUDENT,
    U_OTHER,
    ...["bad", "dup", "dup2", "dup3", "dup4"].map((s) => `${P}${s}`),
  ];

  let mainId: number;
  let secondId: number;
  let studentUserId: number;
  let otherId: number;
  let teamId: number;

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
    await prisma.applications.deleteMany({ where: { name: { startsWith: P } } });
    await prisma.sales_team.deleteMany({ where: { name: TEAM } });
    for (const u of usernames) await purgeUsersByUsername(app, u);
  }

  const post = (body: Record<string, unknown>) =>
    request(http).post('/api/consultants').set(authHeader(token)).send(body);
  const patch = (id: number, body: Record<string, unknown>) =>
    request(http).patch(`/api/consultants/${id}`).set(authHeader(token)).send(body);

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    token = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);
    prisma = app.get(PrismaService);
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('create — phone normalisation and employee_code (C08, C06)', () => {
    it('stores a spaced Indian mobile as the bare 10 digits with code 91', async () => {
      const res = await post({
        name: 'E2E CProf Main',
        username: U_MAIN,
        password: 'e2e-password-1',
        phone: PHONE_MAIN_TYPED,
        employee_code: `  ${CODE_A}  `,
      });
      expect(res.status).toBe(201);
      mainId = res.body.data.id;
      expect(res.body.data.phone).toBe(PHONE_MAIN);
      expect(res.body.data.code).toBe(91);
      expect(res.body.data.employee_code).toBe(CODE_A);
      expect(res.body.data.password).toBeUndefined();
    });

    it('strips a leading 0 trunk prefix', async () => {
      const res = await post({
        name: 'E2E CProf Second',
        username: U_SECOND,
        password: 'e2e-password-2',
        phone: '06000011102',
      });
      expect(res.status).toBe(201);
      secondId = res.body.data.id;
      expect(res.body.data.phone).toBe('6000011102');
      expect(res.body.data.employee_code).toBeNull();
    });

    it('keeps a non-Indian number as E.164', async () => {
      const res = await post({
        name: 'E2E CProf Intl',
        username: U_INTL,
        password: 'e2e-password-3',
        phone: '+974 5500 1234',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.phone).toBe('+97455001234');
    });

    it.each([['97454003222'], ['12345'], ['98765-4321x'], ['5876543210']])(
      'rejects %s with a 400',
      async (phone) => {
        const res = await post({
          name: 'E2E CProf Bad',
          username: `${P}bad`,
          password: 'e2e-password-x',
          phone,
        });
        expect(res.status).toBe(400);
        expect(JSON.stringify(res.body.message)).toMatch(/phone/i);
      },
    );

    it('rejects a duplicate phone typed in another shape (+91 prefix)', async () => {
      const res = await post({
        name: 'E2E CProf Dup',
        username: `${P}dup`,
        password: 'e2e-password-x',
        phone: '+91 60000 11101',
      });
      expect(res.status).toBe(409);
    });

    it('catches a duplicate against a legacy spaced row', async () => {
      await prisma.users.create({
        data: {
          name: 'E2E CProf Legacy',
          username: U_LEGACY,
          role_id: 6,
          code: 91,
          phone: PHONE_LEGACY_STORED,
          status: 1,
          created_at: new Date(),
        },
      });
      const res = await post({
        name: 'E2E CProf Dup2',
        username: `${P}dup2`,
        password: 'e2e-password-x',
        phone: '6000011109',
      });
      expect(res.status).toBe(409);
    });

    it('returns 409 for an employee_code already in use', async () => {
      const res = await post({
        name: 'E2E CProf Dup3',
        username: `${P}dup3`,
        password: 'e2e-password-x',
        employee_code: CODE_A,
      });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/E2E-CPROF-1/);
    });

    it('rejects an employee_code with spaces inside', async () => {
      const res = await post({
        name: 'E2E CProf Dup4',
        username: `${P}dup4`,
        password: 'e2e-password-x',
        employee_code: 'UC 1',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('update — partial PATCH (C03)', () => {
    it('changes only the fields sent', async () => {
      const res = await patch(mainId, { name: 'E2E CProf Main Renamed' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('E2E CProf Main Renamed');
      expect(res.body.data.phone).toBe(PHONE_MAIN);
      expect(res.body.data.employee_code).toBe(CODE_A);
    });

    it('normalises a phone on update and validates it', async () => {
      const ok = await patch(secondId, { phone: '+91-60000-11103' });
      expect(ok.status).toBe(200);
      expect(ok.body.data.phone).toBe('6000011103');
      expect(ok.body.data.code).toBe(91);

      const bad = await patch(secondId, { phone: '0000' });
      expect(bad.status).toBe(400);
    });

    it('sets, refuses a taken, and clears an employee_code', async () => {
      const set = await patch(secondId, { employee_code: CODE_B });
      expect(set.status).toBe(200);
      expect(set.body.data.employee_code).toBe(CODE_B);

      const taken = await patch(secondId, { employee_code: CODE_A });
      expect(taken.status).toBe(409);

      // Re-saving your own code is not a clash.
      const same = await patch(secondId, { employee_code: CODE_B });
      expect(same.status).toBe(200);

      const cleared = await patch(secondId, { employee_code: '' });
      expect(cleared.status).toBe(200);
      expect(cleared.body.data.employee_code).toBeNull();
    });
  });

  describe('GET /consultants/:id/performance (C07)', () => {
    beforeAll(async () => {
      const now = new Date();
      const other = await prisma.users.create({
        data: { name: 'E2E CProf Other', username: U_OTHER, role_id: 6, created_at: now },
      });
      otherId = other.id;
      const studentUser = await prisma.users.create({
        data: { name: 'E2E CProf Student', username: U_STUDENT, role_id: 4, created_at: now },
      });
      studentUserId = studentUser.id;

      await prisma.students.createMany({
        data: [
          { student_id: studentUserId, consultant_id: mainId, address: '-', admission_status: 2 },
          { student_id: studentUserId, consultant_id: mainId, address: '-', admission_status: 4 },
          { student_id: studentUserId, consultant_id: mainId, address: '-', admission_status: null },
        ],
      });

      await prisma.applications.createMany({
        data: [
          // assigned to main
          { name: `${P}app1`, pipeline_user: mainId, created_by: otherId },
          { name: `${P}app2`, pipeline_user: mainId, is_converted: 1 },
          // unassigned, created by main -> counts for main
          { name: `${P}app3`, pipeline_user: null, created_by: mainId, is_archived: true },
          // created by main but assigned elsewhere -> NOT main's
          { name: `${P}app4`, pipeline_user: otherId, created_by: mainId },
        ],
      });

      const day = 24 * 60 * 60 * 1000;
      await prisma.consultant_target.createMany({
        data: [
          {
            consultant_id: mainId,
            type: 2,
            value: 4,
            from_date: new Date(now.getTime() - 10 * day),
            to_date: new Date(now.getTime() + 10 * day),
          },
          {
            consultant_id: mainId,
            type: 1,
            value: 30,
            from_date: new Date(now.getTime() - 400 * day),
            to_date: new Date(now.getTime() - 370 * day),
          },
        ],
      });

      const team = await prisma.sales_team.create({
        data: { name: TEAM, leader: String(otherId), members: '[]', status: 1, created_at: now },
      });
      teamId = team.id;
      const assign = await request(http)
        .patch(`/api/consultants/${mainId}/team`)
        .set(authHeader(token))
        .send({ team_id: teamId, reports_to: otherId });
      expect(assign.status).toBe(200);
    });

    it('counts applications over the full set using pipeline_user ?? created_by', async () => {
      const res = await request(http)
        .get(`/api/consultants/${mainId}/performance`)
        .set(authHeader(token));
      expect(res.status).toBe(200);
      const d = res.body.data;

      expect(d.total_applications).toBe(3);
      expect(d.application_counts).toEqual({ total: 3, open: 1, converted: 1, closed: 1 });
      expect(d.applications).toHaveLength(3);
      expect(d.applications_truncated).toBe(false);
      expect(d.applications.map((a: { name: string }) => a.name).sort()).toEqual([
        `${P}app1`,
        `${P}app2`,
        `${P}app3`,
      ]);
      expect(d.applications[0]).toHaveProperty('status_label');
    });

    it('buckets students by admission status and keeps the original keys', async () => {
      const res = await request(http)
        .get(`/api/consultants/${mainId}/performance`)
        .set(authHeader(token));
      const d = res.body.data;

      expect(d.total_students).toBe(3);
      expect(d.students).toHaveLength(3);
      expect(d.total_fee_revenue).toBe(0);
      expect(d.student_counts.Enrolled).toBe(1);
      expect(d.student_counts.Dropout).toBe(1);
      expect(d.student_counts.Unknown).toBe(1);
      expect(d.students[0]).toHaveProperty('admission_status_label');
      expect(d.students[0]).toHaveProperty('course_title');
      expect(d.password).toBeUndefined();
    });

    it('returns targets with is_active and the hierarchy', async () => {
      const res = await request(http)
        .get(`/api/consultants/${mainId}/performance`)
        .set(authHeader(token));
      const d = res.body.data;

      expect(d.targets).toHaveLength(2);
      const count = d.targets.find((t: { type: number }) => t.type === 2);
      const points = d.targets.find((t: { type: number }) => t.type === 1);
      expect(count.is_active).toBe(true);
      expect(count.achieved).toEqual(expect.any(Number));
      expect(points.is_active).toBe(false);

      expect(d.team_id).toBe(teamId);
      expect(d.team_name).toBe(TEAM);
      expect(d.team_leader_name).toBe('E2E CProf Other');
      expect(d.reports_to).toBe(otherId);
      expect(d.reports_to_name).toBe('E2E CProf Other');
    });

    it('GET /consultants/:id carries the hierarchy too', async () => {
      const res = await request(http)
        .get(`/api/consultants/${mainId}`)
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.data.team_name).toBe(TEAM);
      expect(res.body.data.reports_to_name).toBe('E2E CProf Other');
      expect(res.body.data.total_students).toBe(3);
    });

    it('404s for a non-consultant id', async () => {
      const res = await request(http)
        .get(`/api/consultants/${studentUserId}/performance`)
        .set(authHeader(token));
      expect(res.status).toBe(404);
    });
  });
});
