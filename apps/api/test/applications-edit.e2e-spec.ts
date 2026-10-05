import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Edit Application (e2e) — PATCH /applications/:id/academic and PATCH
 * /applications/:id, as the Edit dialog drives them.
 *
 *   - a cleared course/specialisation is sent as null and stored as NULL, so a
 *     university change cannot leave the old university's course on the row;
 *   - a course of another university, or a specialisation of another course,
 *     is refused with 400; ids that do not exist are refused with 400 (create
 *     and edit alike);
 *   - admission_status is reset only when the university or course changes —
 *     an edit of the counsellor, source or intake leaves it alone;
 *   - PATCH /applications/:id validates the email like the create path.
 *
 * Every fixture carries TAG and is removed in afterAll.
 */
describe('Applications edit (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let token: string;
  let prisma: PrismaService;

  const TAG = 'E2eApEdQz';
  const DOMAIN = 'e2e-aped.local';
  const MISSING_ID = 2_000_000_000;

  let uniA: number;
  let uniB: number;
  let courseA: number; // tagged to uniA
  let courseB: number; // tagged to uniB
  let courseFree: number; // no university
  let specA: number; // of courseA
  let sessionId: number;
  let appId: number;

  async function cleanup() {
    const apps = await prisma.applications.findMany({
      where: { OR: [{ name: { contains: TAG } }, { email: { endsWith: `@${DOMAIN}` } }] },
      select: { application_id: true },
    });
    const ids = apps.map((a) => a.application_id);
    if (ids.length > 0) {
      await prisma.qualification.deleteMany({ where: { application_id: { in: ids } } });
      await prisma.applications.deleteMany({ where: { application_id: { in: ids } } });
    }
    await prisma.specialisations.deleteMany({ where: { title: { startsWith: TAG } } });
    await prisma.course.deleteMany({ where: { title: { startsWith: TAG } } });
    await prisma.university.deleteMany({ where: { title: { startsWith: TAG } } });
    await prisma.sessions.deleteMany({ where: { session_title: { startsWith: TAG } } });
  }

  const mkUniversity = async (title: string) =>
    (
      await prisma.university.create({
        data: {
          title,
          country_id: '99',
          website: 'https://e2e.local',
          phone: '9000000000',
          email: 'u@e2e.local',
          created_at: new Date(),
        },
      })
    ).id;

  const mkCourse = async (title: string, university_id: number | null) =>
    (
      await prisma.course.create({
        data: {
          title,
          short_name: 'E2E',
          stream: '',
          total_duration: '',
          study_mode: '',
          university_id,
          created_at: new Date(),
        },
      })
    ).id;

  const academic = (body: object) =>
    request(http)
      .patch(`/api/applications/${appId}/academic`)
      .set(authHeader(token))
      .send(body);

  const row = () => prisma.applications.findUniqueOrThrow({ where: { application_id: appId } });

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    token = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);
    prisma = app.get(PrismaService);
    await cleanup();

    uniA = await mkUniversity(`${TAG} Uni A`);
    uniB = await mkUniversity(`${TAG} Uni B`);
    courseA = await mkCourse(`${TAG} Course A`, uniA);
    courseB = await mkCourse(`${TAG} Course B`, uniB);
    courseFree = await mkCourse(`${TAG} Course Free`, null);
    specA = (
      await prisma.specialisations.create({
        data: { title: `${TAG} Spec A`, course_id: courseA, created_at: new Date() },
      })
    ).id;
    sessionId = (
      await prisma.sessions.create({ data: { session_title: `${TAG} Jul 2027`, created_at: new Date() } })
    ).session_id;
  });

  beforeEach(async () => {
    await prisma.applications.deleteMany({ where: { name: `${TAG} Row` } });
    appId = (
      await prisma.applications.create({
        data: {
          name: `${TAG} Row`,
          email: `row@${DOMAIN}`,
          phone: '7012345601',
          university_id: uniA,
          course_id: courseA,
          specialisation_id: specA,
          admission_status: true,
          created_at: new Date(),
        },
      })
    ).application_id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('stores a cleared course and specialisation as NULL when the university changes', async () => {
    const res = await academic({ university_id: uniB, course_id: courseB, specialisation_id: null });
    expect(res.status).toBe(200);
    const r = await row();
    expect(r).toMatchObject({ university_id: uniB, course_id: courseB, specialisation_id: null });

    const cleared = await academic({ course_id: null });
    expect(cleared.status).toBe(200);
    expect((await row()).course_id).toBeNull();
  });

  it('refuses a course of another university, and leaves the row untouched', async () => {
    const res = await academic({ university_id: uniB });
    // the row's course A belongs to university A
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/course does not belong to the selected university/);
    expect(await row()).toMatchObject({ university_id: uniA, course_id: courseA });

    const wrongCourse = await academic({ course_id: courseB });
    expect(wrongCourse.status).toBe(400);
  });

  it('refuses a specialisation of another course, including one left behind by a course change', async () => {
    const res = await academic({ course_id: courseFree });
    // spec A (of course A) would stay on the row with course Free
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/specialisation does not belong to the selected course/);

    const ok = await academic({ course_id: courseFree, specialisation_id: null });
    expect(ok.status).toBe(200);
    expect(await row()).toMatchObject({ course_id: courseFree, specialisation_id: null });
  });

  it.each([
    ['university_id', { university_id: MISSING_ID }],
    ['course_id', { course_id: MISSING_ID }],
    ['specialisation_id', { specialisation_id: MISSING_ID }],
    ['session_id', { session_id: MISSING_ID }],
    ['pipeline_user', { pipeline_user: MISSING_ID }],
  ])('refuses a %s that does not exist with 400', async (_field, body) => {
    const res = await academic(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not exist/);
  });

  it('keeps admission_status when only the counsellor, source or intake changes', async () => {
    const admin = await prisma.users.findFirstOrThrow({
      where: { username: ADMIN_CREDENTIALS.username },
      select: { id: true },
    });
    const res = await academic({ pipeline_user: admin.id, source: 'Website', session_id: sessionId });
    expect(res.status).toBe(200);
    const r = await row();
    expect(r.admission_status).toBe(true);
    expect(r).toMatchObject({ pipeline_user: admin.id, source: 'Website', session_id: sessionId });

    // re-sending the same course is not a change either
    expect((await academic({ course_id: courseA })).status).toBe(200);
    expect((await row()).admission_status).toBe(true);
  });

  it('resets admission_status when the course really changes (the legacy academic step)', async () => {
    const res = await academic({ course_id: courseFree, specialisation_id: null });
    expect(res.status).toBe(200);
    expect((await row()).admission_status).toBe(false);
  });

  it('POST /applications refuses ids that do not exist, and a course of another university', async () => {
    const base = { name: `${TAG} New`, email: `new@${DOMAIN}`, phone: '7012345602' };
    const missing = await request(http)
      .post('/api/applications')
      .set(authHeader(token))
      .send({ ...base, course_id: MISSING_ID });
    expect(missing.status).toBe(400);

    const mismatch = await request(http)
      .post('/api/applications')
      .set(authHeader(token))
      .send({ ...base, university_id: uniA, course_id: courseB });
    expect(mismatch.status).toBe(400);
    expect(await prisma.applications.count({ where: { email: `new@${DOMAIN}` } })).toBe(0);

    const ok = await request(http)
      .post('/api/applications')
      .set(authHeader(token))
      .send({ ...base, university_id: uniB, course_id: courseFree });
    expect(ok.status).toBe(201);
  });

  it('PATCH /applications/:id rejects an invalid email', async () => {
    const res = await request(http)
      .patch(`/api/applications/${appId}`)
      .set(authHeader(token))
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect((await row()).email).toBe(`row@${DOMAIN}`);
  });
});
