import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { parseIntakePeriod } from '../src/academics/intake-master.service';

/**
 * Intake master (e2e) — QA IN01.
 *
 *   GET   /api/intakes/sessions       the `sessions` intake list with live roll-ups:
 *                                     applications_count, 7-bucket by_status,
 *                                     first/last PLAUSIBLE enrolment date, and the
 *                                     implausible ones (0025-…, 0226-…) verbatim
 *   POST  /api/intakes/sessions       adds an intake (title required, 409 on dup)
 *   PATCH /api/intakes/sessions/:id   renames one (404 / 409 / same-title ok)
 *   POST/PATCH /api/intakes           schedule dates must be real, 2020–2035 and
 *                                     closing >= start; a stored corrupt date does
 *                                     not block an unrelated edit
 *
 * Every fixture carries the `e2e_inm_` prefix (sessions titles, student
 * addresses, application names, intake names, course titles) and is
 * hard-deleted before and after the run.
 */
const P = 'e2e_inm_';
/** A students.student_id no real user has; students has no FK on it. */
const FAKE_STUDENT_USER_ID = 987_650;

describe('Intake master (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let prisma: PrismaService;
  let token: string;

  let sessionA: number; // has students incl. corrupt dates
  let sessionB: number; // empty
  let courseId: number;
  let universityId: number;
  let createdSessionId: number;
  let legacyIntakeId: number;

  const purge = async () => {
    await prisma.students.deleteMany({ where: { address: { startsWith: P } } });
    await prisma.applications.deleteMany({ where: { name: { startsWith: P } } });
    await prisma.sessions.deleteMany({ where: { session_title: { startsWith: P } } });
    await prisma.intake.deleteMany({ where: { name: { startsWith: P } } });
    await prisma.course.deleteMany({ where: { title: { startsWith: P } } });
    await prisma.university.deleteMany({ where: { title: { startsWith: P } } });
  };

  const student = (
    sessionId: number | null,
    admission_status: number | null,
    enrollment_date: string | null,
    course_id: number | null = null,
  ) => ({
    student_id: FAKE_STUDENT_USER_ID,
    consultant_id: 0,
    address: `${P}fixture`,
    session_id: sessionId,
    admission_status,
    course_id,
    enrollment_date: enrollment_date ? new Date(`${enrollment_date}T00:00:00Z`) : null,
  });

  const getMaster = (query: Record<string, string | number> = {}) =>
    request(http)
      .get('/api/intakes/sessions')
      .query({ limit: 1000, ...query })
      .set(authHeader(token));

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    prisma = app.get(PrismaService);
    token = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);
    await purge();

    const now = new Date();
    sessionA = (
      await prisma.sessions.create({
        data: { session_title: `${P}July 2025 Intake`, created_at: now, updated_at: now },
      })
    ).session_id;
    sessionB = (
      await prisma.sessions.create({
        data: { session_title: `${P}Jan-2026 Batch`, created_at: now, updated_at: now },
      })
    ).session_id;
    universityId = (
      await prisma.university.create({
        data: {
          title: `${P}University`,
          country_id: '',
          website: '',
          phone: '',
          email: '',
          created_at: now,
          updated_at: now,
        },
      })
    ).id;
    courseId = (
      await prisma.course.create({
        data: {
          title: `${P}MBA`,
          short_name: '',
          stream: '',
          total_duration: '2',
          study_mode: '',
          university_id: universityId,
          created_at: now,
          updated_at: now,
        },
      })
    ).id;

    await prisma.students.createMany({
      data: [
        student(sessionA, 2, '2025-07-15', courseId), // Enrolled
        student(sessionA, 2, '2025-09-01'), // Enrolled
        student(sessionA, 0, '0025-08-30'), // Pending, corrupt year
        student(sessionA, 1, '0226-01-10'), // In Progress, corrupt year
        student(sessionA, 1, null), // In Progress, no date
        student(sessionA, null, '2025-08-01'), // Unknown status
        student(null, 0, '2025-08-02'), // no intake
        student(9_999_999, 2, '2025-08-03'), // intake id that does not exist
      ],
    });
    await prisma.applications.createMany({
      data: [
        { name: `${P}app1`, session_id: sessionA, course_id: courseId },
        { name: `${P}app2`, session_id: sessionA },
        { name: `${P}app3`, session_id: null },
      ],
    });
    legacyIntakeId = (
      await prisma.intake.create({
        data: {
          name: `${P}Legacy Intake`,
          month: 'August',
          year: 2025,
          start_date: new Date('0025-08-30T00:00:00Z'),
          closing_date: null,
          status: 'Open',
          created_at: now,
          updated_at: now,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await purge();
    await app.close();
  });

  describe('parseIntakePeriod', () => {
    it('reads month and year from free-text titles without guessing', () => {
      expect(parseIntakePeriod('July 2025 Intake')).toEqual({ month: 'July', year: 2025 });
      expect(parseIntakePeriod('Jan-2026 Batch')).toEqual({ month: 'January', year: 2026 });
      expect(parseIntakePeriod('2025 Sept')).toEqual({ month: 'September', year: 2025 });
      expect(parseIntakePeriod('Summer cohort')).toEqual({ month: null, year: null });
      expect(parseIntakePeriod('Primary 0025')).toEqual({ month: null, year: null });
      expect(parseIntakePeriod(null)).toEqual({ month: null, year: null });
    });
  });

  describe('GET /api/intakes/sessions', () => {
    it('requires authentication', async () => {
      const res = await request(http).get('/api/intakes/sessions');
      expect(res.status).toBe(401);
    });

    it('lists the sessions intake master with roll-ups', async () => {
      const res = await getMaster();
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('Intake master');

      const a = res.body.data.items.find((i: { session_id: number }) => i.session_id === sessionA);
      expect(a).toBeDefined();
      expect(a.session_title).toBe(`${P}July 2025 Intake`);
      expect(a.period).toEqual({ month: 'July', year: 2025 });
      expect(a.applications_count).toBe(2);
      expect(a.students_count).toBe(6);
      expect(a.enrolled_count).toBe(2);
      expect(a.pending_count).toBe(3); // Pending + In Progress
      const byLabel = Object.fromEntries(
        a.by_status.map((s: { label: string; count: number }) => [s.label, s.count]),
      );
      expect(byLabel).toEqual({
        Pending: 1,
        'In Progress': 2,
        Enrolled: 2,
        'Passed Out': 0,
        Dropout: 0,
        Cancelled: 0,
        Unknown: 1,
      });
    });

    it('keeps corrupt years out of the enrolment window and returns them verbatim', async () => {
      const res = await getMaster();
      const a = res.body.data.items.find((i: { session_id: number }) => i.session_id === sessionA);
      expect(a.first_enrollment_date).toBe('2025-07-15');
      expect(a.last_enrollment_date).toBe('2025-09-01');
      expect(a.invalid_enrollment_dates).toEqual({
        count: 2,
        samples: ['0025-08-30', '0226-01-10'],
      });
      expect(res.body.data.date_window.min).toBe('2000-01-01');
    });

    it('lists an intake with no students at zero instead of omitting it', async () => {
      const res = await getMaster();
      const b = res.body.data.items.find((i: { session_id: number }) => i.session_id === sessionB);
      expect(b).toBeDefined();
      expect(b.students_count).toBe(0);
      expect(b.applications_count).toBe(0);
      expect(b.first_enrollment_date).toBeNull();
      expect(b.invalid_enrollment_dates.count).toBe(0);
    });

    it('rolls students with no intake or a dangling intake id into `unassigned`', async () => {
      const res = await getMaster();
      const u = res.body.data.unassigned;
      // >= because the shared DB may hold other unassigned rows.
      expect(u.students_count).toBeGreaterThanOrEqual(2);
      expect(u.applications_count).toBeGreaterThanOrEqual(1);
    });

    it('narrows by search on the title', async () => {
      const res = await getMaster({ search: `${P}Jan` });
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items[0].session_id).toBe(sessionB);
    });

    it('scopes the counts by course and by the course’s university', async () => {
      const scopes: Array<Record<string, number>> = [
        { course_id: courseId },
        { university_id: universityId },
      ];
      for (const q of scopes) {
        const res = await getMaster(q);
        const a = res.body.data.items.find(
          (i: { session_id: number }) => i.session_id === sessionA,
        );
        expect(a.students_count).toBe(1);
        expect(a.enrolled_count).toBe(1);
        expect(a.applications_count).toBe(1);
      }
    });

    it('scopes the counts by enrolment date', async () => {
      const res = await getMaster({ from: '2025-08-01', to: '2025-12-31' });
      const a = res.body.data.items.find((i: { session_id: number }) => i.session_id === sessionA);
      expect(a.students_count).toBe(2); // 2025-09-01 and 2025-08-01
      expect(a.invalid_enrollment_dates.count).toBe(0);
    });

    it('rejects a malformed date filter with 400', async () => {
      const res = await getMaster({ from: '01/08/2025' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST / PATCH /api/intakes/sessions', () => {
    it('creates an intake applications can be filed under', async () => {
      const res = await request(http)
        .post('/api/intakes/sessions')
        .set(authHeader(token))
        .send({ session_title: `  ${P}March   2027  ` });
      expect([200, 201]).toContain(res.status);
      expect(res.body.message).toBe('Intake Added Successfully!');
      expect(res.body.data.session_title).toBe(`${P}March 2027`);
      createdSessionId = res.body.data.session_id;

      const picker = await request(http)
        .get('/api/sessions')
        .query({ limit: 1000 })
        .set(authHeader(token));
      expect(
        picker.body.data.items.some(
          (s: { session_id: number }) => s.session_id === createdSessionId,
        ),
      ).toBe(true);
    });

    it('rejects a blank title with 400', async () => {
      const res = await request(http)
        .post('/api/intakes/sessions')
        .set(authHeader(token))
        .send({ session_title: '   ' });
      expect(res.status).toBe(400);
    });

    it('rejects a duplicate title (case/space-insensitive) with 409', async () => {
      const res = await request(http)
        .post('/api/intakes/sessions')
        .set(authHeader(token))
        .send({ session_title: `${P.toUpperCase()}JULY 2025  intake` });
      expect(res.status).toBe(409);
      expect(res.body.message).toContain(`#${sessionA}`);
    });

    it('renames an intake, keeping its id (students stay linked)', async () => {
      const res = await request(http)
        .patch(`/api/intakes/sessions/${createdSessionId}`)
        .set(authHeader(token))
        .send({ session_title: `${P}March 2027 Intake` });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Intake Renamed Successfully!');
      expect(res.body.data.session_id).toBe(createdSessionId);
      expect(res.body.data.session_title).toBe(`${P}March 2027 Intake`);
    });

    it('allows re-saving the same title, but 409s on another intake’s title', async () => {
      const same = await request(http)
        .patch(`/api/intakes/sessions/${sessionA}`)
        .set(authHeader(token))
        .send({ session_title: `${P}July 2025 Intake` });
      expect(same.status).toBe(200);

      const clash = await request(http)
        .patch(`/api/intakes/sessions/${sessionB}`)
        .set(authHeader(token))
        .send({ session_title: `${P}july 2025 intake` });
      expect(clash.status).toBe(409);
    });

    it('404s for an unknown intake', async () => {
      const res = await request(http)
        .patch('/api/intakes/sessions/99999999')
        .set(authHeader(token))
        .send({ session_title: `${P}Ghost` });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Intake not found!');
    });
  });

  describe('intake schedule date rules (POST / PATCH /api/intakes)', () => {
    const post = (body: Record<string, unknown>) =>
      request(http).post('/api/intakes').set(authHeader(token)).send(body);

    it.each([
      [{ name: `${P}bad1`, year: 25 }, 'year'],
      [{ name: `${P}bad2`, year: 2036 }, 'year'],
      [{ name: `${P}bad3`, start_date: '0025-08-30' }, 'between 2020 and 2035'],
      [{ name: `${P}bad4`, start_date: '2026-02-30' }, 'not a real date'],
      [{ name: `${P}bad5`, start_date: '30/08/2026' }, 'YYYY-MM-DD'],
      [
        { name: `${P}bad6`, start_date: '2026-08-01', closing_date: '2026-07-01' },
        'on or after the start date',
      ],
    ])('rejects %j with 400', async (body, fragment) => {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain(fragment);
    });

    it('accepts a valid window', async () => {
      const res = await post({
        name: `${P}Good`,
        month: 'August',
        year: 2026,
        start_date: '2026-08-01',
        closing_date: '2026-08-31',
      });
      expect([200, 201]).toContain(res.status);
    });

    it('lets a row with a stored corrupt start date be edited without touching it', async () => {
      const res = await request(http)
        .patch(`/api/intakes/${legacyIntakeId}`)
        .set(authHeader(token))
        .send({ status: 'Inactive', closing_date: '2026-01-31' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Inactive');
      // The corrupt stored value is reported, never rewritten.
      expect(String(res.body.data.start_date).slice(0, 10)).toBe('0025-08-30');
    });

    it('still rejects replacing it with another corrupt date', async () => {
      const res = await request(http)
        .patch(`/api/intakes/${legacyIntakeId}`)
        .set(authHeader(token))
        .send({ start_date: '0226-01-10' });
      expect(res.status).toBe(400);
    });

    it('checks a new closing date against the stored start date', async () => {
      const ok = await request(http)
        .patch(`/api/intakes/${legacyIntakeId}`)
        .set(authHeader(token))
        .send({ start_date: '2026-02-01', closing_date: '2026-02-28' });
      expect(ok.status).toBe(200);
      const bad = await request(http)
        .patch(`/api/intakes/${legacyIntakeId}`)
        .set(authHeader(token))
        .send({ closing_date: '2026-01-15' });
      expect(bad.status).toBe(400);
    });
  });
});
