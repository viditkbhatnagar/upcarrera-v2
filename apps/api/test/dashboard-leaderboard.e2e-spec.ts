import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { bootApp, loginAs, authHeader, purgeUsersByUsername } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Counsellor leaderboard (e2e) — GET /dashboard/leaderboard.
 *
 * Ranks counsellors by this-month achieved points (SUM of specialisations.point
 * for each student enrolled this month), admissions as the tiebreaker, caller
 * flagged is_self. A counsellor with no activity this month is off the board but
 * still gets a `self` standing with rank null.
 */
describe('Counsellor leaderboard (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let prisma: PrismaService;

  const P = 'e2e_lb_';
  const U_A = `${P}a`;
  const U_B = `${P}b`;
  const U_C = `${P}c`;
  const U_S = `${P}student`;
  const PASSWORD = 'Leaderboard@12345';
  const usernames = [U_A, U_B, U_C, U_S];

  // High, isolated course ids: specialisations.point drives the score.
  const COURSE_HI = 900001; // 30 points
  const COURSE_LO = 900002; // 10 points

  let aId: number;
  let bId: number;
  let cId: number;

  async function cleanup(): Promise<void> {
    const users = await prisma.users.findMany({
      where: { username: { in: usernames } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    if (ids.length) {
      await prisma.students.deleteMany({ where: { consultant_id: { in: ids } } });
    }
    await prisma.specialisations.deleteMany({ where: { course_id: { in: [COURSE_HI, COURSE_LO] } } });
    for (const u of usernames) await purgeUsersByUsername(app, u);
  }

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    prisma = app.get(PrismaService);
    await cleanup();

    const now = new Date();
    const hash = await bcrypt.hash(PASSWORD, 10);
    const mkConsultant = async (username: string, withPw: boolean) =>
      (
        await prisma.users.create({
          data: {
            name: `E2E LB ${username}`,
            username,
            ...(withPw ? { password: hash } : {}),
            role_id: 6,
            status: 1,
            created_at: now,
          },
        })
      ).id;

    aId = await mkConsultant(U_A, true);
    bId = await mkConsultant(U_B, false);
    cId = await mkConsultant(U_C, true); // logs in but has no activity this month
    const student = await prisma.users.create({
      data: { name: 'E2E LB Student', username: U_S, role_id: 4, created_at: now },
    });

    await prisma.specialisations.createMany({
      data: [
        { course_id: COURSE_HI, point: '30' },
        { course_id: COURSE_LO, point: '10' },
      ],
    });

    // A: 1 enrolment worth 30 points. B: 2 enrolments worth 10 each (20 total).
    // => A leads on points (30 > 20) even though B has more admissions.
    const enrol = (consultant_id: number, course_id: number) =>
      prisma.students.create({
        data: {
          student_id: student.id,
          consultant_id,
          address: '-',
          course_id,
          enrollment_date: now,
        },
      });
    await enrol(aId, COURSE_HI);
    await enrol(bId, COURSE_LO);
    await enrol(bId, COURSE_LO);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('ranks by achieved points (admissions as tiebreaker) and flags the caller', async () => {
    const token = await loginAs(http, U_A, PASSWORD);
    const res = await request(http).get('/api/dashboard/leaderboard').set(authHeader(token));
    expect(res.status).toBe(200);

    const rows = res.body.data.rows as Array<{
      consultant_id: number;
      points: number;
      admissions: number;
      rank: number;
      is_self: boolean;
    }>;
    const a = rows.find((r) => r.consultant_id === aId)!;
    const b = rows.find((r) => r.consultant_id === bId)!;

    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a.points).toBe(30);
    expect(a.admissions).toBe(1);
    expect(b.points).toBe(20);
    expect(b.admissions).toBe(2);
    // Points outrank admissions: A (30) above B (20).
    expect(a.rank).toBeLessThan(b.rank);
    expect(a.is_self).toBe(true);
    expect(b.is_self).toBe(false);
    expect(res.body.data.self.rank).toBe(a.rank);
    expect(res.body.data.self.points).toBe(30);
  });

  it('gives a counsellor with no activity a self standing of rank null, off the board', async () => {
    const token = await loginAs(http, U_C, PASSWORD);
    const res = await request(http).get('/api/dashboard/leaderboard').set(authHeader(token));
    expect(res.status).toBe(200);

    const rows = res.body.data.rows as Array<{ consultant_id: number }>;
    expect(rows.some((r) => r.consultant_id === cId)).toBe(false);
    expect(res.body.data.self.rank).toBeNull();
    expect(res.body.data.self.points).toBe(0);
  });
});
