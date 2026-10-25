-- =====================================================================
-- 005 - Counsellor portal Phase 3: Payments permission, Training, Resources
--
-- Backs the three net-new counsellor screens.
--
--   * Payments   NO new table. The screen reads student_payments, invoice,
--                payment, student_special_fees and specialisations through the
--                new GET /payments endpoint. This file only adds its permission.
--   * Training   training_video (the catalogue) + training_video_completion
--                (one row per counsellor who marked a video complete).
--   * Resources  counsellor_resource (downloadable posters / PDFs / decks /
--                videos / eBooks, grouped into folders by `category`). It is
--                NOT the legacy `resources` / `resource_category` file browser,
--                which keeps working untouched.
--
-- PERMISSIONS (crm:-namespaced, never granted to role 1 - see 002 section 8)
--   crm:payments.index    counsellor, admin   GET /payments, GET /payments/:id
--   crm:training.view     counsellor, admin   GET /training-videos, POST .../complete
--   crm:training.manage   admin               POST/PATCH/DELETE /training-videos
--   crm:resources.view    counsellor, admin   GET /counsellor-resources
--   crm:resources.manage  admin               POST/PATCH/DELETE /counsellor-resources
--   Role 1 (Super Admin) passes PermissionsGuard regardless.
--
-- SEED. Three placeholder rows per table so the screens are not empty on the
-- first load. They have NO video_url / file_url (nothing real exists to link):
-- the screens show them as "not available yet". Replace them through the
-- admin endpoints (or UPDATE ... SET video_url / file_url) with real content.
-- Seeds are written only while the table is completely empty, so deleting a
-- seed row never brings it back on a re-run.
--
-- SAFETY. Strictly additive: 3 new tables the LMS does not know about, 5 new
-- crm: permission rows, and grants to roles 6 ('counsellor') and 'admin'. No
-- existing table or column is touched. Re-runnable: every statement is
-- guarded, so a second run only prints notes and the same verification
-- numbers.
--
-- APPLY (as MariaDB root, after a backup; the app user is DML-only):
--   mysql --defaults-file=<creds> lms_upcarrera < database/migrations/005-counsellor-portal-modules.sql
-- or via CyberPanel phpMyAdmin: select lms_upcarrera, Import this file. Apply
-- AFTER 002 (it needs user_role.role_key, permissions and role_permissions).
-- If phpMyAdmin's Import resolves DATABASE() to information_schema (as it did
-- for 003 and 004), pick the lms_upcarrera database first, or run the
-- CREATE TABLE statements fully qualified in the SQL tab.
-- DO NOT use prisma db push. Then pm2 reload the API so the permission cache
-- loads the new grants.
--
-- All literals are ASCII; every comparison is column = literal, so the mixed
-- legacy collations cannot raise "Illegal mix of collations". Timestamps use
-- UTC_TIMESTAMP() to match what Prisma writes.
-- =====================================================================

SET SESSION lock_wait_timeout = 10;
SET SESSION innodb_lock_wait_timeout = 10;

-- ---------------------------------------------------------------------
-- 0. Guards. A table with one of this file's names that lacks this file's
--    signature column is someone else's table: stop before creating anything.
-- ---------------------------------------------------------------------
SET @foreign_tables := (
  SELECT COUNT(*)
    FROM information_schema.TABLES t
   WHERE t.TABLE_SCHEMA = DATABASE()
     AND t.TABLE_NAME IN ('training_video', 'training_video_completion', 'counsellor_resource')
     AND NOT EXISTS (
           SELECT 1 FROM information_schema.COLUMNS c
            WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA
              AND c.TABLE_NAME   = t.TABLE_NAME
              AND c.COLUMN_NAME  = CASE t.TABLE_NAME
                    WHEN 'training_video'            THEN 'duration_seconds'
                    WHEN 'training_video_completion' THEN 'completed_at'
                    WHEN 'counsellor_resource'       THEN 'file_size_bytes'
                  END));
SET @stmt := IF(@foreign_tables = 0,
  'SELECT ''guard 0a passed: no foreign table uses a 005 table name'' AS note',
  'SELECT 1 FROM `STOP_005_table_name_taken_by_a_foreign_table`');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 0b. Section 3 resolves the roles through user_role.role_key (added by 002).
