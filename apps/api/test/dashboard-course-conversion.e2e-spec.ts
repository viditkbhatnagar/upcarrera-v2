import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { bootApp, loginAs, authHeader, purgeUsersByUsername } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Consultant dashboard — course-wise conversion (e2e, P6).
 *
 * GET /dashboard/consultant/course-conversion returns, per course the consultant
 * raised leads for, the applications total, converted count and conversion %.
 */
describe('Course-wise conversion (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let prisma: PrismaService;

  const TAG = 'E2eConvQ';
  const EMAIL_DOMAIN = 'e2e-conv.local';
  const U = 'e2e_conv_counsellor';
  const PASSWORD = 'Conv@12345';

  let consultantId: number;
  let courseAId: number;
  let courseBId: number;

  const mkCourse = (title: string) =>
    prisma.course.create({
      data: {
        title,
        short_name: 'E2E',
        stream: '',
        total_duration: '',
        study_mode: '',
        created_at: new Date(),
      },
    });

  async function cleanup(): Promise<void> {
    const apps = await prisma.applications.findMany({
      where: { OR: [{ name: { contains: TAG } }, { email: { endsWith: `@${EMAIL_DOMAIN}` } }] },
      select: { application_id: true },
    });
    const ids = apps.map((a) => a.application_id);
    if (ids.length) await prisma.applications.deleteMany({ where: { application_id: { in: ids } } });
    await prisma.course.deleteMany({ where: { title: { contains: TAG } } });
    await purgeUsersByUsername(app, U);
  }

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    prisma = app.get(PrismaService);
    await cleanup();

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
    courseAId = (await mkCourse(`${TAG} Course A`)).id;
    courseBId = (await mkCourse(`${TAG} Course B`)).id;

    const mkApp = (course_id: number, converted: boolean, i: number) =>
      prisma.applications.create({
        data: {
          name: `${TAG} ${course_id}-${i}`,
          email: `c${course_id}i${i}@${EMAIL_DOMAIN}`,
          phone: `70123470${course_id % 10}${i}`,
          pipeline_user: consultantId,
          course_id,
          is_converted: converted ? 1 : 0,
          created_at: new Date(),
        },
      });
    // Course A: 3 apps, 2 converted => 67%. Course B: 2 apps, 0 converted => 0%.
    await mkApp(courseAId, true, 0);
    await mkApp(courseAId, true, 1);
    await mkApp(courseAId, false, 2);
    await mkApp(courseBId, false, 0);
    await mkApp(courseBId, false, 1);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('reports applications, converted and conversion % per course', async () => {
    const token = await loginAs(http, U, PASSWORD);
    const res = await request(http)
      .get('/api/dashboard/consultant/course-conversion')
      .set(authHeader(token));
    expect(res.status).toBe(200);

    const rows = res.body.data.rows as Array<{
      course_id: number;
      applications: number;
      converted: number;
      conversion_pct: number;
    }>;
    const a = rows.find((r) => r.course_id === courseAId)!;
    const b = rows.find((r) => r.course_id === courseBId)!;

    expect(a).toMatchObject({ applications: 3, converted: 2, conversion_pct: 67 });
    expect(b).toMatchObject({ applications: 2, converted: 0, conversion_pct: 0 });
  });
});
