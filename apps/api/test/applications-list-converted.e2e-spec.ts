import type { INestApplication } from '@nestjs/common';
import { bootApp } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { StudentsService } from '../src/students/students.service';

/**
 * Runtime proof for C2/C4/RP1 (Naji): a counsellor's default Applications list
 * ("All", no stage filter) must include their CONVERTED (enrolled) applications,
 * so the rows reconcile with the "All" count and the dashboard "Total
 * Applications" + the Applications report are no longer empty for a counsellor
 * whose admissions are all enrolled. Before the fix, listApplications hid
 * converted rows from counsellors while the counts still included them.
 *
 * Drives the real StudentsService.listApplications with a counsellor actor, so the
 * actual scope + where-building runs. Self-contained high-id seed, cleaned up.
 */
describe('Applications list includes converted for counsellors (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: StudentsService;

  const COUN = 93301; // counsellor (role 6), owns both apps via pipeline_user
  const CONSULTANT_ROLE = 6;
  const TAG = 'E2eC2Conv';

  let CONVERTED = 0;
  let OPEN = 0;

  const cleanup = async () => {
    await prisma.applications.deleteMany({ where: { name: { startsWith: TAG } } });
    await prisma.users.deleteMany({ where: { id: COUN } });
  };

  beforeAll(async () => {
    ({ app } = await bootApp());
    prisma = app.get(PrismaService);
    service = app.get(StudentsService);
    await cleanup();

    await prisma.users.create({ data: { id: COUN, name: `${TAG} Counsellor`, role_id: CONSULTANT_ROLE } });

    const mk = async (name: string, flags: { is_converted?: number }) =>
      (
        await prisma.applications.create({
          data: {
            name,
            email: `${name.replace(/\s+/g, '').toLowerCase()}@e2e-c2.local`,
            phone: '7012349900',
            pipeline_user: COUN,
            created_by: COUN,
            created_at: new Date(),
            ...flags,
          },
        })
      ).application_id;

    CONVERTED = await mk(`${TAG} Enrolled`, { is_converted: 1 });
    OPEN = await mk(`${TAG} Open`, {});
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  const counsellor = { id: COUN, role_id: CONSULTANT_ROLE };

  const listIds = async (query: Record<string, unknown>): Promise<number[]> => {
    const res = await service.listApplications({ page: 1, limit: 500, ...query } as never, counsellor);
    const mine = new Set([CONVERTED, OPEN]);
    return (res.items as Array<{ application_id: number }>)
      .map((r) => r.application_id)
      .filter((id) => mine.has(id))
      .sort((a, b) => a - b);
  };

  it('the "All" list (no stage) now includes the counsellor\'s converted application', async () => {
    const ids = await listIds({});
    expect(ids).toEqual([CONVERTED, OPEN].sort((a, b) => a - b));
  });

  it('the stage=converted (Enrolled) tab still returns only the converted application', async () => {
    expect(await listIds({ stage: 'converted' })).toEqual([CONVERTED]);
  });

  it('the counts and the "All" rows describe the same set (count reconciles)', async () => {
    const res = await service.listApplications({ page: 1, limit: 500 } as never, counsellor);
    expect(res.counts.converted).toBeGreaterThanOrEqual(1);
    const mine = new Set([CONVERTED, OPEN]);
    const shown = (res.items as Array<{ application_id: number }>).filter((r) => mine.has(r.application_id));
    // both seeded apps are shown — the "All (n)" card can no longer sit over an empty table
    expect(shown).toHaveLength(2);
  });
});
