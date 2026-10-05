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
 * Counsellor hierarchy: Group -> Team -> Counsellor (e2e).
 *
 * QA C05/C06/G01/G02/T03. Before migration 001 the Team, Team Leader, Group and
 * Manager columns were "—" for all 35 counsellors, the only "group" was an
 * invented bucket derived from the empty `users.region` column, and team
 * membership lived in `sales_team.members` — a JSON blob readable only in the
 * team -> member direction.
 *
 * The behaviour that matters most here is the DUAL WRITE: `users.team_id` is now
 * the source of truth, but `sales_team.members` is still read by legacy PHP and
 * possibly by the LMS that shares this database, so both must stay in step.
 *
 * All fixtures are created by the spec, so it passes against the bare CI seed.
 */
describe('Counsellor hierarchy (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let token: string;
  let prisma: PrismaService;

  const MANAGER = 'e2e_hier_manager';
  const LEADER = 'e2e_hier_leader';
  const MEMBER = 'e2e_hier_member';
  const GROUP_NAME = 'E2E Hierarchy Group';
  const TEAM_A = 'E2E Team A';
  const TEAM_B = 'E2E Team B';

  let managerId: number;
  let leaderId: number;
  let memberId: number;
  let groupId: number;
  let teamAId: number;
  let teamBId: number;

  async function mkUser(username: string, name: string): Promise<number> {
    await purgeUsersByUsername(app, username);
    const u = await prisma.users.create({
      data: { name, username, role_id: 6, status: 1, created_at: new Date() },
    });
    return u.id;
  }

  async function cleanup(): Promise<void> {
    await prisma.sales_team.deleteMany({ where: { name: { in: [TEAM_A, TEAM_B] } } });
    await prisma.counsellor_group.deleteMany({ where: { name: GROUP_NAME } });
  }

  /** The legacy JSON roster for a team, parsed. */
  async function legacyRoster(teamId: number): Promise<number[]> {
    const t = await prisma.sales_team.findUnique({ where: { id: teamId } });
    try {
      const parsed: unknown = JSON.parse(t?.members ?? '[]');
      return Array.isArray(parsed) ? parsed.map(Number) : [];
    } catch {
      return [];
    }
  }

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    token = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);
    prisma = app.get(PrismaService);

    await cleanup();
    managerId = await mkUser(MANAGER, 'E2E Hier Manager');
    leaderId = await mkUser(LEADER, 'E2E Hier Leader');
    memberId = await mkUser(MEMBER, 'E2E Hier Member');

    const a = await prisma.sales_team.create({
      data: { name: TEAM_A, leader: String(leaderId), members: '[]', status: 1, created_at: new Date() },
    });
    const b = await prisma.sales_team.create({
      data: { name: TEAM_B, leader: String(leaderId), members: '[]', status: 1, created_at: new Date() },
    });
    teamAId = a.id;
    teamBId = b.id;
  });

  afterAll(async () => {
    await cleanup();
    for (const u of [MANAGER, LEADER, MEMBER]) await purgeUsersByUsername(app, u);
    await app.close();
  });

  describe('group CRUD', () => {
    it('creates a group with a manager', async () => {
      const res = await request(http)
        .post('/api/consultants/groups')
        .set(authHeader(token))
        .send({ code: 'E2E-GR-1', name: GROUP_NAME, manager_id: managerId, status: 1 });

      expect(res.status).toBeLessThan(400);
      groupId = res.body.data.id;
      expect(res.body.data.name).toBe(GROUP_NAME);
      expect(res.body.data.manager_id).toBe(managerId);
    });

    it('rejects a duplicate group code', async () => {
      const res = await request(http)
        .post('/api/consultants/groups')
        .set(authHeader(token))
        .send({ code: 'E2E-GR-1', name: 'Another' });
      expect(res.status).toBe(409);
    });

    it('rejects a manager id that does not exist', async () => {
      const res = await request(http)
        .post('/api/consultants/groups')
        .set(authHeader(token))
        .send({ name: 'Ghost managed', manager_id: 99999999 });
      expect(res.status).toBe(404);
    });

    it('leaves fields the caller omitted alone on update', async () => {
      const res = await request(http)
        .patch(`/api/consultants/groups/${groupId}`)
        .set(authHeader(token))
        .send({ name: GROUP_NAME });
      expect(res.status).toBeLessThan(400);
      expect(res.body.data.manager_id).toBe(managerId);
      expect(res.body.data.code).toBe('E2E-GR-1');
    });
  });

  describe('team -> group', () => {
    it('puts a team under a group', async () => {
      const res = await request(http)
        .patch(`/api/consultants/teams/${teamAId}/group`)
        .set(authHeader(token))
        .send({ group_id: groupId });
      expect(res.status).toBeLessThan(400);
      expect(res.body.data.group_id).toBe(groupId);
    });

    it('rejects a group that does not exist', async () => {
      const res = await request(http)
        .patch(`/api/consultants/teams/${teamAId}/group`)
        .set(authHeader(token))
        .send({ group_id: 99999999 });
      expect(res.status).toBe(404);
    });
  });

  describe('counsellor -> team, with the legacy roster kept in step', () => {
    it('assigns a counsellor to a team', async () => {
      const res = await request(http)
        .patch(`/api/consultants/${memberId}/team`)
        .set(authHeader(token))
        .send({ team_id: teamAId, reports_to: leaderId });

      expect(res.status).toBeLessThan(400);
      expect(res.body.data.team_id).toBe(teamAId);
      expect(res.body.data.reports_to).toBe(leaderId);
    });

    it('writes the member into the legacy sales_team.members JSON', async () => {
      expect(await legacyRoster(teamAId)).toContain(memberId);
    });

    it('resolves the whole chain back on the counsellor', async () => {
      const res = await request(http)
        .get(`/api/consultants?limit=1000`)
        .set(authHeader(token));
      const row = (res.body.data.items as Array<{ id: number }>).find((c) => c.id === memberId);

      expect(row).toMatchObject({
        team_name: TEAM_A,
        team_leader_name: 'E2E Hier Leader',
        group_name: GROUP_NAME,
        manager_name: 'E2E Hier Manager',
      });
    });

    it('moves them to another team, removing them from the old roster', async () => {
      await request(http)
        .patch(`/api/consultants/${memberId}/team`)
        .set(authHeader(token))
        .send({ team_id: teamBId })
        .expect((r) => expect(r.status).toBeLessThan(400));

      expect(await legacyRoster(teamAId)).not.toContain(memberId);
      expect(await legacyRoster(teamBId)).toContain(memberId);
    });

    it('keeps a counsellor in exactly one team (spec 2.2)', async () => {
      const inA = (await legacyRoster(teamAId)).filter((id) => id === memberId).length;
      const inB = (await legacyRoster(teamBId)).filter((id) => id === memberId).length;
      expect(inA + inB).toBe(1);
    });

    it('detaches with team_id: null without deleting anything', async () => {
      const res = await request(http)
        .patch(`/api/consultants/${memberId}/team`)
        .set(authHeader(token))
        .send({ team_id: null });

      expect(res.status).toBeLessThan(400);
      expect(res.body.data.team_name).toBeNull();
      expect(await legacyRoster(teamBId)).not.toContain(memberId);
      expect(await prisma.users.findUnique({ where: { id: memberId } })).not.toBeNull();
    });

    it('rejects a team that does not exist', async () => {
      const res = await request(http)
        .patch(`/api/consultants/${memberId}/team`)
        .set(authHeader(token))
        .send({ team_id: 99999999 });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/consultants/groups', () => {
    it('reports the real groups rather than an invented region bucket', async () => {
      const res = await request(http).get('/api/consultants/groups').set(authHeader(token));
      const ours = (res.body.data.items as Array<{ id: number }>).find((g) => g.id === groupId);

      expect(ours).toMatchObject({ name: GROUP_NAME, manager: 'E2E Hier Manager' });
    });

    it('counts teams live from the membership rather than a stored total', async () => {
      const res = await request(http).get('/api/consultants/groups').set(authHeader(token));
      const ours = (res.body.data.items as Array<{ id: number; total_teams: number }>).find(
        (g) => g.id === groupId,
      );
      expect(ours?.total_teams).toBe(1); // only TEAM_A was put under it
    });

    it('reports counsellors belonging to no team separately', async () => {
      const res = await request(http).get('/api/consultants/groups').set(authHeader(token));
      expect(typeof res.body.data.unassigned_counsellors).toBe('number');
    });
  });

  describe('deleting a group', () => {
    it('detaches its teams rather than leaving them pointing at a ghost', async () => {
      await request(http)
        .delete(`/api/consultants/groups/${groupId}`)
        .set(authHeader(token))
        .expect((r) => expect(r.status).toBeLessThan(400));

      const team = await prisma.sales_team.findUnique({ where: { id: teamAId } });
      expect(team?.group_id).toBeNull();
    });

    it('is a soft delete, so the row survives for audit', async () => {
      const row = await prisma.counsellor_group.findUnique({ where: { id: groupId } });
      expect(row).not.toBeNull();
      expect(row?.deleted_at).not.toBeNull();
    });

    it('stops listing it', async () => {
      const res = await request(http).get('/api/consultants/groups').set(authHeader(token));
      const ids = (res.body.data.items as Array<{ id: number }>).map((g) => g.id);
      expect(ids).not.toContain(groupId);
    });
  });
});
