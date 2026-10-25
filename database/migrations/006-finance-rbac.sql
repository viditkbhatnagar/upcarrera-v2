-- =====================================================================
-- 006 - Finance RBAC: lock down the legacy finance endpoints
--
-- The legacy finance controllers (invoices, payments, fee types, commission
-- plans, fee-management, finance reports, student/university commission) had
-- no @RequirePermission, so any authenticated user could call them. The API now
-- guards every route with one of two slugs defined here:
--
--   crm:finance.view     every GET   (lists, details, PDFs, reports)
--   crm:finance.manage   every POST / PATCH / PUT / DELETE
--
-- GRANTS (by role_key, never role 1 - Super Admin bypasses PermissionsGuard):
--   accounts, admin   both slugs
-- Counsellors and every other role get neither. The counsellor's own
-- /counsellor-payments keeps crm:payments.index and is unaffected.
--
-- SAFETY. Strictly additive DML: 2 permission rows and their grants. No table
-- or column is touched. Re-runnable: every statement is guarded, so a second
-- run only prints the same verification numbers.
--
-- APPLY (as MariaDB root, after a backup; the app user is DML-only):
--   mysql --defaults-file=<creds> lms_upcarrera < database/migrations/006-finance-rbac.sql
-- or via CyberPanel phpMyAdmin: pick lms_upcarrera, then Import this file.
-- Apply AFTER 002 (needs user_role.role_key, permissions, role_permissions).
-- DO NOT use prisma db push. Then pm2 reload the API so the permission cache
-- loads the new grants. Deploy the API and apply this together: the new code
-- without these grants would lock accounts/admin out of finance.
--
-- All literals are ASCII; every comparison is column = literal, so mixed
-- legacy collations cannot raise "Illegal mix of collations".
-- =====================================================================

SET SESSION lock_wait_timeout = 10;
SET SESSION innodb_lock_wait_timeout = 10;

-- ---------------------------------------------------------------------
-- 0. Guard: grants resolve roles through user_role.role_key (added by 002).
-- ---------------------------------------------------------------------
SET @has_role_key := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_role' AND COLUMN_NAME = 'role_key');
SET @stmt := IF(@has_role_key = 1,
  'SELECT ''guard 0 passed: user_role.role_key exists (002 applied)'' AS note',
  'SELECT 1 FROM `STOP_006_apply_002_first`');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------
-- 1. Permissions (title and slug are varchar(50)).
-- ---------------------------------------------------------------------
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM finance view', 'crm:finance.view', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:finance.view' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM finance manage', 'crm:finance.manage', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:finance.manage' AND `deleted_at` IS NULL);

-- ---------------------------------------------------------------------
-- 2. Grants, by role_key. Never role 1 (r.id <> 1 is belt and braces).
-- ---------------------------------------------------------------------
INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_on`)
SELECT r.`id`, p.`id`, UTC_TIMESTAMP()
  FROM `user_role` r
  JOIN `permissions` p ON p.`deleted_at` IS NULL AND p.`slug` IN (
       'crm:finance.view', 'crm:finance.manage')
 WHERE r.`role_key` = 'accounts' AND r.`id` <> 1
   AND NOT EXISTS (SELECT 1 FROM `role_permissions` rp
                    WHERE rp.`role_id` = r.`id` AND rp.`permission_id` = p.`id` AND rp.`deleted_at` IS NULL);

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_on`)
SELECT r.`id`, p.`id`, UTC_TIMESTAMP()
  FROM `user_role` r
  JOIN `permissions` p ON p.`deleted_at` IS NULL AND p.`slug` IN (
       'crm:finance.view', 'crm:finance.manage')
 WHERE r.`role_key` = 'admin' AND r.`id` <> 1
   AND NOT EXISTS (SELECT 1 FROM `role_permissions` rp
                    WHERE rp.`role_id` = r.`id` AND rp.`permission_id` = p.`id` AND rp.`deleted_at` IS NULL);

-- ---------------------------------------------------------------------
-- 3. Verification (want 2; accounts 2; admin 2; role 1 0; counsellor 0).
--    Grant counts are 0 if that role_key does not exist in this database.
-- ---------------------------------------------------------------------
SELECT 'finance permissions (want 2)' AS metric, COUNT(*) AS value
  FROM `permissions`
 WHERE `slug` IN ('crm:finance.view', 'crm:finance.manage') AND `deleted_at` IS NULL
UNION ALL
SELECT 'accounts grants (want 2)', COUNT(*)
  FROM `role_permissions` rp
  JOIN `user_role` r ON r.`id` = rp.`role_id` AND r.`role_key` = 'accounts'
  JOIN `permissions` p ON p.`id` = rp.`permission_id`
 WHERE p.`slug` IN ('crm:finance.view', 'crm:finance.manage') AND rp.`deleted_at` IS NULL
UNION ALL
SELECT 'admin grants (want 2)', COUNT(*)
  FROM `role_permissions` rp
  JOIN `user_role` r ON r.`id` = rp.`role_id` AND r.`role_key` = 'admin'
  JOIN `permissions` p ON p.`id` = rp.`permission_id`
 WHERE p.`slug` IN ('crm:finance.view', 'crm:finance.manage') AND rp.`deleted_at` IS NULL
UNION ALL
SELECT 'grants to role 1 (want 0)', COUNT(*)
  FROM `role_permissions` rp
  JOIN `permissions` p ON p.`id` = rp.`permission_id`
 WHERE rp.`role_id` = 1 AND rp.`deleted_at` IS NULL
   AND p.`slug` IN ('crm:finance.view', 'crm:finance.manage')
UNION ALL
SELECT 'counsellor grants (want 0)', COUNT(*)
  FROM `role_permissions` rp
  JOIN `user_role` r ON r.`id` = rp.`role_id` AND r.`role_key` = 'counsellor'
  JOIN `permissions` p ON p.`id` = rp.`permission_id`
 WHERE p.`slug` IN ('crm:finance.view', 'crm:finance.manage') AND rp.`deleted_at` IS NULL;
