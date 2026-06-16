import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';

/**
 * supertest's node parser receives the raw http.IncomingMessage (a readable
 * stream) as its first argument, but @types/superagent types that slot as the
 * superagent Response (which does not surface .on/.read in its d.ts). We model
 * just the stream surface we use so the custom binary parser type-checks under
 * `strict` without an `any` cast.
 */
type ReadableResponse = Pick<NodeJS.ReadableStream, 'on'>;

/**
 * Integrations health probe + invoice PDF download (e2e).
 *
 * Two distinct contract shapes are exercised here against the real request
 * pipeline (setGlobalPrefix('api') + ValidationPipe + ResponseInterceptor +
 * AllExceptionsFilter) and the real MySQL seeded by database/ci-seed.sql:
 *
 *   1. GET /api/integrations/health  (src/integrations/integrations.controller.ts)
 *      Decorated @Public, so it is reachable WITHOUT a token. The handler returns
 *      booleans only — { zoom, email, sms } — which the ResponseInterceptor wraps
 *      as { status:true, message:'Integration health', data }. In CI none of the
 *      integration credentials are configured, so every flag is `false`.
 *
 *   2. GET /api/invoices/:id/pdf  (src/finance/finance.controller.ts)
 *      Streams a binary PDF via @Res({ passthrough:false }); PdfService pipes the
 *      document and ends it. Because headers are flushed before the envelope can
 *      run, ResponseInterceptor bails on `headersSent` and the raw bytes reach the
 *      client untouched. Seeded invoice id=1 (student_id=2, payable 1000) loads a
 *      real document, so the response is a genuine "%PDF" stream. This route is
 *      behind the global JwtAuthGuard, so it carries the admin Bearer token.
 */
describe('Integrations + Invoice PDF (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let token: string;

  // Seeded by database/ci-seed.sql: invoice id=1, student_id=2, payable 1000.
  const SEEDED_INVOICE_ID = 1;

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

  describe('GET /api/integrations/health (public)', () => {
    it('reports integration config as booleans WITHOUT a token (all false in CI)', async () => {
      // No Authorization header — @Public opts this route out of the global guard.
      const res = await request(http).get('/api/integrations/health');

      // Nest returns 200 for this GET; allow 201 to stay aligned with the suite.
      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Integration health');

      const { data } = res.body;
      expect(data).toBeDefined();
      expect(typeof data.zoom).toBe('boolean');
      expect(typeof data.email).toBe('boolean');
      expect(typeof data.sms).toBe('boolean');

      // CI provisions no integration secrets, so every probe reads `false`.
      expect(data.zoom).toBe(false);
      expect(data.email).toBe(false);
      expect(data.sms).toBe(false);
    });
  });

  describe('GET /api/invoices/:id/pdf', () => {
    it('rejects an unauthenticated request with 401 (global JwtAuthGuard)', async () => {
      const res = await request(http).get(
        `/api/invoices/${SEEDED_INVOICE_ID}/pdf`,
      );

      expect(res.status).toBe(401);
      expect(res.body.status).toBe(false);
      expect(res.body.data).toBeNull();
    });

    it('streams a binary application/pdf document for the seeded invoice', async () => {
      // supertest does not buffer unknown binary content types by default, so we
      // opt in with .buffer() and a custom .parse that concatenates the chunks
      // into a single Buffer. This lets us sniff the PDF magic bytes ("%PDF").
      const res = await request(http)
        .get(`/api/invoices/${SEEDED_INVOICE_ID}/pdf`)
        .set(authHeader(token))
        .buffer(true)
        .parse((res, callback) => {
          // At runtime this `res` is the raw IncomingMessage readable stream.
          const stream = res as unknown as ReadableResponse;
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => callback(null, Buffer.concat(chunks)));
          stream.on('error', (err: Error) => callback(err, Buffer.alloc(0)));
        });

      expect([200, 201]).toContain(res.status);

      // The stream bypasses the { status, message, data } envelope entirely.
      expect(res.headers['content-type']).toMatch(/pdf/);
      expect(res.headers['content-disposition']).toContain(
        `invoice-${SEEDED_INVOICE_ID}.pdf`,
      );

      // The body is a real PDF: it begins with the "%PDF" magic header.
      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.slice(0, 4).toString()).toBe('%PDF');
    });
  });
});
