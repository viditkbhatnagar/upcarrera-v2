import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { bootApp, loginAs, authHeader, purgeUsersByUsername } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Self-service profile (e2e) — QA S1.
 *
 * email is the login identifier, so PATCH /users/me must NOT change it (an
 * account-integrity/takeover risk). name/phone remain editable.
 */
describe('Profile email lock (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let prisma: PrismaService;

  const U = 'e2e_emaillock_user';
  const PASSWORD = 'EmailLock@12345';
  const ORIGINAL_EMAIL = 'e2e-emaillock-original@upcarrera.test';

  async function cleanup(): Promise<void> {
    await purgeUsersByUsername(app, U);
  }

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    prisma = app.get(PrismaService);
    await cleanup();
    await prisma.users.create({
      data: {
        name: 'E2E EmailLock',
        username: U,
        email: ORIGINAL_EMAIL,
        password: await bcrypt.hash(PASSWORD, 10),
        role_id: 6,
        status: 1,
        created_at: new Date(),
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('updates name/phone but ignores an email change', async () => {
    const token = await loginAs(http, U, PASSWORD);
    const res = await request(http)
      .patch('/api/users/me')
      .set(authHeader(token))
      .send({ name: 'E2E EmailLock Renamed', phone: '9876500000', email: 'attacker@evil.test' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('E2E EmailLock Renamed');
    expect(res.body.data.phone).toBe('9876500000');
    // The email must be untouched by self-service.
    expect(res.body.data.email).toBe(ORIGINAL_EMAIL);

    const me = await request(http).get('/api/auth/me').set(authHeader(token));
    expect(me.body.data.email).toBe(ORIGINAL_EMAIL);
  });
});
