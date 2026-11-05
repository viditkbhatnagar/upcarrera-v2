import type { INestApplication } from '@nestjs/common';
import { bootApp } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { StudentsService } from '../src/students/students.service';

/**
 * Runtime proof for the Students-list catalog filters (Sharon ST05):
 * university_id / course_id / session_id (intake) / consultant_id (counsellor) /
 * team_id / group_id on GET /students.
 *
 * Boots the real AppModule and calls the real StudentsService.listStudents so the
 * actual Prisma where-building runs (not a re-implementation). It seeds a tiny,
 * self-contained dataset in a high id range, asserts each filter narrows exactly,
 * then deletes everything it created. actor.roleId = 1 (super_admin) so no
 * counsellor scoping is applied.
 */
describe('Students list filters (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: StudentsService;

  // High, unlikely-to-collide ids so the test never touches real seed rows.
  const UNI_A = 9901;
  const UNI_B = 9902;
  const C_A = 98801; // course tagged to UNI_A
  const C_B = 98802; // course tagged to UNI_B
  const C_UNTAGGED = 98803; // course with no university
  const SESS_1 = 97701;
  const SESS_2 = 97702;
  const COUN_1 = 96601; // counsellor, team 1 (group 5)
  const COUN_2 = 96602; // counsellor, team 2 (group 6)
  const COUN_3 = 96603; // counsellor, no team
  const STU_USER_X = 96611; // student-user, users.university_id = UNI_B
  const STU_USER_Y = 96612; // student-user, users.university_id = UNI_A
  const TEAM_1 = 95501;
  const TEAM_2 = 95502;
  const GROUP_5 = 5005;
  const GROUP_6 = 5006;

  // Student row ids captured after insert so assertions compare on identity.
  let A = 0; // course C_A (UNI_A), sess1, coun1
  let B = 0; // course C_B (UNI_B), sess2, coun2
  let C = 0; // course untagged, user X (UNI_B), sess1, coun3
  let D = 0; // no course, user Y (UNI_A), sess2, coun1

  const cleanup = async () => {
    await prisma.students.deleteMany({
      where: { student_id: { in: [STU_USER_X, STU_USER_Y] } },
    });
    await prisma.users.deleteMany({
      where: { id: { in: [COUN_1, COUN_2, COUN_3, STU_USER_X, STU_USER_Y] } },
    });
    await prisma.course.deleteMany({ where: { id: { in: [C_A, C_B, C_UNTAGGED] } } });
    await prisma.sessions.deleteMany({ where: { session_id: { in: [SESS_1, SESS_2] } } });
    await prisma.sales_team.deleteMany({ where: { id: { in: [TEAM_1, TEAM_2] } } });
  };

  beforeAll(async () => {
    ({ app } = await bootApp());
    prisma = app.get(PrismaService);
    service = app.get(StudentsService);

    await cleanup();

    // Counsellors + student-users.
    await prisma.users.createMany({
      data: [
        { id: COUN_1, name: 'Counsellor One', team_id: TEAM_1 },
        { id: COUN_2, name: 'Counsellor Two', team_id: TEAM_2 },
        { id: COUN_3, name: 'Counsellor Three' },
        { id: STU_USER_X, name: 'Student X', university_id: UNI_B },
        { id: STU_USER_Y, name: 'Student Y', university_id: UNI_A },
      ],
    });

    // Courses: two tagged to universities, one untagged.
    const courseBase = {
      short_name: 'C',
      stream: 'S',
      total_duration: '1y',
      study_mode: 'online',
    };
    await prisma.course.createMany({
      data: [
        { id: C_A, title: 'Course A', university_id: UNI_A, ...courseBase },
        { id: C_B, title: 'Course B', university_id: UNI_B, ...courseBase },
        { id: C_UNTAGGED, title: 'Course Untagged', university_id: null, ...courseBase },
      ],
    });

    await prisma.sessions.createMany({
      data: [
        { session_id: SESS_1, session_title: 'Jan 2026' },
        { session_id: SESS_2, session_title: 'Jul 2026' },
      ],
    });

    // Teams -> groups. groupMemberIds reads sales_team.group_id + leader and
    // users.team_id; teamMemberIds reads users.team_id.
    await prisma.sales_team.createMany({
      data: [
        { id: TEAM_1, name: 'Team 1', group_id: GROUP_5, leader: String(COUN_1) },
        { id: TEAM_2, name: 'Team 2', group_id: GROUP_6, leader: String(COUN_2) },
      ],
    });

    const mk = async (data: {
      student_id: number;
      consultant_id: number;
      course_id: number | null;
      session_id: number;
    }) =>
      (
        await prisma.students.create({
          data: { address: 'addr', admission_status: 2, ...data },
        })
      ).id;

    A = await mk({ student_id: STU_USER_Y, consultant_id: COUN_1, course_id: C_A, session_id: SESS_1 });
    B = await mk({ student_id: STU_USER_X, consultant_id: COUN_2, course_id: C_B, session_id: SESS_2 });
    C = await mk({ student_id: STU_USER_X, consultant_id: COUN_3, course_id: C_UNTAGGED, session_id: SESS_1 });
    D = await mk({ student_id: STU_USER_Y, consultant_id: COUN_1, course_id: null, session_id: SESS_2 });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  const ADMIN = { userId: 1, roleId: 1 };

  // Returns the ids of OUR seeded students present in the result (ignores any
  // other rows that may exist in the DB), so assertions are about narrowing.
  const idsOf = async (query: Record<string, unknown>): Promise<number[]> => {
    const res = await service.listStudents(
      { page: 1, limit: 500, ...query } as never,
      ADMIN,
    );
    const mine = new Set([A, B, C, D]);
    return (res.items as Array<{ id: number }>)
      .map((r) => r.id)
      .filter((id) => mine.has(id))
      .sort((a, b) => a - b);
  };

  const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

  it('no filter returns all four seeded students', async () => {
    expect(await idsOf({})).toEqual(sorted([A, B, C, D]));
  });

  it('university_id matches via course university AND via student-user fallback', async () => {
    // UNI_A: A (course C_A) + D (no course -> user Y university UNI_A).
    expect(await idsOf({ university_id: UNI_A })).toEqual(sorted([A, D]));
    // UNI_B: B (course C_B) + C (untagged course -> user X university UNI_B).
    expect(await idsOf({ university_id: UNI_B })).toEqual(sorted([B, C]));
  });

  it('course_id filters students.course_id directly', async () => {
    expect(await idsOf({ course_id: C_A })).toEqual([A]);
    expect(await idsOf({ course_id: C_B })).toEqual([B]);
  });

  it('session_id (intake) filters students.session_id', async () => {
    expect(await idsOf({ session_id: SESS_1 })).toEqual(sorted([A, C]));
    expect(await idsOf({ session_id: SESS_2 })).toEqual(sorted([B, D]));
  });

  it('consultant_id filters students.consultant_id', async () => {
    expect(await idsOf({ consultant_id: COUN_1 })).toEqual(sorted([A, D]));
    expect(await idsOf({ consultant_id: COUN_3 })).toEqual([C]);
  });

  it('team_id resolves to the team’s counsellors', async () => {
    expect(await idsOf({ team_id: TEAM_1 })).toEqual(sorted([A, D]));
    expect(await idsOf({ team_id: TEAM_2 })).toEqual([B]);
  });

  it('group_id resolves to the group’s counsellors', async () => {
    expect(await idsOf({ group_id: GROUP_5 })).toEqual(sorted([A, D]));
    expect(await idsOf({ group_id: GROUP_6 })).toEqual([B]);
  });

  it('filters compose with AND (university + intake)', async () => {
    // UNI_A {A,D} ∩ SESS_2 {B,D} = {D}.
    expect(await idsOf({ university_id: UNI_A, session_id: SESS_2 })).toEqual([D]);
  });

  it('counsellor filters intersect; a disjoint pair returns none', async () => {
    // consultant_id COUN_1 {A,D} ∩ team TEAM_2 {COUN_2} -> no shared counsellor.
    expect(await idsOf({ consultant_id: COUN_1, team_id: TEAM_2 })).toEqual([]);
  });

  it('counts reconcile with the filtered rows (university_id = UNI_A)', async () => {
    const res = await service.listStudents(
      { page: 1, limit: 500, university_id: UNI_A } as never,
      ADMIN,
    );
    // Our two UNI_A students are Enrolled (admission_status 2); the Enrolled bucket
    // must be at least 2 and the total at least 2 (other real rows may add more).
    expect(res.counts.by_status.Enrolled).toBeGreaterThanOrEqual(2);
    expect(res.total).toBeGreaterThanOrEqual(2);
  });
});
