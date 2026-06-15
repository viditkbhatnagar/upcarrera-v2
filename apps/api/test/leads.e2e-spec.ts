import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import * as request from 'supertest';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';

/**
 * Leads CRM funnel (e2e).
 *
 * Exercises the real request pipeline (setGlobalPrefix('api') + ValidationPipe +
 * ResponseInterceptor + AllExceptionsFilter) against the booted AppModule and
 * the real MySQL. Every lead route is behind the global JwtAuthGuard, so we log
 * in as the seed super_admin (role_id 1) and carry the bearer token throughout.
 *
 * Contract under test (src/leads/*):
 *   GET    /api/leads          -> { items: Lead[], total, page, limit }  ('Leads')
 *   GET    /api/lead-sources   -> Source[]                               ('Lead sources')
 *   GET    /api/lead-statuses  -> Status[]                               ('Lead statuses')
 *   POST   /api/leads          -> created Lead row                       ('Lead created successfully!')
 *   GET    /api/leads/:id      -> Lead | 404 'Lead not found!'           ('Lead')
 *   PATCH  /api/leads/:id      -> updated Lead row                       ('Lead updated successfully!')
 *   DELETE /api/leads/:id      -> { id } (soft delete: stamps deleted_at) ('Lead deleted successfully!')
 *
 * Every success is wrapped by ResponseInterceptor as { status:true, message, data }
 * and every error by AllExceptionsFilter as { status:false, message, data:null }.
 */
describe('Leads (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let token: string;

  // id of the lead created in the POST test, reused by GET/PATCH/DELETE so the
  // lifecycle reads as one funnel rather than depending on pre-seeded ids.
  let createdLeadId: number;

  const newLead = {
    title: 'E2E Lead',
    phone: '9111100001',
    email: 'e2e-lead@test.com',
  };

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    token = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/leads', () => {
    it('returns 401 without a token (global JwtAuthGuard)', async () => {
      const res = await request(http).get('/api/leads');

      expect(res.status).toBe(401);
      expect(res.body.status).toBe(false);
      expect(res.body.data).toBeNull();
    });

    it('returns a paginated funnel envelope { items, total, page, limit }', async () => {
      const res = await request(http).get('/api/leads').set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Leads');

      const { data } = res.body;
      expect(data).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
      // total is a non-negative count and is never smaller than the page slice.
      expect(typeof data.total).toBe('number');
      expect(data.total).toBeGreaterThanOrEqual(data.items.length);
      // pagination defaults from the service (DEFAULT_PAGE=1, DEFAULT_LIMIT=20).
      expect(data.page).toBe(1);
      expect(data.limit).toBe(20);
    });
  });

  describe('GET /api/lead-sources', () => {
    it('returns the lead sources as an array', async () => {
      const res = await request(http).get('/api/lead-sources').set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Lead sources');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/lead-statuses', () => {
    it('returns the lead statuses as an array', async () => {
      const res = await request(http).get('/api/lead-statuses').set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Lead statuses');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('lead lifecycle: create -> read -> update -> delete', () => {
    it('POST /api/leads creates a lead and returns the new row', async () => {
      const res = await request(http)
        .post('/api/leads')
        .set(authHeader(token))
        .send(newLead);

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Lead created successfully!');

      const { data } = res.body;
      expect(data).toBeDefined();
      expect(typeof data.id).toBe('number');
      expect(data.title).toBe(newLead.title);
      expect(data.phone).toBe(newLead.phone);
      expect(data.email).toBe(newLead.email);
      // The service stamps every new lead as un-converted so it shows in the funnel.
      expect(data.is_converted).toBe(0);

      createdLeadId = data.id;
    });

    it('lists the freshly created lead (it is non-converted, non-deleted)', async () => {
      // limit=1000 so the new row is on the first page regardless of fixture volume.
      const res = await request(http)
        .get('/api/leads')
        .query({ limit: 1000 })
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.data.total).toBeGreaterThan(0);

      const ids = res.body.data.items.map((lead: { id: number }) => lead.id);
      expect(ids).toContain(createdLeadId);
    });

    it('GET /api/leads/:id returns the lead we just created', async () => {
      const res = await request(http)
        .get(`/api/leads/${createdLeadId}`)
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Lead');

      const { data } = res.body;
      expect(data.id).toBe(createdLeadId);
      expect(data.title).toBe(newLead.title);
      expect(data.phone).toBe(newLead.phone);
      expect(data.email).toBe(newLead.email);
    });

    it('PATCH /api/leads/:id updates the lead remarks', async () => {
      const res = await request(http)
        .patch(`/api/leads/${createdLeadId}`)
        .set(authHeader(token))
        .send({ remarks: 'updated' });

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Lead updated successfully!');

      const { data } = res.body;
      expect(data.id).toBe(createdLeadId);
      expect(data.remarks).toBe('updated');
    });

    it('DELETE /api/leads/:id soft-deletes the lead and returns its id', async () => {
      const res = await request(http)
        .delete(`/api/leads/${createdLeadId}`)
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Lead deleted successfully!');
      expect(res.body.data.id).toBe(createdLeadId);
    });

    it('GET /api/leads/:id returns 404 after the soft delete', async () => {
      // findOne filters on deleted_at: null, so a soft-deleted lead is now unreachable.
      const res = await request(http)
        .get(`/api/leads/${createdLeadId}`)
        .set(authHeader(token));

      expect(res.status).toBe(404);
      expect(res.body.status).toBe(false);
      expect(res.body.message).toBe('Lead not found!');
      expect(res.body.data).toBeNull();
    });
  });

  describe('GET /api/leads/:id (not found)', () => {
    it('returns 404 with the envelope error shape for a non-existent id', async () => {
      const res = await request(http)
        .get('/api/leads/999999999')
        .set(authHeader(token));

      expect(res.status).toBe(404);
      expect(res.body.status).toBe(false);
      expect(res.body.message).toBe('Lead not found!');
      expect(res.body.data).toBeNull();
    });
  });
});
