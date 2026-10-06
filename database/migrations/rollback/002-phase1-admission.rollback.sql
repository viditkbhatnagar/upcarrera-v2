-- =====================================================================
-- ROLLBACK of 002 - Phase 1 admission. DESTRUCTIVE. LAST RESORT.
--
-- Reverting the API/web code does NOT require this file: everything 002
-- added is inert without the new code (the LMS does not know the new
-- tables, and the new columns are NULLable). Run this only when the LMS is
-- proven to break because of 002, or the business decides to remove it.
--
-- BEFORE RUNNING
--   1. Disable the new-role users FIRST, in the same window: the old API has
--      no record-level access, so a Team Leader / Manager / Accounts /
--      Student Affairs user would see every application. Step 1 below does
--      this (users.status = 0); confirm that is what the business wants.
--      status = 0 makes the CRM API refuse the login; the LMS web login
--      does not read users.status at all, so it does NOT block LMS access
--      (see THE NEW ROLES AND THE LMS in the 002 header).
--   2. Export what this file destroys - CRM data with no other copy:
--        mysqldump --defaults-file=<creds> lms_upcarrera \
--          audit_log application_stage_log application_payment \
--          application_sa_review doc_sequence application_magic_link \
--          application_form application_document document_requirement \
--          course_admission_rule university_course university_course_intake \
--          fee_structure fee_structure_item fee_structure_instalment \
--          > 002-tables-<date>.sql
--        mysql --defaults-file=<creds> lms_upcarrera -e "SELECT application_id,
--          stage, stage_entered_at, hold_at, hold_followup_date, remarks,
--          referred_by FROM applications WHERE stage IS NOT NULL OR
--          remarks IS NOT NULL OR referred_by IS NOT NULL" > 002-applications-<date>.tsv
--        mysql --defaults-file=<creds> lms_upcarrera -e "SELECT id, student_id,
--          student_no FROM students WHERE student_no IS NOT NULL" > 002-students-<date>.tsv
--        mysql --defaults-file=<creds> lms_upcarrera -e "SELECT qualification_id,
--          student_id, application_id, level_code, institution, passing_year,
--          score_type, score_value, score_scale FROM qualification WHERE
--          COALESCE(level_code, institution, passing_year, score_type,
--          score_value, score_scale) IS NOT NULL" > 002-qualification-<date>.tsv
--        mysql --defaults-file=<creds> lms_upcarrera -e "SELECT id,
--          fee_collection_model FROM university WHERE fee_collection_model
--          IS NOT NULL" > 002-university-<date>.tsv
--        mysql --defaults-file=<creds> lms_upcarrera -e "SELECT id, session_id
--          FROM intake WHERE session_id IS NOT NULL" > 002-intake-<date>.tsv
--        mysql --defaults-file=<creds> lms_upcarrera -e "SELECT id, title,
--          role_key, deleted_at FROM user_role WHERE role_key IS NOT NULL" > 002-roles-<date>.tsv
--      The STU-YYYY-NNNNNN numbers (students.student_no) and the institution,
--      year and exact score of each qualification exist nowhere else.
--      Also keep apps/api/uploads (payment proofs, KYC documents): those
--      files are referenced only from the tables dropped here.
--   3. Run only the pre-flight queries first if unsure: section 0 stops the
--      file before step 1 when step 5 could not finish.
--   4. Apply as MariaDB root, off-peak, after a full backup:
--        mysql --defaults-file=<creds> lms_upcarrera \
--              < database/migrations/rollback/002-phase1-admission.rollback.sql
--
-- WHAT IT DOES (every step guarded; re-running it is a no-op)
--   0. pre-flight: stops, changing nothing, if a column could not be dropped
--      instantly or a key 002 did not name covers a 002 column.
--   1. users with role 101-104 -> status 0 (the CRM API then refuses them).
--   2. deletes the crm: grants and the 18 crm: permissions rows.
--   3. deletes roles 101-104 - only those no users row references (a user
--      pointing at a missing role breaks the LMS login page), so a role
--      that still has users is kept, disabled with its users.
--   4. drops the 15 tables 002 created - each only if it still carries
--      002's signature column, so a same-named LMS table is never dropped.
--   5. drops 002's keys, then its columns, on applications, qualification,
--      students, user_role, intake and university.
--   It never drops `intake` itself (a v2 table that predates 002 in
--   production) and never touches a legacy column. user_role's
--   AUTO_INCREMENT is left at 105 on purpose: restoring 9 would make the
--   next role created on the LMS screen an LMS "operation executive".
-- =====================================================================