SET @has_role_key := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_role' AND COLUMN_NAME = 'role_key');
SET @stmt := IF(@has_role_key = 1,
  'SELECT ''guard 0b passed: user_role.role_key exists (002 applied)'' AS note',
  'SELECT 1 FROM `STOP_005_apply_002_first`');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------
-- 1. Tables (CREATE TABLE IF NOT EXISTS: re-runs are no-ops).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `training_video` (
  `id`               int NOT NULL AUTO_INCREMENT,
  `title`            varchar(200) NOT NULL,
  `description`      text DEFAULT NULL,
  `category`         varchar(80) NOT NULL DEFAULT 'General',
  `video_url`        varchar(500) DEFAULT NULL,
  `thumbnail_url`    varchar(500) DEFAULT NULL,
  `duration_seconds` int DEFAULT NULL,
  `sort_order`       int NOT NULL DEFAULT 0,
  `status`           tinyint(1) NOT NULL DEFAULT 1,
  `created_by`       int DEFAULT NULL,
  `updated_by`       int DEFAULT NULL,
  `created_at`       datetime DEFAULT NULL,
  `updated_at`       datetime DEFAULT NULL,
  `deleted_at`       datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_training_video_status` (`status`, `sort_order`),
  KEY `idx_training_video_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `training_video_completion` (
  `id`           int NOT NULL AUTO_INCREMENT,
  `video_id`     int NOT NULL,
  `user_id`      int NOT NULL,
  `completed_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_training_completion` (`video_id`, `user_id`),
  KEY `idx_training_completion_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `counsellor_resource` (
  `id`              int NOT NULL AUTO_INCREMENT,
  `title`           varchar(200) NOT NULL,
  `description`     text DEFAULT NULL,
  `type`            varchar(24) NOT NULL DEFAULT 'PDF',
  `file_url`        varchar(500) DEFAULT NULL,
  `category`        varchar(80) NOT NULL DEFAULT 'General',
  `file_size_bytes` int DEFAULT NULL,
  `sort_order`      int NOT NULL DEFAULT 0,
  `status`          tinyint(1) NOT NULL DEFAULT 1,
  `created_by`      int DEFAULT NULL,
  `updated_by`      int DEFAULT NULL,
  `created_at`      datetime DEFAULT NULL,
  `updated_at`      datetime DEFAULT NULL,
  `deleted_at`      datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_cresource_status_category` (`status`, `category`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2. Permissions (title and slug are varchar(50)).
-- ---------------------------------------------------------------------
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM payments list', 'crm:payments.index', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:payments.index' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM training view', 'crm:training.view', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:training.view' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM training manage', 'crm:training.manage', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:training.manage' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM resources view', 'crm:resources.view', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:resources.view' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM resources manage', 'crm:resources.manage', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:resources.manage' AND `deleted_at` IS NULL);

-- ---------------------------------------------------------------------
-- 3. Grants, by role_key. Never role 1 (r.id <> 1 is belt and braces).
-- ---------------------------------------------------------------------
INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_on`)
SELECT r.`id`, p.`id`, UTC_TIMESTAMP()
  FROM `user_role` r
  JOIN `permissions` p ON p.`deleted_at` IS NULL AND p.`slug` IN (
       'crm:payments.index', 'crm:training.view', 'crm:resources.view')
 WHERE r.`role_key` = 'counsellor' AND r.`id` <> 1
   AND NOT EXISTS (SELECT 1 FROM `role_permissions` rp
                    WHERE rp.`role_id` = r.`id` AND rp.`permission_id` = p.`id` AND rp.`deleted_at` IS NULL);

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_on`)
SELECT r.`id`, p.`id`, UTC_TIMESTAMP()
  FROM `user_role` r
  JOIN `permissions` p ON p.`deleted_at` IS NULL AND p.`slug` IN (
       'crm:payments.index', 'crm:training.view', 'crm:training.manage',
       'crm:resources.view', 'crm:resources.manage')
 WHERE r.`role_key` = 'admin' AND r.`id` <> 1
   AND NOT EXISTS (SELECT 1 FROM `role_permissions` rp
                    WHERE rp.`role_id` = r.`id` AND rp.`permission_id` = p.`id` AND rp.`deleted_at` IS NULL);

-- ---------------------------------------------------------------------
-- 4. Placeholder seeds, only into a completely empty table. No URLs: replace
--    with real content (see the header).
-- ---------------------------------------------------------------------
SET @tv_rows := (SELECT COUNT(*) FROM `training_video`);
INSERT INTO `training_video` (`title`, `description`, `category`, `sort_order`, `status`, `created_at`, `updated_at`)
SELECT 'Admission process walkthrough',
       'How an application moves from a new lead to a confirmed enrolment.',
       'Admission Process', 1, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM DUAL WHERE @tv_rows = 0
UNION ALL
SELECT 'Using the counsellor portal',
       'A tour of the dashboard, your students, payments and reports.',
       'Product Training', 2, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM DUAL WHERE @tv_rows = 0
UNION ALL
SELECT 'Handling student objections',
       'Practical ways to answer the questions prospective students ask most.',
       'Sales Training', 3, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM DUAL WHERE @tv_rows = 0;

SET @cr_rows := (SELECT COUNT(*) FROM `counsellor_resource`);
INSERT INTO `counsellor_resource` (`title`, `description`, `type`, `category`, `sort_order`, `status`, `created_at`, `updated_at`)
SELECT 'Programme brochure',
       'Overview of the programmes upCarrera offers.',
       'PDF', 'Brochures', 1, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM DUAL WHERE @cr_rows = 0
UNION ALL
SELECT 'Admissions open poster',
       'Poster for social media and campus visits.',
       'Poster', 'Marketing Assets', 2, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM DUAL WHERE @cr_rows = 0
UNION ALL
SELECT 'Counsellor pitch deck',
       'Presentation to use in student and parent meetings.',
       'Presentation', 'Sales Kit', 3, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM DUAL WHERE @cr_rows = 0;

-- ---------------------------------------------------------------------
-- 5. Verification (first run: 3, 5, then counsellor 3, admin 5, then 3 and 3
--    seed rows on a fresh database; later runs print the live row counts).
-- ---------------------------------------------------------------------
SELECT 'tables (want 3)' AS metric, COUNT(*) AS value
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME IN ('training_video', 'training_video_completion', 'counsellor_resource')
UNION ALL
SELECT 'crm: permissions added (want 5)', COUNT(*)
  FROM `permissions`
 WHERE `slug` IN ('crm:payments.index', 'crm:training.view', 'crm:training.manage',
                  'crm:resources.view', 'crm:resources.manage')
   AND `deleted_at` IS NULL
UNION ALL
SELECT 'counsellor grants (want 3)', COUNT(*)
  FROM `role_permissions` rp
  JOIN `user_role` r ON r.`id` = rp.`role_id` AND r.`role_key` = 'counsellor'
  JOIN `permissions` p ON p.`id` = rp.`permission_id`
 WHERE p.`slug` IN ('crm:payments.index', 'crm:training.view', 'crm:resources.view')
   AND rp.`deleted_at` IS NULL
UNION ALL
SELECT 'admin grants (want 5)', COUNT(*)
  FROM `role_permissions` rp
  JOIN `user_role` r ON r.`id` = rp.`role_id` AND r.`role_key` = 'admin'
  JOIN `permissions` p ON p.`id` = rp.`permission_id`
 WHERE p.`slug` IN ('crm:payments.index', 'crm:training.view', 'crm:training.manage',
                    'crm:resources.view', 'crm:resources.manage')
   AND rp.`deleted_at` IS NULL
UNION ALL
SELECT 'grants to role 1 (want 0)', COUNT(*)
  FROM `role_permissions` rp
  JOIN `permissions` p ON p.`id` = rp.`permission_id`
 WHERE rp.`role_id` = 1 AND rp.`deleted_at` IS NULL
   AND p.`slug` IN ('crm:payments.index', 'crm:training.view', 'crm:training.manage',
                    'crm:resources.view', 'crm:resources.manage')
UNION ALL
SELECT 'training_video rows (info)', COUNT(*) FROM `training_video`
UNION ALL
SELECT 'counsellor_resource rows (info)', COUNT(*) FROM `counsellor_resource`;
