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
import { USER_SECRET_FIELDS, stripUserSecrets } from '../src/common/user-secrets';

/**
 * No endpoint that returns a user row may carry a credential column.
 *
 * Seven services each kept a private copy of the list of columns to strip, and
 * the copies had drifted: GET /users stripped only `password`, so it returned
 * every user's live `otp`, Zoom password and previous password hash to any
 * signed-in caller; five modules leaked `otp`. They now share one deny-list in
 * src/common/user-secrets.ts.
 *
 * This spec plants a recognisable value in EVERY credential column, on a user of
 * every role whose rows these endpoints return, then fetches each endpoint and
 * fails if any planted value — or any credential key — comes back. Add new
 * user-returning endpoints to ENDPOINTS below.
 */
describe('User credential columns never leave the API (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let token: string;
  let prisma: PrismaService;

  // otp is VARCHAR(10), so every planted value is kept short enough for its column.
  const PLANTED = {
    otp: 'PLNT90417',
    zoom_password: 'PLANTED-ZOOM-91f2',
    prev_password: '$2a$10$PLANTEDPREVHASHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  } as const;

  const FIXTURES = [
    { username: 'e2e_sec_consultant', role_id: 6 },
    { username: 'e2e_sec_telecaller', role_id: 2 },
    { username: 'e2e_sec_teacher', role_id: 3 },
    { username: 'e2e_sec_institution', role_id: 5 },
    { username: 'e2e_sec_client', role_id: 8 },
  ];
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    token = await loginAs(http, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);
    prisma = app.get(PrismaService);

    for (const f of FIXTURES) {
      await purgeUsersByUsername(app, f.username);
      const u = await prisma.users.create({
        data: {
          name: f.username,
          username: f.username,
          role_id: f.role_id,
          status: 1,
          password: '$2a$10$PLANTEDCURRENTHASHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          ...PLANTED,
          created_at: new Date(),
        },
      });
      ids[f.username] = u.id;
    }
  });

  afterAll(async () => {
    for (const f of FIXTURES) await purgeUsersByUsername(app, f.username);
    await app.close();
  });

  /** Every endpoint that returns one or more users rows. */
  const ENDPOINTS = (): string[] => [
    '/api/users?limit=1000',
    `/api/users/${ids.e2e_sec_consultant}`,
    '/api/consultants?limit=1000',
    `/api/consultants/${ids.e2e_sec_consultant}`,
    `/api/consultants/${ids.e2e_sec_consultant}/performance`,
    '/api/telecallers?limit=1000',
    `/api/telecallers/${ids.e2e_sec_telecaller}`,
    '/api/teachers?limit=1000',
    `/api/teachers/${ids.e2e_sec_teacher}`,
    '/api/institutions?limit=1000',
    `/api/institutions/${ids.e2e_sec_institution}`,
    '/api/clients?limit=1000',
    `/api/clients/${ids.e2e_sec_client}`,
  ];

  it('plants a value in every credential column the deny-list names', () => {
    // If someone adds a column to USER_SECRET_FIELDS, this spec should plant it too.
    for (const field of USER_SECRET_FIELDS) {
      if (field === 'password') continue; // planted directly above
      expect(PLANTED).toHaveProperty(field);
    }
  });

  it.each([
    ['otp'],
    ['zoom_password'],
    ['prev_password'],
  ])('no user-returning endpoint echoes a planted %s', async (field) => {
    const planted = PLANTED[field as keyof typeof PLANTED];
    const offenders: string[] = [];

    for (const path of ENDPOINTS()) {
      const res = await request(http).get(path).set(authHeader(token));
      if (res.status === 404) continue; // route not present in this build
      if (JSON.stringify(res.body).includes(planted)) offenders.push(path);
    }

    expect(offenders).toEqual([]);
  });

  it('no user-returning endpoint carries a credential KEY at all', async () => {
    const offenders: string[] = [];
    const keyPattern = new RegExp(`"(${USER_SECRET_FIELDS.join('|')})"\\s*:`);

    for (const path of ENDPOINTS()) {
      const res = await request(http).get(path).set(authHeader(token));
      if (res.status === 404) continue;
      const m = JSON.stringify(res.body).match(keyPattern);
      if (m) offenders.push(`${path} -> ${m[1]}`);
    }

    expect(offenders).toEqual([]);
  });

  describe('stripUserSecrets', () => {
    const row = {
      id: 7,
      name: 'X',
      password: 'p',
      prev_password: 'pp',
      otp: 'o',
      zoom_password: 'z',
      email: 'x@example.test',
    };

    it('removes every credential column', () => {
      const out = stripUserSecrets(row);
      for (const field of USER_SECRET_FIELDS) expect(out).not.toHaveProperty(field);
    });

    it('keeps everything else', () => {
      expect(stripUserSecrets(row)).toEqual({ id: 7, name: 'X', email: 'x@example.test' });
    });

    it('does not mutate the row it was given', () => {
      const copy = { ...row };
      stripUserSecrets(row);
      expect(row).toEqual(copy);
    });
  });
});
