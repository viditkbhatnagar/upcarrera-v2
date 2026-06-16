import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';

/**
 * Reporting + integration-health e2e.
 *
 * Reports live under /api/reports and are protected by the global JwtAuthGuard,
 * so every call carries an admin Bearer token. Each JSON response is wrapped by
 * the ResponseInterceptor as { status, message, data } — assertions target
 * res.body.data and the per-handler @ResponseMessage. The CSV variant bypasses
 * the envelope and streams a raw text/csv attachment.
 *
 * GET /api/integrations/health is @Public, so it is asserted WITHOUT a token.
 */
describe('Reports + Integrations (e2e)', () => {
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

  describe('GET /api/reports/leads', () => {
    it('returns the leads aggregation envelope (total + by_status + by_source)', async () => {
      const res = await request(http)
        .get('/api/reports/leads')
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Lead report');

      const { data } = res.body;
      expect(data).toBeDefined();
      expect(typeof data.total).toBe('number');
      expect(Array.isArray(data.by_status)).toBe(true);
      expect(Array.isArray(data.by_source)).toBe(true);

      // Counts across a grouping should reconcile with the total.
      const statusSum = data.by_status.reduce(
        (sum: number, r: { count: number }) => sum + r.count,
        0,
      );
      expect(statusSum).toBe(data.total);

      // Spot-check the shape of a group row when any rows exist.
      if (data.by_status.length > 0) {
        const row = data.by_status[0];
        expect(row).toHaveProperty('lead_status_id');
        expect(typeof row.count).toBe('number');
      }
    });

    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(http).get('/api/reports/leads');

      expect(res.status).toBe(401);
      expect(res.body.status).toBe(false);
      expect(res.body.data).toBeNull();
    });
  });

  describe('GET /api/reports/students', () => {
    it('returns the students aggregation envelope (total + by_admission_status + by_course)', async () => {
      const res = await request(http)
        .get('/api/reports/students')
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Student report');

      const { data } = res.body;
      expect(data).toBeDefined();
      expect(typeof data.total).toBe('number');
      expect(Array.isArray(data.by_admission_status)).toBe(true);
      expect(Array.isArray(data.by_course)).toBe(true);

      const admissionSum = data.by_admission_status.reduce(
        (sum: number, r: { count: number }) => sum + r.count,
        0,
      );
      expect(admissionSum).toBe(data.total);

      if (data.by_course.length > 0) {
        const row = data.by_course[0];
        expect(row).toHaveProperty('course_id');
        expect(typeof row.count).toBe('number');
      }
    });
  });

  describe('GET /api/reports/income', () => {
    it('returns the income aggregation envelope (grand_total + by_month)', async () => {
      const res = await request(http)
        .get('/api/reports/income')
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Income report');

      const { data } = res.body;
      expect(data).toBeDefined();
      expect(typeof data.grand_total).toBe('number');
      expect(Array.isArray(data.by_month)).toBe(true);

      // grand_total is the sum of the monthly buckets.
      const monthSum = data.by_month.reduce(
        (sum: number, r: { total: number }) => sum + r.total,
        0,
      );
      expect(monthSum).toBeCloseTo(data.grand_total, 2);

      if (data.by_month.length > 0) {
        const row = data.by_month[0];
        expect(typeof row.month).toBe('string');
        expect(row.month).toMatch(/^\d{4}-\d{2}$/); // YYYY-MM
        expect(typeof row.total).toBe('number');
      }
    });
  });

  describe('GET /api/reports/income?format=csv', () => {
    it('streams a text/csv attachment (envelope is bypassed)', async () => {
      const res = await request(http)
        .get('/api/reports/income')
        .query({ format: 'csv' })
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain(
        'income-report.csv',
      );

      // Raw CSV body — NOT the { status, message, data } envelope.
      expect(typeof res.text).toBe('string');
      const [headerLine] = res.text.split(/\r\n|\n/);
      expect(headerLine).toBe('month,total');
    });
  });

  describe('GET /api/reports/followups', () => {
    it('returns the followups aggregation envelope (total + by_telecaller)', async () => {
      const res = await request(http)
        .get('/api/reports/followups')
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Followup report');

      const { data } = res.body;
      expect(data).toBeDefined();
      expect(typeof data.total).toBe('number');
      expect(Array.isArray(data.by_telecaller)).toBe(true);

      const telecallerSum = data.by_telecaller.reduce(
        (sum: number, r: { count: number }) => sum + r.count,
        0,
      );
      expect(telecallerSum).toBe(data.total);

      if (data.by_telecaller.length > 0) {
        const row = data.by_telecaller[0];
        expect(row).toHaveProperty('telecaller_id');
        expect(typeof row.count).toBe('number');
        // Nearest upcoming follow-up is a YYYY-MM-DD string or null.
        expect(
          row.upcoming_followup_date === null ||
            /^\d{4}-\d{2}-\d{2}$/.test(row.upcoming_followup_date),
        ).toBe(true);
      }
    });
  });

  describe('GET /api/integrations/health (public)', () => {
    it('reports integration configuration as booleans WITHOUT a token', async () => {
      const res = await request(http).get('/api/integrations/health');

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Integration health');

      const { data } = res.body;
      expect(data).toBeDefined();
      expect(typeof data.zoom).toBe('boolean');
      expect(typeof data.email).toBe('boolean');
      expect(typeof data.sms).toBe('boolean');
    });
  });
});
