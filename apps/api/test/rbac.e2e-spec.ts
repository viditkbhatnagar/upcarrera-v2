import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import * as request from 'supertest';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';

/**
 * RBAC (e2e) — exercises the PermissionsGuard allow-list against the real
 * AppModule + MySQL through the exact production pipeline (setGlobalPrefix('api')
 * + ValidationPipe + ResponseInterceptor + AllExceptionsFilter).
 *
 * Permission contract under test (src/platform/platform.controller.ts):
 *   - GET  /api/roles is @RequirePermission('roles/index')      -> non-admin without
 *     the slug is rejected by PermissionsGuard with a 403 ForbiddenException,
 *     rendered by AllExceptionsFilter as { status:false, message, data:null }.
 *   - GET  /api/users has NO @RequirePermission                 -> any authenticated
 *     user passes the guard (200, paginated envelope).
 *   - Super Admin (role_id === 1) bypasses every @RequirePermission route, so the
 *     same GET /api/roles succeeds with the admin token.
 *
 * The non-admin actor is a role_id 4 user we create with the admin token (POST
 * /api/users is @RequirePermission('consultants/create'), which the admin bypasses).
 * The username is derived from a timestamp to avoid collisions across runs; if the
 * row already exists from a prior run, we just log in with the known password and
 * continue — the RBAC assertions don't depend on a fresh create.
 */
describe('RBAC permissions (e2e)', () => {
  let app: INestApplication;
  let http: Server;

  let adminToken: string;
  let nonAdminToken: string;

  // role_id 4 is a non-super-admin staff role; the create path pins it per the
  // RBAC contract. A unique-ish username keeps repeated local runs collision-free.
  const NON_ADMIN_ROLE_ID = 4;
  const NON_ADMIN_PASSWORD = 'Test@123';
  const nonAdminUsername = `e2e_rbac_${Date.now()}`;

  beforeAll(async () => {
    ({ app, http } = await bootApp());

    // 1) Admin login — super_admin (role_id 1) bypasses every permission check.
    adminToken = await loginAs(
      http,
      ADMIN_CREDENTIALS.username,
      ADMIN_CREDENTIALS.password,
    );

    // 2) Create the non-admin user. Admin bypasses 'consultants/create', so this
    //    should normally return a success envelope. We don't hard-assert the
    //    create here: if the username already exists from a prior run the service
    //    surfaces an error envelope, and that's acceptable — we only need to be
    //    able to log in as the user below.
    await request(http)
      .post('/api/users')
      .set(authHeader(adminToken))
      .send({
        name: 'E2E RBAC',
        username: nonAdminUsername,
        password: NON_ADMIN_PASSWORD,
        role_id: NON_ADMIN_ROLE_ID,
        phone: '9111100009',
      });

    // 3) Log in as the freshly-created (or pre-existing) non-admin user.
    //    loginAs throws if this fails, so a broken create surfaces loudly here.
    nonAdminToken = await loginAs(http, nonAdminUsername, NON_ADMIN_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
  });

  it('created the non-admin actor with a non-super-admin role_id', async () => {
    // Sanity check on the actor: /api/auth/me reflects the JWT's role, proving the
    // token belongs to a non-admin (role_id !== 1) — otherwise the 403 assertion
    // below would be a false negative.
    const me = await request(http).get('/api/auth/me').set(authHeader(nonAdminToken));

    expect([200, 201]).toContain(me.status);
    expect(me.body.status).toBe(true);
    expect(me.body.data).toBeDefined();
    expect(me.body.data.role_id).not.toBe(1);
  });

  it('denies GET /api/roles for a non-admin token (403, permission message)', async () => {
    const res = await request(http).get('/api/roles').set(authHeader(nonAdminToken));

    // PermissionsGuard throws ForbiddenException -> AllExceptionsFilter renders 403.
    expect(res.status).toBe(403);
    expect(res.body.status).toBe(false);
    expect(res.body.data).toBeNull();
    // Message names the missing slug ("...required permission: roles/index").
    expect(typeof res.body.message).toBe('string');
    expect(res.body.message.toLowerCase()).toContain('permission');
  });

  it('allows GET /api/users for the same non-admin token (no @RequirePermission)', async () => {
    const res = await request(http).get('/api/users').set(authHeader(nonAdminToken));

    // No permission decorator on this route -> any authenticated user passes.
    expect([200, 201]).toContain(res.status);
    expect(res.body.status).toBe(true);
    expect(res.body.message).toBe('Users fetched');
    expect(res.body.data).toBeDefined();
    // Paginated envelope: { items, total, page, limit }.
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('allows GET /api/roles for the admin token (super-admin bypass, 200)', async () => {
    const res = await request(http).get('/api/roles').set(authHeader(adminToken));

    // Super Admin (role_id 1) bypasses 'roles/index' -> success envelope.
    expect([200, 201]).toContain(res.status);
    expect(res.body.status).toBe(true);
    expect(res.body.message).toBe('Roles fetched');
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
