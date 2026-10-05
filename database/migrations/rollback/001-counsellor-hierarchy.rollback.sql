-- =====================================================================
-- ROLLBACK of 001 - Counsellor hierarchy. DESTRUCTIVE. LAST RESORT.
--
-- Roll back 002 FIRST (rollback/002-phase1-admission.rollback.sql): the
-- Phase 1 record access is built on these columns. As with 002, reverting
-- the code does not require this file - the columns are NULLable and inert.
--
-- BEFORE RUNNING, export what this file destroys (it has no other copy):
--   mysqldump --defaults-file=<creds> lms_upcarrera counsellor_group > 001-groups-<date>.sql
--   mysql --defaults-file=<creds> lms_upcarrera -e "SELECT id, team_id, reports_to,
--     employee_code FROM users WHERE team_id IS NOT NULL OR reports_to IS NOT NULL
--     OR employee_code IS NOT NULL" > 001-users-<date>.tsv
--   mysql --defaults-file=<creds> lms_upcarrera -e "SELECT id, group_id FROM sales_team
--     WHERE group_id IS NOT NULL" > 001-teams-<date>.tsv
-- Team MEMBERSHIP survives in the legacy sales_team.members JSON, which 001
-- never cleared and the API kept in sync. Apply as MariaDB root, after a
-- backup; re-running it is a no-op.
-- =====================================================================

SET SESSION lock_wait_timeout = 5;
SET SESSION innodb_lock_wait_timeout = 5;

SET @dropkeys := CONCAT_WS(', ',
  IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_team') > 0,         'DROP KEY `idx_users_team`', NULL),
  IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_reports_to') > 0,   'DROP KEY `idx_users_reports_to`', NULL),
  IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'uq_users_employee_code') > 0, 'DROP KEY `uq_users_employee_code`', NULL));
SET @stmt := IF(@dropkeys = '', 'SELECT ''users: no 001 keys left'' AS note', CONCAT('ALTER TABLE `users` ', @dropkeys, ', ALGORITHM=INPLACE, LOCK=NONE'));
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @dropcols := CONCAT_WS(', ',
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'team_id') > 0,       'DROP COLUMN `team_id`', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'reports_to') > 0,    'DROP COLUMN `reports_to`', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'employee_code') > 0, 'DROP COLUMN `employee_code`', NULL));
SET @stmt := IF(@dropcols = '', 'SELECT ''users: no 001 columns left'' AS note', CONCAT('ALTER TABLE `users` ', @dropcols, ', ALGORITHM=INSTANT'));
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_team' AND INDEX_NAME = 'idx_sales_team_group') > 0,
  'ALTER TABLE `sales_team` DROP KEY `idx_sales_team_group`, ALGORITHM=INPLACE, LOCK=NONE', 'SELECT ''sales_team: no 001 key left'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
SET @stmt := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_team' AND COLUMN_NAME = 'group_id') > 0,
  'ALTER TABLE `sales_team` DROP COLUMN `group_id`, ALGORITHM=INSTANT', 'SELECT ''sales_team: no 001 column left'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- counsellor_group, only if it is 001's (it carries manager_id).
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'counsellor_group' AND COLUMN_NAME = 'manager_id') > 0,
  'DROP TABLE `counsellor_group`', 'SELECT ''counsellor_group absent (or not 001''''s) - left alone'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SELECT '001 columns left (expect 0)' AS metric, COUNT(*) AS value
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND ((TABLE_NAME = 'users' AND COLUMN_NAME IN ('team_id', 'reports_to', 'employee_code'))
     OR (TABLE_NAME = 'sales_team' AND COLUMN_NAME = 'group_id'))
UNION ALL
SELECT 'counsellor_group present (expect 0)', COUNT(*)
  FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'counsellor_group';