SET SESSION lock_wait_timeout = 5;
SET SESSION innodb_lock_wait_timeout = 5;

-- 0. Pre-flight. Stops before anything is changed if step 5 would fail
--    half-way (after the tables and grants are already gone).
-- 0a. MariaDB drops a column instantly only when innodb_instant_alter_column_allowed
--     is 'add_drop_reorder' (the 10.11 default). MySQL 8 has no such switch.
SET @stmt := IF(VERSION() LIKE '%MariaDB%',
  'SELECT @@innodb_instant_alter_column_allowed INTO @instant_drop',
  'SELECT ''add_drop_reorder'' INTO @instant_drop');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
SET @stmt := IF(@instant_drop = 'add_drop_reorder',
  'SELECT ''pre-flight 0a passed: columns can be dropped instantly'' AS note',
  'SELECT 1 FROM `STOP_rollback_instant_column_drop_not_allowed`');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 0b. A key on a 002 column under a name 002 did not use (002's by-column
--     guards accept one, e.g. an intake.session_id key made by other code)
--     blocks the instant column drop. Step 5 drops keys by 002's names only,
--     so stop here; list them with the query below and drop them by hand:
--       SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME FROM information_schema.STATISTICS
--        WHERE TABLE_SCHEMA = DATABASE() AND ((TABLE_NAME = 'students' AND COLUMN_NAME = 'student_no')
--           OR (TABLE_NAME = 'user_role' AND COLUMN_NAME = 'role_key')
--           OR (TABLE_NAME = 'intake' AND COLUMN_NAME = 'session_id')
--           OR (TABLE_NAME = 'applications' AND COLUMN_NAME IN ('stage', 'stage_entered_at', 'phone_normalized')));
SET @foreign_keys := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND (   (TABLE_NAME = 'students'      AND COLUMN_NAME = 'student_no')
          OR (TABLE_NAME = 'user_role'     AND COLUMN_NAME = 'role_key')
          OR (TABLE_NAME = 'intake'        AND COLUMN_NAME = 'session_id')
          OR (TABLE_NAME = 'university'    AND COLUMN_NAME = 'fee_collection_model')
          OR (TABLE_NAME = 'applications'  AND COLUMN_NAME IN ('stage', 'stage_entered_at', 'hold_at', 'hold_followup_date',
                                                              'phone_normalized', 'remarks', 'referred_by'))
          OR (TABLE_NAME = 'qualification' AND COLUMN_NAME IN ('level_code', 'institution', 'passing_year',
                                                              'score_type', 'score_value', 'score_scale')))
     AND INDEX_NAME NOT IN ('idx_applications_stage', 'idx_applications_phone_norm',
                            'uq_students_student_no', 'uq_user_role_role_key', 'uq_intake_session_id'));
SET @stmt := IF(@foreign_keys = 0,
  'SELECT ''pre-flight 0b passed: every key on a 002 column is a 002 key'' AS note',
  'SELECT 1 FROM `STOP_rollback_key_on_a_002_column_under_another_name`');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 1. Disable the new-role users.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'status') = 1,
  'UPDATE `users` SET `status` = 0, `updated_at` = UTC_TIMESTAMP()
    WHERE `role_id` IN (101, 102, 103, 104) AND (`status` IS NULL OR `status` <> 0)',
  'SELECT ''users.status missing - nothing disabled'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 2. The crm: grants and permissions (only crm:-prefixed rows: 002 wrote no other).
DELETE rp FROM `role_permissions` rp
  JOIN `permissions` p ON p.`id` = rp.`permission_id`
 WHERE p.`slug` LIKE 'crm:%';
DELETE FROM `permissions` WHERE `slug` LIKE 'crm:%';

-- 3. Roles 101-104, only when no user references them.
DELETE r FROM `user_role` r
 WHERE r.`id` IN (101, 102, 103, 104)
   AND NOT EXISTS (SELECT 1 FROM `users` u WHERE u.`role_id` = r.`id`);

