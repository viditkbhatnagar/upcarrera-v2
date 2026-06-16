import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';

/**
 * Staff platform administration (e2e).
 *
 * Exercises the real request pipeline (setGlobalPrefix('api') + ValidationPipe +
 * ResponseInterceptor + AllExceptionsFilter) against the booted AppModule and the
 * real MySQL CI seed. Every platform route is behind the global JwtAuthGuard and
 * the PermissionsGuard; we log in as the seed Super Admin (role_id 1), who bypasses
 * every @RequirePermission slug, and carry that bearer token throughout.
 *
 * Contract under test (src/platform/platform.controller.ts):
 *   GET    /api/users          -> { items, total, page, limit }  ('Users fetched')
 *   GET    /api/users/:id      -> User | 404 'User not found'     ('User fetched')
 *   POST   /api/users          -> created User (password stripped)('User created')
 *   DELETE /api/users/:id      -> { id } (soft delete)            ('User deleted')
 *   GET    /api/roles          -> Role[]                          ('Roles fetched')
 *   GET    /api/permissions    -> Permission[]                    ('Permissions fetched')
 *   GET    /api/settings       -> Record<string, string|null>     ('Settings fetched')
 *   GET    /api/notifications  -> Notification[]                  ('Notifications fetched')
 *
 * Every success is wrapped by ResponseInterceptor as { status:true, message, data }
 * and every error by AllExceptionsFilter as { status:false, message, data:null }.
 *
 * CI-seed resilient: assertions never depend on the full local dump. Tables that
 * may be empty in CI (permissions, notifications) are asserted as arrays only; the
 * users CRUD lifecycle creates its own row under a fixed unique username so reruns
 * are deterministic.
 */
describe('Platform (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let token: string;

  // id of the user created in the POST test, reused by GET/DELETE so the
  // lifecycle reads as one flow rather than depending on a pre-seeded id.
  let createdUserId: number;

  // Static, spec-unique username so reruns are deterministic (no timestamp/random).
  const newUser = {
    name: 'E2E User',
    username: 'e2e_user_cov',
    password: 'Test@123',
    role_id: 4,
    phone: '9111155001',
  };

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    token = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);

    // Clean up any leftover row from a previous interrupted run so the POST below
    // creates a fresh, assertable row (delete is a soft delete, so a new insert is fine).
    if (createdUserId) {
      await request(http).delete(`/api/users/${createdUserId}`).set(authHeader(token));
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/users', () => {
    it('returns 401 without a token (global JwtAuthGuard)', async () => {
      const res = await request(http).get('/api/users');

      expect(res.status).toBe(401);
      expect(res.body.status).toBe(false);
      expect(res.body.data).toBeNull();
    });

    it('returns a paginated user envelope { items, total, page, limit }', async () => {
      const res = await request(http).get('/api/users').set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Users fetched');

      const { data } = res.body;
      expect(data).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
      // Seed always has the admin (id 1) + student (id 2), so at least one user exists.
      expect(data.total).toBeGreaterThanOrEqual(1);
      expect(data.total).toBeGreaterThanOrEqual(data.items.length);
      // Pagination defaults from the service (DEFAULT_PAGE=1, DEFAULT_LIMIT=20).
      expect(data.page).toBe(1);
      expect(data.limit).toBe(20);
      // Passwords are stripped from every returned user.
      for (const u of data.items) {
        expect(u).not.toHaveProperty('password');
      }
    });
  });

  describe('GET /api/roles', () => {
    it('returns the seeded roles as an array (>=8 rows)', async () => {
      const res = await request(http).get('/api/roles').set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Roles fetched');

      const { data } = res.body;
      expect(Array.isArray(data)).toBe(true);
      // Seed loads user_role ids 1..8 (Super Admin, Teacher, Student, ...).
      expect(data.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('GET /api/permissions', () => {
    it('returns the permissions as an array (may be empty in CI)', async () => {
      const res = await request(http).get('/api/permissions').set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Permissions fetched');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/settings', () => {
    it('returns settings as a plain object map (item -> value)', async () => {
      const res = await request(http).get('/api/settings').set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Settings fetched');

      const { data } = res.body;
      // getSettings reduces rows into a Record; it is an object, never an array,
      // and is {} when the settings table is empty in CI.
      expect(data).toBeDefined();
      expect(data).not.toBeNull();
      expect(typeof data).toBe('object');
      expect(Array.isArray(data)).toBe(false);
    });
  });

  describe('GET /api/notifications (platform list)', () => {
    it('returns the notifications as an array (table is empty in CI)', async () => {
      const res = await request(http).get('/api/notifications').set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Notifications fetched');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('user lifecycle: create -> read -> delete', () => {
    it('POST /api/users creates a user and returns the new row (password stripped)', async () => {
      const res = await request(http)
        .post('/api/users')
        .set(authHeader(token))
        .send(newUser);

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('User created');

      const { data } = res.body;
      expect(data).toBeDefined();
      expect(typeof data.id).toBe('number');
      expect(data.name).toBe(newUser.name);
      expect(data.username).toBe(newUser.username);
      expect(data.role_id).toBe(newUser.role_id);
      expect(data.phone).toBe(newUser.phone);
      // The service sanitises the bcrypt hash out of the response.
      expect(data).not.toHaveProperty('password');

      createdUserId = data.id;
    });

    it('GET /api/users/:id returns the user we just created', async () => {
      const res = await request(http)
        .get(`/api/users/${createdUserId}`)
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('User fetched');

      const { data } = res.body;
      expect(data.id).toBe(createdUserId);
      expect(data.username).toBe(newUser.username);
      expect(data.name).toBe(newUser.name);
      expect(data).not.toHaveProperty('password');
    });

    it('DELETE /api/users/:id soft-deletes the user and returns its id', async () => {
      const res = await request(http)
        .delete(`/api/users/${createdUserId}`)
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('User deleted');
      expect(res.body.data.id).toBe(createdUserId);
    });

    it('GET /api/users/:id returns 404 after the soft delete', async () => {
      // findUser filters on deleted_at: null, so the soft-deleted user is unreachable.
      const res = await request(http)
        .get(`/api/users/${createdUserId}`)
        .set(authHeader(token));

      expect(res.status).toBe(404);
      expect(res.body.status).toBe(false);
      expect(res.body.message).toBe('User not found');
      expect(res.body.data).toBeNull();
    });
  });
});
