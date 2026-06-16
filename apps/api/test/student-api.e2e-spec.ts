import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';

/**
 * Student mobile-API surface (e2e).
 *
 * Exercises the real request pipeline (setGlobalPrefix('api') + ValidationPipe +
 * ResponseInterceptor + AllExceptionsFilter) against the booted AppModule and the
 * real MySQL CI seed (database/ci-seed.sql).
 *
 * Flow:
 *   1. Log in as the seed super_admin (role_id 1).
 *   2. As admin (who bypasses the RBAC @RequirePermission('consultants/create')
 *      guard) POST /api/users to mint a fresh student (role_id 4) with a known
 *      password — static username 'e2e_studapi_cov' so reruns are deterministic.
 *   3. Log in AS that student to get a student-scoped JWT.
 *   4. Hit every read-only /api/student/* endpoint with the student token.
 *
 * The student is brand-new, so almost every collection is empty — assertions
 * target the { status, message, data } envelope and the response SHAPE, never
 * row counts. Each handler's @ResponseMessage (src/student/student.controller.ts)
 * is asserted exactly; data lives at res.body.data.
 *
 * Contract under test (src/student/student.service.ts):
 *   GET /api/student/home        -> { profile, student, counts, upcoming_sessions,
 *                                     unpaid_invoices, unpaid_invoice_total }
 *                                                          ('Student home fetched')
 *   GET /api/student/courses     -> { items, total }       ('Student courses fetched')
 *   GET /api/student/sessions    -> { items, total, page, limit }
 *                                                          ('Student sessions fetched')
 *   GET /api/student/invoices    -> { items, total }       ('Student invoices fetched')
 *   GET /api/student/assessments -> { items, total }       ('Student assessments fetched')
 */
describe('Student API (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let adminToken: string;
  let studentToken: string;

  // id of the user minted in the setup POST; captured but the student logs in by
  // username/password (loginAs), which findFirst-resolves deterministically on reruns.
  let createdUserId: number;

  // Static, spec-unique credentials -> deterministic across reruns.
  const STUDENT = {
    name: 'E2E StudentApi',
    username: 'e2e_studapi_cov',
    password: 'Test@123',
    role_id: 4, // Student
    phone: '9111166001',
  } as const;

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    adminToken = await loginAs(
      http,
      ADMIN_CREDENTIALS.username,
      ADMIN_CREDENTIALS.password,
    );

    // Admin bypasses RBAC -> can create a student user. POST yields 201 in Nest.
    const res = await request(http)
      .post('/api/users')
      .set(authHeader(adminToken))
      .send(STUDENT);

    expect([200, 201]).toContain(res.status);
    expect(res.body.status).toBe(true);
    expect(res.body.message).toBe('User created');

    const { data } = res.body;
    expect(data).toBeDefined();
    expect(typeof data.id).toBe('number');
    expect(data.username).toBe(STUDENT.username);
    expect(data.role_id).toBe(STUDENT.role_id);
    // Password hash is stripped before the user is returned to the client.
    expect(data.password).toBeUndefined();
    createdUserId = data.id;

    // Log in AS the freshly-created student -> student-scoped JWT (sub = user id).
    studentToken = await loginAs(http, STUDENT.username, STUDENT.password);
  });

  afterAll(async () => {
    await app.close();
  });

  it('minted a student user and obtained both admin and student tokens', () => {
    expect(typeof createdUserId).toBe('number');
    expect(createdUserId).toBeGreaterThan(0);
    expect(typeof adminToken).toBe('string');
    expect(adminToken.length).toBeGreaterThan(0);
    expect(typeof studentToken).toBe('string');
    expect(studentToken.length).toBeGreaterThan(0);
  });

  describe('GET /api/student/home', () => {
    it('returns 401 without a token (global JwtAuthGuard)', async () => {
      const res = await request(http).get('/api/student/home');

      expect(res.status).toBe(401);
      expect(res.body.status).toBe(false);
      expect(res.body.data).toBeNull();
    });

    it('returns the student dashboard envelope scoped to the logged-in student', async () => {
      const res = await request(http)
        .get('/api/student/home')
        .set(authHeader(studentToken));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Student home fetched');

      const { data } = res.body;
      expect(data).toBeDefined();

      // profile is the users row (the identity we just created).
      expect(data.profile).toBeDefined();
      expect(data.profile.id).toBe(createdUserId);
      expect(data.profile.role_id).toBe(STUDENT.role_id);

      // student profile row may be null for a brand-new student — both are valid.
      expect(
        data.student === null || typeof data.student === 'object',
      ).toBe(true);

      // counts reconcile with the (empty-for-new-student) collections.
      expect(data.counts).toBeDefined();
      expect(typeof data.counts.courses).toBe('number');
      expect(data.counts.courses).toBeGreaterThanOrEqual(0);
      expect(typeof data.counts.upcoming_sessions).toBe('number');
      expect(data.counts.upcoming_sessions).toBeGreaterThanOrEqual(0);
      expect(typeof data.counts.unpaid_invoices).toBe('number');
      expect(data.counts.unpaid_invoices).toBeGreaterThanOrEqual(0);

      expect(Array.isArray(data.upcoming_sessions)).toBe(true);
      expect(data.upcoming_sessions.length).toBe(data.counts.upcoming_sessions);

      expect(Array.isArray(data.unpaid_invoices)).toBe(true);
      expect(data.unpaid_invoices.length).toBe(data.counts.unpaid_invoices);

      expect(typeof data.unpaid_invoice_total).toBe('number');
      expect(data.unpaid_invoice_total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /api/student/courses', () => {
    it('returns the { items, total } courses envelope', async () => {
      const res = await request(http)
        .get('/api/student/courses')
        .set(authHeader(studentToken));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Student courses fetched');

      const { data } = res.body;
      expect(data).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
      expect(data.total).toBeGreaterThanOrEqual(0);
      // total mirrors the items length for this non-paginated collection.
      expect(data.total).toBe(data.items.length);
    });
  });

  describe('GET /api/student/sessions', () => {
    it('returns the paginated { items, total, page, limit } sessions envelope', async () => {
      const res = await request(http)
        .get('/api/student/sessions')
        .set(authHeader(studentToken));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Student sessions fetched');

      const { data } = res.body;
      expect(data).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
      expect(data.total).toBeGreaterThanOrEqual(0);
      expect(data.total).toBeGreaterThanOrEqual(data.items.length);
      // pagination defaults from the service (DEFAULT_PAGE=1, DEFAULT_LIMIT=20).
      expect(data.page).toBe(1);
      expect(data.limit).toBe(20);
    });
  });

  describe('GET /api/student/invoices', () => {
    it('returns the { items, total } invoices envelope', async () => {
      const res = await request(http)
        .get('/api/student/invoices')
        .set(authHeader(studentToken));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Student invoices fetched');

      const { data } = res.body;
      expect(data).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
      expect(data.total).toBeGreaterThanOrEqual(0);
      expect(data.total).toBe(data.items.length);
    });
  });

  describe('GET /api/student/assessments', () => {
    it('returns the { items, total } assessments envelope', async () => {
      const res = await request(http)
        .get('/api/student/assessments')
        .set(authHeader(studentToken));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Student assessments fetched');

      const { data } = res.body;
      expect(data).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
      expect(data.total).toBeGreaterThanOrEqual(0);
      expect(data.total).toBe(data.items.length);
    });
  });
});
