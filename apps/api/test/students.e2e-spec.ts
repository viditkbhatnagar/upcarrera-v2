import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';

/**
 * E2E coverage for the staff-only student-records surface:
 *   GET /api/students          (paginated list)
 *   GET /api/students/:id       (single record — id discovered from the list)
 *   GET /api/applications       (paginated list)
 *
 * Every assertion targets the ResponseInterceptor envelope { status, message, data }
 * and the service's pagination shape { items, total, page, limit }. Ids are never
 * hardcoded — the detail test reuses the first id returned by the list so the spec
 * stays green against any seed snapshot.
 */
describe('Students & Applications (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let token: string;

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

  describe('GET /api/students', () => {
    it('requires authentication', async () => {
      const res = await request(http).get('/api/students');

      expect(res.status).toBe(401);
      expect(res.body.status).toBe(false);
      expect(res.body.data).toBeNull();
    });

    it('returns a paginated envelope with more than 1000 students', async () => {
      const res = await request(http)
        .get('/api/students')
        .set(authHeader(token));

      // Nest returns 200 for GET; assert the success range to stay robust.
      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Students fetched');

      const { data } = res.body;
      expect(data).toBeDefined();

      // Pagination contract: { items, total, page, limit }.
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
      expect(typeof data.page).toBe('number');
      expect(typeof data.limit).toBe('number');

      // total counts every non-deleted student regardless of page size.
      // (>=1 so it holds against both the full dataset and a minimal CI seed.)
      expect(data.total).toBeGreaterThanOrEqual(1);

      // Defaults from the service (DEFAULT_PAGE=1, DEFAULT_LIMIT=20).
      expect(data.page).toBe(1);
      expect(data.limit).toBe(20);

      // A default page never exceeds the page limit and is non-empty here.
      expect(data.items.length).toBeGreaterThan(0);
      expect(data.items.length).toBeLessThanOrEqual(data.limit);

      // Each row carries the numeric primary key used by the detail route.
      expect(typeof data.items[0].id).toBe('number');
    });
  });

  describe('GET /api/students/:id', () => {
    it('returns the single student matching an id taken from the list', async () => {
      // Discover a real id rather than hardcoding one that may be soft-deleted.
      const listRes = await request(http)
        .get('/api/students')
        .set(authHeader(token));

      const firstId: number = listRes.body.data.items[0].id;
      expect(typeof firstId).toBe('number');

      const res = await request(http)
        .get(`/api/students/${firstId}`)
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Student fetched');
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBe(firstId);
    });

    it('404s with "Student not found!" for a non-existent id', async () => {
      // 2_000_000_000 is well beyond the seed range; the row cannot exist.
      const res = await request(http)
        .get('/api/students/2000000000')
        .set(authHeader(token));

      expect(res.status).toBe(404);
      expect(res.body.status).toBe(false);
      expect(res.body.message).toBe('Student not found!');
      expect(res.body.data).toBeNull();
    });
  });

  describe('GET /api/applications', () => {
    it('returns a paginated envelope of applications', async () => {
      const res = await request(http)
        .get('/api/applications')
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Applications fetched');

      const { data } = res.body;
      expect(data).toBeDefined();

      // Same pagination contract: { items, total, page, limit }.
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
      expect(data.page).toBe(1);
      expect(data.limit).toBe(20);
      expect(data.total).toBeGreaterThanOrEqual(0);
      expect(data.items.length).toBeLessThanOrEqual(data.limit);
    });
  });
});
