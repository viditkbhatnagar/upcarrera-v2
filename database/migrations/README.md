# Database migrations

Hand-applied SQL for `lms_upcarrera` (production: MariaDB 10.11), a database
**shared with the live LMS** (lms.upcarrera.com). Every migration here is
strictly additive, guarded and re-runnable. **Never use `prisma db push` on a
shared database**: it would drop or alter the legacy objects Prisma does not
model.

| Order | File | What it adds |
|---|---|---|
| 1 | `001-counsellor-hierarchy.sql` | `counsellor_group`; `sales_team.group_id`; `users.team_id`, `reports_to`, `employee_code` |
| 2 | `002-phase1-admission.sql` | 15 tables (workflow, audit log, payments, magic link, student form, documents, catalog mapping, fee structures); 17 NULLable columns on 6 existing tables; the Phase 1 roles at ids **101-104**; 18 `crm:` permissions and 52 grants |
| - | `rollback/*.rollback.sql` | Last-resort, destructive down-scripts. Not migrations: never glob-apply this folder |

Apply them in order (001, then 002). Each file's header documents the details,
and its last section prints the numbers to check.

## Apply (production)

1. **Back up first.** Back up the whole database (`mysqldump --single-transaction --routines lms_upcarrera`)
   and `apps/api/uploads/`. Uploaded proofs and KYC files live on disk, not in the database.
2. **Pre-flight** (read-only), as listed in the 002 header:
   - `SELECT id, title FROM user_role ORDER BY id;` must show ids 1-8 as Super Admin, Telecaller,
     Teacher, Student, Institutions, Consultant, Admin and Client. Ids 101-104 must be free.
   - `SHOW GRANTS FOR <app user>;`. If the grants are per table, grant SELECT, INSERT, UPDATE and
     DELETE on the 15 new tables.
   - Check the row format of `applications`, `qualification`, `students`, `user_role`, `intake`
     and `university`. None may be `Compressed`, and `@@innodb_instant_alter_column_allowed` must
     not be `never`. Either would make the pinned `ALGORITHM=INSTANT` stop the file. Only the live
     server can answer this: a schema dump does not record row formats.
3. **Apply as MariaDB root, off-peak.** The app user has DML rights only.
   ```bash
   mysql --defaults-file=<chmod-600 creds file> lms_upcarrera < database/migrations/002-phase1-admission.sql
   ```
   The client stops at the first error. Never use `--force`.
4. **Read section 10** (the last result set). On the first production run, the lines marked
   `expect` should read: 15 tables, 17 columns, 6 indexes, 12 role keys, 4 roles at 101-104,
   0 other same-titled roles, 18 `crm:` permissions, 52 grants, then 0 for every remaining
   `expect 0` line. The two tagged-course counts must be equal, with 0 missing. The intake and
   collection-model lines are informational.
5. **Smoke-test the LMS** (login, application list, a student profile, student finance). Then
   `pm2 reload` the API so the permission cache loads the new grants.
6. **Do not create users with roles 101-104** until the business has decided whether the LMS
   login refuses them. See the 002 header: the LMS login has no role check.

**Development** (local docker MySQL; the app user there has full rights):
`docker exec -i upcarrera-mysql mysql -uupcarrera -p<pw> upcarrera < database/migrations/002-phase1-admission.sql`.

**CI** builds its schema with `prisma db push` from `schema.prisma`, then loads `database/ci-seed.sql`.
To get 002's roles and grants it must also run this, after the seed (it is idempotent):
`pnpm exec prisma db execute --file ../../database/migrations/002-phase1-admission.sql --schema prisma/schema.prisma`.

## Verify

- **Re-run the file.** A second run must print only `already present` notes and the same
  section-10 numbers. No row changes.
- **Check for Prisma drift.** Run this against every database you applied 002 to (the
  replica first, then the target). It must print `-- This is an empty migration.`
  ```bash
  cd apps/api
  DATABASE_URL="mysql://<user>:<pw>@<host>:<port>/<db>" \
    pnpm exec prisma migrate diff --from-schema-datamodel prisma/schema.prisma \
                                  --to-schema-datasource prisma/schema.prisma --script
  ```
- **Know the guard stops.** A message like `Table '...STOP_002_<reason>' doesn't exist` is deliberate, and nothing has been
  created. It means one of these is already taken by something else:
  - a 002 table name (`table_name_taken_by_a_foreign_table`);
  - a 002 column with another type (`column_name_taken_with_another_type`);
  - a reserved role id or Phase 1 role key (`reserved_role_id_101_104_taken`).

  Investigate before doing anything else.
