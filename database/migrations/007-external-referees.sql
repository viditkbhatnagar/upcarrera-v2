-- =====================================================================
-- 007 - External referees + reference lead sources (Add New Lead)
--
-- The Add New Lead form gains a required reference when the Source is
-- "Student Reference" (stored in applications.referred_by, which already exists)
-- or "External Reference" (a person outside the school, stored here):
--
--   external_referee               new table: name, email, phone, state, district
--   applications.external_referee_id  NULLable int, appended last, indexed
--   lead_source rows               'Student Reference', 'External Reference' and
--                                  the five other sources of the design, inserted
--                                  only when the title is missing. Existing rows
--                                  are never modified or deleted.
--   crm:referees.view / .manage    2 permissions, granted to the counsellor and
--                                  admin roles (never role 1: super admin bypasses)
--
-- SAFETY. Additive and idempotent: CREATE TABLE IF NOT EXISTS, a guarded INSTANT
-- ALTER and a guarded ONLINE ALTER for the column and its key, INSERT ... WHERE
-- NOT EXISTS for every row. No foreign keys, no data rewritten. Re-runnable: a
-- second run only prints the same verification numbers.
--
-- APPLY (as MariaDB root, after a backup; the app user is DML-only):
--   mysql --defaults-file=<creds> lms_upcarrera < database/migrations/007-external-referees.sql
-- or via CyberPanel phpMyAdmin: pick lms_upcarrera, then Import this file.
-- Apply AFTER 002 (needs user_role.role_key, permissions, role_permissions).
-- DO NOT use prisma db push. Then pm2 reload the API so the permission cache
-- loads the new grants. Deploy the API and apply this together: the new code
-- without this table would fail every /external-referees call.
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
  'SELECT 1 FROM `STOP_007_apply_002_first`');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------
-- 1. The external_referee table.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `external_referee` (
  `id`         int          NOT NULL AUTO_INCREMENT,
  `name`       varchar(255) NOT NULL,
  `email`      varchar(255) NOT NULL,
  `phone`      varchar(30)  NOT NULL,
  `state`      varchar(100) NOT NULL,
  `district`   varchar(100) NOT NULL,
  `created_by` int          DEFAULT NULL,
  `created_at` datetime     DEFAULT NULL,
  `updated_at` datetime     DEFAULT NULL,
  `deleted_at` datetime     DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_external_referee_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 2. applications.external_referee_id (INSTANT) and its key (ONLINE).
-- ---------------------------------------------------------------------
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications'
      AND COLUMN_NAME = 'external_referee_id') = 0,
  'ALTER TABLE `applications` ADD COLUMN `external_referee_id` int DEFAULT NULL, ALGORITHM=INSTANT',
  'SELECT ''applications.external_referee_id already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @bad := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications'
    AND COLUMN_NAME = 'external_referee_id' AND DATA_TYPE <> 'int');
SET @stmt := IF(@bad = 0,
  'SELECT ''guard: applications.external_referee_id is int'' AS note',
  'SELECT 1 FROM `STOP_007_external_referee_id_wrong_type`');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications'
      AND INDEX_NAME = 'idx_applications_external_referee') = 0,
  'ALTER TABLE `applications` ADD KEY `idx_applications_external_referee` (`external_referee_id`), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''idx_applications_external_referee already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------
-- 3. Lead sources, only when the title is missing. Nothing existing is touched.
-- ---------------------------------------------------------------------
INSERT INTO `lead_source` (`title`, `created_at`)
SELECT 'Student Reference', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `lead_source` WHERE `title` = 'Student Reference' AND `deleted_at` IS NULL);
INSERT INTO `lead_source` (`title`, `created_at`)
SELECT 'External Reference', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `lead_source` WHERE `title` = 'External Reference' AND `deleted_at` IS NULL);
INSERT INTO `lead_source` (`title`, `created_at`)
SELECT 'Inbound Web', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `lead_source` WHERE `title` = 'Inbound Web' AND `deleted_at` IS NULL);
INSERT INTO `lead_source` (`title`, `created_at`)
SELECT 'Walk-in', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `lead_source` WHERE `title` = 'Walk-in' AND `deleted_at` IS NULL);
INSERT INTO `lead_source` (`title`, `created_at`)
SELECT 'Social Media', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `lead_source` WHERE `title` = 'Social Media' AND `deleted_at` IS NULL);
INSERT INTO `lead_source` (`title`, `created_at`)
SELECT 'Paid Ads', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `lead_source` WHERE `title` = 'Paid Ads' AND `deleted_at` IS NULL);
INSERT INTO `lead_source` (`title`, `created_at`)
SELECT 'Event', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `lead_source` WHERE `title` = 'Event' AND `deleted_at` IS NULL);

