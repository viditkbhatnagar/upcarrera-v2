import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { bootApp, loginAs, authHeader, purgeUsersByUsername } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Consultant dashboard — revenue trend (e2e).
 *
 * Pins the invoice.student_id id-space so it can't be re-keyed by mistake.
 * The convention across this codebase is invoice.student_id = the student's
 * USERS id (= students.student_id): the conversion flow writes it that way
 * (LeadsService) and the finance tab reads it that way (StudentProfileService).
 *
 * The fixture gives the students row an id DISTINCT from its users id and keys
 * the invoice on the users id. The revenue chart must find it. If the query is
 * ever re-keyed on students.id (the row id), the invoice stops matching and the
 * chart falls to 0 — this test then fails.
 */
describe('Consultant dashboard revenue (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let prisma: PrismaService;

  const P = 'e2e_dashrev_';
  const U_CONSULTANT = `${P}consultant`;
  const U_STUDENT = `${P}student`;
  const PASSWORD = 'DashRev@12345';
  const usernames = [U_CONSULTANT, U_STUDENT];

  // A far-future year keeps the fixture isolated from seed data and from any
  // "current month/year" logic in the service.
  const YEAR = 2099;
  const MONTH0 = 2; // March (0-based)
  const AMOUNT = 50000;

  let consultantId: number;
  let studentUserId: number; // users id — invoice.student_id points here
  let studentRowId: number; // students-table row id — must NOT be the key

  async function cleanup(): Promise<void> {
    const users = await prisma.users.findMany({
      where: { username: { in: usernames } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    if (ids.length) {
      const rows = await prisma.students.findMany({
        where: { consultant_id: { in: ids } },
        select: { id: true, student_id: true },
      });
      // Delete invoices keyed on either id space so reruns stay clean.
      const invoiceKeys = [...new Set([...ids, ...rows.map((r) => r.id), ...rows.map((r) => r.student_id)])];
      if (invoiceKeys.length) {
        await prisma.invoice.deleteMany({ where: { student_id: { in: invoiceKeys } } });
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
    studentUserId = student.id;

    const row = await prisma.students.create({
      data: {
        student_id: studentUserId,
        consultant_id: consultantId,
        address: '-',
        enrollment_date: new Date(Date.UTC(YEAR, MONTH0, 15)),
      },
    });
    studentRowId = row.id;

    // Premise: the two id spaces must differ, otherwise the test can't tell a
    // correct key (users id) from the wrong one (row id).
    expect(studentRowId).not.toBe(studentUserId);

    await prisma.invoice.create({
      data: {
        student_id: studentUserId, // the users id — the codebase convention
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

  it('reports the invoice revenue for the consultant, keyed on the users id', async () => {
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
