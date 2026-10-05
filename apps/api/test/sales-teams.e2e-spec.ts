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
 * Sales teams — id-to-name decoration (e2e).
 *
 * QA issues T03 and T05: the Teams screen showed the team leader as a bare id
 * ("30", "31") and the team profile said "1 counsellors" followed by "Member
 * details are not available for this team yet".
 *
 * The cause is the legacy shape of the table rather than the UI: `sales_team.leader`
 * is a VarChar holding a users.id and `members` is a JSON array of users.id, and the
 * introspected Prisma schema declares no relations, so nothing joined them to a name.
 * SalesService.decorateTeams now resolves every id across every team in one query
 * and returns `leader_name`, `members_details` and `members_count` alongside the
 * untouched raw columns.
 *
 * These specs create their own users and team so they pass against the bare CI seed,
 * which contains neither.
 */
describe('Sales teams decoration (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let token: string;

  const LEADER_USERNAME = 'e2e_team_leader';
  const MEMBER_USERNAME = 'e2e_team_member';
  const TEAM_NAME = 'E2E Decoration Team';

  let leaderId: number;
  let memberId: number;
  let teamId: number;

  /** Remove any team this spec left behind, so reruns stay deterministic. */
  async function purgeTeams(): Promise<void> {
    const prisma = app.get(PrismaService);
    await prisma.sales_team.deleteMany({ where: { name: TEAM_NAME } });
  }

  async function createUser(username: string, name: string): Promise<number> {
    await purgeUsersByUsername(app, username);
    const res = await request(http)
      .post('/api/users')
      .set(authHeader(token))
      .send({
        name,
        username,
        password: 'E2ePassw0rd!',
        email: `${username}@e2e.local`,
        phone: '9000000000',
        role_id: 6,
        status: 1,
      });
    expect(res.status).toBeLessThan(400);
    const id: number | undefined = res.body?.data?.id;
    if (!id) throw new Error(`createUser(${username}) returned no id: ${JSON.stringify(res.body)}`);
    return id;
  }

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    token = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);

    await purgeTeams();
    leaderId = await createUser(LEADER_USERNAME, 'E2E Leader Person');
    memberId = await createUser(MEMBER_USERNAME, 'E2E Member Person');

    const created = await request(http)
      .post('/api/sales-teams')
      .set(authHeader(token))
      .send({
        name: TEAM_NAME,
        leader: String(leaderId),
        members: [leaderId, memberId],
        status: 1,
      });
    expect(created.status).toBeLessThan(400);
    teamId = created.body?.data?.id;
    expect(teamId).toBeDefined();
  });

  afterAll(async () => {
    await purgeTeams();
    await purgeUsersByUsername(app, LEADER_USERNAME);
    await purgeUsersByUsername(app, MEMBER_USERNAME);
    await app.close();
  });

  describe('GET /api/sales-teams/:id', () => {
    it('resolves the leader id to a name (T03)', async () => {
      const res = await request(http)
        .get(`/api/sales-teams/${teamId}`)
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.data.leader_name).toBe('E2E Leader Person');
    });

    it('returns the member roster with names (T05)', async () => {
      const res = await request(http)
        .get(`/api/sales-teams/${teamId}`)
        .set(authHeader(token));

      const names = (res.body.data.members_details as Array<{ name: string }>)
        .map((m) => m.name)
        .sort();
      expect(names).toEqual(['E2E Leader Person', 'E2E Member Person']);
    });

    it('reports a members_count that matches the roster it returns', async () => {
      const res = await request(http)
        .get(`/api/sales-teams/${teamId}`)
        .set(authHeader(token));

      expect(res.body.data.members_count).toBe(2);
      expect(res.body.data.members_details).toHaveLength(2);
    });

    it('leaves the raw leader and members columns untouched for existing callers', async () => {
      const res = await request(http)
        .get(`/api/sales-teams/${teamId}`)
        .set(authHeader(token));

      expect(res.body.data.leader).toBe(String(leaderId));
      expect(res.body.data.members.sort()).toEqual([leaderId, memberId].sort());
    });
  });

  describe('GET /api/sales-teams', () => {
    it('decorates every team in the list', async () => {
      const res = await request(http)
        .get('/api/sales-teams')
        .set(authHeader(token));

      expect(res.status).toBe(200);
      const ours = (res.body.data.items as Array<{ id: number }>).find((t) => t.id === teamId);
      expect(ours).toBeDefined();
      expect(ours).toMatchObject({
        leader_name: 'E2E Leader Person',
        members_count: 2,
      });
    });

    it('never leaves a leader_name holding a bare id string', async () => {
      const res = await request(http)
        .get('/api/sales-teams')
        .set(authHeader(token));

      for (const team of res.body.data.items as Array<{ leader_name: string | null }>) {
        // null is the honest answer for a missing or soft-deleted user; a numeric
        // string would mean an id leaked through as a display name again.
        if (team.leader_name !== null) {
          expect(team.leader_name).not.toMatch(/^\d+$/);
        }
      }
    });
  });

  describe('resilience', () => {
    it('reports leader_name null rather than inventing a name when the leader id is unknown', async () => {
      const orphan = await request(http)
        .post('/api/sales-teams')
        .set(authHeader(token))
        .send({ name: TEAM_NAME, leader: '99999999', members: [], status: 1 });
      expect(orphan.status).toBeLessThan(400);

      const res = await request(http)
        .get(`/api/sales-teams/${orphan.body.data.id}`)
        .set(authHeader(token));

      expect(res.body.data.leader_name).toBeNull();
      expect(res.body.data.members_details).toEqual([]);
      expect(res.body.data.members_count).toBe(0);
    });
  });
});
