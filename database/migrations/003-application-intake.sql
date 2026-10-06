-- =====================================================================
-- 003 - applications.intake_id (IN04 catalog cascade)
--
-- Phase 1 IN04 lets Add Lead cascade university -> course -> open intake and
-- store the chosen intake on the application. Migration 002 added the catalog
-- tables (university_course, university_course_intake) and intake.session_id
-- (the legacy sessions bridge), but NOT a column to record which intake an
-- application is for. This adds it.
--
--   applications.intake_id  the intake.id (v2 master) the student applies for.
--                           NULL for every existing/legacy row (they keep using
--                           applications.session_id -> intake.session_id for the
--                           displayed intake). Add Lead and PATCH
--                           /applications/:id/academic write it only after the
--                           API verifies (university_id, course_id, intake_id) is
--                           a live university_course_intake offering. No backfill.
--
-- SAFETY. Additive, idempotent, no data rewritten. One guarded INSTANT ALTER for
-- the column and one guarded ONLINE ALTER for its index. NULLable, no default,
-- appended last: named-column INSERTs, SELECT * and CI4 models are unaffected;
-- only a positional INSERT INTO applications VALUES (...) with no column list
-- would break, and the LMS uses the CodeIgniter query builder (named columns).
-- The `intake` table is a v2 master the LMS does not read.
--
-- APPLY (as MariaDB root, after a backup; the app user is DML-only):
--   mysql --defaults-file=<creds> lms_upcarrera < database/migrations/003-application-intake.sql
-- or via CyberPanel phpMyAdmin: select lms_upcarrera, Import this file.
-- Re-running it is a no-op. DO NOT use prisma db push.
-- =====================================================================

SET SESSION lock_wait_timeout = 10;
SET SESSION innodb_lock_wait_timeout = 10;

-- The column (INSTANT; skipped if already present or present with another type).
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications'
      AND COLUMN_NAME = 'intake_id') = 0,
  'ALTER TABLE `applications` ADD COLUMN `intake_id` int DEFAULT NULL, ALGORITHM=INSTANT',
  'SELECT ''applications.intake_id already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Stop if the column exists with an incompatible type (a foreign definition).
SET @bad := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications'
    AND COLUMN_NAME = 'intake_id' AND DATA_TYPE <> 'int');
SET @stmt := IF(@bad = 0,
  'SELECT ''guard: applications.intake_id is int'' AS note',
  'SELECT 1 FROM `STOP_003_intake_id_wrong_type`');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- The index (ONLINE; drives "applications for intake X" and the Intakes count).
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications'
      AND INDEX_NAME = 'idx_applications_intake') = 0,
  'ALTER TABLE `applications` ADD KEY `idx_applications_intake` (`intake_id`), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''idx_applications_intake already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Verification (expect: 1, 1, 0 on first run).
SELECT 'applications.intake_id column (want 1)' AS metric, COUNT(*) AS value
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME = 'intake_id'
UNION ALL
SELECT 'idx_applications_intake (want 1)', COUNT(DISTINCT INDEX_NAME)
  FROM information_schema.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND INDEX_NAME = 'idx_applications_intake'
UNION ALL
SELECT 'applications with an intake_id (want 0: no backfill)', COUNT(*)
  FROM `applications` WHERE `intake_id` IS NOT NULL;
