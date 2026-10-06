import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * IN04 — University x Course x Intake mapping (e2e), on the real stack + DB.
 *
 * Covers: tagging (+ re-tag revives + already), real counts, untag cascade and
 * its 409 guard, offerings PUT (replace) + copy, the three admission-catalog
 * cascade endpoints (keyed by id, only OPEN intakes), and the catalog permission
 * matrix (view vs manage vs none).
 *
 * All fixtures are prefixed with a per-run TAG and created directly via Prisma so
 * intake dates can sit outside the API's 2020–2035 window (an Open intake needs a
 * past start + future closing). Nothing here depends on seed rows.
 */
describe('IN04 university-course mapping (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let prisma: PrismaService;

  const TAG = `e2e_uc_${Date.now()}`;
  const PASSWORD = 'UcMapping@12345';
  let phoneSeq = 0;
  const uniquePhone = () => `96${String(Date.now()).slice(-7)}${phoneSeq++ % 10}`;

  const tokens: Record<string, string> = {};
  let uniA = 0;
  let uniB = 0;
  let courseA1 = 0;
  let courseA2 = 0;
  let courseB1 = 0;
  let intakeOpen = 0;
  let intakeUpcoming = 0;
  let intakeClosed = 0;

  async function mkStaff(key: string, roleId: number): Promise<void> {
    const username = `${TAG}_${key}`;
    const hash = await bcrypt.hash(PASSWORD, 10);
    await prisma.users.create({
      data: {
        name: `${TAG} ${key}`,
        username,
        role_id: roleId,
        status: 1,
        password: hash,
        phone: uniquePhone(),
        created_at: new Date(),
      },
    });
    tokens[key] = await loginAs(http, username, PASSWORD);
  }

  async function mkUniversity(suffix: string): Promise<number> {
    const now = new Date();
    const row = await prisma.university.create({
      data: {
        title: `${TAG} University ${suffix}`,
        country_id: '',
        website: '',
        phone: '',
        email: '',
        fee_collection_model: 'upcarrera_collects',
        created_at: now,
        updated_at: now,
      },
    });
    return row.id;
  }

  async function mkCourse(suffix: string, universityId: number | null): Promise<number> {
    const now = new Date();
    const row = await prisma.course.create({
      data: {
        title: `${TAG} Course ${suffix}`,
        short_name: `${TAG}-${suffix}`,
        stream: 'Management',
        total_duration: '2 Years',
        duration: '2 Years',
        study_mode: 'Online',
        university_id: universityId ?? undefined,
        total_amount: 0,
        created_at: now,
        updated_at: now,
      },
    });
    return row.id;
  }

  /** kind: 'open' (past→future), 'upcoming' (future), 'closed' (past→past). */
  async function mkIntake(suffix: string, kind: 'open' | 'upcoming' | 'closed'): Promise<number> {
    const now = new Date();
    const windows: Record<typeof kind, [Date, Date]> = {
      open: [new Date(Date.UTC(2020, 0, 1)), new Date(Date.UTC(2090, 11, 31))],
      upcoming: [new Date(Date.UTC(2090, 0, 1)), new Date(Date.UTC(2090, 11, 31))],
      closed: [new Date(Date.UTC(2000, 0, 1)), new Date(Date.UTC(2001, 0, 1))],
    };
    const [start, closing] = windows[kind];
    const row = await prisma.intake.create({
      data: {
        name: `${TAG} intake ${suffix} (${kind})`,
        start_date: start,
        closing_date: closing,
        status: 'Open',
        created_at: now,
        updated_at: now,
      },
    });
    return row.id;
  }

  const tagCourses = (token: string, universityId: number, body: object) =>
    request(http).post(`/api/universities/${universityId}/courses`).set(authHeader(token)).send(body);
  const getTagged = (token: string, universityId: number) =>
    request(http).get(`/api/universities/${universityId}/courses`).set(authHeader(token));
  const putOfferings = (token: string, intakeId: number, body: object) =>
    request(http).put(`/api/intakes/${intakeId}/offerings`).set(authHeader(token)).send(body);
  const getOfferings = (token: string, intakeId: number) =>
    request(http).get(`/api/intakes/${intakeId}/offerings`).set(authHeader(token));

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    prisma = app.get(PrismaService);
    await cleanup();

    tokens.superadmin = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);

    const roles = await prisma.user_role.findMany({
      where: { role_key: { in: ['admin', 'accounts', 'counsellor', 'student', 'client'] } },
      select: { id: true, role_key: true },
    });
    const roleId = (key: string): number => {
      const r = roles.find((x) => x.role_key === key);
      if (!r) throw new Error(`role_key ${key} not seeded — apply migration 002`);
      return r.id;
    };
    await mkStaff('admin', roleId('admin'));
    await mkStaff('accounts', roleId('accounts'));
    await mkStaff('counsellor', roleId('counsellor'));
    await mkStaff('student', roleId('student'));
    // `client` (legacy LMS role id 8) is a second NON-staff token: like `student`
    // it holds no catalog slug. Optional so the suite still runs on a DB that
    // never seeded a Client role.
    const clientRoleId = roles.find((x) => x.role_key === 'client')?.id ?? null;
    if (clientRoleId != null) await mkStaff('client', clientRoleId);

    uniA = await mkUniversity('A');
    uniB = await mkUniversity('B');
    courseA1 = await mkCourse('A1', uniA);
    courseA2 = await mkCourse('A2', uniA);
    courseB1 = await mkCourse('B1', uniB);
    intakeOpen = await mkIntake('open', 'open');
    intakeUpcoming = await mkIntake('up', 'upcoming');
    intakeClosed = await mkIntake('closed', 'closed');
  }, 30000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup() {
    const [unis, courses, intakes] = await Promise.all([
      prisma.university.findMany({ where: { title: { startsWith: TAG } }, select: { id: true } }),
      prisma.course.findMany({ where: { title: { startsWith: TAG } }, select: { id: true } }),
      prisma.intake.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } }),
    ]);
    const uniIds = unis.map((u) => u.id);
    const courseIds = courses.map((c) => c.id);
    const intakeIds = intakes.map((i) => i.id);
    if (uniIds.length || courseIds.length || intakeIds.length) {
      const mapOr = [
        ...(uniIds.length ? [{ university_id: { in: uniIds } }] : []),
        ...(courseIds.length ? [{ course_id: { in: courseIds } }] : []),
        ...(intakeIds.length ? [{ intake_id: { in: intakeIds } }] : []),
      ];
      await prisma.university_course_intake.deleteMany({ where: { OR: mapOr } });
      await prisma.university_course.deleteMany({
        where: {
          OR: [
            ...(uniIds.length ? [{ university_id: { in: uniIds } }] : []),
            ...(courseIds.length ? [{ course_id: { in: courseIds } }] : []),
          ],
        },
      });
      await prisma.fee_structure.deleteMany({ where: { OR: mapOr } });
      await prisma.applications.deleteMany({
        where: {
          OR: [
            ...(uniIds.length ? [{ university_id: { in: uniIds } }] : []),
            ...(courseIds.length ? [{ course_id: { in: courseIds } }] : []),
            ...(intakeIds.length ? [{ intake_id: { in: intakeIds } }] : []),
          ],
        },
      });
    }
    if (intakeIds.length) await prisma.intake.deleteMany({ where: { id: { in: intakeIds } } });
    if (courseIds.length) await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
    if (uniIds.length) await prisma.university.deleteMany({ where: { id: { in: uniIds } } });
    await prisma.users.deleteMany({ where: { username: { startsWith: TAG } } });
  }

  // ---- tagging ---------------------------------------------------------------

  it('tags courses onto a university, with a per-university name', async () => {
    const res = await tagCourses(tokens.admin, uniA, {
      items: [
        { course_id: courseA1 },
        { course_id: courseA2, university_course_name: 'Custom MBA' },
      ],
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.data).toEqual({ added: 2, revived: 0, already: 0 });

    const tagged = await getTagged(tokens.admin, uniA);
    expect(tagged.status).toBe(200);
    const items = tagged.body.data as Array<{
      course_id: number;
      university_course_name: string | null;
    }>;
    const a2 = items.find((i) => i.course_id === courseA2);
    expect(a2?.university_course_name).toBe('Custom MBA');
    expect(items.map((i) => i.course_id).sort()).toEqual([courseA1, courseA2].sort());
  });

  it('is idempotent: re-tagging an active pair reports it as already tagged', async () => {
    const res = await tagCourses(tokens.admin, uniA, { items: [{ course_id: courseA1 }] });
    expect([200, 201]).toContain(res.status);
    expect(res.body.data).toEqual({ added: 0, revived: 0, already: 1 });
  });

  it('re-tagging a soft-deleted pair REVIVES the row (no duplicate key)', async () => {
    const localCourse = await mkCourse('revive', uniA);
    const first = await tagCourses(tokens.admin, uniA, { items: [{ course_id: localCourse }] });
    expect(first.body.data.added).toBe(1);

    const del = await request(http)
      .delete(`/api/universities/${uniA}/courses/${localCourse}`)
      .set(authHeader(tokens.admin));
    expect(del.status).toBe(200);

    const revive = await tagCourses(tokens.admin, uniA, { items: [{ course_id: localCourse }] });
    expect(revive.body.data).toEqual({ added: 0, revived: 1, already: 0 });

    // Exactly one row exists for the pair (revived, not duplicated).
    const rows = await prisma.university_course.count({
      where: { university_id: uniA, course_id: localCourse },
    });
    expect(rows).toBe(1);
  });

  it('400s when tagging a non-existent course', async () => {
    const res = await tagCourses(tokens.admin, uniA, { items: [{ course_id: 999999999 }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not found or deleted/i);
  });

  it('tags a course to a SECOND university (M:N)', async () => {
    const res = await tagCourses(tokens.admin, uniB, { items: [{ course_id: courseA1 }] });
    expect([200, 201]).toContain(res.status);
    expect(res.body.data.added).toBe(1);
  });

  // ---- real counts -----------------------------------------------------------

  it('GET /universities reports tagged_courses_count from the mapping table', async () => {
    const res = await request(http)
      .get('/api/universities')
      .query({ limit: 1000 })
      .set(authHeader(tokens.admin));
    expect(res.status).toBe(200);
    const row = res.body.data.items.find((u: { id: number }) => u.id === uniA);
    expect(row).toBeDefined();
    const actual = await prisma.university_course.count({
      where: { university_id: uniA, deleted_at: null },
    });
    expect(row.tagged_courses_count).toBe(actual);
    expect(typeof row.intakes_count).toBe('number');
  });

  it('GET /courses reports mapped_universities_count (courseA1 is on two universities)', async () => {
    const res = await request(http)
      .get('/api/courses')
      .query({ limit: 1000 })
      .set(authHeader(tokens.admin));
    expect(res.status).toBe(200);
    const row = res.body.data.items.find((c: { id: number }) => c.id === courseA1);
    expect(row).toBeDefined();
    expect(row.mapped_universities_count).toBeGreaterThanOrEqual(2);
    const actual = await prisma.university_course.count({
      where: { course_id: courseA1, deleted_at: null },
    });
    expect(row.mapped_universities_count).toBe(actual);
  });

  it('GET /courses/:id/universities lists the universities offering a course', async () => {
    const res = await request(http)
      .get(`/api/courses/${courseA1}/universities`)
      .set(authHeader(tokens.counsellor));
    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ university_id: number }>).map((u) => u.university_id);
    expect(ids).toEqual(expect.arrayContaining([uniA, uniB]));
  });

  // ---- offerings: PUT (replace) + copy ---------------------------------------

  it('PUT /intakes/:id/offerings replaces the whole set in one transaction', async () => {
    const put = await putOfferings(tokens.admin, intakeOpen, {
      offerings: [
        { university_id: uniA, course_id: courseA1 },
        { university_id: uniA, course_id: courseA2 },
      ],
    });
    expect([200, 201]).toContain(put.status);
    expect(put.body.data).toEqual({ added: 2, revived: 0, removed: 0 });

    const view = await getOfferings(tokens.admin, intakeOpen);
    expect(view.status).toBe(200);
    expect(view.body.data.total_pairs).toBe(2);
    const uni = view.body.data.universities.find((u: { university_id: number }) => u.university_id === uniA);
    expect(uni.courses.map((c: { course_id: number }) => c.course_id).sort()).toEqual(
      [courseA1, courseA2].sort(),
    );

    // Replace with a subset -> the dropped pair is removed, nothing re-added.
    const put2 = await putOfferings(tokens.admin, intakeOpen, {
      offerings: [{ university_id: uniA, course_id: courseA1 }],
    });
    expect(put2.body.data).toEqual({ added: 0, revived: 0, removed: 1 });

    // Re-adding the dropped pair revives the soft-deleted row.
    const put3 = await putOfferings(tokens.admin, intakeOpen, {
      offerings: [
        { university_id: uniA, course_id: courseA1 },
        { university_id: uniA, course_id: courseA2 },
      ],
    });
    expect(put3.body.data).toEqual({ added: 0, revived: 1, removed: 0 });
  });

  it('PUT /intakes/:id/offerings 400s a pair that is not an active tagged course', async () => {
    // courseB1 is tagged to uniB, not uniA.
    const put = await putOfferings(tokens.admin, intakeOpen, {
      offerings: [{ university_id: uniA, course_id: courseB1 }],
    });
    expect(put.status).toBe(400);
    expect(put.body.message).toMatch(/not active tagged courses/i);
  });

  it('POST /intakes/:id/offerings/copy copies missing pairs and is idempotent', async () => {
    const target = await mkIntake('copy-target', 'open');
    const first = await request(http)
      .post(`/api/intakes/${target}/offerings/copy`)
      .set(authHeader(tokens.admin))
      .send({ from_intake_id: intakeOpen });
    expect([200, 201]).toContain(first.status);
    expect(first.body.data.added).toBeGreaterThanOrEqual(2);

    const again = await request(http)
      .post(`/api/intakes/${target}/offerings/copy`)
      .set(authHeader(tokens.admin))
      .send({ from_intake_id: intakeOpen });
    expect(again.body.data.added).toBe(0);
    expect(again.body.data.already).toBeGreaterThanOrEqual(2);
  });

  it('GET /intakes reports real mapped counts and filters by ?university_id', async () => {
    const res = await request(http)
      .get('/api/intakes')
      .query({ limit: 1000 })
      .set(authHeader(tokens.admin));
    const row = res.body.data.items.find((i: { id: number }) => i.id === intakeOpen);
    expect(row.mapped_universities).toBeGreaterThanOrEqual(1);
    expect(row.mapped_courses).toBeGreaterThanOrEqual(2);

    const filtered = await request(http)
      .get('/api/intakes')
      .query({ limit: 1000, university_id: uniA })
      .set(authHeader(tokens.admin));
    const ids = filtered.body.data.items.map((i: { id: number }) => i.id);
    expect(ids).toContain(intakeOpen);

    // A university with no offerings returns no intakes.
    const none = await request(http)
      .get('/api/intakes')
      .query({ limit: 1000, university_id: uniB })
      .set(authHeader(tokens.admin));
    expect(none.body.data.items.find((i: { id: number }) => i.id === intakeClosed)).toBeUndefined();
  });

  // ---- admission-catalog cascade (keyed by id, only OPEN) ---------------------

  it('cascades university -> course -> OPEN intake, excluding closed/upcoming', async () => {
    // Offer courseA1 at uniA in all three intakes; only the Open one should surface.
    await putOfferings(tokens.admin, intakeOpen, {
      offerings: [{ university_id: uniA, course_id: courseA1 }, { university_id: uniA, course_id: courseA2 }],
    });
    await putOfferings(tokens.admin, intakeUpcoming, {
      offerings: [{ university_id: uniA, course_id: courseA1 }],
    });
    await putOfferings(tokens.admin, intakeClosed, {
      offerings: [{ university_id: uniA, course_id: courseA1 }],
    });

    const unis = await request(http)
      .get('/api/admission-catalog/universities')
      .set(authHeader(tokens.counsellor));
    expect(unis.status).toBe(200);
    expect((unis.body.data as Array<{ id: number }>).map((u) => u.id)).toContain(uniA);

    const courses = await request(http)
      .get(`/api/admission-catalog/universities/${uniA}/courses`)
      .set(authHeader(tokens.counsellor));
    expect(courses.status).toBe(200);
    const courseIds = (courses.body.data as Array<{ course_id: number }>).map((c) => c.course_id);
    expect(courseIds).toContain(courseA1);

    const intakesRes = await request(http)
      .get(`/api/admission-catalog/universities/${uniA}/courses/${courseA1}/intakes`)
      .set(authHeader(tokens.counsellor));
    expect(intakesRes.status).toBe(200);
    const intakeIds = (intakesRes.body.data as Array<{ id: number }>).map((i) => i.id);
    expect(intakeIds).toContain(intakeOpen);
    expect(intakeIds).not.toContain(intakeUpcoming);
    expect(intakeIds).not.toContain(intakeClosed);
  });

  it('a course with only closed/upcoming offerings never appears in the cascade', async () => {
    const lonelyCourse = await mkCourse('lonely', uniB);
    await tagCourses(tokens.admin, uniB, { items: [{ course_id: lonelyCourse }] });
    await putOfferings(tokens.admin, intakeClosed, {
      offerings: [{ university_id: uniB, course_id: lonelyCourse }],
    });
    const courses = await request(http)
      .get(`/api/admission-catalog/universities/${uniB}/courses`)
      .set(authHeader(tokens.admin));
    const ids = (courses.body.data as Array<{ course_id: number }>).map((c) => c.course_id);
    expect(ids).not.toContain(lonelyCourse);
  });

  // ---- untag: cascade + 409 --------------------------------------------------

  it('untagging cascades: it soft-deletes the pair and its offerings', async () => {
    const course = await mkCourse('cascade', uniA);
    await tagCourses(tokens.admin, uniA, { items: [{ course_id: course }] });
    await putOfferings(tokens.admin, intakeOpen, {
      offerings: [
        { university_id: uniA, course_id: courseA1 },
        { university_id: uniA, course_id: courseA2 },
        { university_id: uniA, course_id: course },
      ],
    });

    const del = await request(http)
      .delete(`/api/universities/${uniA}/courses/${course}`)
      .set(authHeader(tokens.admin));
    expect(del.status).toBe(200);
    expect(del.body.data.untagged).toBe(true);
    expect(del.body.data.offerings_removed).toBeGreaterThanOrEqual(1);

    // The offering for the pair is gone.
    const liveOffering = await prisma.university_course_intake.count({
      where: { university_id: uniA, course_id: course, intake_id: intakeOpen, deleted_at: null },
    });
    expect(liveOffering).toBe(0);
    // The tag is gone from the list.
    const tagged = await getTagged(tokens.admin, uniA);
    expect((tagged.body.data as Array<{ course_id: number }>).map((t) => t.course_id)).not.toContain(course);
  });

  it('untag 409s when an in-flight application references the pair', async () => {
    const course = await mkCourse('blocked-app', uniA);
    await tagCourses(tokens.admin, uniA, { items: [{ course_id: course }] });
    await prisma.applications.create({
      data: {
        name: `${TAG} inflight`,
        university_id: uniA,
        course_id: course,
        is_converted: 0,
        is_archived: false,
        created_at: new Date(),
      },
    });
    const del = await request(http)
      .delete(`/api/universities/${uniA}/courses/${course}`)
      .set(authHeader(tokens.admin));
    expect(del.status).toBe(409);
    expect(del.body.message).toMatch(/in-flight application/i);
  });

  it('untag 409s when a non-expired fee structure references the pair', async () => {
    const course = await mkCourse('blocked-fee', uniA);
    await tagCourses(tokens.admin, uniA, { items: [{ course_id: course }] });
    const now = new Date();
    await prisma.fee_structure.create({
      data: {
        university_id: uniA,
        course_id: course,
        intake_id: intakeOpen,
        status: 'draft',
        created_at: now,
        updated_at: now,
      },
    });
    const del = await request(http)
      .delete(`/api/universities/${uniA}/courses/${course}`)
      .set(authHeader(tokens.admin));
    expect(del.status).toBe(409);
    expect(del.body.message).toMatch(/fee structure/i);
  });

  it('PATCH rename / pause a tagged course', async () => {
    const course = await mkCourse('rename', uniA);
    await tagCourses(tokens.admin, uniA, { items: [{ course_id: course }] });
    const res = await request(http)
      .patch(`/api/universities/${uniA}/courses/${course}`)
      .set(authHeader(tokens.admin))
      .send({ university_course_name: 'Renamed Programme', status: 0 });
    expect([200, 201]).toContain(res.status);
    expect(res.body.data.university_course_name).toBe('Renamed Programme');
    expect(res.body.data.status).toBe(0);
  });

  // ---- permission matrix -----------------------------------------------------

  it('catalog READS require crm:catalog.view (staff yes, student no)', async () => {
    for (const key of ['admin', 'accounts', 'counsellor', 'superadmin']) {
      const res = await getTagged(tokens[key], uniA);
      expect(res.status).toBe(200);
    }
    const student = await getTagged(tokens.student, uniA);
    expect(student.status).toBe(403);

    const studentCatalog = await request(http)
      .get('/api/admission-catalog/universities')
      .set(authHeader(tokens.student));
    expect(studentCatalog.status).toBe(403);
    const counsellorCatalog = await request(http)
      .get('/api/admission-catalog/universities')
      .set(authHeader(tokens.counsellor));
    expect(counsellorCatalog.status).toBe(200);
  });

  it('catalog WRITES require crm:catalog.manage (admin yes, counsellor/accounts/student no)', async () => {
    const localCourse = await mkCourse('perm', uniA);

    const counsellor = await tagCourses(tokens.counsellor, uniA, { items: [{ course_id: localCourse }] });
    expect(counsellor.status).toBe(403);
    const accounts = await tagCourses(tokens.accounts, uniA, { items: [{ course_id: localCourse }] });
    expect(accounts.status).toBe(403);
    const student = await tagCourses(tokens.student, uniA, { items: [{ course_id: localCourse }] });
    expect(student.status).toBe(403);

    const admin = await tagCourses(tokens.admin, uniA, { items: [{ course_id: localCourse }] });
    expect([200, 201]).toContain(admin.status);

    // Offerings PUT is also a manage write.
    const counsellorPut = await putOfferings(tokens.counsellor, intakeOpen, { offerings: [] });
    expect(counsellorPut.status).toBe(403);
  });

  // ---- pre-existing course + intake write guards (WS3 HIGH 1) -----------------

  it('course writes (POST/PATCH/DELETE /courses) reject non-staff and allow admin', async () => {
    const nonStaff = ['student', 'client'].filter((k) => tokens[k]);
    expect(nonStaff).toContain('student');

    // A real course to target with PATCH/DELETE attempts.
    const target = await mkCourse('write-guard', uniA);
    const courseBody = {
      title: `${TAG} Guarded Course`,
      level: 'PG',
      duration: 'Year',
      total_duration: '2',
      specialisations: 'General',
    };

    for (const key of nonStaff) {
      const post = await request(http).post('/api/courses').set(authHeader(tokens[key])).send(courseBody);
      expect(post.status).toBe(403);
      const patch = await request(http).patch(`/api/courses/${target}`).set(authHeader(tokens[key])).send({ title: 'Hacked' });
      expect(patch.status).toBe(403);
      const patchStatus = await request(http).patch(`/api/courses/${target}/status`).set(authHeader(tokens[key])).send({ status: 0 });
      expect(patchStatus.status).toBe(403);
      const del = await request(http).delete(`/api/courses/${target}`).set(authHeader(tokens[key]));
      expect(del.status).toBe(403);
    }

    // Admin (crm:catalog.manage) succeeds across the same write set.
    const created = await request(http).post('/api/courses').set(authHeader(tokens.admin)).send(courseBody);
    expect([200, 201]).toContain(created.status);
    const newId = created.body.data.id as number;
    const upd = await request(http).patch(`/api/courses/${newId}`).set(authHeader(tokens.admin)).send({ title: `${TAG} Guarded Course v2` });
    expect([200, 201]).toContain(upd.status);
    const del = await request(http).delete(`/api/courses/${newId}`).set(authHeader(tokens.admin));
    expect([200, 201]).toContain(del.status);
  });

  it('intake writes (POST/PATCH/DELETE /intakes + sessions) reject non-staff and allow admin', async () => {
    const nonStaff = ['student', 'client'].filter((k) => tokens[k]);
    const target = await mkIntake('write-guard', 'open');
    const intakeBody = { name: `${TAG} Guarded Intake`, year: 2026, status: 'Open' };

    for (const key of nonStaff) {
      const post = await request(http).post('/api/intakes').set(authHeader(tokens[key])).send(intakeBody);
      expect(post.status).toBe(403);
      const patch = await request(http).patch(`/api/intakes/${target}`).set(authHeader(tokens[key])).send({ name: 'Hacked' });
      expect(patch.status).toBe(403);
      const del = await request(http).delete(`/api/intakes/${target}`).set(authHeader(tokens[key]));
      expect(del.status).toBe(403);
      // The intake MASTER (sessions) create/rename are manage writes too.
      const postSession = await request(http).post('/api/intakes/sessions').set(authHeader(tokens[key])).send({ session_title: `${TAG} session` });
      expect(postSession.status).toBe(403);
      const patchSession = await request(http).patch('/api/intakes/sessions/1').set(authHeader(tokens[key])).send({ session_title: `${TAG} session` });
      expect(patchSession.status).toBe(403);
    }

    const created = await request(http).post('/api/intakes').set(authHeader(tokens.admin)).send(intakeBody);
    expect([200, 201]).toContain(created.status);
    const newId = created.body.data.id as number;
    const upd = await request(http).patch(`/api/intakes/${newId}`).set(authHeader(tokens.admin)).send({ name: `${TAG} Guarded Intake v2` });
    expect([200, 201]).toContain(upd.status);
    const del = await request(http).delete(`/api/intakes/${newId}`).set(authHeader(tokens.admin));
    expect([200, 201]).toContain(del.status);
  });

  // ---- untag: no false 409 across two universities (WS3 MEDIUM 3) -------------

  it('untag does not 409 when the in-flight application belongs to the OTHER university', async () => {
    const now = new Date();
    const shared = await mkCourse('shared-untag', null);
    await tagCourses(tokens.admin, uniA, { items: [{ course_id: shared }] });
    await tagCourses(tokens.admin, uniB, { items: [{ course_id: shared }] });

    // Offer the pair in the SAME intake on both universities.
    const intakeShared = await mkIntake('shared-untag', 'open');
    await prisma.university_course_intake.createMany({
      data: [
        { university_id: uniA, course_id: shared, intake_id: intakeShared, status: 1, source: 'ui', created_at: now, updated_at: now },
        { university_id: uniB, course_id: shared, intake_id: intakeShared, status: 1, source: 'ui', created_at: now, updated_at: now },
      ],
    });

    // An in-flight application that belongs to university B (same course + intake).
    await prisma.applications.create({
      data: {
        name: `${TAG} belongs-to-B`,
        university_id: uniB,
        course_id: shared,
        intake_id: intakeShared,
        is_converted: 0,
        is_archived: false,
        created_at: now,
      },
    });

    // Untagging university A must NOT 409 — the application is university B's.
    const delA = await request(http)
      .delete(`/api/universities/${uniA}/courses/${shared}`)
      .set(authHeader(tokens.admin));
    expect(delA.status).toBe(200);
    expect(delA.body.data.untagged).toBe(true);

    // Untagging university B DOES 409 — its own in-flight application references it.
    const delB = await request(http)
      .delete(`/api/universities/${uniB}/courses/${shared}`)
      .set(authHeader(tokens.admin));
    expect(delB.status).toBe(409);
    expect(delB.body.message).toMatch(/in-flight application/i);
  });

  // ---- PUT offerings blocked when a removed offering is referenced (WS3 MEDIUM 4) ---

  it('PUT /intakes/:id/offerings 409s when a removed offering has an in-flight application', async () => {
    const now = new Date();
    const course = await mkCourse('offer-rm-app', uniA);
    await tagCourses(tokens.admin, uniA, { items: [{ course_id: course }] });
    const intake = await mkIntake('offer-rm-app', 'open');
    const put = await putOfferings(tokens.admin, intake, {
      offerings: [{ university_id: uniA, course_id: course }],
    });
    expect([200, 201]).toContain(put.status);

    // An in-flight application references the exact (uni, course, intake) triple.
    await prisma.applications.create({
      data: {
        name: `${TAG} offer-app`,
        university_id: uniA,
        course_id: course,
        intake_id: intake,
        is_converted: 0,
        is_archived: false,
        created_at: now,
      },
    });

    // Removing it (PUT with an empty set) must 409, not orphan the application.
    const removed = await putOfferings(tokens.admin, intake, { offerings: [] });
    expect(removed.status).toBe(409);
    expect(removed.body.message).toMatch(/referenced by in-flight applications|fee structures/i);

    // The offering is still live — the whole replace transaction rolled back.
    const live = await prisma.university_course_intake.count({
      where: { university_id: uniA, course_id: course, intake_id: intake, deleted_at: null },
    });
    expect(live).toBe(1);
  });

  it('PUT /intakes/:id/offerings 409s when a removed offering has a non-expired fee structure', async () => {
    const now = new Date();
    const course = await mkCourse('offer-rm-fee', uniA);
    await tagCourses(tokens.admin, uniA, { items: [{ course_id: course }] });
    const intake = await mkIntake('offer-rm-fee', 'open');
    await putOfferings(tokens.admin, intake, {
      offerings: [{ university_id: uniA, course_id: course }],
    });
    await prisma.fee_structure.create({
      data: {
        university_id: uniA,
        course_id: course,
        intake_id: intake,
        status: 'draft',
        created_at: now,
        updated_at: now,
      },
    });

    const removed = await putOfferings(tokens.admin, intake, { offerings: [] });
    expect(removed.status).toBe(409);
    expect(removed.body.message).toMatch(/fee structure/i);
  });

  // ---- paused tag excluded from the Add Lead cascade (WS3 LOW 5) --------------

  it('a PAUSED (university, course) tag is excluded from the catalog intake cascade', async () => {
    const now = new Date();
    const course = await mkCourse('paused-cascade', uniA);
    await tagCourses(tokens.admin, uniA, { items: [{ course_id: course }] });
    const intake = await mkIntake('paused-cascade', 'open');
    await prisma.university_course_intake.create({
      data: { university_id: uniA, course_id: course, intake_id: intake, status: 1, source: 'ui', created_at: now, updated_at: now },
    });

    // While the tag is ACTIVE, the open intake surfaces in the cascade.
    const before = await request(http)
      .get(`/api/admission-catalog/universities/${uniA}/courses/${course}/intakes`)
      .set(authHeader(tokens.counsellor));
    expect(before.status).toBe(200);
    expect((before.body.data as Array<{ id: number }>).map((i) => i.id)).toContain(intake);

    // Pause the tag (status 0).
    const pause = await request(http)
      .patch(`/api/universities/${uniA}/courses/${course}`)
      .set(authHeader(tokens.admin))
      .send({ status: 0 });
    expect([200, 201]).toContain(pause.status);

    // Now the cascade excludes the pair — both the intake list AND the course list.
    const afterIntakes = await request(http)
      .get(`/api/admission-catalog/universities/${uniA}/courses/${course}/intakes`)
      .set(authHeader(tokens.counsellor));
    expect(afterIntakes.status).toBe(200);
    expect((afterIntakes.body.data as Array<{ id: number }>).map((i) => i.id)).not.toContain(intake);

    const afterCourses = await request(http)
      .get(`/api/admission-catalog/universities/${uniA}/courses`)
      .set(authHeader(tokens.counsellor));
    expect((afterCourses.body.data as Array<{ course_id: number }>).map((c) => c.course_id)).not.toContain(course);
  });
});