- **ERROR 1205 (lock wait timeout).** A long LMS transaction held the table for more than 5 s.
  Wait, then re-run the whole file.
- **`ALGORITHM=INSTANT/INPLACE is not supported`.** The server would have rebuilt a live LMS table under a lock.
  Plan a maintenance window instead. Do not delete the clause.
- **Fewer than 12 role keys.** A legacy role's title differs. Fix the title, or set the key by
  hand, then re-run.
- **Fewer than 52 grants later.** Someone saved role 6 or 7 on the LMS Roles & Permissions
  screen, which replaces the role's grants with its own checkboxes and never shows the `crm:`
  ones. The CRM API re-applies sections 7 and 8 nightly; to repair at once, re-run 002 (once
  its DDL exists, the DML-only app user is enough). Ask LMS admins not to edit or delete the
  "CRM ..." permissions or roles 101-104. Section 10 reports soft-deleted Phase 1 roles.

## Roll back

Roll back the newest migration first: 002, then 001.

- **Level 0 (preferred): revert the code only.** Every object 001 and 002 add is inert without
  the new API. NULLable columns and unknown tables do not affect the LMS. One action is still
  required: disable any users on roles 101-104, because the old API has no record-level access.
  ```sql
  UPDATE users SET status = 0 WHERE role_id IN (101, 102, 103, 104);
  ```
  `status = 0` makes the CRM API refuse these users. The LMS web login ignores
  `users.status`, so it does not stop them reaching the LMS.
  That exposure exists with or without 002; the 002 header says what decides it.
- **Level 1: run `rollback/002-phase1-admission.rollback.sql` as root**, after exporting what it
  destroys. Its header gives the exact `mysqldump` and `SELECT` commands: the 15 tables,
  `applications.stage` / `remarks` / `referred_by`, `students.student_no` (the issued
  STU numbers), the six new `qualification` columns, `university.fee_collection_model`,
  `intake.session_id` and `user_role.role_key`. Several of these exist nowhere else. The script:
  - stops first, changing nothing, if a column could not be dropped instantly or a key
    002 did not name covers a 002 column (it would otherwise fail half-way);
  - disables the new-role users;
  - deletes the `crm:` grants and permissions;
  - deletes roles 101-104 only if no user references them;
  - drops each of the 15 tables only if it still carries 002's signature column;
  - drops 002's keys, then its columns.

  It never touches a legacy column or the pre-existing `intake` table.
- **Level 1 for 001: `rollback/001-counsellor-hierarchy.rollback.sql`**, after exporting
  `counsellor_group` and `users.team_id` / `reports_to` / `employee_code`. Team membership
  survives in `sales_team.members`.

Both rollbacks are re-runnable. Both were rehearsed on the production schema: apply, roll
back, compare and re-apply. Each time, the schema came back identical except for
AUTO_INCREMENT counters (`user_role` 9 -> 105 on purpose; `permissions` 99 -> 117 and
`role_permissions` 17 -> 93, because rows were inserted and then deleted), and the legacy
data was untouched.

## Writing the next migration (003)

Follow 002's conventions:

- **Guards.** Guard every CREATE and ALTER through `information_schema` + PREPARE. Put each
  table's columns in one `ALGORITHM=INSTANT` ALTER, and its keys in one
  `ALGORITHM=INPLACE, LOCK=NONE` ALTER.
- **Additive only.** Add new columns as NULLable at the end of the table. No foreign keys,
  triggers or generated columns.
- **Collations.** Compare one table's column with another table's only under an explicit
  `COLLATE`: production mixes `utf8mb4_general_ci` and `utf8mb4_unicode_ci`.
- **Legacy data rules.**
  - JSON ids are JSON strings: `JSON_UNQUOTE` them.
  - `applications.status` NULL means active.
  - `is_archived = 1` is an LMS draft, not a rejection.
- **Permissions.** Grant only `crm:` slugs, and never to role 1. The LMS reads role 1's grants
  as a deny list.
- **New roles.** Give them explicit ids, guarded like 002's section 0c, above the current
  `user_role` AUTO_INCREMENT (105 right after 002, but a role created on the LMS or CRM
  screen takes the next id). The LMS hard-codes 1-11.
- **Literals.** Keep every literal ASCII, and spell booleans `BOOLEAN`.
- **Rehearse before production.** Run the migration twice on the MariaDB production-schema
  replica, with production-shaped synthetic rows, and on MySQL 8. Then run the drift check on
  both.
