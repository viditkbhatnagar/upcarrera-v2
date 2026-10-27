-- =====================================================================
-- 008 - Applicant form: Employment Industry + Current Location
--
-- Adds two optional text columns to application_form (the table behind the
-- public apply form's Employment step):
--
--   application_form.industry          varchar(120) NULL
--   application_form.current_location  varchar(160) NULL
--
-- SAFETY. ADDITIVE ONLY and idempotent: each column is added by a guarded
-- ALGORITHM=INSTANT ALTER only when information_schema says it is missing.
-- No data rewritten, no keys, no foreign keys. Re-runnable.
--
-- APPLY via CyberPanel phpMyAdmin (as root, after a backup): pick lms_upcarrera,
-- then Import this file. Apply AFTER 002 (creates application_form). DO NOT use
-- prisma db push. Deploy the API and apply this together: the new code selects
-- these columns on application_form.
-- =====================================================================

SET SESSION lock_wait_timeout = 10;
SET SESSION innodb_lock_wait_timeout = 10;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_form'
      AND COLUMN_NAME = 'industry') = 0,
  'ALTER TABLE `application_form` ADD COLUMN `industry` varchar(120) DEFAULT NULL, ALGORITHM=INSTANT',
  'SELECT ''application_form.industry already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_form'
      AND COLUMN_NAME = 'current_location') = 0,
  'ALTER TABLE `application_form` ADD COLUMN `current_location` varchar(160) DEFAULT NULL, ALGORITHM=INSTANT',
  'SELECT ''application_form.current_location already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------
-- Verification: a single information_schema statement (not UNION-ed with
-- application tables, which trips a phpMyAdmin #1109 quirk). Want 2 rows.
-- ---------------------------------------------------------------------
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_form'
   AND COLUMN_NAME IN ('industry', 'current_location');
