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
 * Students KPI counts (e2e) — QA ST03.
 *
 * The status cards summed to 1,526 against a total of 1,541: fifteen students
 * carried an admission_status the label map does not cover, and the counting
 * helper deliberately skipped unmapped labels ("count toward total but never
 * invent a card"). The cards therefore could not reconcile with the total.
 *
 * Unmapped and null codes now fold into an 'Unknown' bucket, so the breakdown
 * sums to the total by construction. The bucket is always present — zero when
 * the data is clean — and clients hide it at zero.
 */
describe('Students admission-status counts (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let token: string;

  const USERNAME = 'e2e_counts_student';
  const UNMAPPED_STATUS = 99; // deliberately outside ADMISSION_STATUS_LABELS
  let userId: number;

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    token = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);
    const prisma = app.get(PrismaService);

    await purgeUsersByUsername(app, USERNAME);
    const user = await prisma.users.create({
      data: {
        name: 'E2E Counts Student',
        username: USERNAME,
        email: `${USERNAME}@e2e.local`,
        role_id: 4,
        status: 1,
        created_at: new Date(),
      },
    });
    userId = user.id;

    // One student the label map cannot classify — the production condition.
    await prisma.students.create({
      data: {
        student_id: userId,
        admission_status: UNMAPPED_STATUS,
        address: 'E2E',
        consultant_id: 0,
        created_at: new Date(),
      },
    });
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.students.deleteMany({ where: { student_id: userId } });
    await purgeUsersByUsername(app, USERNAME);
    await app.close();
  });

  async function counts(path: string) {
    const res = await request(http).get(path).set(authHeader(token));
    expect(res.status).toBe(200);
    const body = res.body.data;
    return (body.counts ?? body) as {
      total: number;
      by_status: Record<string, number>;
    };
  }

  describe('GET /api/students', () => {
    it('breaks every student down into a bucket, so the cards sum to the total', async () => {
      const { total, by_status } = await counts('/api/students?page=1&limit=1');
      const sum = Object.values(by_status).reduce((a, b) => a + b, 0);
      expect(sum).toBe(total);
    });

    it('surfaces the unmapped student under Unknown rather than dropping it', async () => {
      const { by_status } = await counts('/api/students?page=1&limit=1');
      expect(by_status.Unknown).toBeGreaterThanOrEqual(1);
    });

    it('still reports every known status bucket', async () => {
      const { by_status } = await counts('/api/students?page=1&limit=1');
      for (const label of [
        'Pending',
        'In Progress',
        'Enrolled',
        'Passed Out',
        'Dropout',
        'Cancelled',
      ]) {
        expect(by_status).toHaveProperty(label);
      }
    });
  });

  describe('GET /api/students/stats', () => {
    it('reconciles there too — it shares the same helper', async () => {
      const { total, by_status } = await counts('/api/students/stats');
      const sum = Object.values(by_status).reduce((a, b) => a + b, 0);
      expect(sum).toBe(total);
    });
  });

  describe('filtered lists', () => {
    it('reconciles when a status filter narrows the set', async () => {
      const { total, by_status } = await counts(
        `/api/students?page=1&limit=1&admission_status=${UNMAPPED_STATUS}`,
      );
      const sum = Object.values(by_status).reduce((a, b) => a + b, 0);
      expect(sum).toBe(total);
      expect(by_status.Unknown).toBe(total);
    });
  });
});
