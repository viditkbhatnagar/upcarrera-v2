import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { bootApp, purgeUsersByUsername } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Login honours users.status for STAFF (Phase 1 spec 1.1).
 *
 * Login never checked status, so the 13 counsellors deactivated in production
 * still had full access. The fix blocks inactive staff only: students share this
 * endpoint with the mobile app and 146 of them have status 0, so their behaviour
 * is deliberately unchanged.
 */
describe('Login and account status (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let prisma: PrismaService;

  const PASSWORD = 'E2eStatusPassw0rd';
  const fixtures = {
    activeStaff: { username: 'e2e_auth_active_staff', role_id: 6, status: 1 },
    inactiveStaff: { username: 'e2e_auth_inactive_staff', role_id: 6, status: 0 },
    nullStaff: { username: 'e2e_auth_null_staff', role_id: 6, status: null },
    inactiveAdmin: { username: 'e2e_auth_inactive_admin', role_id: 7, status: 0 },
    inactiveStudent: { username: 'e2e_auth_inactive_student', role_id: 4, status: 0 },
  } as const;

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(PASSWORD, 10);
    for (const f of Object.values(fixtures)) {
      await purgeUsersByUsername(app, f.username);
      await prisma.users.create({
        data: {
          name: f.username,
          username: f.username,
          role_id: f.role_id,
          status: f.status,
          password: hash,
          created_at: new Date(),
        },
      });
    }
  });

  afterAll(async () => {
    for (const f of Object.values(fixtures)) await purgeUsersByUsername(app, f.username);
    await app.close();
  });

  const login = (username: string, password = PASSWORD) =>
    request(http).post('/api/auth/login').send({ username, password });

  it('lets an active staff member in', async () => {
    const res = await login(fixtures.activeStaff.username);
    expect(res.status).toBeLessThan(400);
    expect(res.body.data.auth_token).toBeDefined();
  });

  it('blocks a deactivated counsellor', async () => {
    const res = await login(fixtures.inactiveStaff.username);
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/deactivated/i);
    expect(res.body.data).toBeNull();
  });

  it('blocks a deactivated admin too — status applies to every staff role', async () => {
    const res = await login(fixtures.inactiveAdmin.username);
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/deactivated/i);
  });

  it('treats a NULL status as active, so legacy rows are not locked out', async () => {
    const res = await login(fixtures.nullStaff.username);
    expect(res.status).toBeLessThan(400);
    expect(res.body.data.auth_token).toBeDefined();
  });

  it('leaves student login unchanged — the mobile app shares this endpoint', async () => {
    const res = await login(fixtures.inactiveStudent.username);
    expect(res.status).toBeLessThan(400);
    expect(res.body.data.auth_token).toBeDefined();
  });

  it('does not reveal that an account is deactivated to someone without its password', async () => {
    const res = await login(fixtures.inactiveStaff.username, 'wrong-password');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid password!');
    expect(res.body.message).not.toMatch(/deactivated/i);
  });
});
