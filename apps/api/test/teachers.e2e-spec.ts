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

/**
 * Teacher staff-management e2e.
 *
 * Exercises the real request pipeline (setGlobalPrefix('api') + ValidationPipe +
 * ResponseInterceptor + AllExceptionsFilter) against the booted AppModule and the
 * real MySQL. Every teacher route is behind the global JwtAuthGuard, so we log in
 * as the seed super_admin (role_id 1) and carry the bearer token throughout.
 *
 * RESILIENCE: the CI seed has NO teachers (role_id 3), NO schedules, subjects,
 * salary rates, change requests, or demo_sessions — those tables are empty. So
 * list assertions only require Array.isArray(items) and total >= 0, and the CRUD
 * + salary checks operate on a teacher this spec creates (static username so reruns
 * are deterministic). findOne filters role_id=3, so a seeded non-teacher user is
 * deliberately NOT used as an existing teacher id.
 *
 * Contract under test (src/teachers/*):
 *   GET  /api/teachers                 -> { items, total, page, limit }  ('Teachers fetched successfully!')
 *   GET  /api/teacher-schedules        -> { items, total, page, limit }  ('Teacher schedules fetched successfully!')
 *   GET  /api/teacher-subjects         -> { items, total, page, limit }  ('Teacher subjects fetched successfully!')
 *   GET  /api/teacher-salary-rates     -> { items, total, page, limit }  ('Teacher salary rates fetched successfully!')
 *   GET  /api/teacher-change-requests  -> { items, total, page, limit }  ('Teacher change requests fetched successfully!')
 *   POST /api/teachers                 -> created users row (role_id 3)   ('Teacher created successfully!')
 *   GET  /api/teachers/:id             -> teacher | 404 'Teacher not found!' ('Teacher fetched successfully!')
 *   GET  /api/teachers/:id/salary      -> { bands, demo, total, ... }      ('Teacher salary computed successfully!')
 *
 * Each success is wrapped by ResponseInterceptor as { status:true, message, data }
 * and each error by AllExceptionsFilter as { status:false, message, data:null }.
 */
