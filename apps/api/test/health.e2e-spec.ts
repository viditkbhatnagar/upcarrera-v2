import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { bootApp } from './app.factory';

/**
 * Liveness/readiness probe (e2e) — GET /api/health.
 *
 * Public (no token), asserts real DB connectivity via `SELECT 1`, and is wrapped
 * by the ResponseInterceptor as { status, message, data }. This is the route the
 * post-deploy smoke test (`curl -fsS https://<domain>/api/health`) hits, so it
 * must answer without auth and reflect that MySQL is reachable.
 */
describe('Health (e2e)', () => {
  let app: INestApplication;
  let http: Server;

  beforeAll(async () => {
    ({ app, http } = await bootApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health returns the healthy envelope WITHOUT a token', async () => {
    const res = await request(http).get('/api/health');

    expect([200, 201]).toContain(res.status);
    expect(res.body.status).toBe(true);
    expect(res.body.message).toBe('Service healthy');

    const { data } = res.body;
    expect(data).toBeDefined();
    expect(data.status).toBe('ok');
    expect(data.db).toBe('up');
    expect(typeof data.uptime).toBe('number');
    expect(data.uptime).toBeGreaterThanOrEqual(0);
  });
});
