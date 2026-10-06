import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import {
  ADMIN_CREDENTIALS,
  authHeader,
  bootApp,
  loginAs,
  purgeUsersByUsername,
} from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Server-side list search (e2e) — QA AP07 and ST02.
 *
 * Both list screens filtered only the rows already fetched, so searching page 1
 * for a record on page 2 returned "0 rows" while the footer still read
 * "Showing 1-10 of 844". GET /applications and GET /students now accept a
 * `search` term and resolve it across the whole table.
 *
 * Every assertion uses `limit=1`, so a passing search PROVES the match came from
 * the server: the matching row cannot be on the single-row page being returned.
 *
 * Fixtures are created by the spec, so this passes against the bare CI seed.
 */
describe('List search (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let token: string;

  const TAG = 'Zqxlv'; // improbable token, so matches can only be our fixtures
  const STUDENT_USERNAME = 'e2e_search_student';
  let studentUserId: number;
  let applicationId: number;

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    token = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);
    const prisma = app.get(PrismaService);

    await prisma.applications.deleteMany({ where: { name: { contains: TAG } } });
    await purgeUsersByUsername(app, STUDENT_USERNAME);

    const application = await prisma.applications.create({
      data: {
        name: `${TAG} Applicant`,
        email: `${TAG.toLowerCase()}.applicant@e2e.local`,
        phone: '9008007001',
        custom_application_id: `CUSTOM-${TAG}-1`,
        created_at: new Date(),
      },
    });
    applicationId = application.application_id;

    const user = await prisma.users.create({
      data: {
        name: `${TAG} Student`,
        username: STUDENT_USERNAME,
        email: `${TAG.toLowerCase()}.student@e2e.local`,
        phone: '9008007002',
        role_id: 4,
        status: 1,
        created_at: new Date(),
      },
    });
    studentUserId = user.id;

    await prisma.students.create({
      data: {
        student_id: studentUserId,
        admission_status: 2,
        address: 'E2E',
        consultant_id: 0,
        created_at: new Date(),
      },
    });
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.students.deleteMany({ where: { student_id: studentUserId } });
    await prisma.applications.deleteMany({ where: { name: { contains: TAG } } });
    await purgeUsersByUsername(app, STUDENT_USERNAME);
    await app.close();
  });

  /** GET a list with limit=1 and return the response body's data block. */
  async function list(path: string, params: Record<string, string | number>) {
    const res = await request(http)
      .get(path)
      .query({ page: 1, limit: 1, ...params })
      .set(authHeader(token));
    expect(res.status).toBe(200);
    return res.body.data as { total: number; items: Array<Record<string, unknown>> };
  }

  describe('GET /api/applications?search=', () => {
    it('finds an application by name from outside the current page', async () => {
      const data = await list('/api/applications', { search: `${TAG} Applicant` });
      expect(data.total).toBe(1);
      expect(data.items[0].application_id).toBe(applicationId);
    });

    it('finds it by email', async () => {
      const data = await list('/api/applications', {
        search: `${TAG.toLowerCase()}.applicant@e2e.local`,
      });
      expect(data.total).toBe(1);
    });

    it('finds it by phone', async () => {
      const data = await list('/api/applications', { search: '9008007001' });
      expect(data.total).toBe(1);
    });

    it('finds it by the custom application id', async () => {
      const data = await list('/api/applications', { search: `CUSTOM-${TAG}-1` });
      expect(data.total).toBe(1);
    });

    it('finds it by the printed APP-<id>, which is what the user can actually see', async () => {
      const data = await list('/api/applications', { search: `APP-${applicationId}` });
      expect(data.total).toBeGreaterThanOrEqual(1);
      expect(data.items[0].application_id).toBe(applicationId);
    });

    it('accepts the bare numeric id too', async () => {
      const data = await list('/api/applications', { search: String(applicationId) });
      expect(data.items[0].application_id).toBe(applicationId);
    });

    it('returns an empty page rather than everything when nothing matches', async () => {
      const data = await list('/api/applications', { search: 'no-such-applicant-zzzz' });
      expect(data.total).toBe(0);
      expect(data.items).toHaveLength(0);
    });

    it('is ignored when blank, so the unfiltered list is unaffected', async () => {
      const blank = await list('/api/applications', { search: '   ' });
      const none = await list('/api/applications', {});
      expect(blank.total).toBe(none.total);
    });
  });

  describe('GET /api/students?search=', () => {
    it('finds a student by name from outside the current page', async () => {
      const data = await list('/api/students', { search: `${TAG} Student` });
      expect(data.total).toBe(1);
      expect(data.items[0].student_id).toBe(studentUserId);
    });

    it('finds them by email', async () => {
      const data = await list('/api/students', {
        search: `${TAG.toLowerCase()}.student@e2e.local`,
      });
      expect(data.total).toBe(1);
    });

    it('finds them by phone', async () => {
      const data = await list('/api/students', { search: '9008007002' });
      expect(data.total).toBe(1);
    });

    it('finds them by the printed STU-<id>', async () => {
      const data = await list('/api/students', { search: `STU-${studentUserId}` });
      expect(data.total).toBeGreaterThanOrEqual(1);
      expect(data.items[0].student_id).toBe(studentUserId);
    });

    it('returns nothing when the term matches nothing', async () => {
      const data = await list('/api/students', { search: 'no-such-student-zzzz' });
      expect(data.total).toBe(0);
    });

    it('is ignored when blank', async () => {
      const blank = await list('/api/students', { search: '  ' });
      const none = await list('/api/students', {});
      expect(blank.total).toBe(none.total);
    });
  });

  describe('GET /api/applications — pipeline stage counts (QA AP06)', () => {
    it('counts the whole filtered set, not the page being returned', async () => {
      const page = await list('/api/applications', {});
      const counts = (page as unknown as { counts: Record<string, number> }).counts;
      const sum = Object.values(counts).reduce((a, b) => a + b, 0);

      // limit=1, so counting the page could never produce the full total.
      expect(page.items).toHaveLength(1);
      expect(sum).toBe(page.total);
    });

    it('reports every pipeline stage, including the ones with no column behind them', async () => {
      const page = await list('/api/applications', {});
      const counts = (page as unknown as { counts: Record<string, number> }).counts;
      for (const stage of [
        'lead_added',
        'form_pending',
        'counsellor_review',
        'fee_pending',
        'fee_verification',
        'sa_verification',
        'converted',
        'rejected',
      ]) {
        expect(counts).toHaveProperty(stage);
      }
    });

    it('narrows the counts when a search narrows the list', async () => {
      const page = await list('/api/applications', { search: `${TAG} Applicant` });
      const counts = (page as unknown as { counts: Record<string, number> }).counts;
      const sum = Object.values(counts).reduce((a, b) => a + b, 0);
      expect(page.total).toBe(1);
      expect(sum).toBe(1);
    });

    it('zeroes every stage when nothing matches', async () => {
      const page = await list('/api/applications', { search: 'no-such-applicant-zzzz' });
      const counts = (page as unknown as { counts: Record<string, number> }).counts;
      expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(0);
    });
  });

  describe('search composes with the other student filters', () => {
    it('ANDs with admission_status — a matching status keeps the row', async () => {
      const data = await list('/api/students', {
        search: `${TAG} Student`,
        admission_status: 2,
      });
      expect(data.total).toBe(1);
    });

    it('ANDs with admission_status — a non-matching status excludes it', async () => {
      const data = await list('/api/students', {
        search: `${TAG} Student`,
        admission_status: 5,
      });
      expect(data.total).toBe(0);
    });

    it('still returns the KPI counts alongside a searched page', async () => {
      const res = await request(http)
        .get('/api/students')
        .query({ page: 1, limit: 1, search: `${TAG} Student` })
        .set(authHeader(token));
      expect(res.body.data.counts).toBeDefined();
    });
  });
});
