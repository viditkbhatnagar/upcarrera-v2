import type { INestApplication } from '@nestjs/common';
import { bootApp } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { RecordAccessService, AccessScope } from '../src/workflow/record-access.service';

/**
 * RecordAccessService.scopeFor (QA AP04, CRITIQUE #6) against the real DB and the
 * migration-001 hierarchy. Roles are resolved through role_key (seeded ids:
 * counsellor 6, team_leader 101, manager 102, accounts 103, student_affairs 104,
 * student 4). Leaders/managers come from sales_team.leader / counsellor_group
 * .manager_id, never a role id.
 */
describe('RecordAccessService.scopeFor (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let access: RecordAccessService;

  const TAG = `e2e_access_${Date.now()}`;
  const ids: Record<string, number> = {};
  let teamId: number;
  let groupId: number;

  const mkUser = (key: string, roleId: number, extra: Record<string, unknown> = {}) =>
    prisma.users
      .create({
        data: {
          name: `${TAG} ${key}`,
          username: `${TAG}_${key}`,
          role_id: roleId,
          status: 1,
          created_at: new Date(),
          ...extra,
        },
      })
      .then((u) => {
        ids[key] = u.id;
        return u;
      });

  beforeAll(async () => {
    ({ app } = await bootApp());
    prisma = app.get(PrismaService);
    access = app.get(RecordAccessService, { strict: false });

    // Resolve role ids via role_key (never hard-coded), as the app does.
    const roleRows = await prisma.user_role.findMany({
      where: {
        role_key: {
          in: ['counsellor', 'manager', 'team_leader', 'accounts', 'student_affairs', 'student'],
        },
      },
      select: { id: true, role_key: true },
    });
    const roleId = (key: string): number => {
      const row = roleRows.find((r) => r.role_key === key);
      if (!row) throw new Error(`role_key ${key} not seeded — apply migration 002`);
      return row.id;
    };

    // Principals.
    await mkUser('counsellor', roleId('counsellor'));
    await mkUser('manager', roleId('manager'));
    await mkUser('leader', roleId('team_leader'));
    await mkUser('accounts', roleId('accounts'));
    await mkUser('sa', roleId('student_affairs'));
    await mkUser('student', roleId('student'));
    await mkUser('inactive', roleId('counsellor'), { status: 0 });

    // Group (managed by manager) -> team (led by leader) -> member + a direct report.
    groupId = (
      await prisma.counsellor_group.create({
        data: { code: `${TAG}-G`, name: `${TAG} Group`, manager_id: ids.manager, created_at: new Date() },
      })
    ).id;
    teamId = (
      await prisma.sales_team.create({
        data: {
          name: `${TAG} Team`,
          leader: String(ids.leader),
          group_id: groupId,
          created_at: new Date(),
        },
      })
    ).id;
    await mkUser('member', roleId('counsellor'), { team_id: teamId });
    await mkUser('report', roleId('counsellor'), { reports_to: ids.leader });
    access.invalidate();
  });

  afterAll(async () => {
    await prisma.users.deleteMany({ where: { username: { startsWith: TAG } } });
    await prisma.sales_team.deleteMany({ where: { id: teamId } });
    await prisma.counsellor_group.deleteMany({ where: { id: groupId } });
    await app.close();
  });

  const scopeOf = (key: string): Promise<AccessScope> =>
    access.scopeFor({ userId: ids[key] });

  it('a counsellor is scoped to their own records', async () => {
    const scope = await scopeOf('counsellor');
    expect(scope.scope).toBe('owners');
    if (scope.scope === 'owners') {
      expect(scope.ids).toEqual([ids.counsellor]);
      expect(scope.roleKey).toBe('counsellor');
    }
  });

  it('a team leader sees themselves, their team members and their direct reports', async () => {
    const scope = await scopeOf('leader');
    expect(scope.scope).toBe('owners');
    if (scope.scope === 'owners') {
      expect(scope.ids).toEqual(expect.arrayContaining([ids.leader, ids.member, ids.report]));
      // NOT a counsellor from another team.
      expect(scope.ids).not.toContain(ids.counsellor);
    }
  });

  it('a manager sees the members and leaders of the teams in their group', async () => {
    const scope = await scopeOf('manager');
    expect(scope.scope).toBe('owners');
    if (scope.scope === 'owners') {
      expect(scope.ids).toEqual(
        expect.arrayContaining([ids.manager, ids.member, ids.leader]),
      );
      expect(scope.ids).not.toContain(ids.counsellor);
    }
  });

  it('accounts is scoped to the fee_verification stage', async () => {
    const scope = await scopeOf('accounts');
    expect(scope.scope).toBe('stages');
    if (scope.scope === 'stages') expect(scope.stages).toEqual(['fee_verification']);
  });

  it('student affairs is scoped to sa_verification, converted and rejected', async () => {
    const scope = await scopeOf('sa');
    expect(scope.scope).toBe('stages');
    if (scope.scope === 'stages') {
      expect(scope.stages).toEqual(['sa_verification', 'converted', 'rejected']);
    }
  });

  it('a student (and any other role) gets no access', async () => {
    expect((await scopeOf('student')).scope).toBe('none');
  });

  it('a deactivated user loses access even with a valid id (CRITIQUE #13)', async () => {
    expect((await scopeOf('inactive')).scope).toBe('none');
  });

  it('scopeWhere mirrors the scope: owners -> pipeline_user/created_by, none -> nothing', async () => {
    const counsellor = await scopeOf('counsellor');
    const where = access.scopeWhere(counsellor);
    expect(JSON.stringify(where)).toContain('pipeline_user');

    const student = await scopeOf('student');
    expect(access.scopeWhere(student)).toEqual({ application_id: { in: [] } });
  });
});
