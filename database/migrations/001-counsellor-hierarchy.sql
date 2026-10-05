-- =====================================================================
-- 001 — Counsellor hierarchy: Group -> Team -> Counsellor
--
-- Phase 1 spec, Module 2. Closes QA C05, C06, G01, G02 and T03, and provides
-- the record access (own / team / group) every other Phase 1 permission needs.
--
-- WHY THIS EXISTS
--   There is no counsellor hierarchy in the database today:
--     * `users` has no team, no group, no reporting line and no employee code.
--       `users.code` is the phone DIAL CODE — 91 for every Indian user — which
--       is why all 35 counsellors rendered as "UC-91" and every View link
--       opened the same person.
--     * Team membership lives only inside `sales_team.members`, a LongText JSON
--       array. It can be read team -> member but never member -> team, and it
--       cannot be indexed or filtered in SQL.
--     * `sales_team.leader` is a VarChar holding a users.id, with no join.
--     * There is no counsellor-group table at all. `group_courses` is course
--       bundles for universities — something else entirely.
--
-- SAFETY — READ THIS BEFORE RUNNING
--   This database is SHARED WITH THE LIVE LMS (lms.upcarrera.com). Every
--   statement below is therefore strictly ADDITIVE:
--     * one new table, which the LMS cannot be affected by because it does not
--       know the table exists;
--     * new columns that are all NULLable with no default, so existing INSERTs
--       that omit them keep working and `SELECT *` consumers are unaffected.
--   NOTHING existing is renamed, retyped, dropped, or made NOT NULL.
--
--   `sales_team.members` and `sales_team.leader` are deliberately LEFT IN PLACE
--   and are kept in sync by the API, so any legacy PHP or LMS code still reading
--   them keeps working throughout the transition.
--
--   DO NOT APPLY THIS WITH `prisma db push`. That command diffs the entire
--   schema and will drop or alter legacy columns Prisma does not model — the
--   repo's DEPLOY.md already warns against it. Apply this file by hand:
--
--     mysql --defaults-file=<chmod-600 creds file> upcarrera \
--           < database/migrations/001-counsellor-hierarchy.sql
--
--   Take a backup first, and smoke-test lms.upcarrera.com afterwards.
--
--   Re-runnable: every statement is guarded, so applying twice is a no-op.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The group — the top of the hierarchy, owned by a Manager.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `counsellor_group` (
  `id`         int NOT NULL AUTO_INCREMENT,
  `code`       varchar(32)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name`       varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- users.id of the group manager. Intentionally NOT a foreign key: no other
  -- table in this legacy schema declares one, and introducing the first FK on a
  -- table the LMS also writes to would turn one of their bad writes into a hard
  -- error. Referential integrity is enforced in the API instead.
  `manager_id` int DEFAULT NULL,
  `status`     int DEFAULT 1,
  `created_by` int DEFAULT NULL,
  `updated_by` int DEFAULT NULL,
  `deleted_by` int DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_counsellor_group_code` (`code`),
  KEY `idx_counsellor_group_manager` (`manager_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2. Team -> Group.
-- ---------------------------------------------------------------------
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_team'
      AND COLUMN_NAME = 'group_id') = 0,
  'ALTER TABLE `sales_team` ADD COLUMN `group_id` int DEFAULT NULL, ADD KEY `idx_sales_team_group` (`group_id`)',
  'SELECT "sales_team.group_id already present" AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- `sales_team.leader` stays VarChar(10) holding a users.id. Retyping it to INT
-- would be a destructive change to a column the LMS may read, and the API
-- already resolves it to a name (SalesService.decorateTeams). Left alone.

-- ---------------------------------------------------------------------
-- 3. Counsellor -> Team, the reporting line, and a real employee code.
--
--    A counsellor belongs to exactly ONE team (Phase 1 spec 2.2), so this is a
--    column on `users` rather than a join table — and unlike sales_team.members
--    it can be queried in BOTH directions and indexed.
-- ---------------------------------------------------------------------
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'team_id') = 0,
  'ALTER TABLE `users` ADD COLUMN `team_id` int DEFAULT NULL, ADD KEY `idx_users_team` (`team_id`)',
  'SELECT "users.team_id already present" AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- The Team Leader or Manager this user reports to. Spec 1.1 makes it required
-- for the Counsellor and Team Leader roles; that is enforced in the API, not by
-- the column, so the ~974 existing LMS student rows stay valid.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'reports_to') = 0,
  'ALTER TABLE `users` ADD COLUMN `reports_to` int DEFAULT NULL, ADD KEY `idx_users_reports_to` (`reports_to`)',
  'SELECT "users.reports_to already present" AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- The hand-entered employee id the spec asks for ("UC-1024"), which must never
-- again be derived from the phone dial code. NULLable because the legacy LMS
-- users will never have one; UNIQUE so the ones that do cannot collide (MySQL
-- permits many NULLs under a unique index).
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'employee_code') = 0,
  'ALTER TABLE `users` ADD COLUMN `employee_code` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL, ADD UNIQUE KEY `uq_users_employee_code` (`employee_code`)',
  'SELECT "users.employee_code already present" AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------
-- 4. Backfill users.team_id from the existing sales_team.members JSON.
--
--    MySQL 8 reads the JSON array directly, so existing memberships are carried
--    over rather than re-entered by hand. A counsellor listed in more than one
--    team lands in the lowest team id; the API prevents that recurring.
--
--    sales_team.members is NOT cleared — it remains the legacy read path.
-- ---------------------------------------------------------------------
UPDATE `users` u
JOIN (
  SELECT CAST(jt.user_id AS UNSIGNED) AS user_id, MIN(t.id) AS team_id
    FROM `sales_team` t
    JOIN JSON_TABLE(
           CASE WHEN JSON_VALID(t.members) THEN t.members ELSE '[]' END,
           '$[*]' COLUMNS (user_id JSON PATH '$')
         ) jt ON TRUE
   WHERE t.deleted_at IS NULL
     AND CAST(jt.user_id AS UNSIGNED) > 0
   GROUP BY CAST(jt.user_id AS UNSIGNED)
) m ON m.user_id = u.id
   SET u.team_id = m.team_id
 WHERE u.team_id IS NULL;

-- ---------------------------------------------------------------------
-- 5. Verification — run these and read the numbers before walking away.
-- ---------------------------------------------------------------------
SELECT 'counsellors with a team'     AS metric, COUNT(*) AS value
  FROM `users` WHERE role_id = 6 AND deleted_at IS NULL AND team_id IS NOT NULL
UNION ALL
SELECT 'counsellors without a team', COUNT(*)
  FROM `users` WHERE role_id = 6 AND deleted_at IS NULL AND team_id IS NULL
UNION ALL
SELECT 'teams',                      COUNT(*) FROM `sales_team` WHERE deleted_at IS NULL
UNION ALL
SELECT 'teams assigned to a group',  COUNT(*) FROM `sales_team` WHERE deleted_at IS NULL AND group_id IS NOT NULL
UNION ALL
SELECT 'groups',                     COUNT(*) FROM `counsellor_group` WHERE deleted_at IS NULL
UNION ALL
SELECT 'users with an employee_code', COUNT(*) FROM `users` WHERE employee_code IS NOT NULL;

-- Expected on first run against production: roughly 3 counsellors with a team
-- and 32 without (only three of the thirty-five are in any sales_team today),
-- 2 teams, 0 teams in a group, 0 groups, 0 employee codes.
--
-- Those zeros are CORRECT. Groups are created by operations through the UI once
-- this lands, and employee codes are entered by hand. QA should expect the Group
-- and Manager columns to stay blank until then and should NOT log it as a
-- regression.
