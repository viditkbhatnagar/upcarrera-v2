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
 * Student profile + Students list Edit (e2e) — QA ST01, ST04.
 *
 *   ST01  GET /students/:id resolves specialisation/session/university names and
 *         the dial code; finance reads student_payments and the course fee (not
 *         only invoice+payment); `application` links the student to the
 *         application they came from (custom id, their records, or one unique
 *         converted application with their contact details).
 *         GET /students/:id/documents and /qualifications key on the USERS id
 *         (students.student_id), as every writer does — never the students PK.
 *         GET /students/:id/timeline builds events from real timestamps.
 *   ST04  PATCH /students/:id validates references, refuses to clear NOT NULL
 *         columns, clears dates to NULL (not 1970), records updated_by, and a
 *         move to Dropout stamps users.drop_out_at.
 *
 * Every fixture carries TAG / e2e_stp_ and is removed in afterAll.
 */
describe('Student profile (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let token: string;
  let prisma: PrismaService;

  const TAG = 'E2eStpQx';
  const DOMAIN = 'e2e-stp.local';
  const U = {
    s1: 'e2e_stp_student1',
    s2: 'e2e_stp_student2',
    s3: 'e2e_stp_student3',
    s4: 'e2e_stp_student4',
    counsellor: 'e2e_stp_counsellor',
  };

  let universityId: number;
  let courseId: number;
  let otherCourseId: number;
  let specId: number;
  let otherSpecId: number;
  let sessionId: number;
  let counsellorId: number;
  const userIds: Record<string, number> = {};
  const studentPk: Record<string, number> = {};
  const appIds: number[] = [];
  const CUSTOM_APP_ID = `APP-${TAG}-1`;

  async function cleanup() {
    const users = await prisma.users.findMany({
      where: { username: { startsWith: 'e2e_stp_' } },
      select: { id: true },
    });
    const uids = users.map((u) => u.id);
    const students = await prisma.students.findMany({
      where: { student_id: { in: uids } },
      select: { id: true },
    });
    const pks = students.map((s) => s.id);
    const apps = await prisma.applications.findMany({
      where: { email: { endsWith: `@${DOMAIN}` } },
      select: { application_id: true },
    });
    const aids = apps.map((a) => a.application_id);
    await prisma.student_document.deleteMany({
      where: {
        OR: [
          { label: { startsWith: TAG } },
          { student_id: { in: uids } },
          { application_id: { in: aids } },
        ],
      },
    });
    await prisma.qualification.deleteMany({
      where: { OR: [{ board: { startsWith: TAG } }, { student_id: { in: uids } }] },
    });
    await prisma.student_payments.deleteMany({ where: { student_id: { in: uids } } });
    await prisma.invoice.deleteMany({ where: { remarks: { startsWith: TAG } } });
    await prisma.student_special_fees.deleteMany({ where: { student_id: { in: uids } } });
    await prisma.students.deleteMany({ where: { id: { in: pks } } });
    await prisma.applications.deleteMany({ where: { application_id: { in: aids } } });
    await prisma.specialisations.deleteMany({ where: { title: { startsWith: TAG } } });
    await prisma.course.deleteMany({ where: { title: { startsWith: TAG } } });
    await prisma.university.deleteMany({ where: { title: { startsWith: TAG } } });
    await prisma.sessions.deleteMany({ where: { session_title: { startsWith: TAG } } });
    for (const username of Object.values(U)) {
      await purgeUsersByUsername(app, username);
    }
  }

  const get = (path: string) =>
    request(http).get(`/api${path}`).set(authHeader(token));
  const patch = (path: string, body: object) =>
    request(http).patch(`/api${path}`).set(authHeader(token)).send(body);

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    token = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);
    prisma = app.get(PrismaService);
    await cleanup();
    const now = new Date();

    universityId = (
      await prisma.university.create({
        data: {
          title: `${TAG} University`,
          country_id: '99',
          website: 'https://e2e.local',
          phone: '9000000000',
          email: 'u@e2e.local',
          created_at: now,
        },
      })
    ).id;
    const mkCourse = (title: string) =>
      prisma.course.create({
        data: {
          title,
          short_name: 'E2E',
          stream: '',
          total_duration: '',
          study_mode: '',
          university_id: universityId,
          created_at: now,
        },
      });
    courseId = (await mkCourse(`${TAG} MBA`)).id;
    otherCourseId = (await mkCourse(`${TAG} BBA`)).id;
    specId = (
      await prisma.specialisations.create({
        data: { title: `${TAG} Finance`, course_id: courseId, total_amount: 100000, created_at: now },
      })
    ).id;
    otherSpecId = (
      await prisma.specialisations.create({
        data: { title: `${TAG} Marketing`, course_id: otherCourseId, total_amount: 50000, created_at: now },
      })
    ).id;
    sessionId = (
      await prisma.sessions.create({ data: { session_title: `${TAG} Jan 2027`, created_at: now } })
    ).session_id;

    counsellorId = (
      await prisma.users.create({
        data: { name: `${TAG} Counsellor`, username: U.counsellor, role_id: 6, status: 1, created_at: now },
      })
    ).id;
    for (const key of ['s1', 's2', 's3', 's4'] as const) {
      userIds[key] = (
        await prisma.users.create({
          data: {
            name: `${TAG} Student ${key}`,
            username: U[key],
            email: `${key}@${DOMAIN}`,
            phone: `70123499${key.slice(1).padStart(2, '0')}`,
            code: 91,
            role_id: 4,
            status: 1,
            created_at: now,
          },
        })
      ).id;
    }

    // Applications: s1 by custom id, s2 through its records, s3 by contact.
    const mkApp = async (data: Record<string, unknown>) => {
      const row = await prisma.applications.create({
        data: {
          is_archived: false,
          is_converted: 1,
          created_by: counsellorId,
          created_at: new Date('2026-01-10T09:00:00Z'),
          converted_by: counsellorId,
          converted_at: new Date('2026-01-20T09:00:00Z'),
          ...data,
        },
      });
      appIds.push(row.application_id);
      return row.application_id;
    };
    await mkApp({ name: `${TAG} s1`, email: `s1-app@${DOMAIN}`, custom_application_id: CUSTOM_APP_ID });
    const s2App = await mkApp({ name: `${TAG} s2`, email: `s2-app@${DOMAIN}` });
    await mkApp({ name: `${TAG} s3`, email: `s3@${DOMAIN}` });

    const mkStudent = async (key: string, data: Record<string, unknown>) => {
      studentPk[key] = (
        await prisma.students.create({
          data: {
            student_id: userIds[key],
            address: 'E2E',
            consultant_id: counsellorId,
            admission_status: 2,
            created_at: new Date('2026-01-20T09:00:00Z'),
            updated_at: new Date('2026-01-20T09:00:00Z'),
            ...data,
          },
        })
      ).id;
    };
    await mkStudent('s1', {
      application_id: CUSTOM_APP_ID,
      course_id: courseId,
      specialisation_id: specId,
      session_id: sessionId,
      enrollment_date: new Date('2026-02-01'),
    });
    await mkStudent('s2', {});
    await mkStudent('s3', {});
    await mkStudent('s4', {});

    // s1's records — keyed on the USERS id, as every writer does.
    await prisma.student_document.createMany({
      data: [
        { label: `${TAG} Aadhaar`, file: 'student_documents/x.pdf', student_id: userIds.s1, created_by: counsellorId, created_at: new Date('2026-01-21T09:00:00Z') },
        // Uploaded with s2's application before conversion (no student_id yet).
        { label: `${TAG} App photo`, file: 'student_documents/y.jpg', application_id: s2App, created_at: now },
        // A row keyed on s1's students PK — another student's row under the
        // users-id convention. It must NOT show on s1's profile.
        { label: `${TAG} Wrong key`, file: 'z', student_id: studentPk.s1, created_at: now },
      ],
    });
    await prisma.qualification.createMany({
      data: [
        { student_id: userIds.s1, qualification: '12th', board: `${TAG} CBSE` },
        { student_id: studentPk.s1, qualification: '12th', board: `${TAG} Wrong key` },
        { student_id: userIds.s2, application_id: s2App, qualification: '10th', board: `${TAG} s2` },
      ],
    });
    await prisma.student_payments.createMany({
      data: [
        { student_id: userIds.s1, installment_details: 'Registration Fee', amount: 3000, status: 'Paid', paid_date: new Date('2026-01-22'), payment_mode: 'Online', created_at: new Date('2026-01-22T09:00:00Z') },
        { student_id: userIds.s1, installment_details: 'Semester 1', amount: 25000, status: 'Pending', due_date: new Date('2026-03-01'), created_at: new Date('2026-01-23T09:00:00Z') },
      ],
    });
  }, 60000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  /* ---------------- ST01: names, not ids ---------------- */

  it('resolves specialisation, session, university and dial code on the detail', async () => {
    const res = await get(`/students/${studentPk.s1}`).expect(200);
    const d = res.body.data;
    expect(d.specialisation_title).toBe(`${TAG} Finance`);
    expect(d.session_title).toBe(`${TAG} Jan 2027`);
    expect(d.course_title).toBe(`${TAG} MBA`);
    expect(d.university_title).toBe(`${TAG} University`);
    expect(d.dial_code).toBe(91);
    // Raw columns are still there for callers that use them.
    expect(d.specialisation_id).toBe(specId);
    expect(d.session_id).toBe(sessionId);
  });

  it('carries the same joined names on list rows', async () => {
    const res = await get('/students').query({ search: `${TAG} Student s1` }).expect(200);
    const row = res.body.data.items.find((r: { id: number }) => r.id === studentPk.s1);
    expect(row).toBeDefined();
    expect(row.specialisation_title).toBe(`${TAG} Finance`);
    expect(row.session_title).toBe(`${TAG} Jan 2027`);
    expect(row.dial_code).toBe(91);
  });

  /* ---------------- ST01: finance ---------------- */

  it('reads fee installments and the course fee into the finance block', async () => {
    const f = (await get(`/students/${studentPk.s1}`).expect(200)).body.data.finance;
    expect(f.installment_count).toBe(2);
    expect(f.installments_paid).toBe(3000);
    expect(f.installments_pending).toBe(25000);
    expect(f.course_fee.amount).toBe(100000);
    expect(f.total_basis).toBe('course_fee');
    expect(f.total).toBe(100000);
    expect(f.paid).toBe(3000);
    expect(f.outstanding).toBe(97000);
    // The original keys keep their shape.
    expect(f.invoice_count).toBe(0);
    expect(Array.isArray(f.invoices)).toBe(true);
    expect(Array.isArray(f.payments)).toBe(true);
    expect(f.installments.map((i: { is_paid: boolean }) => i.is_paid)).toEqual([true, false]);
  });

  it('prefers a special fee for the student over the specialisation fee', async () => {
    await prisma.student_special_fees.create({
      data: { student_id: userIds.s1, specialisation_id: specId, special_fee: 90000, reason: 'Merit', created_at: new Date() },
    });
    const f = (await get(`/students/${studentPk.s1}`).expect(200)).body.data.finance;
    expect(f.course_fee.amount).toBe(90000);
    expect(f.course_fee.standard_amount).toBe(100000);
    expect(f.course_fee.special_reason).toBe('Merit');
    expect(f.outstanding).toBe(87000);
    await prisma.student_special_fees.deleteMany({ where: { student_id: userIds.s1 } });
  });

  it('falls back to scheduled installments when no course fee is known', async () => {
    await prisma.student_payments.create({
      data: { student_id: userIds.s2, installment_details: 'Total Fee', amount: 19000, status: 'Paid', created_at: new Date() },
    });
    const f = (await get(`/students/${studentPk.s2}`).expect(200)).body.data.finance;
    expect(f.total_basis).toBe('installments');
    expect(f.total).toBe(19000);
    expect(f.paid).toBe(19000);
    expect(f.outstanding).toBe(0);
  });

  it('takes the total from invoices when any exist — never course fee PLUS invoices', async () => {
    // s1 has a specialisation fee of 100000. An invoice billing that same
    // course must replace it as the basis, not be added on top (was 160000).
    const invoice = await prisma.invoice.create({
      data: {
        student_id: userIds.s1,
        course_id: courseId,
        total_amount: 60000,
        payable_amount: 60000,
        remarks: `${TAG} invoice`,
        created_at: new Date(),
      },
    });
    try {
      const f = (await get(`/students/${studentPk.s1}`).expect(200)).body.data.finance;
      expect(f.total_basis).toBe('invoices');
      expect(f.total).toBe(60000);
      // The course fee is still reported on its own, just not summed in.
      expect(f.course_fee.amount).toBe(100000);
      expect(f.invoice_count).toBe(1);
      // paid = installments marked Paid (3000) + invoice payments (none).
      expect(f.paid).toBe(3000);
      expect(f.outstanding).toBe(57000);
    } finally {
      await prisma.invoice.delete({ where: { id: invoice.id } });
    }
  });

  /* ---------------- ST01: application link ---------------- */

  it('links the student to their application by custom id', async () => {
    const a = (await get(`/students/${studentPk.s1}`).expect(200)).body.data.application;
    expect(a).not.toBeNull();
    expect(a.display_id).toBe(CUSTOM_APP_ID);
    expect(a.link_basis).toBe('application_id');
    expect(a.created_by_name).toBe(`${TAG} Counsellor`);
    expect(a.converted_by_name).toBe(`${TAG} Counsellor`);
  });

  it('links through the student’s own records, then by unique contact', async () => {
    const a2 = (await get(`/students/${studentPk.s2}`).expect(200)).body.data.application;
    expect(a2?.link_basis).toBe('records');
    expect(a2?.application_id).toBe(appIds[1]);

    const a3 = (await get(`/students/${studentPk.s3}`).expect(200)).body.data.application;
    expect(a3?.link_basis).toBe('contact');
    expect(a3?.application_id).toBe(appIds[2]);

    const a4 = (await get(`/students/${studentPk.s4}`).expect(200)).body.data.application;
    expect(a4).toBeNull();
  });

  /* ---------------- ST01: documents + qualifications keyed on users.id ---------------- */

  it('returns documents keyed on the users id, never the students PK', async () => {
    const docs = (await get(`/students/${studentPk.s1}/documents`).expect(200)).body.data;
    const labels = docs.map((d: { label: string }) => d.label);
    expect(labels).toContain(`${TAG} Aadhaar`);
    if (studentPk.s1 !== userIds.s1) {
      expect(labels).not.toContain(`${TAG} Wrong key`);
    }
    const aadhaar = docs.find((d: { label: string }) => d.label === `${TAG} Aadhaar`);
    expect(aadhaar.uploaded_by_name).toBe(`${TAG} Counsellor`);
    expect(aadhaar.source).toBe('student');
  });

  it('includes documents uploaded with the linked application', async () => {
    const docs = (await get(`/students/${studentPk.s2}/documents`).expect(200)).body.data;
    const photo = docs.find((d: { label: string }) => d.label === `${TAG} App photo`);
    expect(photo?.source).toBe('application');
  });

  it('reads and writes qualifications on the users id', async () => {
    const quals = (await get(`/students/${studentPk.s1}/qualifications`).expect(200)).body.data;
    expect(quals.map((q: { board: string }) => q.board)).toEqual([`${TAG} CBSE`]);

    await patch(`/students/${studentPk.s1}/qualifications`, {
      qualifications: [{ qualification: '12th', percentage: 88 }],
    }).expect(200);
    const decoy = await prisma.qualification.findFirst({
      where: { board: `${TAG} Wrong key` },
    });
    expect(decoy?.percentage ?? null).toBeNull();
    const mine = await prisma.qualification.findFirst({ where: { board: `${TAG} CBSE` } });
    expect(mine?.percentage).toBe(88);
  });

  /* ---------------- ST01: timeline ---------------- */

  it('builds a newest-first timeline from real records', async () => {
    const t = (await get(`/students/${studentPk.s1}/timeline`).expect(200)).body.data;
    const types = t.items.map((e: { type: string }) => e.type);
    for (const type of [
      'application_created',
      'application_converted',
      'student_created',
      'enrolled',
      'payment_received',
      'installment_scheduled',
      'document_uploaded',
    ]) {
      expect(types).toContain(type);
    }
    expect(t.total).toBe(t.items.length);
    const times = t.items.map((e: { at: string }) => new Date(e.at).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    const paid = t.items.find((e: { type: string }) => e.type === 'payment_received');
    expect(paid.title).toContain('Registration Fee');
  });

  it('404s the profile sub-resources for an unknown student', async () => {
    await get('/students/999999999/timeline').expect(404);
    await get('/students/999999999/documents').expect(404);
  });

  /* ---------------- ST04: PATCH /students/:id ---------------- */

  it('saves changed fields and records who changed them', async () => {
    const res = await patch(`/students/${studentPk.s4}`, {
      enrollment_id: `${TAG}-ENR-4`,
      course_id: courseId,
      specialisation_id: specId,
      session_id: sessionId,
      whatsapp_no: '+91 98765-43210',
    }).expect(200);
    expect(res.body.data.enrollment_id).toBe(`${TAG}-ENR-4`);
    expect(res.body.data.updated_by).toEqual(expect.any(Number));
    const d = (await get(`/students/${studentPk.s4}`).expect(200)).body.data;
    expect(d.specialisation_title).toBe(`${TAG} Finance`);
  });

  it('clears a date to NULL rather than 1970', async () => {
    await patch(`/students/${studentPk.s4}`, { enrollment_date: '2026-03-01' }).expect(200);
    const res = await patch(`/students/${studentPk.s4}`, { enrollment_date: null }).expect(200);
    expect(res.body.data.enrollment_date).toBeNull();
  });

  it.each([
    ['an unknown course', { course_id: 999999999 }],
    ['an unknown specialisation', { specialisation_id: 999999999 }],
    ['an unknown session', { session_id: 999999999 }],
    ['an unknown counsellor', { consultant_id: 999999999 }],
    ['a cleared counsellor', { consultant_id: null }],
    ['a cleared address', { address: null }],
    ['an out-of-range status', { admission_status: 9 }],
    ['a non-phone WhatsApp number', { whatsapp_no: 'call me' }],
  ])('rejects %s with 400', async (_label, body) => {
    await patch(`/students/${studentPk.s4}`, body).expect(400);
  });

  it('rejects a specialisation from another course', async () => {
    // s4 is on courseId (previous test); otherSpecId belongs to otherCourseId.
    const res = await patch(`/students/${studentPk.s4}`, { specialisation_id: otherSpecId }).expect(400);
    expect(res.body.message).toMatch(/does not belong/);
    // Changing course and specialisation together is fine.
    await patch(`/students/${studentPk.s4}`, {
      course_id: otherCourseId,
      specialisation_id: otherSpecId,
    }).expect(200);
  });

  it('stamps users.drop_out_at when a student moves to Dropout', async () => {
    await patch(`/students/${studentPk.s3}`, { admission_status: 4 }).expect(200);
    const user = await prisma.users.findFirst({ where: { id: userIds.s3 } });
    expect(user?.drop_out_at).toBeInstanceOf(Date);
    const t = (await get(`/students/${studentPk.s3}/timeline`).expect(200)).body.data;
    expect(t.items.map((e: { type: string }) => e.type)).toContain('dropout');
  });
});
