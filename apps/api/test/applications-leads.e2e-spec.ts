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
 * Applications list + Add Lead (e2e) — QA AP02, AP05, AP08, AP10.
 *
 *   AP02  POST /applications creates a real row in one call (academic fields
 *         included) and the server issues an APP-YYYY-NNNNNN id.
 *   AP10  phone must be a 10-digit Indian mobile (canonicalised), email must be
 *         an email, and a second application for the same mobile/email is
 *         refused with 409 naming the existing one. GET
 *         /applications/check-duplicate reports matches up front.
 *   AP05  GET /applications filters by university_id / course_id / session_id /
 *         consultant_id / stage, composing with `search`; stage counts ignore
 *         the stage filter.
 *   AP08  rows carry session_title (the intake), and university_title falls back
 *         to applications.university_id when the course has no university.
 *
 * Every fixture is created here and removed in afterAll, so the spec passes
 * against the bare CI seed. All names carry TAG; all phones are 70123400xx.
 */
describe('Applications leads (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let token: string;
  let prisma: PrismaService;

  const TAG = 'E2eApQvx';
  const EMAIL_DOMAIN = 'e2e-ap.local';
  const CONSULTANT_USERNAME = 'e2e_ap_consultant';
  const OTHER_USERNAME = 'e2e_ap_creator';

  let universityId: number;
  let otherUniversityId: number;
  let taggedCourseId: number; // course.university_id = universityId
  let untaggedCourseId: number; // course.university_id = null
  let sessionId: number;
  let consultantId: number;
  let creatorId: number;

  /** application ids created directly (fixtures), by role. */
  const ids: Record<string, number> = {};

  const email = (local: string) => `${local}@${EMAIL_DOMAIN}`;

  async function cleanup() {
    const apps = await prisma.applications.findMany({
      where: {
        OR: [{ name: { contains: TAG } }, { email: { endsWith: `@${EMAIL_DOMAIN}` } }],
      },
      select: { application_id: true },
    });
    const appIds = apps.map((a) => a.application_id);
    if (appIds.length > 0) {
      await prisma.qualification.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.applications.deleteMany({ where: { application_id: { in: appIds } } });
    }
    await prisma.course.deleteMany({ where: { title: { contains: TAG } } });
    await prisma.university.deleteMany({ where: { title: { contains: TAG } } });
    await prisma.sessions.deleteMany({ where: { session_title: { contains: TAG } } });
    await purgeUsersByUsername(app, CONSULTANT_USERNAME);
    await purgeUsersByUsername(app, OTHER_USERNAME);
  }

  function makeUniversity(title: string) {
    return prisma.university.create({
      data: {
        title,
        country_id: '99',
        website: 'https://e2e.local',
        phone: '9000000000',
        email: 'u@e2e.local',
        created_at: new Date(),
      },
    });
  }

  function makeCourse(title: string, university_id: number | null) {
    return prisma.course.create({
      data: {
        title,
        short_name: 'E2E',
        stream: '',
        total_duration: '',
        study_mode: '',
        university_id,
        created_at: new Date(),
      },
    });
  }

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    token = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);
    prisma = app.get(PrismaService);
    await cleanup();

    universityId = (await makeUniversity(`${TAG} University`)).id;
    otherUniversityId = (await makeUniversity(`${TAG} Other University`)).id;
    taggedCourseId = (await makeCourse(`${TAG} Tagged Course`, universityId)).id;
    untaggedCourseId = (await makeCourse(`${TAG} Untagged Course`, null)).id;
    sessionId = (
      await prisma.sessions.create({
        data: { session_title: `${TAG} Jan 2027`, created_at: new Date() },
      })
    ).session_id;

    const mkUser = (username: string, name: string) =>
      prisma.users.create({
        data: { name, username, role_id: 6, status: 1, created_at: new Date() },
      });
    consultantId = (await mkUser(CONSULTANT_USERNAME, `${TAG} Counsellor`)).id;
    creatorId = (await mkUser(OTHER_USERNAME, `${TAG} Creator`)).id;

    const mkApp = (key: string, data: Record<string, unknown>) =>
      prisma.applications
        .create({
          data: {
            name: `${TAG} ${key}`,
            email: email(`fixture.${key.toLowerCase()}`),
            created_at: new Date(),
            ...data,
          },
        })
        .then((a) => {
          ids[key] = a.application_id;
        });

    // via the course's university, assigned counsellor, intake set
    await mkApp('ViaCourse', {
      phone: '7012340091',
      course_id: taggedCourseId,
      pipeline_user: consultantId,
      session_id: sessionId,
    });
    // university only on the application (course has none) — fallback path
    await mkApp('ViaFallback', {
      phone: '7012340092',
      course_id: untaggedCourseId,
      university_id: universityId,
      created_by: consultantId, // no pipeline_user -> created_by is the counsellor
    });
    // a different university, another counsellor, converted
    await mkApp('Converted', {
      phone: '7012340093',
      university_id: otherUniversityId,
      pipeline_user: creatorId,
      is_converted: 1,
    });
    // archived -> Rejected
    await mkApp('Archived', {
      phone: '7012340094',
      university_id: universityId,
      is_archived: true,
    });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function list(params: Record<string, string | number>) {
    const res = await request(http)
      .get('/api/applications')
      .query({ page: 1, limit: 50, search: TAG, ...params })
      .set(authHeader(token));
    expect(res.status).toBe(200);
    return res.body.data as {
      total: number;
      items: Array<Record<string, unknown>>;
      counts: Record<string, number>;
    };
  }

  const namesOf = (items: Array<Record<string, unknown>>) =>
    items.map((i) => String(i.name).replace(`${TAG} `, '')).sort();

  // ------------------------------------------------------------------ AP02 --

  describe('POST /api/applications (Add Lead)', () => {
    let createdId: number;

    it('creates the application with its academic fields in one call and issues APP-YYYY-NNNNNN', async () => {
      const res = await request(http)
        .post('/api/applications')
        .set(authHeader(token))
        .send({
          name: `${TAG} New Lead`,
          email: email('new.lead'),
          phone: '+91 70123-40001',
          university_id: universityId,
          course_id: taggedCourseId,
          session_id: sessionId,
          pipeline_user: consultantId,
          source: 'Website',
        });

      expect(res.status).toBe(201);
      const created = res.body.data;
      createdId = created.application_id;
      expect(created.custom_application_id).toBe(
        `APP-${new Date().getFullYear()}-${String(createdId).padStart(6, '0')}`,
      );
      // canonicalised to the bare 10 digits
      expect(created.phone).toBe('7012340001');

      const row = await prisma.applications.findUnique({
        where: { application_id: createdId },
      });
      expect(row).toMatchObject({
        university_id: universityId,
        course_id: taggedCourseId,
        session_id: sessionId,
        pipeline_user: consultantId,
        source: 'Website',
        is_converted: 0,
      });
      const quals = await prisma.qualification.count({ where: { application_id: createdId } });
      expect(quals).toBe(3);
    });

    it('lists the new lead with its intake, university and counsellor resolved', async () => {
      const data = await list({ search: `APP-${new Date().getFullYear()}-${String(createdId).padStart(6, '0')}` });
      expect(data.total).toBe(1);
      expect(data.items[0]).toMatchObject({
        application_id: createdId,
        session_title: `${TAG} Jan 2027`,
        university_title: `${TAG} University`,
        consultant_name: `${TAG} Counsellor`,
        status_label: 'Active',
      });
    });

    // ---------------------------------------------------------------- AP10 --

    it.each([['12'], ['12345'], ['5012340001'], ['70123400011'], ['+1 7012340001'], ['abcdefghij']])(
      'rejects the invalid mobile %p with 400',
      async (phone) => {
        const res = await request(http)
          .post('/api/applications')
          .set(authHeader(token))
          .send({ name: `${TAG} Bad Phone`, email: email('bad.phone'), phone });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/10-digit Indian mobile/);
      },
    );

    it('rejects an invalid email with 400', async () => {
      const res = await request(http)
        .post('/api/applications')
        .set(authHeader(token))
        .send({ name: `${TAG} Bad Email`, email: 'not-an-email', phone: '7012340002' });
      expect(res.status).toBe(400);
    });

    it('refuses a second application for the same mobile (in another format) with 409 naming the first', async () => {
      const res = await request(http)
        .post('/api/applications')
        .set(authHeader(token))
        .send({ name: `${TAG} Dup Phone`, email: email('dup.phone'), phone: '07012340001' });
      expect(res.status).toBe(409);
      expect(res.body.message).toContain(String(createdId).padStart(6, '0'));
      expect(res.body.message).toContain(`${TAG} Counsellor`);
      expect(res.body.message).toContain('mobile number');
    });

    it('refuses a second application for the same email (any case) with 409', async () => {
      const res = await request(http)
        .post('/api/applications')
        .set(authHeader(token))
        .send({ name: `${TAG} Dup Email`, email: email('NEW.LEAD'), phone: '7012340003' });
      expect(res.status).toBe(409);
      expect(res.body.message).toContain('email');
    });

    it('PATCH refuses moving a phone onto another application, but accepts its own phone', async () => {
      const clash = await request(http)
        .patch(`/api/applications/${ids.ViaCourse}`)
        .set(authHeader(token))
        .send({ phone: '7012340001' });
      expect(clash.status).toBe(409);

      const own = await request(http)
        .patch(`/api/applications/${ids.ViaCourse}`)
        .set(authHeader(token))
        .send({ phone: '+91 70123 40091' });
      expect(own.status).toBe(200);
      expect(own.body.data.phone).toBe('7012340091');

      const bad = await request(http)
        .patch(`/api/applications/${ids.ViaCourse}`)
        .set(authHeader(token))
        .send({ phone: '12' });
      expect(bad.status).toBe(400);
    });
  });

  describe('GET /api/applications/check-duplicate', () => {
    async function check(params: Record<string, string | number>) {
      const res = await request(http)
        .get('/api/applications/check-duplicate')
        .query(params)
        .set(authHeader(token));
      expect(res.status).toBe(200);
      return res.body.data as {
        duplicate: boolean;
        matches: Array<Record<string, unknown>>;
      };
    }

    it('finds an application by mobile in any common format, with its counsellor', async () => {
      for (const phone of ['7012340091', '+91 70123 40091', '917012340091', '07012340091']) {
        const data = await check({ phone });
        expect(data.duplicate).toBe(true);
        expect(data.matches[0]).toMatchObject({
          application_id: ids.ViaCourse,
          matched_on: ['phone'],
          consultant_id: consultantId,
          consultant_name: `${TAG} Counsellor`,
        });
        expect(typeof data.matches[0].display_id).toBe('string');
      }
    });

    it('finds an application by email, case-insensitively', async () => {
      const data = await check({ email: email('FIXTURE.VIAFALLBACK') });
      expect(data.duplicate).toBe(true);
      expect(data.matches[0]).toMatchObject({
        application_id: ids.ViaFallback,
        matched_on: ['email'],
      });
    });

    it('excludes the application being edited', async () => {
      const data = await check({ phone: '7012340091', exclude_id: ids.ViaCourse });
      expect(data.duplicate).toBe(false);
      expect(data.matches).toEqual([]);
    });

    it('reports no duplicate for an unused mobile, a blank query, or a too-short number', async () => {
      expect((await check({ phone: '7012340099' })).duplicate).toBe(false);
      expect((await check({})).duplicate).toBe(false);
      expect((await check({ phone: '12' })).duplicate).toBe(false);
    });
  });

  // ------------------------------------------------------------- AP05/AP08 --

  describe('GET /api/applications filters', () => {
    it('university_id matches via the course AND via the application fallback, never the other university', async () => {
      const data = await list({ university_id: universityId });
      // the Add Lead row created above also belongs to this university
      expect(namesOf(data.items)).toEqual(['Archived', 'New Lead', 'ViaCourse', 'ViaFallback']);
      const fallback = data.items.find((i) => i.application_id === ids.ViaFallback);
      expect(fallback?.university_title).toBe(`${TAG} University`);

      const other = await list({ university_id: otherUniversityId });
      expect(namesOf(other.items)).toEqual(['Converted']);
    });

    it('course_id and session_id filter on the application columns', async () => {
      expect(namesOf((await list({ course_id: untaggedCourseId })).items)).toEqual(['ViaFallback']);
      expect(namesOf((await list({ session_id: sessionId })).items)).toEqual(['New Lead', 'ViaCourse']);
    });

    it('consultant_id matches pipeline_user, falling back to created_by', async () => {
      const mine = await list({ consultant_id: consultantId });
      expect(namesOf(mine.items)).toEqual(['New Lead', 'ViaCourse', 'ViaFallback']);
      expect(namesOf((await list({ consultant_id: creatorId })).items)).toEqual(['Converted']);
    });

    it('stage narrows the rows while the counts still describe the whole filtered set', async () => {
      const enrolled = await list({ stage: 'Enrolled' });
      expect(namesOf(enrolled.items)).toEqual(['Converted']);
      expect(enrolled.total).toBe(1);
      expect(enrolled.counts).toMatchObject({ 'New Lead': 3, Enrolled: 1, Rejected: 1 });

      expect(namesOf((await list({ stage: 'Rejected' })).items)).toEqual(['Archived']);
      expect(namesOf((await list({ stage: 'New Lead' })).items)).toEqual([
        'New Lead',
        'ViaCourse',
        'ViaFallback',
      ]);
      // no column records this stage yet — empty, not guessed
      const formPending = await list({ stage: 'Form Pending' });
      expect(formPending.total).toBe(0);
      expect(formPending.items).toEqual([]);
    });

    it('filters compose with each other and with search', async () => {
      const data = await list({ university_id: universityId, consultant_id: consultantId, stage: 'New Lead' });
      expect(namesOf(data.items)).toEqual(['New Lead', 'ViaCourse', 'ViaFallback']);
      expect(data.counts).toMatchObject({ 'New Lead': 3, Enrolled: 0, Rejected: 0 });

      const narrowed = await list({ search: `${TAG} ViaFallback`, university_id: universityId });
      expect(namesOf(narrowed.items)).toEqual(['ViaFallback']);
    });

    it('rejects an unknown stage and a non-numeric id with 400', async () => {
      const badStage = await request(http)
        .get('/api/applications')
        .query({ stage: 'Paid' })
        .set(authHeader(token));
      expect(badStage.status).toBe(400);
      const badId = await request(http)
        .get('/api/applications')
        .query({ university_id: 'abc' })
        .set(authHeader(token));
      expect(badId.status).toBe(400);
    });
  });
});