-- 4. The 15 tables, each only if it is 002's (signature column present).
SET @drop := (
  SELECT GROUP_CONCAT(CONCAT('`', t.TABLE_NAME, '`') ORDER BY t.TABLE_NAME SEPARATOR ', ')
    FROM information_schema.TABLES t
   WHERE t.TABLE_SCHEMA = DATABASE()
     AND t.TABLE_NAME IN ('audit_log', 'application_stage_log', 'application_payment',
                          'application_sa_review', 'doc_sequence', 'application_magic_link',
                          'application_form', 'application_document', 'document_requirement',
                          'course_admission_rule', 'university_course', 'university_course_intake',
                          'fee_structure', 'fee_structure_item', 'fee_structure_instalment')
     AND EXISTS (
           SELECT 1 FROM information_schema.COLUMNS c
            WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA
              AND c.TABLE_NAME   = t.TABLE_NAME
              AND c.COLUMN_NAME  = CASE t.TABLE_NAME
                    WHEN 'audit_log'                THEN 'change_id'
                    WHEN 'application_stage_log'    THEN 'on_behalf'
                    WHEN 'application_payment'      THEN 'txn_ref_active'
                    WHEN 'application_sa_review'    THEN 'eligibility_ok'
                    WHEN 'doc_sequence'             THEN 'seq_key'
                    WHEN 'application_magic_link'   THEN 'token_hash'
                    WHEN 'application_form'         THEN 'name_on_certificate'
                    WHEN 'application_document'     THEN 'verification_status'
                    WHEN 'document_requirement'     THEN 'applies_when'
                    WHEN 'course_admission_rule'    THEN 'requires_employment'
                    WHEN 'university_course'        THEN 'university_course_name'
                    WHEN 'university_course_intake' THEN 'intake_id'
                    WHEN 'fee_structure'            THEN 'allow_per_semester'
                    WHEN 'fee_structure_item'       THEN 'fee_structure_id'
                    WHEN 'fee_structure_instalment' THEN 'due_offset_days'
                  END));
SET @stmt := IF(@drop IS NULL, 'SELECT ''no 002 tables left'' AS note', CONCAT('DROP TABLE ', @drop));
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 5. Keys first (a column inside an index cannot be dropped instantly), then
--    columns, one ALTER per table. Keys are matched by 002's names only.
SET @dropkeys := CONCAT_WS(', ',
  IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND INDEX_NAME = 'idx_applications_stage') > 0,      'DROP KEY `idx_applications_stage`', NULL),
  IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND INDEX_NAME = 'idx_applications_owner') > 0,      'DROP KEY `idx_applications_owner`', NULL),
  IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND INDEX_NAME = 'idx_applications_phone_norm') > 0, 'DROP KEY `idx_applications_phone_norm`', NULL));
SET @stmt := IF(@dropkeys = '', 'SELECT ''applications: no 002 keys left'' AS note', CONCAT('ALTER TABLE `applications` ', @dropkeys, ', ALGORITHM=INPLACE, LOCK=NONE'));
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND INDEX_NAME = 'uq_students_student_no') > 0,
  'ALTER TABLE `students` DROP KEY `uq_students_student_no`, ALGORITHM=INPLACE, LOCK=NONE', 'SELECT ''students: no 002 key left'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
SET @stmt := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_role' AND INDEX_NAME = 'uq_user_role_role_key') > 0,
  'ALTER TABLE `user_role` DROP KEY `uq_user_role_role_key`, ALGORITHM=INPLACE, LOCK=NONE', 'SELECT ''user_role: no 002 key left'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