describe('Teachers (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let token: string;

  // id of the teacher created in the POST test, reused by the GET-by-id and salary
  // tests so the lifecycle stands on its own rather than on pre-seeded teacher rows
  // (there are none in CI).
  let createdTeacherId: number;

  // Static, spec-unique username so reruns against the same DB are deterministic.
  const newTeacher = {
    name: 'E2E Teacher',
    username: 'e2e_teacher_cov',
    password: 'Test@123',
    email: 'e2et_cov@test.com',
    phone: '9111144001',
  };

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    token = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);

    // Deterministic isolation: POST /api/teachers creates a role_id-3 users row and
    // never deletes it, and the create path enforces no username uniqueness — so
    // reruns against a non-recreated DB would accumulate active 'e2e_teacher_cov'
    // rows. Purge any prior fixture before this run mints its own.
    await purgeUsersByUsername(app, newTeacher.username);
  });

  afterAll(async () => {
    // Leave the DB as we found it so repeated local runs stay idempotent.
    await purgeUsersByUsername(app, newTeacher.username);
    await app.close();
  });

  describe('GET /api/teachers', () => {
    it('returns 401 without a token (global JwtAuthGuard)', async () => {
      const res = await request(http).get('/api/teachers');

      expect(res.status).toBe(401);
      expect(res.body.status).toBe(false);
      expect(res.body.data).toBeNull();
    });

    it('returns a paginated envelope { items, total, page, limit } (may be empty in CI)', async () => {
      const res = await request(http).get('/api/teachers').set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Teachers fetched successfully!');

      const { data } = res.body;
      expect(data).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
      expect(data.total).toBeGreaterThanOrEqual(0);
      expect(data.total).toBeGreaterThanOrEqual(data.items.length);
      expect(data.page).toBe(1);
      expect(data.limit).toBe(20);
    });
  });

  describe('teacher sub-resource list endpoints (empty in CI)', () => {
    const cases: ReadonlyArray<{ path: string; message: string }> = [
      { path: '/api/teacher-schedules', message: 'Teacher schedules fetched successfully!' },
      { path: '/api/teacher-subjects', message: 'Teacher subjects fetched successfully!' },
      { path: '/api/teacher-salary-rates', message: 'Teacher salary rates fetched successfully!' },
      { path: '/api/teacher-change-requests', message: 'Teacher change requests fetched successfully!' },
    ];

    it.each(cases)(
      'GET $path returns a paginated envelope with an items array and total >= 0',
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

    it('GET /api/teacher-schedules returns 401 without a token', async () => {
      const res = await request(http).get('/api/teacher-schedules');

      expect(res.status).toBe(401);
      expect(res.body.status).toBe(false);
      expect(res.body.data).toBeNull();
    });
  });

  describe('teacher lifecycle: create -> read -> salary', () => {
    it('POST /api/teachers creates a teacher and returns the new row (secrets stripped)', async () => {
      const res = await request(http)
        .post('/api/teachers')
        .set(authHeader(token))
        .send(newTeacher);

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Teacher created successfully!');

      const { data } = res.body;
      expect(data).toBeDefined();
      expect(typeof data.id).toBe('number');
      expect(data.name).toBe(newTeacher.name);
      expect(data.username).toBe(newTeacher.username);
      expect(data.email).toBe(newTeacher.email);
      expect(data.phone).toBe(newTeacher.phone);
      // A teacher is a users row with role_id=3 and an active status default of 1.
      expect(data.role_id).toBe(3);
      expect(data.status).toBe(1);
      // stripSecrets() must never leak the password hash or zoom credentials.
      expect(data.password).toBeUndefined();
      expect(data.zoom_password).toBeUndefined();

      createdTeacherId = data.id;
    });

    it('GET /api/teachers/:id returns the teacher we just created', async () => {
      const res = await request(http)
        .get(`/api/teachers/${createdTeacherId}`)
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Teacher fetched successfully!');

      const { data } = res.body;
      expect(data.id).toBe(createdTeacherId);
      expect(data.name).toBe(newTeacher.name);
      expect(data.username).toBe(newTeacher.username);
      expect(data.email).toBe(newTeacher.email);
      expect(data.phone).toBe(newTeacher.phone);
      expect(data.role_id).toBe(3);
      expect(data.password).toBeUndefined();
    });

    it('GET /api/teachers/:id/salary returns a zeroed breakdown without crashing (no rate, no sessions)', async () => {
      const res = await request(http)
        .get(`/api/teachers/${createdTeacherId}/salary`)
        .query({ from: '2024-01-01', to: '2026-12-31' })
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Teacher salary computed successfully!');

      const { data } = res.body;
      expect(data).toBeDefined();
      expect(data.teacher_id).toBe(createdTeacherId);
      expect(data.from).toBe('2024-01-01');
      expect(data.to).toBe('2026-12-31');
      // A freshly created teacher has no teacher_salary row and no demo_sessions.
      expect(data.has_rate).toBe(false);
      expect(data.completed_sessions).toBe(0);

      // Three duration bands (30/45/60), each zeroed.
      expect(Array.isArray(data.bands)).toBe(true);
      expect(data.bands).toHaveLength(3);
      expect(data.bands.map((b: { duration: number }) => b.duration)).toEqual([30, 45, 60]);
      for (const band of data.bands) {
        expect(band.count).toBe(0);
        expect(band.subtotal).toBe(0);
      }

      // Confirmed-demo bonus is also zeroed, and the grand total reconciles to 0.
      expect(data.demo.count).toBe(0);
      expect(data.demo.subtotal).toBe(0);
      expect(data.total).toBe(0);
    });
  });

  describe('GET /api/teachers/:id (not found)', () => {
    it('returns 404 with the envelope error shape for a non-existent id', async () => {
      const res = await request(http)
        .get('/api/teachers/999999999')
        .set(authHeader(token));

      expect(res.status).toBe(404);
      expect(res.body.status).toBe(false);
      expect(res.body.message).toBe('Teacher not found!');
      expect(res.body.data).toBeNull();
    });
  });
});
