import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { bootApp } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Self-serve public application intake (online admission funnel). Seeds a full
 * open offering + a required document, then exercises the catalogue and the public
 * submit: happy path, honeypot, bad offering, missing required doc, duplicate
 * guard, and the Aadhaar last-4-only privacy rule.
 */
describe('Public intake (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let prisma: PrismaService;

  const TAG = `e2e_pi_${Date.now()}`;
  const ids = {
    university: 0,
    course: 0,
    intake: 0,
    docType: 0,
  };
  const appIds: number[] = [];
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  const PDF = Buffer.from('%PDF-1.4\n%e2e\n', 'utf8');
  let emailSeq = 0;
  const uniqueEmail = () => `${TAG}.${emailSeq++}@e2e.local`.toLowerCase();
  const uniquePhone = () => `+9198${String(Date.now()).slice(-7)}${emailSeq % 10}`;

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    prisma = app.get(PrismaService);
    const now = new Date();

    const uni = await prisma.university.create({
      data: {
        title: `${TAG} University`,
        country_id: '',
        website: '',
        phone: '',
        email: '',
        fee_collection_model: 'upcarrera_collects',
        created_at: now,
        updated_at: now,
      },
    });
    ids.university = uni.id;
    const course = await prisma.course.create({
      data: {
        title: `${TAG} MBA`,
        short_name: `${TAG}-MBA`,
        level: 'pg',
        stream: 'Management',
        total_duration: '2 Years',
        duration: '2 Years',
        study_mode: 'Online',
        university_id: uni.id,
        total_amount: 0,
        created_at: now,
        updated_at: now,
      },
    });
    ids.course = course.id;
    const intake = await prisma.intake.create({
      data: {
        name: `${TAG} January 2027`,
        start_date: new Date(now.getTime() - 10 * 86400000), // started → not Upcoming
        closing_date: new Date(now.getTime() + 20 * 86400000), // future → not Closed => Open
        status: 'Open',
        created_at: now,
        updated_at: now,
      },
    });
    ids.intake = intake.id;
    await prisma.university_course.create({
      data: { university_id: uni.id, course_id: course.id, created_at: now, updated_at: now },
    });
    await prisma.university_course_intake.create({
      data: {
        university_id: uni.id,
        course_id: course.id,
        intake_id: intake.id,
        status: 1,
        source: 'ui',
        created_at: now,
        updated_at: now,
      },
    });
    const dt = await prisma.document_type.create({ data: { title: `${TAG} Aadhaar` } });
    ids.docType = dt.id;
    await prisma.document_requirement.create({
      data: {
        course_level: 'pg',
        document_type_id: dt.id,
        is_required: true,
        applies_when: null,
        max_files: 1,
        sort_order: 1,
        created_at: now,
      },
    });
  }, 30000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup() {
    if (appIds.length) {
      await prisma.application_document.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.application_form.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.applications.deleteMany({ where: { application_id: { in: appIds } } });
    }
    // Online applications are identified by their TAG-based email (name is a fixed
    // valid value, so it can't carry the TAG).
    await prisma.applications.deleteMany({ where: { email: { startsWith: TAG.toLowerCase() } } });
    await prisma.university_course_intake.deleteMany({ where: { university_id: ids.university } });
    await prisma.university_course.deleteMany({ where: { university_id: ids.university } });
    await prisma.document_requirement.deleteMany({ where: { document_type_id: ids.docType } });
    await prisma.document_type.deleteMany({ where: { id: ids.docType } });
    await prisma.course.deleteMany({ where: { id: ids.course } });
    await prisma.intake.deleteMany({ where: { id: ids.intake } });
    await prisma.university.deleteMany({ where: { id: ids.university } });
  }

  /** A supertest POST pre-filled with a valid submission; callers tweak via .field/.attach. */
  function submit(overrides: Record<string, string> = {}) {
    const req = request(http)
      .post('/api/public/intake/applications')
      .field('university_id', String(ids.university))
      .field('course_id', String(ids.course))
      .field('intake_id', String(ids.intake))
      // full_name must satisfy the name regex (letters/space/.'- only) — no TAG here.
      .field('full_name', 'Test Student')
      .field('date_of_birth', '2000-05-12')
      .field('gender', 'Male')
      .field('father_name', 'Test Father')
      .field('phone', uniquePhone())
      .field('whatsapp', '+919876543210')
      .field('email', uniqueEmail())
      .field('employment_status', 'Student')
      .field('aadhaar_number', '123412341234')
      .field('agree_terms', '1');
    for (const [k, v] of Object.entries(overrides)) req.field(k, v);
    return req;
  }
  const withDocs = (req: request.Test) =>
    req
      .attach('documents[photo]', PNG, { filename: 'photo.png', contentType: 'image/png' })
      .attach('documents[signature]', PNG, { filename: 'sig.png', contentType: 'image/png' })
      .attach(`documents[doc_${ids.docType}]`, PDF, { filename: 'aadhaar.pdf', contentType: 'application/pdf' });

  it('catalogue lists the open offering + its document rules', async () => {
    const res = await request(http).get('/api/public/intake/catalogue');
    expect(res.status).toBe(200);
    const uni = res.body.data.universities.find((u: { id: number }) => u.id === ids.university);
    expect(uni).toBeTruthy();
    const course = uni.courses.find((c: { id: number }) => c.id === ids.course);
    expect(course).toBeTruthy();
    expect(course.document_group).toBe('pg');
    expect(course.intakes.some((i: { id: number }) => i.id === ids.intake)).toBe(true);
    expect(res.body.data.document_rules.pg.some((r: { document_type_id: number }) => r.document_type_id === ids.docType)).toBe(true);
  }, 30000);

  it('happy path creates an UNASSIGNED lead, APP number, and stores docs + aadhaar last-4 only', async () => {
    const email = uniqueEmail();
    const res = await withDocs(submit({ email }));
    expect(res.status).toBe(201);
    expect(res.body.data.application_no).toMatch(/^APP-\d{4}-\d{6}$/);

    const appRow = await prisma.applications.findFirst({ where: { email }, orderBy: { application_id: 'desc' } });
    expect(appRow).toBeTruthy();
    appIds.push(appRow!.application_id);
    expect(appRow!.source).toBe('Online Application');
    expect(appRow!.pipeline_user).toBeNull(); // unassigned queue
    expect(appRow!.stage).toBe('lead_added');
    expect(appRow!.custom_application_id).toBe(res.body.data.application_no);
    expect(appRow!.university_id).toBe(ids.university);

    const form = await prisma.application_form.findUnique({ where: { application_id: appRow!.application_id } });
    expect(form!.aadhaar_last4).toBe('1234');
    expect(JSON.stringify(form)).not.toContain('123412341234'); // full Aadhaar never stored

    const docs = await prisma.application_document.findMany({ where: { application_id: appRow!.application_id } });
    expect(docs.length).toBe(3); // photo + signature + the required doc
  }, 30000);

  it('honeypot submission is silently accepted (generic receipt) but creates nothing', async () => {
    const email = uniqueEmail();
    const res = await withDocs(submit({ email, company_website: 'http://spam.example' }));
    expect(res.status).toBe(201);
    expect(res.body.data.application_no).toMatch(/^APP-\d{4}-\d{6}$/); // plausible, not fingerprintable
    expect(await prisma.applications.count({ where: { email } })).toBe(0);
  }, 30000);

  it('rejects a non-open / invalid intake', async () => {
    const res = await withDocs(submit({ intake_id: '99999999' }));
    expect(res.status).toBe(400);
  }, 30000);

  it('rejects a submission missing a required document', async () => {
    const res = await submit()
      .attach('documents[photo]', PNG, { filename: 'photo.png', contentType: 'image/png' })
      .attach('documents[signature]', PNG, { filename: 'sig.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  }, 30000);

  it('duplicate guard silently suppresses a second submission with the same email', async () => {
    const email = uniqueEmail();
    const first = await withDocs(submit({ email }));
    expect(first.status).toBe(201);
    const firstRow = await prisma.applications.findFirst({ where: { email } });
    if (firstRow) appIds.push(firstRow.application_id);
    // A duplicate gets the same generic 201 receipt (no 409 — no enumeration/griefing)
    // and does NOT create a second row.
    const second = await withDocs(submit({ email }));
    expect(second.status).toBe(201);
    expect(await prisma.applications.count({ where: { email } })).toBe(1);
  }, 30000);
});
