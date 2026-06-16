import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';

/**
 * Finance (e2e) — invoices + payments settlement flow against the real API.
 *
 * Exercises the same request pipeline as production (setGlobalPrefix('api'),
 * ValidationPipe, ResponseInterceptor envelope, AllExceptionsFilter), so every
 * success is asserted at res.body.data and every error as
 * { status:false, message, data:null }.
 *
 * Flow under test (FinanceController + FinanceService):
 *   1. GET  /api/invoices                      -> list, capture one live invoice
 *   2. GET  /api/invoices/:id                  -> fetch that invoice
 *   3. POST /api/payments {paid_amount: payable}-> record a manual cash payment
 *   4. GET  /api/invoices/:id                   -> payment_status recomputed to 'paid'
 *   5. GET  /api/payments                       -> list includes the new row
 *   6. POST /api/payments/razorpay/order        -> 503 'Razorpay not configured' locally
 *
 * Ids are never hardcoded — the invoice (and its student_id / payable_amount)
 * is pulled from the list endpoint so the spec stays resilient to seed drift.
 */
describe('Finance (e2e)', () => {
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

  // ---- invoices ------------------------------------------------------------

  describe('GET /api/invoices', () => {
    it('returns the paginated invoice list with at least one row', async () => {
      const res = await request(http)
        .get('/api/invoices')
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Invoices fetched');
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.total).toBeGreaterThan(0);
      expect(res.body.data.items.length).toBeGreaterThan(0);

      const invoice = res.body.data.items[0];
      expect(invoice.id).toBeDefined();
      // payable_amount is a money/Decimal column; serialized as string|number.
      expect(invoice.payable_amount).toBeDefined();
    });
  });

  describe('GET /api/invoices/:id', () => {
    it('fetches a single invoice captured from the list', async () => {
      const list = await request(http)
        .get('/api/invoices')
        .set(authHeader(token));
      const seed = list.body.data.items[0];

      const res = await request(http)
        .get(`/api/invoices/${seed.id}`)
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Invoice fetched');
      expect(res.body.data.id).toBe(seed.id);
    });

    it('returns 404 "Invoice not found!" for a non-existent id', async () => {
      const res = await request(http)
        .get('/api/invoices/999999999')
        .set(authHeader(token));

      expect(res.status).toBe(404);
      expect(res.body.status).toBe(false);
      expect(res.body.message).toBe('Invoice not found!');
      expect(res.body.data).toBeNull();
    });
  });

  // ---- payment settles invoice --------------------------------------------

  describe('POST /api/payments — settles the invoice', () => {
    it('records a full cash payment and flips payment_status to "paid"', async () => {
      // Capture a live invoice with a POSITIVE payable amount — a $0 fallback
      // invoice (e.g. a course with no semesters) can never settle to "paid".
      const list = await request(http)
        .get('/api/invoices')
        .query({ limit: 200 })
        .set(authHeader(token));
      const invoice = list.body.data.items.find(
        (i: { payable_amount: unknown }) => Number(i.payable_amount) > 0,
      );
      expect(invoice).toBeDefined();

      const invoiceId: number = invoice.id;
      const studentId: number | undefined = invoice.student_id ?? undefined;
      // Coerce the Decimal/string money column to a number for paid_amount.
      const payableAmount = Number(invoice.payable_amount);
      expect(Number.isFinite(payableAmount)).toBe(true);

      // Record a manual payment covering the full payable amount.
      const payRes = await request(http)
        .post('/api/payments')
        .set(authHeader(token))
        .send({
          invoice_id: invoiceId,
          user_id: studentId,
          paid_amount: payableAmount,
          payment_type: 'cash',
          payment_date: '2026-06-15',
        });

      expect([200, 201]).toContain(payRes.status);
      expect(payRes.body.status).toBe(true);
      expect(payRes.body.message).toBe('Payment recorded');
      // The handler returns the created payment row, not the invoice.
      expect(payRes.body.data).toBeDefined();
      expect(payRes.body.data.id).toBeDefined();
      expect(payRes.body.data.invoice_id).toBe(invoiceId);

      // Re-fetch the invoice: total paid now >= payable, so status is 'paid'.
      const after = await request(http)
        .get(`/api/invoices/${invoiceId}`)
        .set(authHeader(token));

      expect([200, 201]).toContain(after.status);
      expect(after.body.status).toBe(true);
      expect(after.body.data.payment_status).toBe('paid');
    });
  });

  // ---- payments list -------------------------------------------------------

  describe('GET /api/payments', () => {
    it('returns the paginated payments list envelope', async () => {
      const res = await request(http)
        .get('/api/payments')
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Payments fetched');
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(typeof res.body.data.total).toBe('number');
    });
  });

  // ---- razorpay (not configured locally) -----------------------------------

  describe('POST /api/payments/razorpay/order', () => {
    it('returns a controlled 503 "Razorpay not configured" without gateway creds', async () => {
      const res = await request(http)
        .post('/api/payments/razorpay/order')
        .set(authHeader(token))
        // receipt is required by CreateRazorpayOrderDto — include it so the
        // request passes ValidationPipe and actually reaches the provider,
        // which then throws ServiceUnavailable (503) for missing creds.
        .send({ amount: 100, receipt: 'finance-e2e-test' });

      expect(res.status).toBe(503);
      expect(res.body.status).toBe(false);
      expect(res.body.message).toBe('Razorpay not configured');
      expect(res.body.data).toBeNull();
    });
  });

  // ---- auth guard ----------------------------------------------------------

  describe('auth', () => {
    it('rejects an unauthenticated invoices request with 401', async () => {
      const res = await request(http).get('/api/invoices');

      expect(res.status).toBe(401);
      expect(res.body.status).toBe(false);
      expect(res.body.data).toBeNull();
    });
  });
});
