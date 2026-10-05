import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Record-access on the student_document routes that a second hardening pass closed
 * (the candidate-document controller + the files document routes). Mirrors the
 * CRITIQUE #1 matrix already proven for PATCH/DELETE /students|applications
 * /documents/:id, but for:
 *   - POST   /files/student-document            (client-supplied student/app ids)
 *   - GET    /files/student-document/:id/download (download leak)
 *   - PATCH  /candidates/documents/:id          (edit any doc by id)
 *   - DELETE /candidates/documents/:id          (soft-delete any doc by id)
 *   - POST   /candidates/:id/documents          (lead-keyed write)
 *   - GET    /candidates/:id/documents          (lead-keyed metadata read)
 *
 * The invariant under test: every one of these needs BOTH a permission slug and a
 * record-access check, so counsellor B and a Student token are refused on
 * counsellor A's record, the owner succeeds, and a client-supplied foreign id /
 * file path is never honoured. Staff are created directly via Prisma with a known
 * bcrypt password (roles resolved through role_key, never hard-coded ids).
 */
describe('Document route record-access (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let prisma: PrismaService;

  const TAG = `e2e_docacc_${Date.now()}`;
  const PASSWORD = 'DocAccess@12345';
  let phoneSeq = 0;

  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};
  const appIds: number[] = [];
  const leadIds: number[] = [];
  const docRowIds: number[] = [];
  let docTypeId: number;

  const uniquePhone = () => `97${String(Date.now()).slice(-7)}${phoneSeq++ % 10}`;
  const PDF = Buffer.from('%PDF-1.4\n%e2e doc-access proof\n', 'utf8');

  async function mkStaff(key: string, roleId: number): Promise<number> {
    const username = `${TAG}_${key}`;
    const hash = await bcrypt.hash(PASSWORD, 10);
    const u = await prisma.users.create({
      data: {
        name: `${TAG} ${key}`,
        username,
        role_id: roleId,
        status: 1,
        password: hash,
        phone: uniquePhone(),
        created_at: new Date(),
      },
    });
    tokens[key] = await loginAs(http, username, PASSWORD);
    ids[key] = u.id;
    return u.id;
  }

  /** Create an application AS a token (its owner = created_by) and track it. */
  async function createApplication(token: string, label: string): Promise<number> {
    const res = await request(http)
      .post('/api/applications')
      .set(authHeader(token))
      .send({
        name: `${TAG} ${label}`,
        phone: uniquePhone(),
        email: `${TAG}.${label}@e2e.local`.toLowerCase(),
        address: 'E2E Street',
      });
    expect(res.status).toBe(201);
    const id = res.body.data.application_id as number;
    appIds.push(id);
    return id;
  }

  /** Insert a student_document row directly (keyed on whatever caller wants). */
  async function mkDoc(data: {
    application_id?: number | null;
    student_id?: number | null;
    label?: string;
    file?: string | null;
  }): Promise<number> {
    const row = await prisma.student_document.create({
      data: {
        label: data.label ?? `${TAG} doc`,
        application_id: data.application_id ?? null,
        student_id: data.student_id ?? null,
        file: data.file ?? null,
        created_at: new Date(),
      },
    });
    docRowIds.push(row.student_document_id);
    return row.student_document_id;
  }

  let appA: number;
  let appB: number;
  let leadA: number;
  let leadB: number;

  // Fixtures for the READ/STREAM + data-integrity cases added by this pass.
  let studentRoleId: number;
  let appConv: number; // owned by A, with a linked (converted) student
  let linkedStudentPk: number; // students.id (route param)
  let linkedStudentUserId: number; // users.id (student_document.student_id)
  let leadColl: number; // owned by A, used for the id-collision case
  // A single id that is BOTH a real application (owned by B) and a real lead (owned
  // by A) — the FINAL WS1 candidate/application id-space collision fixture.
  let collideAppLeadId: number;
  const studentPks: number[] = [];
  const studentUserIds: number[] = [];
  // A tiny PNG-typed payload for the avatar-serve case (bytes are irrelevant — the
  // avatar route checks the multipart content-type, not the magic bytes).
  const PNG = Buffer.from('\x89PNG\r\n\x1a\n e2e avatar bytes', 'binary');

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    prisma = app.get(PrismaService);
    await cleanup();

    tokens.superadmin = await loginAs(
      http,
      ADMIN_CREDENTIALS.username,
      ADMIN_CREDENTIALS.password,
    );

    const roleRows = await prisma.user_role.findMany({
      where: { role_key: { in: ['counsellor', 'student'] } },
      select: { id: true, role_key: true },
    });
    const roleId = (key: string): number => {
      const row = roleRows.find((r) => r.role_key === key);
      if (!row) throw new Error(`role_key ${key} not seeded — apply migration 002`);
      return row.id;
    };

    await mkStaff('counsellorA', roleId('counsellor'));
    await mkStaff('counsellorB', roleId('counsellor'));
    await mkStaff('student', roleId('student'));

    // A document_type whose title becomes the stored `label`.
    docTypeId = (
      await prisma.document_type.create({
        data: { title: `${TAG} Aadhaar`, created_at: new Date() },
      })
    ).id;

    // Applications owned by A and by B (owner = created_by, no pipeline_user).
    appA = await createApplication(tokens.counsellorA, 'AppA');
    appB = await createApplication(tokens.counsellorB, 'AppB');

    // Leads owned by A and by B (candidate docs key on the lead id).
    leadA = (
      await prisma.leads.create({
        data: { created_by: ids.counsellorA, created_at: new Date() },
      })
    ).id;
    leadIds.push(leadA);
    leadB = (
      await prisma.leads.create({
        data: { created_by: ids.counsellorB, created_at: new Date() },
      })
    ).id;
    leadIds.push(leadB);

    // --- fixtures for the read/stream + data-integrity cases ---
    studentRoleId = roleId('student');

    // An application owned by A with a converted student linked to it
    // (students.application_id = applications.custom_application_id). HIGH 2 reads
    // this owner-scoped student's documents; MEDIUM 4 checks a supplied student_id
    // against this application's real converted student.
    appConv = await createApplication(tokens.counsellorA, 'AppConv');
    const convApp = await prisma.applications.findUnique({
      where: { application_id: appConv },
      select: { custom_application_id: true },
    });
    const linkedUser = await prisma.users.create({
      data: {
        name: `${TAG} linked`,
        username: `${TAG}_linkedStudent`,
        role_id: studentRoleId,
        status: 1,
        password: await bcrypt.hash(PASSWORD, 10),
        phone: uniquePhone(),
        created_at: new Date(),
      },
    });
    linkedStudentUserId = linkedUser.id;
    studentUserIds.push(linkedStudentUserId);
    const linkedStudent = await prisma.students.create({
      data: {
        student_id: linkedStudentUserId,
        consultant_id: ids.counsellorA,
        address: '',
        application_id: convApp?.custom_application_id ?? null,
        created_at: new Date(),
      },
    });
    linkedStudentPk = linkedStudent.id;
    studentPks.push(linkedStudentPk);

    // A lead owned by A whose numeric id is reused as a colliding application_id
    // on an application-style document below (the MEDIUM 3 collision case).
    leadColl = (
      await prisma.leads.create({
        data: { created_by: ids.counsellorA, created_at: new Date() },
      })
    ).id;
    leadIds.push(leadColl);

    // FINAL WS1 id-space collision: one id that is BOTH a real application (owned by
    // counsellor B) AND a real lead (owned by counsellor A). Chosen above both tables'
    // current max so the explicit-id inserts cannot conflict. A candidate document at
    // this id must be reachable ONLY through the lead (owner A), never through the
    // colliding application (owner B) — the invariant the shared discriminator restores.
    const [maxApp, maxLead] = await Promise.all([
      prisma.applications.aggregate({ _max: { application_id: true } }),
      prisma.leads.aggregate({ _max: { id: true } }),
    ]);
    collideAppLeadId =
      Math.max(maxApp._max.application_id ?? 0, maxLead._max.id ?? 0) + 1000;
    await prisma.applications.create({
      data: {
        application_id: collideAppLeadId,
        name: `${TAG} CollideApp`,
        created_by: ids.counsellorB, // B owns the colliding REAL application
        created_at: new Date(),
      },
    });
    appIds.push(collideAppLeadId);
    await prisma.leads.create({
      data: {
        id: collideAppLeadId,
        created_by: ids.counsellorA, // A owns the LEAD at the same id
        created_at: new Date(),
      },
    });
    leadIds.push(collideAppLeadId);
  }, 60000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup() {
    // Route-created doc rows are caught by owner/app/lead linkage as well as ids.
    const orClauses: Record<string, unknown>[] = [{ label: { startsWith: TAG } }];
    if (docRowIds.length) orClauses.push({ student_document_id: { in: docRowIds } });
    if (appIds.length) orClauses.push({ application_id: { in: appIds } });
    if (leadIds.length) orClauses.push({ application_id: { in: leadIds } });
    if (ids.counsellorA || ids.counsellorB) {
      orClauses.push({
        created_by: {
          in: [ids.counsellorA, ids.counsellorB].filter((n): n is number => !!n),
        },
      });
    }
    if (studentUserIds.length) {
      orClauses.push({ student_id: { in: studentUserIds } });
    }
    await prisma.student_document.deleteMany({ where: { OR: orClauses } });

    if (studentPks.length || studentUserIds.length) {
      await prisma.students.deleteMany({
        where: {
          OR: [{ id: { in: studentPks } }, { student_id: { in: studentUserIds } }],
        },
      });
    }

    if (leadIds.length) {
      await prisma.leads.deleteMany({ where: { id: { in: leadIds } } });
    }
    if (appIds.length) {
      await prisma.qualification.deleteMany({ where: { application_id: { in: appIds } } });
      await prisma.applications.deleteMany({ where: { application_id: { in: appIds } } });
    }
    if (docTypeId) {
      await prisma.document_type.deleteMany({ where: { id: docTypeId } });
    }
    await prisma.users.deleteMany({ where: { username: { startsWith: TAG } } });
  }

  // ---- POST /files/student-document -----------------------------------------

  describe('POST /api/files/student-document', () => {
    let uploadedDocId: number;

    it('the owner uploads a document scoped to their own application (201)', async () => {
      const res = await request(http)
        .post('/api/files/student-document')
        .set(authHeader(tokens.counsellorA))
        .field('student_id', String(ids.student))
        .field('document_type_id', String(docTypeId))
        .field('application_id', String(appA))
        .attach('file', PDF, { filename: 'aadhaar.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(201);
      uploadedDocId = res.body.data.document.student_document_id as number;
      docRowIds.push(uploadedDocId);
      expect(uploadedDocId).toBeGreaterThan(0);
    });

    it("another counsellor cannot upload against counsellor A's application (403)", async () => {
      const res = await request(http)
        .post('/api/files/student-document')
        .set(authHeader(tokens.counsellorB))
        .field('student_id', String(ids.student))
        .field('document_type_id', String(docTypeId))
        .field('application_id', String(appA))
        .attach('file', PDF, { filename: 'x.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(403);
      expect(String(res.body.message)).toBe('Access denied');
    });

    it('a client-supplied FOREIGN application_id is not honoured (A -> B app = 403)', async () => {
      const res = await request(http)
        .post('/api/files/student-document')
        .set(authHeader(tokens.counsellorA))
        .field('student_id', String(ids.student))
        .field('document_type_id', String(docTypeId))
        .field('application_id', String(appB))
        .attach('file', PDF, { filename: 'x.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(403);
      expect(String(res.body.message)).toBe('Access denied');
    });

    it('a Student token is refused by the permission guard (403)', async () => {
      const res = await request(http)
        .post('/api/files/student-document')
        .set(authHeader(tokens.student))
        .field('student_id', String(ids.student))
        .field('document_type_id', String(docTypeId))
        .field('application_id', String(appA))
        .attach('file', PDF, { filename: 'x.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(403);
    });

    // ---- GET /files/student-document/:id/download (uses the uploaded row) ----

    it('the owner can download their document (200), B and Student cannot (403)', async () => {
      const mine = await request(http)
        .get(`/api/files/student-document/${uploadedDocId}/download`)
        .set(authHeader(tokens.counsellorA));
      expect(mine.status).toBe(200);

      const theirs = await request(http)
        .get(`/api/files/student-document/${uploadedDocId}/download`)
        .set(authHeader(tokens.counsellorB));
      expect(theirs.status).toBe(403);
      expect(String(theirs.body.message)).toBe('Access denied');

      const student = await request(http)
        .get(`/api/files/student-document/${uploadedDocId}/download`)
        .set(authHeader(tokens.student));
      expect(student.status).toBe(403);
    });
  });

  // ---- PATCH / DELETE /candidates/documents/:id (acts on ANY doc by id) ------

  describe('PATCH/DELETE /api/candidates/documents/:id', () => {
    it("counsellor B cannot edit counsellor A's application document via the candidates route (403); owner ok", async () => {
      const docId = await mkDoc({ application_id: appA, label: `${TAG} Original` });

      const owner = await request(http)
        .patch(`/api/candidates/documents/${docId}`)
        .set(authHeader(tokens.counsellorA))
        .field('title', `${TAG} Updated by owner`);
      expect(owner.status).toBe(200);
      const afterOwner = await prisma.student_document.findUnique({
        where: { student_document_id: docId },
      });
      expect(afterOwner?.label).toBe(`${TAG} Updated by owner`);

      const other = await request(http)
        .patch(`/api/candidates/documents/${docId}`)
        .set(authHeader(tokens.counsellorB))
        .field('title', `${TAG} Hijacked`);
      expect(other.status).toBe(403);
      expect(String(other.body.message)).toBe('Access denied');

      const student = await request(http)
        .patch(`/api/candidates/documents/${docId}`)
        .set(authHeader(tokens.student))
        .field('title', `${TAG} Hijacked`);
      expect(student.status).toBe(403);

      // The row was not mutated by the refused callers.
      const unchanged = await prisma.student_document.findUnique({
        where: { student_document_id: docId },
      });
      expect(unchanged?.label).toBe(`${TAG} Updated by owner`);
    });

    it("counsellor B / Student cannot delete counsellor A's document (403); owner soft-deletes (200)", async () => {
      const docId = await mkDoc({ application_id: appA, label: `${TAG} ToDelete` });

      const otherDelete = await request(http)
        .delete(`/api/candidates/documents/${docId}`)
        .set(authHeader(tokens.counsellorB));
      expect(otherDelete.status).toBe(403);
      expect(String(otherDelete.body.message)).toBe('Access denied');

      const studentDelete = await request(http)
        .delete(`/api/candidates/documents/${docId}`)
        .set(authHeader(tokens.student));
      expect(studentDelete.status).toBe(403);

      // Still present (not soft-deleted) after the refused attempts.
      const stillThere = await prisma.student_document.findUnique({
        where: { student_document_id: docId },
      });
      expect(stillThere?.deleted_at ?? null).toBeNull();

      const ownerDelete = await request(http)
        .delete(`/api/candidates/documents/${docId}`)
        .set(authHeader(tokens.counsellorA));
      expect(ownerDelete.status).toBe(200);
      const afterDelete = await prisma.student_document.findUnique({
        where: { student_document_id: docId },
      });
      expect(afterDelete?.deleted_at).not.toBeNull();
    });

    it('a missing document id is 404 for the owner', async () => {
      const res = await request(http)
        .patch('/api/candidates/documents/999999999')
        .set(authHeader(tokens.counsellorA))
        .field('title', 'nope');
      expect(res.status).toBe(404);
    });
  });

  // ---- POST / GET /candidates/:id/documents (lead-keyed) --------------------

  describe('POST/GET /api/candidates/:id/documents', () => {
    it("the lead owner can add a candidate document (201); B and Student cannot (403)", async () => {
      const owner = await request(http)
        .post(`/api/candidates/${leadA}/documents`)
        .set(authHeader(tokens.counsellorA))
        .field('title', `${TAG} Candidate doc`)
        .field('document_type_id', String(docTypeId))
        .attach('file', PDF, { filename: 'cand.pdf', contentType: 'application/pdf' });
      expect(owner.status).toBe(201);
      docRowIds.push(owner.body.data.document.student_document_id as number);

      const other = await request(http)
        .post(`/api/candidates/${leadA}/documents`)
        .set(authHeader(tokens.counsellorB))
        .field('title', `${TAG} Candidate doc`)
        .field('document_type_id', String(docTypeId))
        .attach('file', PDF, { filename: 'cand.pdf', contentType: 'application/pdf' });
      expect(other.status).toBe(403);
      expect(String(other.body.message)).toBe('Access denied');

      const student = await request(http)
        .post(`/api/candidates/${leadA}/documents`)
        .set(authHeader(tokens.student))
        .field('title', `${TAG} Candidate doc`)
        .field('document_type_id', String(docTypeId))
        .attach('file', PDF, { filename: 'cand.pdf', contentType: 'application/pdf' });
      expect(student.status).toBe(403);
    });

    it('a client-supplied FOREIGN lead id is not honoured (A -> B lead = 403)', async () => {
      const res = await request(http)
        .post(`/api/candidates/${leadB}/documents`)
        .set(authHeader(tokens.counsellorA))
        .field('title', `${TAG} Candidate doc`)
        .field('document_type_id', String(docTypeId))
        .attach('file', PDF, { filename: 'cand.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(403);
      expect(String(res.body.message)).toBe('Access denied');
    });

    it('the lead owner can list candidate documents (200); B and Student cannot (403)', async () => {
      const owner = await request(http)
        .get(`/api/candidates/${leadA}/documents`)
        .set(authHeader(tokens.counsellorA));
      expect(owner.status).toBe(200);
      expect(Array.isArray(owner.body.data)).toBe(true);

      const other = await request(http)
        .get(`/api/candidates/${leadA}/documents`)
        .set(authHeader(tokens.counsellorB));
      expect(other.status).toBe(403);
      expect(String(other.body.message)).toBe('Access denied');

      const student = await request(http)
        .get(`/api/candidates/${leadA}/documents`)
        .set(authHeader(tokens.student));
      expect(student.status).toBe(403);
    });
  });

  // ---- HIGH 1: GET /files/serve public-subdir restriction -------------------

  describe('GET /api/files/serve (public-subdir restriction)', () => {
    it('serves a public avatars/ path (200) but refuses a sensitive student_documents/ path', async () => {
      // An avatar lands under avatars/ (public-by-design) and must still stream.
      const avatarRes = await request(http)
        .post('/api/files/avatar')
        .set(authHeader(tokens.counsellorA))
        .attach('file', PNG, { filename: 'avatar.png', contentType: 'image/png' });
      expect([200, 201]).toContain(avatarRes.status);
      const avatarPath = avatarRes.body.data.profile_picture as string;
      expect(avatarPath.startsWith('avatars/')).toBe(true);

      const servedAvatar = await request(http)
        .get('/api/files/serve')
        .query({ item: Buffer.from(avatarPath).toString('base64') })
        .set(authHeader(tokens.counsellorA));
      expect(servedAvatar.status).toBe(200);

      // A REAL sensitive document lands under student_documents/ (uploaded by the
      // application owner). /files/serve must refuse its path even though the file
      // exists on disk — and even for the super admin.
      const docRes = await request(http)
        .post('/api/files/student-document')
        .set(authHeader(tokens.counsellorA))
        .field('student_id', String(ids.student))
        .field('document_type_id', String(docTypeId))
        .field('application_id', String(appA))
        .attach('file', PDF, { filename: 'aadhaar.pdf', contentType: 'application/pdf' });
      expect(docRes.status).toBe(201);
      docRowIds.push(docRes.body.data.document.student_document_id as number);
      const sensitivePath = docRes.body.data.path as string;
      expect(sensitivePath.startsWith('student_documents/')).toBe(true);

      const item = Buffer.from(sensitivePath).toString('base64');
      const blockedForOwner = await request(http)
        .get('/api/files/serve')
        .query({ item })
        .set(authHeader(tokens.counsellorA));
      expect([403, 404]).toContain(blockedForOwner.status);
      expect(blockedForOwner.status).not.toBe(200);

      const blockedForAdmin = await request(http)
        .get('/api/files/serve')
        .query({ item })
        .set(authHeader(tokens.superadmin));
      expect([403, 404]).toContain(blockedForAdmin.status);
    });

    it('refuses a candidate_documents/ path too', async () => {
      const res = await request(http)
        .get('/api/files/serve')
        .query({ item: Buffer.from('candidate_documents/anything.pdf').toString('base64') })
        .set(authHeader(tokens.counsellorA));
      expect([403, 404]).toContain(res.status);
    });
  });

  // ---- HIGH 2: GET /students/:id/documents record-access --------------------

  describe('GET /api/students/:id/documents (record-access)', () => {
    it("the owner reads the linked student's documents (200); B and Student cannot (403)", async () => {
      const owner = await request(http)
        .get(`/api/students/${linkedStudentPk}/documents`)
        .set(authHeader(tokens.counsellorA));
      expect(owner.status).toBe(200);
      expect(Array.isArray(owner.body.data)).toBe(true);

      const other = await request(http)
        .get(`/api/students/${linkedStudentPk}/documents`)
        .set(authHeader(tokens.counsellorB));
      expect(other.status).toBe(403);
      expect(String(other.body.message)).toBe('Access denied');

      const student = await request(http)
        .get(`/api/students/${linkedStudentPk}/documents`)
        .set(authHeader(tokens.student));
      expect(student.status).toBe(403);
    });

    it('the super admin can read any student\'s documents (200)', async () => {
      const res = await request(http)
        .get(`/api/students/${linkedStudentPk}/documents`)
        .set(authHeader(tokens.superadmin));
      expect(res.status).toBe(200);
    });
  });

  // ---- MEDIUM 3: candidate list cannot return an application doc (collision) --

  describe('GET /api/candidates/:id/documents (id-space collision)', () => {
    it('excludes an application document whose application_id equals the lead id', async () => {
      // A genuine candidate doc for leadColl (stored under candidate_documents/).
      const candRes = await request(http)
        .post(`/api/candidates/${leadColl}/documents`)
        .set(authHeader(tokens.counsellorA))
        .field('title', `${TAG} Candidate doc`)
        .field('document_type_id', String(docTypeId))
        .attach('file', PDF, { filename: 'cand.pdf', contentType: 'application/pdf' });
      expect(candRes.status).toBe(201);
      const candidateDocId = candRes.body.data.document.student_document_id as number;
      docRowIds.push(candidateDocId);

      // An application-style doc (stored under student_documents/, NOT a candidate
      // doc) whose application_id COLLIDES with the lead id.
      const collideDocId = await mkDoc({
        application_id: leadColl,
        file: 'student_documents/collide.pdf',
        label: `${TAG} collide app doc`,
      });

      const list = await request(http)
        .get(`/api/candidates/${leadColl}/documents`)
        .set(authHeader(tokens.counsellorA));
      expect(list.status).toBe(200);
      const returnedIds = (
        list.body.data as Array<{ student_document_id: number }>
      ).map((d) => d.student_document_id);
      expect(returnedIds).toContain(candidateDocId);
      expect(returnedIds).not.toContain(collideDocId);
    });
  });

  // ---- MEDIUM 4: createStudentDocument student_id vs application_id ----------

  describe('POST /api/files/student-document (student_id consistency)', () => {
    it("accepts a student_id matching the application's converted student (201)", async () => {
      const res = await request(http)
        .post('/api/files/student-document')
        .set(authHeader(tokens.counsellorA))
        .field('student_id', String(linkedStudentUserId))
        .field('document_type_id', String(docTypeId))
        .field('application_id', String(appConv))
        .attach('file', PDF, { filename: 'ok.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(201);
      docRowIds.push(res.body.data.document.student_document_id as number);
      expect(res.body.data.document.student_id).toBe(linkedStudentUserId);
    });

    it('rejects a student_id inconsistent with the supplied application_id (400)', async () => {
      const res = await request(http)
        .post('/api/files/student-document')
        .set(authHeader(tokens.counsellorA))
        .field('student_id', String(ids.student)) // not appConv's converted student
        .field('document_type_id', String(docTypeId))
        .field('application_id', String(appConv))
        .attach('file', PDF, { filename: 'bad.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(400);
      expect(String(res.body.message)).toContain('student_id');
    });
  });

  // ---- FINAL WS1: candidate (lead) doc whose lead id EQUALS a real application id -
  //
  // student_document.application_id is overloaded (a leads.id for candidate docs, a
  // real applications.application_id for application/student docs). collideAppLeadId
  // is BOTH a real application (owner = counsellor B) and a real lead (owner =
  // counsellor A). A candidate doc at that id must follow the LEAD class on every
  // route: reachable by the lead owner (A), refused for the application owner (B), and
  // never merged into a student profile. A file replace must not flip the row's class.
  describe('candidate-doc / application id-space collision (FINAL WS1)', () => {
    /** A fresh candidate doc (candidate_documents/ prefix) keyed on the collide id. */
    async function mkCollidingCandidateDoc(label: string): Promise<number> {
      return mkDoc({
        application_id: collideAppLeadId,
        file: `candidate_documents/${TAG}-collide.pdf`,
        label: `${TAG} ${label}`,
      });
    }

    it('PATCH /applications/documents/:id follows the lead: app owner B refused, lead owner A ok', async () => {
      const docId = await mkCollidingCandidateDoc('collide-patch-app');

      // Sanity: B really can VIEW the colliding real application, so the 403 below is
      // the discriminator refusing a lead-class doc — not B lacking application access.
      const bSeesApp = await request(http)
        .get(`/api/applications/${collideAppLeadId}`)
        .set(authHeader(tokens.counsellorB));
      expect(bSeesApp.status).toBe(200);

      // B owns the REAL application at this id but NOT the lead -> 403 (never 200).
      const attacker = await request(http)
        .patch(`/api/applications/documents/${docId}`)
        .set(authHeader(tokens.counsellorB))
        .send({ label: `${TAG} hijacked` });
      expect(attacker.status).toBe(403);
      expect(String(attacker.body.message)).toBe('Access denied');

      // The lead owner (A) reaches it through the lead class -> 200.
      const owner = await request(http)
        .patch(`/api/applications/documents/${docId}`)
        .set(authHeader(tokens.counsellorA))
        .send({ label: `${TAG} edited by lead owner` });
      expect(owner.status).toBe(200);

      const row = await prisma.student_document.findUnique({
        where: { student_document_id: docId },
      });
      expect(row?.label).toBe(`${TAG} edited by lead owner`);
    });

    it('PATCH /students/documents/:id refuses the app owner (B) on the candidate doc (403)', async () => {
      const docId = await mkCollidingCandidateDoc('collide-patch-stu');

      const attacker = await request(http)
        .patch(`/api/students/documents/${docId}`)
        .set(authHeader(tokens.counsellorB))
        .send({ label: `${TAG} hijacked` });
      expect(attacker.status).toBe(403);
      expect(String(attacker.body.message)).toBe('Access denied');

      const row = await prisma.student_document.findUnique({
        where: { student_document_id: docId },
      });
      expect(row?.label).toBe(`${TAG} collide-patch-stu`); // untouched
    });

    it('DELETE /students/documents/:id cannot delete the candidate doc as the app owner (B) (403)', async () => {
      const docId = await mkCollidingCandidateDoc('collide-del-stu');

      const attacker = await request(http)
        .delete(`/api/students/documents/${docId}`)
        .set(authHeader(tokens.counsellorB));
      expect(attacker.status).toBe(403);
      expect(String(attacker.body.message)).toBe('Access denied');

      const row = await prisma.student_document.findUnique({
        where: { student_document_id: docId },
      });
      expect(row?.deleted_at ?? null).toBeNull(); // not soft-deleted
    });

    it('GET /files/student-document/:id/download refuses the app owner (B) on the candidate doc', async () => {
      const docId = await mkCollidingCandidateDoc('collide-download');
      const res = await request(http)
        .get(`/api/files/student-document/${docId}/download`)
        .set(authHeader(tokens.counsellorB));
      expect(res.status).toBe(403);
      expect(String(res.body.message)).toBe('Access denied');
    });

    it('GET /students/:id/documents does NOT merge a colliding candidate doc into the profile', async () => {
      // A candidate doc whose (lead) application_id EQUALS the linked student's
      // application id — must be excluded from the profile despite the id match.
      const candidateDocId = await mkDoc({
        application_id: appConv,
        file: `candidate_documents/${TAG}-profile-collide.pdf`,
        label: `${TAG} profile-collide candidate`,
      });
      // A GENUINE application doc on the same application id — must still appear.
      const genuineDocId = await mkDoc({
        application_id: appConv,
        file: `student_documents/${TAG}-profile-genuine.pdf`,
        label: `${TAG} profile-genuine app doc`,
      });

      const res = await request(http)
        .get(`/api/students/${linkedStudentPk}/documents`)
        .set(authHeader(tokens.counsellorA));
      expect(res.status).toBe(200);
      const returnedIds = (
        res.body.data as Array<{ student_document_id: number }>
      ).map((d) => d.student_document_id);
      expect(returnedIds).toContain(genuineDocId); // genuine app doc still merged
      expect(returnedIds).not.toContain(candidateDocId); // candidate doc excluded
    });

    it('PATCH /candidates/documents/:id file replace cannot flip a NON-candidate row to candidate class', async () => {
      // A non-candidate (application) doc owned via appA (counsellor A).
      const docId = await mkDoc({
        application_id: appA,
        file: `student_documents/${TAG}-class-orig.pdf`,
        label: `${TAG} class-preserve`,
      });

      const res = await request(http)
        .patch(`/api/candidates/documents/${docId}`)
        .set(authHeader(tokens.counsellorA))
        .field('title', `${TAG} class replaced`)
        .attach('file', PDF, { filename: 'new.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(200);

      const row = await prisma.student_document.findUnique({
        where: { student_document_id: docId },
      });
      // The replacement stayed under the row's ORIGINAL class (student_documents/),
      // so the discriminator cannot be flipped by an edit.
      expect(row?.file?.startsWith('student_documents/')).toBe(true);
      expect(row?.file?.startsWith('candidate_documents/')).toBe(false);
    });

    it('PATCH /candidates/documents/:id file replace keeps a genuine candidate row under candidate_documents/', async () => {
      const docId = await mkCollidingCandidateDoc('class-preserve-candidate');

      // The lead owner (A) may edit the candidate doc (candidate -> lead scope).
      const res = await request(http)
        .patch(`/api/candidates/documents/${docId}`)
        .set(authHeader(tokens.counsellorA))
        .field('title', `${TAG} candidate replaced`)
        .attach('file', PDF, { filename: 'new.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(200);

      const row = await prisma.student_document.findUnique({
        where: { student_document_id: docId },
      });
      expect(row?.file?.startsWith('candidate_documents/')).toBe(true);
    });
  });
});