SET @stmt := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'intake' AND INDEX_NAME = 'uq_intake_session_id') > 0,
  'ALTER TABLE `intake` DROP KEY `uq_intake_session_id`, ALGORITHM=INPLACE, LOCK=NONE', 'SELECT ''intake: no 002 key left'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @dropcols := CONCAT_WS(', ',
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME = 'stage') > 0,              'DROP COLUMN `stage`', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME = 'stage_entered_at') > 0,   'DROP COLUMN `stage_entered_at`', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME = 'hold_at') > 0,            'DROP COLUMN `hold_at`', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME = 'hold_followup_date') > 0, 'DROP COLUMN `hold_followup_date`', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME = 'phone_normalized') > 0,   'DROP COLUMN `phone_normalized`', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME = 'remarks') > 0,            'DROP COLUMN `remarks`', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME = 'referred_by') > 0,        'DROP COLUMN `referred_by`', NULL));
SET @stmt := IF(@dropcols = '', 'SELECT ''applications: no 002 columns left'' AS note', CONCAT('ALTER TABLE `applications` ', @dropcols, ', ALGORITHM=INSTANT'));
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @dropcols := CONCAT_WS(', ',
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'qualification' AND COLUMN_NAME = 'level_code') > 0,   'DROP COLUMN `level_code`', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'qualification' AND COLUMN_NAME = 'institution') > 0,  'DROP COLUMN `institution`', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'qualification' AND COLUMN_NAME = 'passing_year') > 0, 'DROP COLUMN `passing_year`', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'qualification' AND COLUMN_NAME = 'score_type') > 0,   'DROP COLUMN `score_type`', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'qualification' AND COLUMN_NAME = 'score_value') > 0,  'DROP COLUMN `score_value`', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'qualification' AND COLUMN_NAME = 'score_scale') > 0,  'DROP COLUMN `score_scale`', NULL));
SET @stmt := IF(@dropcols = '', 'SELECT ''qualification: no 002 columns left'' AS note', CONCAT('ALTER TABLE `qualification` ', @dropcols, ', ALGORITHM=INSTANT'));
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'student_no') > 0,
  'ALTER TABLE `students` DROP COLUMN `student_no`, ALGORITHM=INSTANT', 'SELECT ''students: no 002 column left'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
SET @stmt := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_role' AND COLUMN_NAME = 'role_key') > 0,
  'ALTER TABLE `user_role` DROP COLUMN `role_key`, ALGORITHM=INSTANT', 'SELECT ''user_role: no 002 column left'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
SET @stmt := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'intake' AND COLUMN_NAME = 'session_id') > 0,
  'ALTER TABLE `intake` DROP COLUMN `session_id`, ALGORITHM=INSTANT', 'SELECT ''intake: no 002 column left'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
SET @stmt := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'university' AND COLUMN_NAME = 'fee_collection_model') > 0,
  'ALTER TABLE `university` DROP COLUMN `fee_collection_model`, ALGORITHM=INSTANT', 'SELECT ''university: no 002 column left'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Verification: every line should read 0, except "Phase 1 roles kept" which
-- counts roles kept because users still reference them.
SELECT '002 tables left (expect 0)' AS metric, COUNT(*) AS value
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME IN ('audit_log', 'application_stage_log', 'application_payment',
                      'application_sa_review', 'doc_sequence', 'application_magic_link',
                      'application_form', 'application_document', 'document_requirement',
                      'course_admission_rule', 'university_course', 'university_course_intake',
                      'fee_structure', 'fee_structure_item', 'fee_structure_instalment')
UNION ALL
SELECT '002 columns left (expect 0)', COUNT(*)
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND (   (TABLE_NAME = 'applications'  AND COLUMN_NAME IN ('stage', 'stage_entered_at', 'hold_at', 'hold_followup_date',
                                                             'phone_normalized', 'remarks', 'referred_by'))
        OR (TABLE_NAME = 'qualification' AND COLUMN_NAME IN ('level_code', 'institution', 'passing_year', 'score_type', 'score_value', 'score_scale'))
        OR (TABLE_NAME = 'students'      AND COLUMN_NAME = 'student_no')
        OR (TABLE_NAME = 'user_role'     AND COLUMN_NAME = 'role_key')
        OR (TABLE_NAME = 'intake'        AND COLUMN_NAME = 'session_id')
        OR (TABLE_NAME = 'university'    AND COLUMN_NAME = 'fee_collection_model'))
UNION ALL
SELECT 'crm: permissions left (expect 0)', COUNT(*) FROM `permissions` WHERE `slug` LIKE 'crm:%'
UNION ALL
SELECT 'Phase 1 roles kept because users reference them', COUNT(*) FROM `user_role` WHERE `id` IN (101, 102, 103, 104)
UNION ALL
SELECT 'active users on roles 101-104 (expect 0)', COUNT(*) FROM `users` WHERE `role_id` IN (101, 102, 103, 104) AND (`status` IS NULL OR `status` <> 0);
