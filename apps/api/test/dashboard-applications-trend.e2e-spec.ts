import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { bootApp, loginAs, authHeader, purgeUsersByUsername } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Consultant dashboard — monthly applications series (e2e, D3/D7).
 *
 * trends.applications counts the consultant's applications per month (scope:
 * pipeline_user = me, else created_by = me), bucketed by created_at. It drives
 * the Applications-vs-Enrollments chart, the lead→enrolled badge and the
 * application trend chip.
 */
describe('Consultant dashboard applications trend (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let prisma: PrismaService;

  const TAG = 'E2eAppTrendQ';
  const EMAIL_DOMAIN = 'e2e-apptrend.local';
  const U = 'e2e_apptrend_counsellor';
  const PASSWORD = 'AppTrend@12345';
  const YEAR = 2099;
  const MONTH0 = 2; // March

  let consultantId: number;

  async function cleanup(): Promise<void> {
    const apps = await prisma.applications.findMany({
      where: { OR: [{ name: { contains: TAG } }, { email: { endsWith: `@${EMAIL_DOMAIN}` } }] },
      select: { application_id: true },
    });
    const ids = apps.map((a) => a.application_id);
    if (ids.length) await prisma.applications.deleteMany({ where: { application_id: { in: ids } } });
    await purgeUsersByUsername(app, U);
  }

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    prisma = app.get(PrismaService);
    await cleanup();

    const when = new Date(Date.UTC(YEAR, MONTH0, 15));
    consultantId = (
      await prisma.users.create({
        data: {
          name: `${TAG} Counsellor`,
          username: U,
          password: await bcrypt.hash(PASSWORD, 10),
          role_id: 6,
          status: 1,
          created_at: new Date(),
        },
      })
    ).id;

    // Two applications owned by the consultant, created in March 2099.
    for (let i = 0; i < 2; i++) {
      await prisma.applications.create({
        data: {
          name: `${TAG} Lead ${i}`,
          email: `lead${i}@${EMAIL_DOMAIN}`,
          phone: `70123480${i}0`,
          pipeline_user: consultantId,
          created_at: when,
        },
      });
    }
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('reports the consultant applications bucketed by month', async () => {
    const token = await loginAs(http, U, PASSWORD);
    const res = await request(http)
      .get('/api/dashboard/consultant')
      .query({ year: YEAR })
      .set(authHeader(token));

    expect(res.status).toBe(200);
    const applications = res.body.data.trends.applications as number[];
    expect(applications).toHaveLength(12);
    expect(applications[MONTH0]).toBe(2);
    expect(applications.reduce((a, b) => a + b, 0)).toBe(2);
  });
});