-- ---------------------------------------------------------------------
-- 4. Permissions (title and slug are varchar(50)).
-- ---------------------------------------------------------------------
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM referees view', 'crm:referees.view', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:referees.view' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM referees manage', 'crm:referees.manage', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:referees.manage' AND `deleted_at` IS NULL);

-- ---------------------------------------------------------------------
-- 5. Grants, by role_key. Never role 1 (r.id <> 1 is belt and braces).
-- ---------------------------------------------------------------------
INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_on`)
SELECT r.`id`, p.`id`, UTC_TIMESTAMP()
  FROM `user_role` r
  JOIN `permissions` p ON p.`deleted_at` IS NULL AND p.`slug` IN (
       'crm:referees.view', 'crm:referees.manage')
 WHERE r.`role_key` = 'counsellor' AND r.`id` <> 1
   AND NOT EXISTS (SELECT 1 FROM `role_permissions` rp
                    WHERE rp.`role_id` = r.`id` AND rp.`permission_id` = p.`id` AND rp.`deleted_at` IS NULL);

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_on`)
SELECT r.`id`, p.`id`, UTC_TIMESTAMP()
  FROM `user_role` r
  JOIN `permissions` p ON p.`deleted_at` IS NULL AND p.`slug` IN (
       'crm:referees.view', 'crm:referees.manage')
 WHERE r.`role_key` = 'admin' AND r.`id` <> 1
   AND NOT EXISTS (SELECT 1 FROM `role_permissions` rp
                    WHERE rp.`role_id` = r.`id` AND rp.`permission_id` = p.`id` AND rp.`deleted_at` IS NULL);

-- ---------------------------------------------------------------------
-- 6. Verification (want 1; 1; 2; counsellor 2; admin 2; role 1 0; 2).
--    Grant counts are 0 if that role_key does not exist in this database.
-- ---------------------------------------------------------------------
SELECT 'external_referee table (want 1)' AS metric, COUNT(*) AS value
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'external_referee'
UNION ALL
SELECT 'applications.external_referee_id column (want 1)', COUNT(*)
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications'
   AND COLUMN_NAME = 'external_referee_id'
UNION ALL
SELECT 'referee permissions (want 2)', COUNT(*)
  FROM `permissions`
 WHERE `slug` IN ('crm:referees.view', 'crm:referees.manage') AND `deleted_at` IS NULL
UNION ALL
SELECT 'counsellor grants (want 2)', COUNT(*)
  FROM `role_permissions` rp
  JOIN `user_role` r ON r.`id` = rp.`role_id` AND r.`role_key` = 'counsellor'
  JOIN `permissions` p ON p.`id` = rp.`permission_id`
 WHERE p.`slug` IN ('crm:referees.view', 'crm:referees.manage') AND rp.`deleted_at` IS NULL
UNION ALL
SELECT 'admin grants (want 2)', COUNT(*)
  FROM `role_permissions` rp
  JOIN `user_role` r ON r.`id` = rp.`role_id` AND r.`role_key` = 'admin'
  JOIN `permissions` p ON p.`id` = rp.`permission_id`
 WHERE p.`slug` IN ('crm:referees.view', 'crm:referees.manage') AND rp.`deleted_at` IS NULL
UNION ALL
SELECT 'grants to role 1 (want 0)', COUNT(*)
  FROM `role_permissions` rp
  JOIN `permissions` p ON p.`id` = rp.`permission_id`
 WHERE rp.`role_id` = 1 AND rp.`deleted_at` IS NULL
   AND p.`slug` IN ('crm:referees.view', 'crm:referees.manage')
UNION ALL
SELECT 'reference lead sources (want 2)', COUNT(*)
  FROM `lead_source`
 WHERE `title` IN ('Student Reference', 'External Reference') AND `deleted_at` IS NULL;
