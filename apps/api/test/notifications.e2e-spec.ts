import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';

/**
 * Notifications send + manage (e2e).
 *
 * Every route on NotificationsController is behind the global JwtAuthGuard (no
 * @Public), so we log in as the seed super_admin (user id 1, role_id 1) and
 * carry the bearer token throughout. Each JSON response is wrapped by the
 * ResponseInterceptor as { status, message, data } — assertions target
 * res.body.data and the per-handler @ResponseMessage.
 *
 * Contract under test (src/notifications/*):
 *   POST  /api/notifications/send     -> created row              ('Notification sent')
 *   GET   /api/notifications/mine     -> { items, total, page, limit } ('Notifications fetched')
 *   PATCH /api/notifications/:id/read -> updated (soft-deleted) row    ('Notification marked read')
 *
 * Seed-resilience: the `notifications` table is EMPTY in CI, so we create our
 * own row (targeted at the admin, user id 1) and then read/mark it rather than
 * depending on any pre-seeded notification. The mine feed is asserted with
 * total >= 0 since it may legitimately be empty save for the row we just sent.
 *
 * Notes on shapes confirmed from source:
 *   - SendNotificationDto maps `message` -> the `description` column.
 *   - There is no is_read column; markRead() soft-deletes (stamps deleted_at),
 *     so the row drops out of the mine feed after being marked read.
 */
describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let token: string;

  // Admin is seed user id 1; we target the notification at them so it surfaces
  // in their own /mine feed (where user_id = me).
  const ADMIN_USER_ID = 1;

  // id of the notification created in the POST test, reused by GET/PATCH so the
  // lifecycle reads as one flow rather than depending on a pre-seeded row.
  let createdNotificationId: number;

  const newNotification = {
    user_id: ADMIN_USER_ID,
    title: 'E2E',
    message: 'hello',
    email: false,
  };

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

  describe('POST /api/notifications/send', () => {
    it('returns 401 without a token (global JwtAuthGuard)', async () => {
      const res = await request(http)
        .post('/api/notifications/send')
        .send(newNotification);

      expect(res.status).toBe(401);
      expect(res.body.status).toBe(false);
      expect(res.body.data).toBeNull();
    });

    it('creates a notification and returns the new row', async () => {
      const res = await request(http)
        .post('/api/notifications/send')
        .set(authHeader(token))
        .send(newNotification);

      // Nest returns 201 for POST; either 200 or 201 is acceptable.
      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Notification sent');

      const { data } = res.body;
      expect(data).toBeDefined();
      expect(typeof data.id).toBe('number');
      expect(data.title).toBe(newNotification.title);
      // `message` is persisted into the legacy `description` column.
      expect(data.description).toBe(newNotification.message);
      expect(data.user_id).toBe(ADMIN_USER_ID);

      createdNotificationId = data.id;
    });
  });

  describe('GET /api/notifications/mine', () => {
    it('returns the paginated feed envelope { items, total, page, limit }', async () => {
      const res = await request(http)
        .get('/api/notifications/mine')
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Notifications fetched');

      const { data } = res.body;
      expect(data).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
      // The table is empty in CI apart from the row we may have created, so the
      // total is only guaranteed non-negative and never below the page slice.
      expect(typeof data.total).toBe('number');
      expect(data.total).toBeGreaterThanOrEqual(0);
      expect(data.total).toBeGreaterThanOrEqual(data.items.length);
      // Pagination defaults from the service (DEFAULT_PAGE=1, DEFAULT_LIMIT=20).
      expect(data.page).toBe(1);
      expect(data.limit).toBe(20);
    });

    it('surfaces the notification we just sent to the admin', async () => {
      // limit=1000 so the freshly created row is on the first page regardless of
      // fixture volume; it is targeted at the admin (user_id = me) and not yet
      // marked read (deleted_at is null), so it must be visible.
      const res = await request(http)
        .get('/api/notifications/mine')
        .query({ limit: 1000 })
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);

      const ids = res.body.data.items.map(
        (n: { id: number }) => n.id,
      );
      expect(ids).toContain(createdNotificationId);
    });
  });

  describe('PATCH /api/notifications/:id/read', () => {
    it('marks the notification read (soft-delete) and returns its id', async () => {
      const res = await request(http)
        .patch(`/api/notifications/${createdNotificationId}/read`)
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Notification marked read');
      expect(res.body.data.id).toBe(createdNotificationId);
    });

    it('drops the marked-read notification out of the mine feed', async () => {
      // markRead() stamps deleted_at, and findMine filters on deleted_at: null,
      // so the dismissed row is now unreachable in the feed.
      const res = await request(http)
        .get('/api/notifications/mine')
        .query({ limit: 1000 })
        .set(authHeader(token));

      expect([200, 201]).toContain(res.status);
      const ids = res.body.data.items.map((n: { id: number }) => n.id);
      expect(ids).not.toContain(createdNotificationId);
    });

    it('returns 404 when marking a non-existent notification read', async () => {
      const res = await request(http)
        .patch('/api/notifications/999999999/read')
        .set(authHeader(token));

      expect(res.status).toBe(404);
      expect(res.body.status).toBe(false);
      expect(res.body.message).toBe('Notification not found!');
      expect(res.body.data).toBeNull();
    });
  });
});
