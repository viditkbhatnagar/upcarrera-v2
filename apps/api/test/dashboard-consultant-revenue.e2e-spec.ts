import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { bootApp, loginAs, authHeader, purgeUsersByUsername } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Consultant dashboard — revenue trend (e2e). Regression guard for the
 * "Revenue ₹0" bug.
 *
 * invoice.student_id references students.id (the students-table row id), NOT
 * students.student_id (the users id). getConsultantMetrics used to key the
 * invoice query on the users id, which matched nothing and zeroed the chart.
 * This test deliberately gives the fixture a row id that differs from the user
 * id, so if the query ever keys on the wrong one again the revenue falls to 0
 * and this fails.
 */
describe('Consultant dashboard revenue (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let prisma: PrismaService;

  const P = 'e2e_dashrev_';
  const U_CONSULTANT = `${P}consultant`;
  const U_STUDENT = `${P}student`;
  const PASSWORD = 'e2e-dashrev-pass';
  const usernames = [U_CONSULTANT, U_STUDENT];

  // A far-future year keeps the fixture isolated from seed data and from any
  // "current month/year" logic in the service.
  const YEAR = 2099;
  const MONTH0 = 2; // March (0-based)
  const AMOUNT = 50000;

  let consultantId: number;
  let studentRowId: number;

  async function cleanup(): Promise<void> {
    const users = await prisma.users.findMany({
      where: { username: { in: usernames } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    if (ids.length) {
      const rows = await prisma.students.findMany({
        where: { consultant_id: { in: ids } },
        select: { id: true },
      });
      const rowIds = rows.map((r) => r.id);
      if (rowIds.length) {
        await prisma.invoice.deleteMany({ where: { student_id: { in: rowIds } } });
      }
      await prisma.students.deleteMany({ where: { consultant_id: { in: ids } } });
    }
    for (const u of usernames) await purgeUsersByUsername(app, u);
  }

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    prisma = app.get(PrismaService);
    await cleanup();

    const now = new Date();
    const hash = await bcrypt.hash(PASSWORD, 10);
    const consultant = await prisma.users.create({
      data: {
        name: 'E2E DashRev Consultant',
        username: U_CONSULTANT,
        password: hash,
        role_id: 6,
        status: 1,
        created_at: now,
      },
    });
    consultantId = consultant.id;

    const student = await prisma.users.create({
      data: { name: 'E2E DashRev Student', username: U_STUDENT, role_id: 4, created_at: now },
    });

    const row = await prisma.students.create({
      data: {
        student_id: student.id, // the users id — must NOT be what invoice keys on
        consultant_id: consultantId,
        address: '-',
        enrollment_date: new Date(Date.UTC(YEAR, MONTH0, 15)),
      },
    });
    studentRowId = row.id; // the students-table row id — invoice.student_id points here

    // Guard the premise of the test: the two ids must actually differ, otherwise
    // the bug and the fix would be indistinguishable.
    expect(studentRowId).not.toBe(student.id);

    await prisma.invoice.create({
      data: {
        student_id: studentRowId,
        payable_amount: AMOUNT,
        date: new Date(Date.UTC(YEAR, MONTH0, 15)),
        created_at: now,
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('reports the invoice revenue for the consultant, keyed on students.id', async () => {
    const token = await loginAs(http, U_CONSULTANT, PASSWORD);
    const res = await request(http)
      .get('/api/dashboard/consultant')
      .query({ year: YEAR })
      .set(authHeader(token));

    expect(res.status).toBe(200);
    const revenue = res.body.data.trends.revenue as number[];
    expect(revenue).toHaveLength(12);
    expect(revenue[MONTH0]).toBe(AMOUNT);
    expect(revenue.reduce((a, b) => a + b, 0)).toBe(AMOUNT);
  });
});
