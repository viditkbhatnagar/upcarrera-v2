import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import {
  ADMIN_CREDENTIALS,
  authHeader,
  bootApp,
  loginAs,
  purgeUsersByUsername,
} from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Counsellor application guardrails (e2e).
 *
 *  - A14: a counsellor creating a lead cannot assign it to anyone else — the
 *    server forces applications.pipeline_user = the counsellor, whatever the
 *    body said.
 *  - A12: a converted/rejected application is terminal, so its reported
 *    days_in_stage is frozen to 0 (it must not keep counting).
 */
describe('Counsellor application guardrails (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let prisma: PrismaService;

  const TAG = 'E2eGuardQ';
  const EMAIL_DOMAIN = 'e2e-guard.local';
  const U_COUNSELLOR = 'e2e_guard_counsellor';
  const U_OTHER = 'e2e_guard_other';
  const PASSWORD = 'Guardrail@12345';

  let universityId: number;
  let courseId: number;
  let counsellorId: number;
  let otherConsultantId: number;
  let convertedAppId: number;

  const email = (local: string) => `${local}@${EMAIL_DOMAIN}`;

  async function cleanup(): Promise<void> {
    const apps = await prisma.applications.findMany({
      where: { OR: [{ name: { contains: TAG } }, { email: { endsWith: `@${EMAIL_DOMAIN}` } }] },
      select: { application_id: true },
    });
    const appIds = apps.map((a) => a.application_id);
    if (appIds.length) {
      await prisma.qualification.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.applications.deleteMany({ where: { application_id: { in: appIds } } });
    }
    await prisma.course.deleteMany({ where: { title: { contains: TAG } } });
    await prisma.university.deleteMany({ where: { title: { contains: TAG } } });
    for (const u of [U_COUNSELLOR, U_OTHER]) await purgeUsersByUsername(app, u);
  }

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    prisma = app.get(PrismaService);
    await cleanup();

    const now = new Date();
    universityId = (
      await prisma.university.create({
        data: {
          title: `${TAG} University`,
          country_id: '99',
          website: 'https://e2e.local',
          phone: '9000000000',
          email: 'u@e2e.local',
          created_at: now,
        },
      })
    ).id;
    courseId = (
      await prisma.course.create({
        data: {
          title: `${TAG} Course`,
          short_name: 'E2E',
          stream: '',
          total_duration: '',
          study_mode: '',
          university_id: universityId,
          created_at: now,
        },
      })
    ).id;

    counsellorId = (
      await prisma.users.create({
        data: {
          name: `${TAG} Counsellor`,
          username: U_COUNSELLOR,
          password: await bcrypt.hash(PASSWORD, 10),
          role_id: 6,
          status: 1,
          created_at: now,
        },
      })
    ).id;
    otherConsultantId = (
      await prisma.users.create({
        data: { name: `${TAG} Other`, username: U_OTHER, role_id: 6, status: 1, created_at: now },
      })
    ).id;

    // A12 fixture: a converted application that entered its stage 100 days ago.
    const longAgo = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000);
    convertedAppId = (
      await prisma.applications.create({
        data: {
          name: `${TAG} Converted`,
          email: email('converted'),
          phone: '7012349001',
          university_id: universityId,
          pipeline_user: counsellorId,
          is_converted: 1,
          stage: 'converted',
          stage_entered_at: longAgo,
          created_at: longAgo,
        },
      })
    ).application_id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('A14: forces pipeline_user to the counsellor, ignoring an assignment to someone else', async () => {
    const token = await loginAs(http, U_COUNSELLOR, PASSWORD);
    const res = await request(http)
      .post('/api/applications')
      .set(authHeader(token))
      .send({
        name: `${TAG} New Lead`,
        email: email('new.lead'),
        phone: '7012349002',
        university_id: universityId,
        course_id: courseId,
        source: 'Website',
        pipeline_user: otherConsultantId, // attempt to assign to another counsellor
      });

    expect(res.status).toBe(201);
    const row = await prisma.applications.findUnique({
      where: { application_id: res.body.data.application_id },
      select: { pipeline_user: true },
    });
    // Forced to self, not the other consultant.
    expect(row?.pipeline_user).toBe(counsellorId);
  });

  it('A12: a converted application reports days_in_stage frozen at 0', async () => {
    const token = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);
    const res = await request(http)
      .get('/api/applications')
      .query({ page: 1, limit: 50, search: `${TAG} Converted` })
      .set(authHeader(token));
    expect(res.status).toBe(200);

    const row = (res.body.data.items as Array<{ application_id: number; days_in_stage: number }>).find(
      (r) => r.application_id === convertedAppId,
    );
    expect(row).toBeDefined();
    expect(row!.days_in_stage).toBe(0);
  });
});
