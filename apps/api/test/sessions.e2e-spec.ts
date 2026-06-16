import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';

/**
 * Live sessions + demo sessions + session requests (e2e).
 *
 * Exercises the real request pipeline (setGlobalPrefix('api') + ValidationPipe +
 * ResponseInterceptor + AllExceptionsFilter) against the booted AppModule and the
 * real MySQL. Every sessions route is behind the global JwtAuthGuard (no @Public),
 * so we log in as the seed super_admin (role_id 1) and carry the bearer token
 * throughout.
 *
 * Contract under test (src/sessions/*):
 *   GET    /api/sessions          -> { items, total, page, limit } ('Sessions fetched successfully!')
 *   GET    /api/demo-sessions     -> { items, total, page, limit } ('Demo sessions fetched successfully!')
 *   GET    /api/session-requests  -> { items, total, page, limit } ('Session requests fetched successfully!')
 *   POST   /api/sessions          -> created row (PK session_id)    ('Session added successfully!')
 *   GET    /api/sessions/:id      -> row | 404 'Session not found!' ('Session fetched successfully!')
 *
 * The `sessions` table is thin: PK is `session_id` (NOT `id`) and the only
 * business column is `session_title` (all CreateSessionDto fields are optional).
 *
 * CI-seed resilience: the demo_sessions, session_requests and sessions tables may
 * be EMPTY in CI, so list assertions only require Array.isArray(items) and
 * total >= 0 — never a positive count. The lifecycle CREATEs its own session row
 * rather than depending on any pre-seeded session id.
 *
 * Every success is wrapped by ResponseInterceptor as { status:true, message, data }
 * and every error by AllExceptionsFilter as { status:false, message, data:null }.
 */
describe('Sessions (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let token: string;

  // session_id of the row created in the POST test, reused by the GET-by-id test.
  let createdSessionId: number;

  const newSession = {
    session_title: 'E2E Session',
  };

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    token = await loginAs(
      http,
      ADMIN_CREDENTIALS.username,
      ADMIN_CREDENTIALS.password,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/sessions', () => {
    it('returns 401 without a token (global JwtAuthGuard)', async () => {
      const res = await request(http).get('/api/sessions');

      expect(res.status).toBe(401);
      expect(res.body.status).toBe(false);
      expect(res.body.data).toBeNull();
    });

    it('returns a paginated envelope { items, total, page, limit }', async () => {
      const res = await request(http)
        .get('/api/sessions')
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Sessions fetched successfully!');

      const { data } = res.body;
      expect(data).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
      // The sessions table may be empty in CI — only assert a non-negative count.
      expect(typeof data.total).toBe('number');
      expect(data.total).toBeGreaterThanOrEqual(0);
      expect(data.total).toBeGreaterThanOrEqual(data.items.length);
      // Pagination defaults from the service (DEFAULT_PAGE=1, DEFAULT_LIMIT=20).
      expect(data.page).toBe(1);
      expect(data.limit).toBe(20);
    });
  });

  describe('GET /api/demo-sessions', () => {
    it('returns a paginated envelope { items, total, page, limit }', async () => {
      const res = await request(http)
        .get('/api/demo-sessions')
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Demo sessions fetched successfully!');

      const { data } = res.body;
      expect(data).toBeDefined();
      // demo_sessions is EMPTY in CI — resilient to a zero-row table.
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
      expect(data.total).toBeGreaterThanOrEqual(0);
      expect(data.total).toBeGreaterThanOrEqual(data.items.length);
      expect(data.page).toBe(1);
      expect(data.limit).toBe(20);
    });
  });

  describe('GET /api/session-requests', () => {
    it('returns a paginated envelope { items, total, page, limit }', async () => {
      const res = await request(http)
        .get('/api/session-requests')
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Session requests fetched successfully!');

      const { data } = res.body;
      expect(data).toBeDefined();
      // session_requests is EMPTY in CI — resilient to a zero-row table.
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
      expect(data.total).toBeGreaterThanOrEqual(0);
      expect(data.total).toBeGreaterThanOrEqual(data.items.length);
      expect(data.page).toBe(1);
      expect(data.limit).toBe(20);
    });
  });

  describe('session lifecycle: create -> read', () => {
    it('POST /api/sessions creates a session and returns the new row', async () => {
      const res = await request(http)
        .post('/api/sessions')
        .set(authHeader(token))
        .send(newSession);

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Session added successfully!');

      const { data } = res.body;
      expect(data).toBeDefined();
      // PK is session_id (NOT id) per schema.prisma.
      expect(typeof data.session_id).toBe('number');
      expect(data.session_title).toBe(newSession.session_title);

      createdSessionId = data.session_id;
    });

    it('GET /api/sessions/:id returns the session we just created', async () => {
      const res = await request(http)
        .get(`/api/sessions/${createdSessionId}`)
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Session fetched successfully!');

      const { data } = res.body;
      expect(data.session_id).toBe(createdSessionId);
      expect(data.session_title).toBe(newSession.session_title);
    });
  });

  describe('GET /api/sessions/:id (not found)', () => {
    it('returns 404 with the envelope error shape for a non-existent id', async () => {
      const res = await request(http)
        .get('/api/sessions/999999999')
        .set(authHeader(token));

      expect(res.status).toBe(404);
      expect(res.body.status).toBe(false);
      expect(res.body.message).toBe('Session not found!');
      expect(res.body.data).toBeNull();
    });
  });
});
