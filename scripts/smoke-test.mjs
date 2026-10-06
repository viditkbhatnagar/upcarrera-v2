#!/usr/bin/env node
/**
 * Post-deploy smoke test for the upCarrera Admission CRM.
 *
 * Exercises the behaviour fixed in the Phase 1 QA rounds against a running
 * deployment, so a deploy can be checked in one command instead of by clicking.
 *
 * READ-ONLY by default: it logs in and issues GET requests, nothing else, so it
 * is safe to run against production at any time. Pass --writes to also exercise
 * the create/edit paths; every record it creates is named "SMOKE-<timestamp>"
 * and deleted again before it exits, success or failure.
 *
 * Credentials come from the environment — never put them in this file:
 *
 *   SMOKE_BASE=https://admin.upcarrera.com \
 *   SMOKE_USER=upcarrera.superadmin SMOKE_PASS='...' \
 *   SMOKE_SITES=https://lms.upcarrera.com,https://admissions.upcarrera.com \
 *   node scripts/smoke-test.mjs [--writes]
 *
 * Local dev, where Vite serves the SPA separately:
 *   SMOKE_BASE=http://localhost:3000 SMOKE_WEB=http://localhost:3001 ...
 *
 * Exit code is the number of failed checks (0 = all green).
 */

const BASE = (process.env.SMOKE_BASE ?? 'http://localhost:3000').replace(/\/$/, '');
const API = `${BASE}/api`;
// Production serves the SPA and the API from one origin. Locally Vite serves the
// SPA on its own port, so allow the web origin to differ from the API origin.
const WEB = (process.env.SMOKE_WEB ?? BASE).replace(/\/$/, '');
const USER = process.env.SMOKE_USER;
const PASS = process.env.SMOKE_PASS;
const WRITES = process.argv.includes('--writes');
const EXTRA_SITES = (process.env.SMOKE_SITES ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const results = [];
const cleanups = [];

/** Record one check. `detail` is shown on failure, and on success when short. */
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  ${mark}  ${name}${detail && (!ok || detail.length < 70) ? `  — ${detail}` : ''}`);
}

async function http(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body — leave null */
  }
  return { status: res.status, json, data: json?.data };
}

async function section(title, fn) {
  console.log(`\n${title}`);
  try {
    await fn();
  } catch (err) {
    check(`${title} — unexpected error`, false, err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`upCarrera smoke test → ${BASE}${WRITES ? '  (with --writes)' : '  (read-only)'}`);

  await section('Availability', async () => {
    const health = await http('GET', '/health');
    check('API health', health.status === 200 && health.data?.status === 'ok', JSON.stringify(health.data));
    check('Database reachable', health.data?.db === 'up', `db=${health.data?.db}`);

    const page = await fetch(`${WEB}/`).catch((e) => ({ status: `ERR ${e.message}` }));
    check('Web app serves', page.status === 200, `${WEB} → HTTP ${page.status}`);

    for (const site of EXTRA_SITES) {
      const r = await fetch(site).catch((e) => ({ status: `ERR ${e.message}` }));
      check(`Site up: ${site}`, r.status === 200, `HTTP ${r.status}`);
    }
  });

  if (!USER || !PASS) {
    check('Credentials supplied (SMOKE_USER / SMOKE_PASS)', false, 'set them to run the authenticated checks');
    return;
  }

  const login = await http('POST', '/auth/login', { body: { username: USER, password: PASS } });
  const token = login.data?.auth_token;
  check('Login', Boolean(token), token ? '' : login.json?.message ?? `HTTP ${login.status}`);
  if (!token) return;

  await section('Counsellors — identity (C01) and hierarchy (C05)', async () => {
    const r = await http('GET', '/consultants?limit=1000', { token });
    const rows = r.data?.items ?? [];
    check('Lists counsellors', rows.length > 0, `${rows.length} rows`);

    const displayIds = new Set(rows.map((c) => (c.employee_code?.trim() || `UC-${c.id}`)));
    check('Every counsellor has a distinct display id (was all "UC-91")',
      displayIds.size === rows.length, `${displayIds.size} distinct / ${rows.length}`);

    const dialCodeIds = new Set(rows.map((c) => `UC-${c.code}`));
    check('…and the old dial-code derivation really would have collided',
      dialCodeIds.size < rows.length || rows.length < 2, `UC-{code} gives ${dialCodeIds.size} value(s)`);

    const hasHierarchy = rows.every((c) =>
      ['team_name', 'team_leader_name', 'group_name', 'manager_name'].every((k) => k in c));
    check('Rows carry team / leader / group / manager', hasHierarchy);

    if (rows[0]) {
      const one = await http('GET', `/consultants/${rows[0].id}`, { token });
      check('Profile resolves by id to the same person', one.data?.id === rows[0].id, one.data?.name);
    }

    const groups = await http('GET', '/consultants/groups', { token });
    check('Groups endpoint returns the real table',
      Array.isArray(groups.data?.items) && typeof groups.data?.unassigned_counsellors === 'number',
      `${groups.data?.items?.length ?? 0} groups, ${groups.data?.unassigned_counsellors} unassigned`);
  });

  await section('Teams — leader names and rosters (T03, T05)', async () => {
    const r = await http('GET', '/sales-teams', { token });
    const teams = r.data?.items ?? [];
    check('Lists teams', r.status === 200, `${teams.length} teams`);
    for (const t of teams) {
      check(`Team "${t.name}": leader is never a bare id`,
        t.leader_name === null || !/^\d+$/.test(String(t.leader_name)), `leader_name=${t.leader_name}`);
      check(`Team "${t.name}": members_count matches the roster`,
        t.members_count === (t.members_details ?? []).length,
        `${t.members_count} vs ${(t.members_details ?? []).length}`);
    }
  });

  await section('Universities — view by id (UN02)', async () => {
    const list = await http('GET', '/universities?page=1&limit=5', { token });
    const first = (list.data?.items ?? list.data ?? [])[0];
    check('Lists universities', Boolean(first));
    if (first) {
      const byId = await http('GET', `/universities/${first.id}`, { token });
      check('Detail loads by numeric id', byId.status === 200, `HTTP ${byId.status}`);
      const code = `UNI-${String(first.id).padStart(3, '0')}`;
      const byCode = await http('GET', `/universities/${code}`, { token });
      check(`The display code (${code}) is NOT what the app routes on`,
        byCode.status === 400, `HTTP ${byCode.status} — the list must link by id`);
    }
  });

  await section('Applications — server-side search and counts (AP06, AP07)', async () => {
    const page1 = await http('GET', '/applications?page=1&limit=1', { token });
    const total = page1.data?.total ?? 0;
    check('Lists applications', total > 0, `${total} total`);

    const counts = page1.data?.counts ?? {};
    const sum = Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0);
    check('Stage counts cover the whole set, not the page', sum === total, `sum=${sum} total=${total}`);

    // Pick a record that is NOT on page 1 (limit=1) and search for it from page 1.
    const page3 = await http('GET', '/applications?page=3&limit=1', { token });
    const target = page3.data?.items?.[0];
    if (target) {
      const q = encodeURIComponent(`APP-${target.application_id}`);
      const found = await http('GET', `/applications?page=1&limit=1&search=${q}`, { token });
      check('Search finds a record from another page',
        found.data?.items?.some((a) => a.application_id === target.application_id),
        `searched APP-${target.application_id}`);
    }
  });

  await section('Students — server-side search and reconciled counts (ST02, ST03)', async () => {
    const page1 = await http('GET', '/students?page=1&limit=1', { token });
    const c = page1.data?.counts;
    check('Lists students', (page1.data?.total ?? 0) > 0, `${page1.data?.total} total`);
    if (c) {
      const sum = Object.values(c.by_status ?? {}).reduce((a, b) => a + b, 0);
      check('Status cards sum to the total (was 1,526 vs 1,541)', sum === c.total,
        `sum=${sum} total=${c.total} unknown=${c.by_status?.Unknown ?? 0}`);
    }
    const page3 = await http('GET', '/students?page=3&limit=1', { token });
    const target = page3.data?.items?.[0];
    if (target?.student_id) {
      const found = await http('GET', `/students?page=1&limit=1&search=STU-${target.student_id}`, { token });
      check('Search finds a student from another page',
        found.data?.items?.some((s) => s.student_id === target.student_id), `STU-${target.student_id}`);
    }
  });

  if (WRITES) {
    await section('Write paths (creates SMOKE-* records, then deletes them)', async () => {
      const tag = `SMOKE-${Date.now()}`;

      const uni = await http('POST', '/universities', {
        token, body: { title: `${tag} University`, category: 'Private University', status: '1' },
      });
      const uniId = uni.data?.id;
      check('Create university (UN01 — used to fake success)', Boolean(uniId), uni.json?.message);
      if (uniId) {
        cleanups.push(() => http('DELETE', `/universities/${uniId}`, { token }));
        const listed = await http('GET', `/universities/${uniId}`, { token });
        check('…and it really persisted', listed.data?.id === uniId);
      }

      const grp = await http('POST', '/consultants/groups', {
        token, body: { code: tag, name: `${tag} Group`, status: 1 },
      });
      const grpId = grp.data?.id;
      check('Create counsellor group (G01)', Boolean(grpId), grp.json?.message);
      if (grpId) cleanups.push(() => http('DELETE', `/consultants/groups/${grpId}`, { token }));
    });
  }
}

// ---------------------------------------------------------------------------

try {
  await main();
} finally {
  for (const undo of cleanups.reverse()) {
    try {
      await undo();
    } catch {
      console.log('  WARN  a cleanup step failed — look for leftover SMOKE-* records');
    }
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('\nFailed:');
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`);
  }
  process.exitCode = failed.length;
}
