import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Course catalog hygiene (e2e) — QA CO03 / CO04 / CO05.
 *
 *   POST  /api/courses            requires level, specialisations, total_duration
 *                                 (positive number) and duration (unit) — 400 otherwise
 *   PATCH /api/courses/:id        does NOT require them: a legacy row that lacks
 *                                 them stays editable
 *   GET   /api/courses            rows gain `university_name`
 *   GET   /api/courses/:id        gains `university_name` + `semesters_count`
 *   GET   /api/group-courses      rows gain a live `courses_count`
 *   GET   /api/specialisations    rows gain a live `courses_count`
 *   POST/PATCH /api/group-courses       409 on a duplicate name (case/space-insensitive)
 *   POST/PATCH /api/specialisations     409 on a duplicate title for the same course_id
 *
 * Every fixture is created here with an `e2e_cocat_` prefix and hard-deleted in
 * afterAll — nothing pre-existing is read for assertions or modified.
 */
const P = 'e2e_cocat_';

describe('Course catalog hygiene (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let prisma: PrismaService;
  let token: string;

  let universityId: number;
  let courseId: number; // created via POST (strict)
  let legacyCourseId: number; // inserted directly, lacking level/spec/duration
  let groupId: number;
  let specId: number;

  const SPEC_TITLE = `${P}Marketing`;

  /** Hard-delete every row this spec owns (by its unique name prefix). */
  const purgeFixtures = async () => {
    await prisma.group_courses.deleteMany({ where: { group_name: { contains: P } } });
    await prisma.specialisations.deleteMany({ where: { title: { contains: P } } });
    await prisma.semester.deleteMany({ where: { title: { startsWith: P } } });
    await prisma.course.deleteMany({ where: { title: { startsWith: P } } });
    await prisma.university.deleteMany({ where: { title: { startsWith: P } } });
  };

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    prisma = app.get(PrismaService);
    token = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);
    // Leftovers from an interrupted earlier run would trip the 409 guards.
    await purgeFixtures();

    const now = new Date();
    const uni = await prisma.university.create({
      data: {
        title: `${P}University`,
        country_id: '',
        website: '',
        phone: '',
        email: '',
        created_at: now,
        updated_at: now,
      },
    });
    universityId = uni.id;

    // A legacy-shaped row: no level, no specialisation, a unit with no number.
    // The legacy React admin's JSON blob shape lives on a second row below.
    const legacy = await prisma.course.create({
      data: {
        title: `${P}Legacy MBA`,
        short_name: '',
        stream: '',
        total_duration: '',
        study_mode: '',
        duration: 'Year',
        // Legacy JSON blob that names the specialisation under test.
        specialisations: JSON.stringify([
          { id: 'specialisation-1737981364926', name: SPEC_TITLE, fee: '' },
        ]),
        created_at: now,
        updated_at: now,
      },
    });
    legacyCourseId = legacy.id;
  });

  afterAll(async () => {
    await purgeFixtures();
    await app.close();
  });

  describe('POST /api/courses (CO03 — required on create)', () => {
    const valid = () => ({
      title: `${P}MBA in Marketing`,
      short_name: `${P}MBA`,
      level: 'PG',
      specialisations: SPEC_TITLE,
      total_duration: '2',
      duration: 'Year',
      study_mode: 'Online',
      eligibility_criteria: 'Graduation in any discipline',
    });

    it.each([
      ['level', { level: undefined }, 'Course level is required'],
      ['level (blank)', { level: '   ' }, 'Course level is required'],
      ['specialisations', { specialisations: undefined }, 'Specialisation is required'],
      ['total_duration', { total_duration: undefined }, 'Duration must be a positive number'],
      ['total_duration (non-numeric)', { total_duration: '2 Years' }, 'Duration must be a positive number'],
      ['total_duration (zero)', { total_duration: '0' }, 'Duration must be a positive number'],
      ['duration unit', { duration: '' }, 'Duration unit is required'],
    ])('rejects a missing/invalid %s with 400', async (_label, patch, message) => {
      const res = await request(http)
        .post('/api/courses')
        .set(authHeader(token))
        .send({ ...valid(), university_id: universityId, ...patch });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe(false);
      expect(String(res.body.message)).toContain(message);
    });

    it('creates a complete course, trimming the required fields', async () => {
      const res = await request(http)
        .post('/api/courses')
        .set(authHeader(token))
        .send({ ...valid(), university_id: universityId, level: ' PG ', duration: ' Year ' });

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      const { data } = res.body;
      expect(data.level).toBe('PG');
      expect(data.duration).toBe('Year');
      expect(data.total_duration).toBe('2');
      expect(data.specialisations).toBe(SPEC_TITLE);
      expect(data.study_mode).toBe('Online');
      courseId = data.id;
    });
  });

  describe('PATCH /api/courses/:id (legacy rows stay editable)', () => {
    it('accepts a partial update on a row that lacks level/spec/duration', async () => {
      const res = await request(http)
        .patch(`/api/courses/${legacyCourseId}`)
        .set(authHeader(token))
        .send({ eligibility_criteria: 'Any graduate' });

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.data.eligibility_criteria).toBe('Any graduate');
      expect(res.body.data.level).toBeNull();
      expect(res.body.data.total_duration).toBe('');
    });

    it('still rejects blanking a field that IS sent', async () => {
      const res = await request(http)
        .patch(`/api/courses/${courseId}`)
        .set(authHeader(token))
        .send({ level: '' });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe(false);
    });

    it.each([
      ['total_duration', 'Duration must be a positive number'],
      ['level', 'Course level is required'],
      ['specialisations', 'Specialisation is required'],
      ['duration', 'Duration unit is required'],
    ])('rejects %s: null with 400 (not a 500, not a blanked column)', async (field, message) => {
      const before = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
      const res = await request(http)
        .patch(`/api/courses/${courseId}`)
        .set(authHeader(token))
        .send({ [field]: null });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe(false);
      expect(String(res.body.message)).toContain(message);
      const after = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
      expect(after[field as keyof typeof after]).toEqual(before[field as keyof typeof before]);
    });

    it('still trims and accepts a sent required field on update', async () => {
      const res = await request(http)
        .patch(`/api/courses/${courseId}`)
        .set(authHeader(token))
        .send({ total_duration: ' 3 ' });

      expect([200, 201]).toContain(res.status);
      expect(res.body.data.total_duration).toBe('3');
    });
  });

  describe('course reads carry university + semester context (CO03b / CO05)', () => {
    beforeAll(async () => {
      const now = new Date();
      await prisma.semester.createMany({
        data: [1, 2].map((n) => ({
          title: `${P}Semester ${n}`,
          course_id: courseId,
          university_id: universityId,
          created_at: now,
          updated_at: now,
        })),
      });
    });

    it('GET /api/courses rows carry university_name', async () => {
      const res = await request(http)
        .get('/api/courses')
        .query({ university_id: universityId })
        .set(authHeader(token));

      expect(res.status).toBe(200);
      const row = res.body.data.items.find((c: { id: number }) => c.id === courseId);
      expect(row).toBeDefined();
      expect(row.university_name).toBe(`${P}University`);
    });

    it('GET /api/courses/:id carries university_name and semesters_count', async () => {
      const res = await request(http)
        .get(`/api/courses/${courseId}`)
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Course');
      expect(res.body.data.id).toBe(courseId);
      expect(res.body.data.university_name).toBe(`${P}University`);
      expect(res.body.data.semesters_count).toBe(2);
    });

    it('GET /api/courses/:id reports university_name null when unset', async () => {
      const res = await request(http)
        .get(`/api/courses/${legacyCourseId}`)
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.data.university_name).toBeNull();
      expect(res.body.data.semesters_count).toBe(0);
    });
  });

  describe('course groups (CO04)', () => {
    const GROUP = `${P}MSC`;

    it('creates a group and reports a live courses_count', async () => {
      const res = await request(http)
        .post('/api/group-courses')
        .set(authHeader(token))
        .send({ group_name: `  ${GROUP}  `, course_ids: [courseId, legacyCourseId, 999999999] });

      expect([200, 201]).toContain(res.status);
      expect(res.body.data.group_name).toBe(GROUP);
      // 999999999 does not resolve, so it is not counted.
      expect(res.body.data.courses_count).toBe(2);
      groupId = res.body.data.id;
    });

    it('rejects a duplicate name with 409, regardless of case and spacing', async () => {
      const res = await request(http)
        .post('/api/group-courses')
        .set(authHeader(token))
        .send({ group_name: ` ${GROUP.toUpperCase()} `, course_ids: [courseId] });

      expect(res.status).toBe(409);
      expect(res.body.status).toBe(false);
      expect(res.body.message).toContain('already exists');
      expect(res.body.message).toContain(`GRP-${String(groupId).padStart(3, '0')}`);
    });

    it('rejects renaming another group onto an existing name with 409', async () => {
      const other = await request(http)
        .post('/api/group-courses')
        .set(authHeader(token))
        .send({ group_name: `${P}BSC`, course_ids: [courseId] });
      expect([200, 201]).toContain(other.status);

      const res = await request(http)
        .patch(`/api/group-courses/${other.body.data.id}`)
        .set(authHeader(token))
        .send({ group_name: GROUP.toLowerCase() });

      expect(res.status).toBe(409);
    });

    it('still lets an existing duplicate be edited without a rename', async () => {
      // Simulate legacy bad data: a second row with the same name, inserted
      // directly (the API now refuses to create it).
      const now = new Date();
      const dup = await prisma.group_courses.create({
        data: { group_name: GROUP, course_ids: JSON.stringify([courseId]), created_at: now, updated_at: now },
      });

      const res = await request(http)
        .patch(`/api/group-courses/${dup.id}`)
        .set(authHeader(token))
        .send({ group_name: GROUP, description: 'kept editable' });

      expect([200, 201]).toContain(res.status);
      expect(res.body.data.description).toBe('kept editable');
    });

    it('GET /api/group-courses rows carry courses_count', async () => {
      const res = await request(http)
        .get('/api/group-courses')
        .query({ limit: 1000 })
        .set(authHeader(token));

      expect(res.status).toBe(200);
      const row = res.body.data.items.find((g: { id: number }) => g.id === groupId);
      expect(row).toBeDefined();
      expect(row.courses_count).toBe(2);
      expect(Array.isArray(row.courses)).toBe(true);
      expect(row.courses).toHaveLength(2);
    });
  });

  describe('specialisations (CO04)', () => {
    it('requires a title on create', async () => {
      const res = await request(http)
        .post('/api/specialisations')
        .set(authHeader(token))
        .send({ description: 'no name' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Specialisation name is required');
    });

    it('creates a master specialisation with a live courses_count', async () => {
      const res = await request(http)
        .post('/api/specialisations')
        .set(authHeader(token))
        .send({ title: ` ${SPEC_TITLE} ` });

      expect([200, 201]).toContain(res.status);
      expect(res.body.data.title).toBe(SPEC_TITLE);
      specId = res.body.data.id;

      const list = await request(http)
        .get('/api/specialisations')
        .query({ limit: 1000 })
        .set(authHeader(token));
      expect(list.status).toBe(200);
      const row = list.body.data.items.find((s: { id: number }) => s.id === specId);
      expect(row).toBeDefined();
      // The strict course names it as a plain string, the legacy course inside
      // a JSON blob — both count, each once.
      expect(row.courses_count).toBe(2);
    });

    it('rejects a duplicate master title with 409, regardless of case and spacing', async () => {
      const res = await request(http)
        .post('/api/specialisations')
        .set(authHeader(token))
        .send({ title: `  ${SPEC_TITLE.toUpperCase()}` });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('already exists');
    });

    it('allows the same title as a per-course child row (different course_id)', async () => {
      const res = await request(http)
        .post('/api/specialisations')
        .set(authHeader(token))
        .send({ title: SPEC_TITLE, course_id: courseId });

      expect([200, 201]).toContain(res.status);
      const childId = res.body.data.id;

      // A per-course child row belongs to exactly its course. It is NOT
      // name-matched, so it reports 1 even though two live courses name
      // SPEC_TITLE — while the master row still reports both.
      const list = await request(http)
        .get('/api/specialisations')
        .query({ limit: 1000 })
        .set(authHeader(token));
      expect(list.status).toBe(200);
      const items = list.body.data.items as { id: number; courses_count: number }[];
      expect(items.find((s) => s.id === childId)?.courses_count).toBe(1);
      expect(items.find((s) => s.id === specId)?.courses_count).toBe(2);
    });

    it('counts a child row as 0 once its course is soft-deleted', async () => {
      const res = await request(http)
        .post('/api/specialisations')
        .set(authHeader(token))
        .send({ title: `${P}Child of legacy`, course_id: legacyCourseId });
      expect([200, 201]).toContain(res.status);
      const childId = res.body.data.id;

      const countOf = async () => {
        const list = await request(http)
          .get('/api/specialisations')
          .query({ limit: 1000 })
          .set(authHeader(token));
        expect(list.status).toBe(200);
        return (list.body.data.items as { id: number; courses_count: number }[]).find(
          (s) => s.id === childId,
        )?.courses_count;
      };
      expect(await countOf()).toBe(1);

      await prisma.course.update({
        where: { id: legacyCourseId },
        data: { deleted_at: new Date() },
      });
      try {
        expect(await countOf()).toBe(0);
      } finally {
        await prisma.course.update({
          where: { id: legacyCourseId },
          data: { deleted_at: null },
        });
      }
    });

    it('rejects renaming onto an existing title with 409 but allows a description edit', async () => {
      const other = await request(http)
        .post('/api/specialisations')
        .set(authHeader(token))
        .send({ title: `${P}Finance` });
      expect([200, 201]).toContain(other.status);

      const clash = await request(http)
        .patch(`/api/specialisations/${other.body.data.id}`)
        .set(authHeader(token))
        .send({ title: SPEC_TITLE });
      expect(clash.status).toBe(409);

      const ok = await request(http)
        .patch(`/api/specialisations/${specId}`)
        .set(authHeader(token))
        .send({ description: 'still editable' });
      expect([200, 201]).toContain(ok.status);
      expect(ok.body.data.description).toBe('still editable');
    });
  });
});
