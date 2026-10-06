import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * IN04 — applications.intake_id wiring (e2e).
 *
 * POST /applications (Add Lead) and PATCH /applications/:id/academic now accept
 * intake_id, validate it is a live offering for (university_id, course_id), store
 * it, and dual-write applications.session_id from intake.session_id so legacy
 * displays/joins keep resolving. An invalid combo is rejected with 400.
 *
 * Runs as the seed Super Admin (bypasses permission + stage guards) so the test
 * isolates the intake validation itself. Fixtures are created via Prisma.
 */
describe('IN04 application intake wiring (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let prisma: PrismaService;
  let token: string;

  const TAG = `e2e_appintake_${Date.now()}`;
  let seq = 0;
  const uniqueContact = () => {
    seq += 1;
    const digits = String(Date.now()).slice(-8);
    return {
      phone: `9${digits}${seq % 10}`.slice(0, 10),
      email: `${TAG}_${seq}@example.com`,
    };
  };

  let universityId = 0;
  let courseId = 0;
  let sessionId = 0;
  let intakeLinked = 0; // open, offering present, intake.session_id set
  let intakeNoSession = 0; // open, offering present, no session link
  let intakeNoOffer = 0; // open, exists, NO offering for the pair

  async function mkOpenIntake(suffix: string, sessionLink: number | null): Promise<number> {
    const now = new Date();
    const row = await prisma.intake.create({
      data: {
        name: `${TAG} intake ${suffix}`,
        start_date: new Date(Date.UTC(2020, 0, 1)),
        closing_date: new Date(Date.UTC(2090, 11, 31)),
        status: 'Open',
        session_id: sessionLink ?? undefined,
        created_at: now,
        updated_at: now,
      },
    });
    return row.id;
  }

  async function mkOffering(intakeId: number): Promise<void> {
    const now = new Date();
    await prisma.university_course_intake.create({
      data: {
        university_id: universityId,
        course_id: courseId,
        intake_id: intakeId,
        status: 1,
        source: 'ui',
        created_at: now,
        updated_at: now,
      },
    });
  }

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    prisma = app.get(PrismaService);
    await cleanup();

    token = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);

    const now = new Date();
    const uni = await prisma.university.create({
      data: {
        title: `${TAG} University`,
        country_id: '',
        website: '',
        phone: '',
        email: '',
        fee_collection_model: 'upcarrera_collects',
        created_at: now,
        updated_at: now,
      },
    });
    universityId = uni.id;
    const course = await prisma.course.create({
      data: {
        title: `${TAG} Course`,
        short_name: `${TAG}-C`,
        stream: 'Management',
        total_duration: '2 Years',
        duration: '2 Years',
        study_mode: 'Online',
        university_id: universityId,
        total_amount: 0,
        created_at: now,
        updated_at: now,
      },
    });
    courseId = course.id;
    const session = await prisma.sessions.create({
      data: { session_title: `${TAG} Spring 2026`, created_at: now },
    });
    sessionId = session.session_id;

    // Tag the course to the university (live, active).
    await prisma.university_course.create({
      data: {
        university_id: universityId,
        course_id: courseId,
        status: 1,
        source: 'ui',
        created_at: now,
        updated_at: now,
      },
    });

    intakeLinked = await mkOpenIntake('linked', sessionId);
    intakeNoSession = await mkOpenIntake('nosession', null);
    intakeNoOffer = await mkOpenIntake('nooffer', null);
    await mkOffering(intakeLinked);
    await mkOffering(intakeNoSession);
  }, 30000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup() {
    const [unis, courses, intakes, sessions] = await Promise.all([
      prisma.university.findMany({ where: { title: { startsWith: TAG } }, select: { id: true } }),
      prisma.course.findMany({ where: { title: { startsWith: TAG } }, select: { id: true } }),
      prisma.intake.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } }),
      prisma.sessions.findMany({ where: { session_title: { startsWith: TAG } }, select: { session_id: true } }),
    ]);
    const uniIds = unis.map((u) => u.id);
    const courseIds = courses.map((c) => c.id);
    const intakeIds = intakes.map((i) => i.id);
    const sessionIds = sessions.map((s) => s.session_id);

    const apps = await prisma.applications.findMany({
      where: {
        OR: [
          { name: { startsWith: TAG } },
          ...(uniIds.length ? [{ university_id: { in: uniIds } }] : []),
        ],
      },
      select: { application_id: true },
    });
    const appIds = apps.map((a) => a.application_id);
    if (appIds.length) {
      await prisma.qualification.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.application_stage_log.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.audit_log.deleteMany({
        where: { entity: 'applications', entity_id: { in: appIds.map(String) } },
      });
      await prisma.applications.deleteMany({ where: { application_id: { in: appIds } } });
    }
    if (uniIds.length || courseIds.length || intakeIds.length) {
      await prisma.university_course_intake.deleteMany({
        where: {
          OR: [
            ...(uniIds.length ? [{ university_id: { in: uniIds } }] : []),
            ...(courseIds.length ? [{ course_id: { in: courseIds } }] : []),
            ...(intakeIds.length ? [{ intake_id: { in: intakeIds } }] : []),
          ],
        },
      });
      await prisma.university_course.deleteMany({
        where: {
          OR: [
            ...(uniIds.length ? [{ university_id: { in: uniIds } }] : []),
            ...(courseIds.length ? [{ course_id: { in: courseIds } }] : []),
          ],
        },
      });
    }
    if (intakeIds.length) await prisma.intake.deleteMany({ where: { id: { in: intakeIds } } });
    if (courseIds.length) await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
    if (uniIds.length) await prisma.university.deleteMany({ where: { id: { in: uniIds } } });
    if (sessionIds.length) await prisma.sessions.deleteMany({ where: { session_id: { in: sessionIds } } });
  }

  const createLead = (body: Record<string, unknown>) =>
    request(http).post('/api/applications').set(authHeader(token)).send(body);

  // ---- POST /applications (Add Lead) -----------------------------------------

  it('writes intake_id AND syncs session_id from a valid, linked offering', async () => {
    const contact = uniqueContact();
    const res = await createLead({
      name: `${TAG} Valid Linked`,
      ...contact,
      university_id: universityId,
      course_id: courseId,
      intake_id: intakeLinked,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.data.intake_id).toBe(intakeLinked);
    // Dual-write: session_id mirrors intake.session_id.
    expect(res.body.data.session_id).toBe(sessionId);
  });

  it('writes intake_id with a null session when the intake has no session link', async () => {
    const contact = uniqueContact();
    const res = await createLead({
      name: `${TAG} Valid NoSession`,
      ...contact,
      university_id: universityId,
      course_id: courseId,
      intake_id: intakeNoSession,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.data.intake_id).toBe(intakeNoSession);
    expect(res.body.data.session_id ?? null).toBeNull();
  });

  it('400s when the (university, course, intake) triple is not an offering', async () => {
    const contact = uniqueContact();
    const res = await createLead({
      name: `${TAG} Invalid Combo`,
      ...contact,
      university_id: universityId,
      course_id: courseId,
      intake_id: intakeNoOffer,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not open for the selected intake/i);
  });

  it('400s when the intake does not exist', async () => {
    const contact = uniqueContact();
    const res = await createLead({
      name: `${TAG} Missing Intake`,
      ...contact,
      university_id: universityId,
      course_id: courseId,
      intake_id: 999999999,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not exist/i);
  });

  // ---- PATCH /applications/:id/academic --------------------------------------

  it('PATCH /academic validates the offering, writes intake_id and syncs session_id', async () => {
    const contact = uniqueContact();
    const created = await createLead({
      name: `${TAG} For Patch`,
      ...contact,
      university_id: universityId,
      course_id: courseId,
    });
    expect([200, 201]).toContain(created.status);
    const appId = created.body.data.application_id as number;
    expect(created.body.data.intake_id ?? null).toBeNull();

    const patch = await request(http)
      .patch(`/api/applications/${appId}/academic`)
      .set(authHeader(token))
      .send({ intake_id: intakeLinked });
    expect([200, 201]).toContain(patch.status);
    expect(patch.body.data.intake_id).toBe(intakeLinked);
    expect(patch.body.data.session_id).toBe(sessionId);
  });

  it('PATCH /academic 400s an invalid offering combo', async () => {
    const contact = uniqueContact();
    const created = await createLead({
      name: `${TAG} For Patch Invalid`,
      ...contact,
      university_id: universityId,
      course_id: courseId,
    });
    const appId = created.body.data.application_id as number;

    const patch = await request(http)
      .patch(`/api/applications/${appId}/academic`)
      .set(authHeader(token))
      .send({ intake_id: intakeNoOffer });
    expect(patch.status).toBe(400);
    expect(patch.body.message).toMatch(/not open for the selected intake/i);
  });

  it('the application list and detail expose intake_name', async () => {
    const contact = uniqueContact();
    const created = await createLead({
      name: `${TAG} For Display`,
      ...contact,
      university_id: universityId,
      course_id: courseId,
      intake_id: intakeLinked,
    });
    const appId = created.body.data.application_id as number;

    const detail = await request(http)
      .get(`/api/applications/${appId}`)
      .set(authHeader(token));
    expect(detail.status).toBe(200);
    // intake_name resolves from intake_id (intake.name), not the legacy session.
    expect(detail.body.data.intake_name).toContain(`${TAG} intake linked`);
  });

  // ---- PATCH /academic desync guard (WS3 MEDIUM 2) ---------------------------

  async function mkTaggedCourse(suffix: string): Promise<number> {
    const now = new Date();
    const course = await prisma.course.create({
      data: {
        title: `${TAG} Course ${suffix}`,
        short_name: `${TAG}-${suffix}`,
        stream: 'Management',
        total_duration: '2 Years',
        duration: '2 Years',
        study_mode: 'Online',
        university_id: universityId,
        total_amount: 0,
        created_at: now,
        updated_at: now,
      },
    });
    await prisma.university_course.create({
      data: {
        university_id: universityId,
        course_id: course.id,
        status: 1,
        source: 'ui',
        created_at: now,
        updated_at: now,
      },
    });
    return course.id;
  }

  it('PATCH /academic clears a now-stale intake when the course changes without a new intake', async () => {
    // A second course tagged to the SAME university but NOT offered in intakeLinked.
    const otherCourse = await mkTaggedCourse('desync-clear');

    const contact = uniqueContact();
    const created = await createLead({
      name: `${TAG} Desync Clear`,
      ...contact,
      university_id: universityId,
      course_id: courseId,
      intake_id: intakeLinked,
    });
    const appId = created.body.data.application_id as number;
    expect(created.body.data.intake_id).toBe(intakeLinked);
    expect(created.body.data.session_id).toBe(sessionId);

    // Change only the course (no intake_id in the body). intakeLinked is not an
    // offering for the new pair, so the stale intake + its mirrored session clear.
    const patch = await request(http)
      .patch(`/api/applications/${appId}/academic`)
      .set(authHeader(token))
      .send({ course_id: otherCourse });
    expect([200, 201]).toContain(patch.status);
    expect(patch.body.data.course_id).toBe(otherCourse);
    expect(patch.body.data.intake_id ?? null).toBeNull();
    expect(patch.body.data.session_id ?? null).toBeNull();
  });

  it('PATCH /academic keeps the stored intake when it is still a live offering for the new pair', async () => {
    const keepCourse = await mkTaggedCourse('desync-keep');
    const now = new Date();
    // keepCourse IS offered in intakeLinked.
    await prisma.university_course_intake.create({
      data: {
        university_id: universityId,
        course_id: keepCourse,
        intake_id: intakeLinked,
        status: 1,
        source: 'ui',
        created_at: now,
        updated_at: now,
      },
    });

    const contact = uniqueContact();
    const created = await createLead({
      name: `${TAG} Desync Keep`,
      ...contact,
      university_id: universityId,
      course_id: courseId,
      intake_id: intakeLinked,
    });
    const appId = created.body.data.application_id as number;

    const patch = await request(http)
      .patch(`/api/applications/${appId}/academic`)
      .set(authHeader(token))
      .send({ course_id: keepCourse });
    expect([200, 201]).toContain(patch.status);
    expect(patch.body.data.course_id).toBe(keepCourse);
    // Still a live offering for (uni, keepCourse) -> intake and session kept.
    expect(patch.body.data.intake_id).toBe(intakeLinked);
    expect(patch.body.data.session_id).toBe(sessionId);
  });

  // ---- paused tag rejects new leads (WS3 LOW 5, resolveApplicationIntake) -----

  it('POST /applications rejects a lead on a PAUSED (university, course) tag', async () => {
    const now = new Date();
    const pausedCourse = await prisma.course.create({
      data: {
        title: `${TAG} Course Paused`,
        short_name: `${TAG}-P`,
        stream: 'Management',
        total_duration: '2 Years',
        duration: '2 Years',
        study_mode: 'Online',
        university_id: universityId,
        total_amount: 0,
        created_at: now,
        updated_at: now,
      },
    });
    // Tag is PAUSED (status 0) even though the offering row is active (status 1).
    await prisma.university_course.create({
      data: {
        university_id: universityId,
        course_id: pausedCourse.id,
        status: 0,
        source: 'ui',
        created_at: now,
        updated_at: now,
      },
    });
    await prisma.university_course_intake.create({
      data: {
        university_id: universityId,
        course_id: pausedCourse.id,
        intake_id: intakeLinked,
        status: 1,
        source: 'ui',
        created_at: now,
        updated_at: now,
      },
    });

    const contact = uniqueContact();
    const res = await createLead({
      name: `${TAG} Paused Lead`,
      ...contact,
      university_id: universityId,
      course_id: pausedCourse.id,
      intake_id: intakeLinked,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not active for the selected university/i);
  });
});
