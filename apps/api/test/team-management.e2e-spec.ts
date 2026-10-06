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
 * Team management (e2e) — QA T04 / T02 / G01.
 *
 * The Teams screens now edit teams (PATCH /sales-teams/:id), manage members
 * (PATCH /consultants/:id/team, plus DELETE /sales-teams/:id/members/:memberId
 * for ids whose user no longer exists) and place a team under a group
 * (PATCH /consultants/teams/:id/group). These specs pin the API behaviour those
 * screens rely on:
 *   - the leader / members columns only ever accept users.id values;
 *   - a PATCH changes only the fields it carries;
 *   - GET /sales-teams decorates each team with its parent group's name;
 *   - an orphan roster id (production has three: 30, 31, 41) can be removed,
 *     and removing a real member keeps users.team_id in step.
 *
 * Every fixture is created here with an e2e_t04_ prefix and removed afterwards.
 */
describe('Team management (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let token: string;
  let prisma: PrismaService;

  const PREFIX = 'e2e_t04_';
  const TEAM_NAME = `${PREFIX}team`;
  const OTHER_TEAM_NAME = `${PREFIX}other_team`;
  const GROUP_CODE = 'E2ET04-GRP';
  const LEADER_USERNAME = `${PREFIX}leader`;
  const MEMBER_USERNAME = `${PREFIX}member`;
  /** An id far above any real users.id — stands in for production's 30/31/41. */
  const ORPHAN_ID = 99999971;

  let leaderId: number;
  let memberId: number;
  let teamId: number;
  let otherTeamId: number;

  async function purgeFixtures(): Promise<void> {
    await prisma.sales_team.deleteMany({
      where: { name: { in: [TEAM_NAME, OTHER_TEAM_NAME] } },
    });
    await prisma.counsellor_group.deleteMany({ where: { code: GROUP_CODE } });
    await purgeUsersByUsername(app, LEADER_USERNAME);
    await purgeUsersByUsername(app, MEMBER_USERNAME);
  }

  async function createConsultant(username: string, name: string): Promise<number> {
    const res = await request(http)
      .post('/api/users')
      .set(authHeader(token))
      .send({
        name,
        username,
        password: 'E2ePassw0rd!',
        email: `${username}@e2e.local`,
        phone: '9000000071',
        role_id: 6,
        status: 1,
      });
    expect(res.status).toBeLessThan(400);
    const id: number | undefined = res.body?.data?.id;
    if (!id) throw new Error(`createConsultant(${username}) returned no id`);
    return id;
  }

  async function createTeam(body: Record<string, unknown>): Promise<number> {
    const res = await request(http).post('/api/sales-teams').set(authHeader(token)).send(body);
    expect(res.status).toBeLessThan(400);
    return res.body.data.id as number;
  }

  const getTeam = (id: number) =>
    request(http).get(`/api/sales-teams/${id}`).set(authHeader(token));

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    prisma = app.get(PrismaService);
    token = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);

    await purgeFixtures();
    leaderId = await createConsultant(LEADER_USERNAME, 'E2E T04 Leader');
    memberId = await createConsultant(MEMBER_USERNAME, 'E2E T04 Member');

    // Created the way the Create Team dialog now does it: no members in the
    // body — they are attached afterwards through PATCH /consultants/:id/team.
    teamId = await createTeam({ name: TEAM_NAME, leader: String(leaderId), members: [], status: 1 });
    otherTeamId = await createTeam({ name: OTHER_TEAM_NAME, members: [], status: 1 });
  });

  afterAll(async () => {
    await purgeFixtures();
    await app.close();
  });

  describe('leader and member ids are validated', () => {
    it('rejects a display name as the leader on create (QA T01)', async () => {
      const res = await request(http)
        .post('/api/sales-teams')
        .set(authHeader(token))
        .send({ name: TEAM_NAME, leader: 'Priya', status: 1 });
      expect(res.status).toBe(400);
    });

    it('rejects a display name as the leader on update', async () => {
      const res = await request(http)
        .patch(`/api/sales-teams/${teamId}`)
        .set(authHeader(token))
        .send({ leader: 'UC-91' });
      expect(res.status).toBe(400);
      expect((await getTeam(teamId)).body.data.leader).toBe(String(leaderId));
    });

    it('rejects display codes in members', async () => {
      const res = await request(http)
        .post('/api/sales-teams')
        .set(authHeader(token))
        .send({ name: TEAM_NAME, members: ['UC-91', 5] });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('UC-91');
    });

    it('still accepts numeric ids as numbers or digit strings', async () => {
      const res = await request(http)
        .patch(`/api/sales-teams/${otherTeamId}`)
        .set(authHeader(token))
        .send({ members: [] });
      expect(res.status).toBe(200);
    });
  });

  describe('PATCH /api/sales-teams/:id (Edit Team)', () => {
    it('changes only the fields it carries', async () => {
      const res = await request(http)
        .patch(`/api/sales-teams/${teamId}`)
        .set(authHeader(token))
        .send({ status: 0 });
      expect(res.status).toBe(200);

      const team = (await getTeam(teamId)).body.data;
      expect(team).toMatchObject({ name: TEAM_NAME, leader: String(leaderId), status: 0 });

      await request(http).patch(`/api/sales-teams/${teamId}`).set(authHeader(token)).send({ status: 1 });
    });

    it('clears the leader when sent null', async () => {
      const res = await request(http)
        .patch(`/api/sales-teams/${otherTeamId}`)
        .set(authHeader(token))
        .send({ leader: String(memberId) });
      expect(res.status).toBe(200);
      expect((await getTeam(otherTeamId)).body.data.leader_name).toBe('E2E T04 Member');

      const cleared = await request(http)
        .patch(`/api/sales-teams/${otherTeamId}`)
        .set(authHeader(token))
        .send({ leader: null });
      expect(cleared.status).toBe(200);
      const team = (await getTeam(otherTeamId)).body.data;
      expect(team.leader).toBeNull();
      expect(team.leader_name).toBeNull();
    });
  });

  describe('group decoration (Transfer Team / Parent Group)', () => {
    let groupId: number;

    beforeAll(async () => {
      const res = await request(http)
        .post('/api/consultants/groups')
        .set(authHeader(token))
        .send({ code: GROUP_CODE, name: 'E2E T04 Group', status: 1 });
      expect(res.status).toBeLessThan(400);
      groupId = res.body.data.id;
    });

    it('reports group_name null for a team in no group', async () => {
      const team = (await getTeam(teamId)).body.data;
      expect(team.group_id).toBeNull();
      expect(team.group_name).toBeNull();
    });

    it('resolves the parent group once the team is transferred into it', async () => {
      const moved = await request(http)
        .patch(`/api/consultants/teams/${teamId}/group`)
        .set(authHeader(token))
        .send({ group_id: groupId });
      expect(moved.status).toBe(200);

      const team = (await getTeam(teamId)).body.data;
      expect(team).toMatchObject({
        group_id: groupId,
        group_name: 'E2E T04 Group',
        group_code: GROUP_CODE,
      });

      const list = await request(http)
        .get('/api/sales-teams')
        .query({ limit: 1000 })
        .set(authHeader(token));
      const ours = (list.body.data.items as Array<{ id: number }>).find((t) => t.id === teamId);
      expect(ours).toMatchObject({ group_name: 'E2E T04 Group' });
    });

    it('drops the group name when the group is deleted', async () => {
      const del = await request(http)
        .delete(`/api/consultants/groups/${groupId}`)
        .set(authHeader(token));
      expect(del.status).toBe(200);

      const team = (await getTeam(teamId)).body.data;
      expect(team.group_id).toBeNull();
      expect(team.group_name).toBeNull();
    });
  });

  describe('Manage Members', () => {
    it('adds a member through PATCH /consultants/:id/team and shows it on the roster', async () => {
      const res = await request(http)
        .patch(`/api/consultants/${memberId}/team`)
        .set(authHeader(token))
        .send({ team_id: teamId });
      expect(res.status).toBe(200);

      const team = (await getTeam(teamId)).body.data;
      expect(team.members).toContain(memberId);
      const detail = (team.members_details as Array<{ id: number; name: string; employee_code: unknown }>)
        .find((m) => m.id === memberId);
      expect(detail).toMatchObject({ name: 'E2E T04 Member', employee_code: null });
    });

    it('removes an orphan id that PATCH /consultants/:id/team cannot reach', async () => {
      // Legacy shape: ids stored as JSON strings, one of which has no user.
      await prisma.sales_team.update({
        where: { id: otherTeamId },
        data: { members: JSON.stringify([String(ORPHAN_ID)]) },
      });

      const unreachable = await request(http)
        .patch(`/api/consultants/${ORPHAN_ID}/team`)
        .set(authHeader(token))
        .send({ team_id: null });
      expect(unreachable.status).toBe(404);

      const before = (await getTeam(otherTeamId)).body.data;
      expect(before.members_details).toEqual([
        expect.objectContaining({ id: ORPHAN_ID, name: null }),
      ]);

      const res = await request(http)
        .delete(`/api/sales-teams/${otherTeamId}/members/${ORPHAN_ID}`)
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.data.members).toEqual([]);
      expect(res.body.data.members_count).toBe(0);
    });

    it('404s for an id that is not on the roster', async () => {
      const res = await request(http)
        .delete(`/api/sales-teams/${otherTeamId}/members/${ORPHAN_ID}`)
        .set(authHeader(token));
      expect(res.status).toBe(404);
    });

    it('keeps users.team_id in step when it removes a real member', async () => {
      const res = await request(http)
        .delete(`/api/sales-teams/${teamId}/members/${memberId}`)
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.data.members).not.toContain(memberId);

      const user = await prisma.users.findUnique({ where: { id: memberId } });
      expect(user?.team_id).toBeNull();
    });

    it('does not detach a user whose team_id points at a different team', async () => {
      // Drift case: the roster JSON still lists the user, but they have since
      // moved to the other team.
      await request(http)
        .patch(`/api/consultants/${memberId}/team`)
        .set(authHeader(token))
        .send({ team_id: otherTeamId });
      await prisma.sales_team.update({
        where: { id: teamId },
        data: { members: JSON.stringify([String(memberId)]) },
      });

      const res = await request(http)
        .delete(`/api/sales-teams/${teamId}/members/${memberId}`)
        .set(authHeader(token));
      expect(res.status).toBe(200);

      const user = await prisma.users.findUnique({ where: { id: memberId } });
      expect(user?.team_id).toBe(otherTeamId);
    });

    it('keeps the stored representation of the remaining entries', async () => {
      await prisma.sales_team.update({
        where: { id: teamId },
        data: { members: JSON.stringify([String(leaderId), String(ORPHAN_ID)]) },
      });
      await request(http)
        .delete(`/api/sales-teams/${teamId}/members/${ORPHAN_ID}`)
        .set(authHeader(token))
        .expect(200);

      const row = await prisma.sales_team.findUnique({ where: { id: teamId } });
      expect(row?.members).toBe(JSON.stringify([String(leaderId)]));
    });

    it('does not lose a removal when two DELETEs race on the same roster', async () => {
      // Each DELETE re-reads the roster under a row lock, so the second one
      // sees the first one's write instead of writing back a stale copy.
      const ORPHAN_B = ORPHAN_ID + 1;
      const ORPHAN_C = ORPHAN_ID + 2;
      await prisma.sales_team.update({
        where: { id: otherTeamId },
        data: { members: JSON.stringify([ORPHAN_ID, ORPHAN_B, ORPHAN_C]) },
      });

      const results = await Promise.all(
        [ORPHAN_ID, ORPHAN_B].map((id) =>
          request(http)
            .delete(`/api/sales-teams/${otherTeamId}/members/${id}`)
            .set(authHeader(token)),
        ),
      );
      expect(results.map((r) => r.status)).toEqual([200, 200]);

      const row = await prisma.sales_team.findUnique({ where: { id: otherTeamId } });
      expect(row?.members).toBe(JSON.stringify([ORPHAN_C]));
    });

    it('404s for a soft-deleted or missing team', async () => {
      const res = await request(http)
        .delete(`/api/sales-teams/99999990/members/${ORPHAN_ID}`)
        .set(authHeader(token));
      expect(res.status).toBe(404);
    });
  });
});
