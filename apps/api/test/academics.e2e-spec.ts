import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';

/**
 * Academic catalog (e2e).
 *
 * Exercises the real request pipeline (setGlobalPrefix('api') + ValidationPipe +
 * ResponseInterceptor + AllExceptionsFilter) against the booted AppModule and the
 * real MySQL. Every academics route is behind the global JwtAuthGuard (no @Public),
 * so we log in as the seed super_admin (role_id 1) and carry the bearer token.
 *
 * Contract under test (src/academics/*):
 *   GET    /api/courses          -> { items, total, page, limit }  ('Courses')
 *   GET    /api/universities     -> { items, total, page, limit }  ('Universities')
 *   GET    /api/subjects         -> { items, total, page, limit }  ('Subjects')
 *   GET    /api/semesters        -> { items, total, page, limit }  ('Semesters')
 *   GET    /api/specialisations  -> { items, total, page, limit }  ('Specialisations')
 *   GET    /api/countries        -> { items, total, page, limit }  ('Countries')
 *   GET    /api/courses/:id      -> Course | 404 'Course not found!'  ('Course')
 *   POST   /api/courses          -> created Course row  ('Course Added Successfully!')
 *   DELETE /api/courses/:id      -> soft delete (deleted_at)  ('Course Deleted Successfully!')
 *
 * Every success is wrapped by ResponseInterceptor as { status:true, message, data }
 * and every error by AllExceptionsFilter as { status:false, message, data:null }.
 *
 * Resilience: the CI seed (database/ci-seed.sql) only guarantees course id=1, so
 * lookup lists assert Array.isArray(items) + total >= 0 (the catalog tables for
 * universities/subjects/semesters/specialisations/countries may be empty in CI),
 * while /api/courses asserts total >= 1 because course id=1 is seeded. The CRUD
 * lifecycle creates, reads, then deletes its own course rather than relying on
 * pre-existing rows.
 */
describe('Academics catalog (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let token: string;

  // id of the course created in the POST test, reused by GET/DELETE so the
  // lifecycle reads as one flow rather than depending on pre-seeded ids.
  let createdCourseId: number;

  // All academics create fields are optional (legacy ported nothing), so this is
  // a full, valid payload. total_amount / is_lms_course are @IsInt (numbers);
  // total_duration is a @IsString column ('2' is intentional, not a typo).
  const newCourse = {
    title: 'E2E Course',
    short_name: 'E2EC',
    stream: 'Management',
    total_duration: '2',
    total_amount: 1000,
    study_mode: 'Online',
    is_lms_course: 0,
  };

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    token = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/courses', () => {
    it('returns 401 without a token (global JwtAuthGuard)', async () => {
      const res = await request(http).get('/api/courses');

      expect(res.status).toBe(401);
      expect(res.body.status).toBe(false);
      expect(res.body.data).toBeNull();
    });

    it('returns a paginated catalog envelope { items, total, page, limit }', async () => {
      const res = await request(http).get('/api/courses').set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Courses');

      const { data } = res.body;
      expect(data).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
      // course id=1 is seeded, so the catalog is never empty.
      expect(typeof data.total).toBe('number');
      expect(data.total).toBeGreaterThanOrEqual(1);
      expect(data.total).toBeGreaterThanOrEqual(data.items.length);
      // pagination defaults from the service (DEFAULT_PAGE=1, DEFAULT_LIMIT=20).
      expect(data.page).toBe(1);
      expect(data.limit).toBe(20);
    });
  });

  // Lookup lists that may be EMPTY in the CI seed: assert shape + non-negative
  // total, never a hardcoded count (those only hold for the full local dump).
  describe('lookup list endpoints (may be empty in CI)', () => {
    const lookups = [
      { path: '/api/universities', message: 'Universities' },
      { path: '/api/subjects', message: 'Subjects' },
      { path: '/api/semesters', message: 'Semesters' },
      { path: '/api/specialisations', message: 'Specialisations' },
      { path: '/api/countries', message: 'Countries' },
    ];

    it.each(lookups)(
      'GET $path returns the $message envelope { items[], total>=0 }',
      async ({ path, message }) => {
        const res = await request(http).get(path).set(authHeader(token));

        expect([200, 201]).toContain(res.status);
        expect(res.body.status).toBe(true);
        expect(res.body.message).toBe(message);

        const { data } = res.body;
        expect(data).toBeDefined();
        expect(Array.isArray(data.items)).toBe(true);
        expect(typeof data.total).toBe('number');
        expect(data.total).toBeGreaterThanOrEqual(0);
        expect(data.total).toBeGreaterThanOrEqual(data.items.length);
        expect(data.page).toBe(1);
        expect(data.limit).toBe(20);
      },
    );

    it('GET /api/universities rejects an unauthenticated request with 401', async () => {
      const res = await request(http).get('/api/universities');

      expect(res.status).toBe(401);
      expect(res.body.status).toBe(false);
      expect(res.body.data).toBeNull();
    });
  });

  describe('course lifecycle: create -> read -> delete', () => {
    it('POST /api/courses creates a course and returns the new row', async () => {
      const res = await request(http)
        .post('/api/courses')
        .set(authHeader(token))
        .send(newCourse);

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Course Added Successfully!');

      const { data } = res.body;
      expect(data).toBeDefined();
      expect(typeof data.id).toBe('number');
      expect(data.title).toBe(newCourse.title);
      expect(data.short_name).toBe(newCourse.short_name);
      expect(data.stream).toBe(newCourse.stream);
      expect(data.study_mode).toBe(newCourse.study_mode);

      createdCourseId = data.id;
    });

    it('GET /api/courses/:id returns the course we just created', async () => {
      const res = await request(http)
        .get(`/api/courses/${createdCourseId}`)
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Course');

      const { data } = res.body;
      expect(data.id).toBe(createdCourseId);
      expect(data.title).toBe(newCourse.title);
      expect(data.short_name).toBe(newCourse.short_name);
    });

    it('DELETE /api/courses/:id soft-deletes the course', async () => {
      const res = await request(http)
        .delete(`/api/courses/${createdCourseId}`)
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Course Deleted Successfully!');
      expect(res.body.data.id).toBe(createdCourseId);
    });

    it('GET /api/courses/:id returns 404 after the soft delete', async () => {
      // getCourse filters on deleted_at: null, so a soft-deleted course is gone.
      const res = await request(http)
        .get(`/api/courses/${createdCourseId}`)
        .set(authHeader(token));

      expect(res.status).toBe(404);
      expect(res.body.status).toBe(false);
      expect(res.body.message).toBe('Course not found!');
      expect(res.body.data).toBeNull();
    });
  });

  describe('GET /api/courses/:id (not found)', () => {
    it('returns 404 with the envelope error shape for a non-existent id', async () => {
      const res = await request(http)
        .get('/api/courses/999999999')
        .set(authHeader(token));

      expect(res.status).toBe(404);
      expect(res.body.status).toBe(false);
      expect(res.body.message).toBe('Course not found!');
      expect(res.body.data).toBeNull();
    });
  });
});
