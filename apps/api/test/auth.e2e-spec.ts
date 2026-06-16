import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let http: Server;

  beforeAll(async () => {
    ({ app, http } = await bootApp());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/auth/login', () => {
    it('logs in with valid admin credentials and returns an auth_token', async () => {
      const res = await request(http)
        .post('/api/auth/login')
        .send(ADMIN_CREDENTIALS);

      // 201 is Nest's default for POST; assert the success range to stay robust.
      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Login successful!');
      expect(res.body.data).toBeDefined();
      expect(typeof res.body.data.auth_token).toBe('string');
      expect(res.body.data.auth_token.length).toBeGreaterThan(0);
      expect(res.body.data.role_id).toBe(1);
    });

    it('rejects a wrong password with "Invalid password!"', async () => {
      const res = await request(http)
        .post('/api/auth/login')
        .send({ username: ADMIN_CREDENTIALS.username, password: 'definitely-wrong' });

      expect(res.status).toBe(401);
      expect(res.body.status).toBe(false);
      expect(res.body.message).toBe('Invalid password!');
      expect(res.body.data).toBeNull();
    });

    it('rejects an unknown user with "User not found!"', async () => {
      const res = await request(http)
        .post('/api/auth/login')
        .send({ username: 'no-such-user-xyz', password: 'whatever' });

      expect(res.status).toBe(401);
      expect(res.body.status).toBe(false);
      expect(res.body.message).toBe('User not found!');
      expect(res.body.data).toBeNull();
    });

    it('rejects a request missing required fields (ValidationPipe)', async () => {
      const res = await request(http).post('/api/auth/login').send({});

      expect(res.status).toBe(400);
      expect(res.body.status).toBe(false);
      expect(res.body.data).toBeNull();
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(http).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.status).toBe(false);
      expect(res.body.data).toBeNull();
    });

    it('returns the authenticated user snapshot with a valid token', async () => {
      const token = await loginAs(
        http,
        ADMIN_CREDENTIALS.username,
        ADMIN_CREDENTIALS.password,
      );

      const res = await request(http).get('/api/auth/me').set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Profile');
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.role_id).toBe(1);
    });
  });
});
