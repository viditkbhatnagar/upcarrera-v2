import type { INestApplication } from '@nestjs/common';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { bootApp } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { StudentsService } from '../src/students/students.service';

/**
 * Runtime proof for the per-record student access scope (Naji C1/E1): before this,
 * GET /students/:id and its sub-resources were permission-gated but carried NO
 * record scope, so a counsellor could open ANOTHER counsellor's student by guessing
 * the PK. assertStudentAccess now gates every /:id route and MIRRORS listStudents
 * exactly — a counsellor (role 6) may only reach their own admissions
 * (students.consultant_id = me); every other staff role sees all, as the list does.
 *
 * Boots the real AppModule and calls the real StudentsService so the actual DB
 * scoping runs. Seeds a tiny, self-contained high-id dataset, then deletes it.
 */
describe('Students record access (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: StudentsService;

  const COUN_A = 94401; // counsellor (role 6) — owns STU_A
  const COUN_B = 94402; // counsellor (role 6) — owns STU_B
  const STU_USER_A = 94411;
  const STU_USER_B = 94412;
  const MISSING_ID = 944999; // no such student row

  const CONSULTANT_ROLE = 6;
  const ADMIN_ROLE = 1;
  const ACCOUNTS_ROLE = 103; // a non-counsellor staff role

  let STU_A = 0; // consultant_id = COUN_A
  let STU_B = 0; // consultant_id = COUN_B

  const cleanup = async () => {
    await prisma.students.deleteMany({
      where: { student_id: { in: [STU_USER_A, STU_USER_B] } },
    });
    await prisma.users.deleteMany({
      where: { id: { in: [COUN_A, COUN_B, STU_USER_A, STU_USER_B] } },
    });
  };

  beforeAll(async () => {
    ({ app } = await bootApp());
    prisma = app.get(PrismaService);
    service = app.get(StudentsService);

    await cleanup();

    await prisma.users.createMany({
      data: [
        { id: COUN_A, name: 'Counsellor A', role_id: CONSULTANT_ROLE },
        { id: COUN_B, name: 'Counsellor B', role_id: CONSULTANT_ROLE },
        { id: STU_USER_A, name: 'Student A' },
        { id: STU_USER_B, name: 'Student B' },
      ],
    });

    const mk = async (student_id: number, consultant_id: number) =>
      (
        await prisma.students.create({
          data: { address: 'addr', admission_status: 2, student_id, consultant_id },
        })
      ).id;

    STU_A = await mk(STU_USER_A, COUN_A);
    STU_B = await mk(STU_USER_B, COUN_B);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  const as = (id: number, role_id: number) => ({ id, role_id });

  it('a counsellor may reach their OWN student', async () => {
    await expect(
      service.assertStudentAccess(STU_A, as(COUN_A, CONSULTANT_ROLE)),
    ).resolves.toBeUndefined();
  });

  it("a counsellor is DENIED another counsellor's student (C1/E1)", async () => {
    await expect(
      service.assertStudentAccess(STU_B, as(COUN_A, CONSULTANT_ROLE)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('an admin may reach any student', async () => {
    await expect(
      service.assertStudentAccess(STU_A, as(1, ADMIN_ROLE)),
    ).resolves.toBeUndefined();
    await expect(
      service.assertStudentAccess(STU_B, as(1, ADMIN_ROLE)),
    ).resolves.toBeUndefined();
  });

  it('a non-counsellor staff role may reach any student, as the list returns them', async () => {
    await expect(
      service.assertStudentAccess(STU_A, as(COUN_B, ACCOUNTS_ROLE)),
    ).resolves.toBeUndefined();
    await expect(
      service.assertStudentAccess(STU_B, as(COUN_B, ACCOUNTS_ROLE)),
    ).resolves.toBeUndefined();
  });

  it('a missing student id is 404, not a scope leak', async () => {
    await expect(
      service.assertStudentAccess(MISSING_ID, as(COUN_A, CONSULTANT_ROLE)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('the owner can still load the decorated detail after the guard passes', async () => {
    const detail = await service.getStudentDetail(STU_A);
    expect((detail as { id: number }).id).toBe(STU_A);
  });
});
