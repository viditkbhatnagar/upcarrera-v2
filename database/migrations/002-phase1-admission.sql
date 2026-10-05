-- =====================================================================
-- 002 - Phase 1 admission: workflow, student form, catalog, fee
--       structures, one audit log, and the four Phase 1 roles
--
-- Phase 1 spec modules 1.5, 3.3, 3.4 and 4.x. Closes the schema half of QA
-- AP01, AP03, AP04, AP08, IN01 (schedule link), IN04 and FS01-FS04, and
-- carries the schema needs the Phase 1 QA rounds reported but were not
-- allowed to apply (AP02 Add Lead notes and referral, AP10 indexed
-- duplicate check, the qualification institution and year of passing).
--
-- WHAT IT ADDS
--   * The application workflow: one stage per application, a timeline of
--     every move, holds, the registration-fee entry and its verification,
--     the Student Affairs review, and STU-YYYY-NNNNNN numbering.
--   * The magic link and the public student form: per-section saves, the
--     application's documents, the per-level document checklist and the
--     course eligibility rule.
--   * Tagged courses (university x course, under the university's own name),
--     intake offerings (university x course x intake), and the 1:1 link from
--     an intake schedule to its `sessions` row.
--   * The fee-structure master and the university's fee-collection model.
--   * ONE audit log (spec 1.5), and the four Phase 1 roles - Team Leader,
--     Manager, Accounts, Student Affairs - at the RESERVED ids 101-104, with
--     their crm: permissions.
--   * Add Lead: applications.remarks (Quick Notes), applications.referred_by,
--     and applications.phone_normalized, the canonical mobile number the
--     duplicate check can use through an index, backfilled from
--     applications.phone.
--
-- WHY THIS EXISTS
--   * `applications` has no stage. The lifecycle is folded out of
--     is_converted / is_archived / status, so four of the seven spec stages
--     cannot be represented, and nothing records who moved what, when.
--   * The registration fee is five loose columns on the application row
--     (amount, paid_date, payment_mode, payment_to, fee_receipt): no
--     transaction number, no proof, no verifier, no duplicate check.
--     student_payments cannot hold it before conversion (student_id is NOT
--     NULL and means users.id) and is the ledger the LMS reads.
--   * `student_document.application_id` is overloaded: the candidate-document
--     endpoints store leads.id in it. Documents uploaded before conversion
--     therefore get their own table and are copied into student_document
--     only when the application becomes a student.
--   * `qualification.percentage` is an INT: no CGPA, no 78.5, no institution,
--     no year of passing.
--   * There is no audit trail. user_logs is the LMS login log.
--   * user_role is (id, title) only, titles are editable on the Roles screen,
--     and Team Leader / Manager / Accounts / Student Affairs do not exist.
--   * "Tagged courses" is course.university_id: one university per course
--     row, no university-specific course name, no intake offering.
--   * There is no fee-structure master. course.total_amount is 0 for most
--     rows, course.fee_structure is free text, course.payment_mode is a
--     label, and none of them is keyed by intake.
--   * The Add Lead "Quick Notes" and "Referred By" inputs had nowhere to be
--     saved, and the duplicate-mobile check is a LIKE '%digits' scan that
--     two simultaneous creates can both pass.
--
-- INTAKE IDENTITY (read before building on this)
--   An intake IS a `sessions` row. applications.session_id and
--   students.session_id reference sessions.session_id, the LMS reads it, and
--   the intake master screen (IN01, IntakeMasterService) serves it. `intake`
--   holds an intake's SCHEDULE (dates, status) and is linked 1:1 by the new
--   intake.session_id. Fee structures and offerings key on intake.id (a
--   scheduled intake); an application reaches them through
--   applications.session_id -> intake.session_id. No intake column is added
--   to `applications`: a second intake reference on a table the LMS writes
--   would drift. 002 is the ONLY owner of intake.session_id and its unique
--   key (named uq_intake_session_id, the name IN01 proposed): the IN01 data
--   step must run after 002 and must contain no DDL. 002 seeds no intake
--   rows from session titles (decision 3).
--
-- SAFETY - READ THIS BEFORE RUNNING
--   This database is SHARED WITH THE LIVE LMS (lms.upcarrera.com). Every
--   statement below is strictly ADDITIVE:
--     * 15 new tables, which the LMS cannot be affected by because it does
--       not know they exist (plus `intake`, created only where it is
--       missing - it already exists, empty, in production);
--     * 17 new columns on 6 existing tables (applications 7, qualification 6,
--       students 1, user_role 1, intake 1, university 1), all NULLable with
--       no default, appended at the end, so named-column INSERTs, the
--       CodeIgniter query builder and `SELECT *` consumers keep working;
--     * 3 secondary indexes on applications and 3 unique keys on new
--       NULLable columns (students.student_no, user_role.role_key,
--       intake.session_id). Every existing row, and every row the LMS
--       inserts, holds NULL there, and NULLs never clash under a unique key.
--   NOTHING existing is renamed, retyped, dropped, or made NOT NULL. There
--   are no foreign keys, CHECK constraints, triggers, events, generated
--   columns or stored programs.
--
--   Rows written to EXISTING tables, and nothing else:
--     * user_role.role_key (a new column) on the eight seeded roles, each
--       matched on id AND title;
--     * 4 user_role rows at the explicit ids 101-104, 18 permissions rows
--       (crm:-namespaced slugs the LMS never checks) and 52 role_permissions
--       grants;
--     * applications.phone_normalized (a new column), derived from
--       applications.phone. No other column of any applications row is
--       touched, and the tables have no ON UPDATE clauses or triggers.
--   No row of students, qualification, course, university, sessions,
--   student_document or student_payments is modified. applications.stage is
--   deliberately NOT backfilled: legacy rows stay NULL and the API derives
--   their stage at read time, so LMS conversions always win.
--
--   ROLE IDS ARE RESERVED, NOT AUTO_INCREMENT. The LMS hard-codes role
--   meanings in application/app/Helpers/login_helper.php: 1 admin, 2
--   education manager / telecaller / institutions, 3 teacher, 4 student, 5
--   accountant, 6 consultant, 7 sub admin, 8 client, 9 operation executive,
--   10 quality department, 11 co-ordinator - and
--   Controllers/App/Administrator.php lists and creates role 11 users as its
--   "Administrator" screen. user_role's AUTO_INCREMENT is 9 in production,
--   so AUTO_INCREMENT would have made Team Leader an LMS operation
--   executive and Accounts an LMS Administrator. A grep of every
--   controller, model, helper and view finds only the literals 1-11 (and
--   the ranges role_id > 0, role_id != 3, role_id != 4, and the dropdown
--   filter in_array(id, [1, 4, 5])); 101-104 match none of them. The
--   explicit inserts move user_role's AUTO_INCREMENT to 105, so a role
--   created later from the LMS Roles screen no longer lands on 9.
--
--   THE NEW ROLES AND THE LMS. users is shared, the LMS login has no role
--   check, and LMS controllers do not call has_permission(): a user given
--   role 101-104 in the CRM can sign in to lms.upcarrera.com with the same
--   credentials and open any app/* URL (the menus hide, the URLs work).
--   The existing role-6 counsellors already have this exposure. Decided
--   2026-10-05: the LMS gets a login guard that refuses role_id >= 100 on
--   every login path (built and tested against the live LMS code). Apply
--   this file only once that guard is live on lms.upcarrera.com, and create
--   no users on 101-104 before then. This file creates no users.
--
--   Section 0 STOPS the file before any DDL if a table already carries one
--   of this file's table names without this file's shape, if a column this
--   file adds already exists with another type, or if a reserved role id
--   (101-104) or a Phase 1 role key is already used by another role - so no
--   guard can silently adopt an LMS object. The stop is a deliberate
--   "Table 'STOP_002_...' doesn't exist" error, and nothing is created.
--
--   LOCKS. lock_wait_timeout and innodb_lock_wait_timeout are 5 s: if a long
--   LMS transaction holds a table, the ALTER waits at most 5 s and then
--   gives up (ERROR 1205). While it waits, later LMS queries on that table
--   queue behind it, so expect a stall of up to 5 s on that one table (4.1 s
--   measured on the replica), not an outage. Each existing table gets at most TWO
--   short metadata locks: one ALTER adds all of its columns with
--   ALGORITHM=INSTANT, one adds all of its keys with ALGORITHM=INPLACE,
--   LOCK=NONE. The algorithm is pinned on purpose: if the server cannot do
--   the change instantly / online it raises an error instead of quietly
--   rebuilding a live LMS table under a lock. If that happens, stop and
--   plan a maintenance window; do not delete the ALGORITHM clause. The
--   mysql client stops at the first error; wait, then re-run the whole file.
--   Never run it with --force.
--
--   RE-RUNNABLE, EVEN WITHOUT ROOT. Every CREATE, ALTER and seed is guarded
--   (information_schema + PREPARE / EXECUTE, INSERT ... WHERE NOT EXISTS,
--   UPDATE ... WHERE <not yet done>), so applying it twice is a no-op. Once
--   the DDL is in place a re-run executes only SELECTs and DML, so the
--   DML-only app user can re-run it - e.g. to restore the crm: grants after
--   someone saves role 6 or 7 on the LMS Roles & Permissions screen. That
--   screen replaces all of the role's grants with its own hard-coded
--   checkboxes and never shows the crm: ones, so every save of role 6 or 7
--   drops them. The LMS Permissions list does show the 18 "CRM ..." rows
--   (with Edit and Delete), and its User Role screen can delete roles
--   101-104. The CRM API re-applies sections 7 and 8 every night.
--
--   DO NOT APPLY THIS WITH `prisma db push` (see DEPLOY.md). Apply it by
--   hand, as MariaDB root (the app user has DML only), after a backup and
--   off-peak, AFTER 001:
--
--     mysql --defaults-file=<chmod-600 creds file> lms_upcarrera \
--           < database/migrations/002-phase1-admission.sql
--
--   Production is `lms_upcarrera` (001's example said `upcarrera`). Every
--   statement uses DATABASE(), so the schema named on the command line is
--   the one changed. See database/migrations/README.md for the order, the
--   verification and the rollback.
--
--   PRE-FLIGHT (read-only, before applying):
--     SELECT id, title FROM user_role ORDER BY id;
--       -> ids 1-8 must be Super Admin, Telecaller, Teacher, Student,
--          Institutions, Consultant, Admin, Client (section 7 matches them),
--          and ids 101-104 must be free (guard 0c stops otherwise)
--     SELECT COUNT(*) FROM intake;      -> informational (0 in production)
--     SELECT TABLE_NAME, ROW_FORMAT FROM information_schema.TABLES
--      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('applications',
--            'qualification', 'students', 'user_role', 'intake', 'university');
--       -> none may be Compressed, and SELECT @@innodb_instant_alter_column_allowed
--          must not be 'never': either makes ALGORITHM=INSTANT stop the file
--          (safely, before that table changes). A schema dump does not carry
--          the row format, so only the live server can answer this.
--     SHOW GRANTS FOR <app user>;       -> if grants are per table, the app
--          user needs SELECT, INSERT, UPDATE, DELETE on the 15 new tables
--     grep the LMS source for positional inserts (no column list) into
--          applications, students, qualification, user_role, university
--          (none existed when this file was written: the LMS only uses the
--          CodeIgniter query builder)
--
--   AFTERWARDS: read section 10; smoke-test lms.upcarrera.com (login,
--   application list, a student profile with qualifications, student
--   finance); then restart the API (pm2 reload) so the permission cache
--   loads the new grants.
--
-- LMS FACTS THE API MUST HONOUR (no schema depends on them, but every
-- column comment below assumes them)
--   * applications.status is NULL on every legacy row (the LMS form never
--     posts it). Only status = 0 means deactivated; NULL is active.
--   * applications.is_archived = 1 is the LMS "Save to Archive" DRAFT flag,
--     rewritten by every LMS save - not "rejected". A NULL-stage row with
--     is_archived = 1 is a legacy draft (lead_added), never a rejection.
--   * Legacy JSON ids are JSON STRINGS (["30", "31"]): any JSON parse of a
--     legacy column must JSON_UNQUOTE (see 001). This file parses no JSON.
--   * Registration-fee values mirrored into LMS columns must use the LMS
--     vocabulary, not the CRM codes stored here: payment_to 'upCarrera' |
--     'University'; payment_mode 'Online' | 'Cash' | 'Cheque'; status
--     'Paid'. CRM storage keys (proof_path, file_path) are not LMS paths.
--   * Conversion copies into narrower LMS columns. New columns here are
--     sized so their copies cannot fail (name_on_certificate varchar(100) =
--     users.name; registration amounts decimal(10,2), whose ROUND() always
--     fits the INT columns applications.amount and student_payments.amount;
--     document label varchar(50) = student_document.label). Existing
--     applications columns are wider than their LMS targets, so the API
--     must VALIDATE (never silently truncate) before it writes them or
--     claims a conversion: name <= 100 (users.name), email <= 50
--     (users.email), state <= 60 (students.state), source <= 50
--     (students.source), custom_application_id and enrollment_id <= 50
--     (students.application_id / enrollment_id), and address non-NULL
--     (students.address is TEXT NOT NULL).
--
--   All string literals are ASCII, so a latin1 client connection cannot
--   mangle them, every seed compares a column with a literal (never one
--   table's column with another's) so the mixed legacy collations cannot
--   raise "Illegal mix of collations", and timestamps use UTC_TIMESTAMP()
--   to match what Prisma writes. BOOLEAN is TINYINT(1) on both engines; it
--   is spelled BOOLEAN so MySQL 8 does not warn about a deprecated display
--   width. The file runs with zero warnings on MariaDB 10.11 and MySQL 8.
-- =====================================================================

SET SESSION lock_wait_timeout = 5;
SET SESSION innodb_lock_wait_timeout = 5;

-- ---------------------------------------------------------------------
-- 0. Guards. Nothing below runs unless all three pass.
-- ---------------------------------------------------------------------
-- 0a. A table with one of this file's names that lacks this file's
--     signature column is someone else's table.
SET @foreign_tables := (
  SELECT COUNT(*)
    FROM information_schema.TABLES t
   WHERE t.TABLE_SCHEMA = DATABASE()
     AND t.TABLE_NAME IN ('audit_log', 'application_stage_log', 'application_payment',
                          'application_sa_review', 'doc_sequence', 'application_magic_link',
                          'application_form', 'application_document', 'document_requirement',
                          'course_admission_rule', 'university_course', 'university_course_intake',
                          'fee_structure', 'fee_structure_item', 'fee_structure_instalment',
                          'intake')
     AND NOT EXISTS (
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
                    WHEN 'intake'                   THEN 'closing_date'
                  END));
SET @stmt := IF(@foreign_tables = 0,
  'SELECT ''guard 0a passed: no foreign table uses a 002 table name'' AS note',
  'SELECT 1 FROM `STOP_002_table_name_taken_by_a_foreign_table`');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 0b. A column this file defines that already exists with another type
--     would be skipped by its guard and then misread by the API. The new-
--     table columns listed are the ones whose type differs from the Phase 2
--     reconciler's draft, in case that draft was ever applied somewhere.
SET @foreign_columns := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND (   (TABLE_NAME = 'applications'  AND COLUMN_NAME = 'stage'                AND NOT (DATA_TYPE = 'varchar' AND CHARACTER_MAXIMUM_LENGTH = 32))
          OR (TABLE_NAME = 'applications'  AND COLUMN_NAME = 'stage_entered_at'     AND DATA_TYPE <> 'datetime')
          OR (TABLE_NAME = 'applications'  AND COLUMN_NAME = 'hold_at'              AND DATA_TYPE <> 'datetime')
          OR (TABLE_NAME = 'applications'  AND COLUMN_NAME = 'hold_followup_date'   AND DATA_TYPE <> 'date')
          OR (TABLE_NAME = 'applications'  AND COLUMN_NAME = 'phone_normalized'     AND NOT (DATA_TYPE = 'char' AND CHARACTER_MAXIMUM_LENGTH = 10))
          OR (TABLE_NAME = 'applications'  AND COLUMN_NAME = 'remarks'              AND DATA_TYPE <> 'text')
          OR (TABLE_NAME = 'applications'  AND COLUMN_NAME = 'referred_by'          AND DATA_TYPE <> 'int')
          OR (TABLE_NAME = 'students'      AND COLUMN_NAME = 'student_no'           AND NOT (DATA_TYPE = 'varchar' AND CHARACTER_MAXIMUM_LENGTH = 32))
          OR (TABLE_NAME = 'user_role'     AND COLUMN_NAME = 'role_key'             AND NOT (DATA_TYPE = 'varchar' AND CHARACTER_MAXIMUM_LENGTH = 32))
          OR (TABLE_NAME = 'intake'        AND COLUMN_NAME = 'session_id'           AND DATA_TYPE <> 'int')
          OR (TABLE_NAME = 'university'    AND COLUMN_NAME = 'fee_collection_model' AND NOT (DATA_TYPE = 'varchar' AND CHARACTER_MAXIMUM_LENGTH = 32))
          OR (TABLE_NAME = 'qualification' AND COLUMN_NAME = 'level_code'           AND NOT (DATA_TYPE = 'varchar' AND CHARACTER_MAXIMUM_LENGTH = 16))
          OR (TABLE_NAME = 'qualification' AND COLUMN_NAME = 'institution'          AND NOT (DATA_TYPE = 'varchar' AND CHARACTER_MAXIMUM_LENGTH = 160))
          OR (TABLE_NAME = 'qualification' AND COLUMN_NAME = 'passing_year'         AND DATA_TYPE <> 'smallint')
          OR (TABLE_NAME = 'qualification' AND COLUMN_NAME = 'score_type'           AND NOT (DATA_TYPE = 'varchar' AND CHARACTER_MAXIMUM_LENGTH = 16))
          OR (TABLE_NAME = 'qualification' AND COLUMN_NAME = 'score_value'          AND NOT (DATA_TYPE = 'decimal' AND NUMERIC_PRECISION = 5 AND NUMERIC_SCALE = 2))
          OR (TABLE_NAME = 'qualification' AND COLUMN_NAME = 'score_scale'          AND NOT (DATA_TYPE = 'decimal' AND NUMERIC_PRECISION = 5 AND NUMERIC_SCALE = 2))
          OR (TABLE_NAME = 'audit_log'           AND COLUMN_NAME = 'id'                  AND NOT (DATA_TYPE = 'int' AND COLUMN_TYPE NOT LIKE '%unsigned%'))
          OR (TABLE_NAME = 'application_form'    AND COLUMN_NAME = 'name_on_certificate' AND NOT (DATA_TYPE = 'varchar' AND CHARACTER_MAXIMUM_LENGTH = 100))
          OR (TABLE_NAME = 'application_payment' AND COLUMN_NAME IN ('amount', 'amount_expected') AND NOT (DATA_TYPE = 'decimal' AND NUMERIC_PRECISION = 10 AND NUMERIC_SCALE = 2))
          OR (TABLE_NAME = 'fee_structure'       AND COLUMN_NAME = 'registration_fee'    AND NOT (DATA_TYPE = 'decimal' AND NUMERIC_PRECISION = 10 AND NUMERIC_SCALE = 2))
          -- the pre-release draft named the counter `last_value` (reserved in MySQL 8);
          -- rename it by hand: ALTER TABLE doc_sequence CHANGE last_value last_no int NOT NULL DEFAULT 0
          OR (TABLE_NAME = 'doc_sequence'        AND COLUMN_NAME = 'last_value')));
SET @stmt := IF(@foreign_columns = 0,
  'SELECT ''guard 0b passed: no 002 column name is taken by another type'' AS note',
  'SELECT 1 FROM `STOP_002_column_name_taken_with_another_type`');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 0c. The four Phase 1 roles live at the reserved ids 101-104 (see SAFETY).
--     A row already at one of those ids that is not that role, or a Phase 1
--     role_key already held by another id, stops the file. Written twice
--     because user_role.role_key does not exist before the first run.
SET @has_role_key := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_role' AND COLUMN_NAME = 'role_key');
SET @stmt := IF(@has_role_key = 0,
  'SELECT COUNT(*) INTO @foreign_roles FROM `user_role`
    WHERE (`id` = 101 AND NOT (TRIM(`title`) <=> ''Team Leader''))
       OR (`id` = 102 AND NOT (TRIM(`title`) <=> ''Manager''))
       OR (`id` = 103 AND NOT (TRIM(`title`) <=> ''Accounts''))
       OR (`id` = 104 AND NOT (TRIM(`title`) <=> ''Student Affairs''))',
  'SELECT COUNT(*) INTO @foreign_roles FROM `user_role`
    WHERE (`id` = 101 AND NOT (`role_key` <=> ''team_leader'')     AND NOT (`role_key` IS NULL AND TRIM(`title`) <=> ''Team Leader''))
       OR (`id` = 102 AND NOT (`role_key` <=> ''manager'')         AND NOT (`role_key` IS NULL AND TRIM(`title`) <=> ''Manager''))
       OR (`id` = 103 AND NOT (`role_key` <=> ''accounts'')        AND NOT (`role_key` IS NULL AND TRIM(`title`) <=> ''Accounts''))
       OR (`id` = 104 AND NOT (`role_key` <=> ''student_affairs'') AND NOT (`role_key` IS NULL AND TRIM(`title`) <=> ''Student Affairs''))
       OR (`role_key` = ''team_leader''     AND `id` <> 101)
       OR (`role_key` = ''manager''         AND `id` <> 102)
       OR (`role_key` = ''accounts''        AND `id` <> 103)
       OR (`role_key` = ''student_affairs'' AND `id` <> 104)');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
SET @stmt := IF(@foreign_roles = 0,
  'SELECT ''guard 0c passed: user_role ids 101-104 are free or already ours'' AS note',
  'SELECT 1 FROM `STOP_002_reserved_role_id_101_104_taken`');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------
-- 1. The audit log (spec 1.5) - ONE table for every feature in this file.
--
--    Who, when, which record, which field, old value, new value: every
--    create / edit / delete, stage change, payment entry, verification,
--    document review, login and failed login. One row per changed field;
--    change_id groups the fields of one save. Append-only. There is no
--    viewer in Phase 1.
--
--    id is a plain signed INT, like every other id in this schema: Prisma's
--    Int is a signed 32-bit type, so about 2.1 billion ids are usable
--    whatever the column says (a BigInt would not serialise to JSON in the
--    ResponseInterceptor). At one row per changed field that is ample.
-- ---------------------------------------------------------------------
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_log') = 0,
  'CREATE TABLE `audit_log` (
  `id`             int NOT NULL AUTO_INCREMENT,
  `occurred_at`    datetime(3)  NOT NULL,
  -- users.id; NULL when actor_type is applicant, system or anonymous
  `actor_id`       int DEFAULT NULL,
  `actor_role_id`  int DEFAULT NULL,
  -- user | applicant (the student on a magic link) | system | anonymous (failed login)
  `actor_type`     varchar(16)  COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''user'',
  -- create | update | delete | correct | stage_change | payment_entry | verify |
  -- mismatch | doc_review | login | login_failed | logout
  `action`         varchar(32)  COLLATE utf8mb4_unicode_ci NOT NULL,
  -- the table the record lives in: applications, application_payment, fee_structure, users ...
  `entity`         varchar(48)  COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id`      varchar(64)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- denormalised so the application Timeline can read corrections without a join
  `application_id` int DEFAULT NULL,
  `field`          varchar(64)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `old_value`      text         COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_value`      text         COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reason`         varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `change_id`      char(36)     COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip`             varchar(45)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent`     varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- JSON text written by the API (the attempted username of a failed login,
  -- the magic-link id of an applicant). LONGTEXT, not JSON: MariaDB JSON is a
  -- LONGTEXT alias plus a CHECK, so the two engines would introspect apart.
  `context`        longtext     COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_audit_entity`      (`entity`, `entity_id`, `occurred_at`),
  KEY `idx_audit_application` (`application_id`, `occurred_at`),
  KEY `idx_audit_actor`       (`actor_id`, `occurred_at`),
  KEY `idx_audit_action`      (`action`, `occurred_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT ''audit_log already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------
-- 2. The application stage engine, and the Add Lead fields.
--
--    Stage codes (the spec's numbers 1-7 are derived in code):
--      lead_added | form_pending | counsellor_review | fee_pending |
--      fee_verification | sa_verification | converted | rejected
--    On Hold is NOT a stage: hold_at is set and the stage is kept, so
--    Resume returns the application to the same stage and owner.
-- ---------------------------------------------------------------------
-- The domain timeline: one row per move. audit_log is the compliance
-- firehose; this is the product data behind the Timeline tab, days-in-stage
-- history and Phase 2 SLA reports. Both are written in the same transaction.
-- Who put an application on hold and why live on its 'hold' row.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_stage_log') = 0,
  'CREATE TABLE `application_stage_log` (
  `id`             int NOT NULL AUTO_INCREMENT,
  `application_id` int NOT NULL,
  -- created | magic_link_sent | form_submitted | form_received | accepted | reopened |
  -- payment_recorded | fee_verified | fee_mismatch | sent_back | hold | resume |
  -- converted | rejected | legacy_convert
  `event`          varchar(32)   COLLATE utf8mb4_unicode_ci NOT NULL,
  `from_stage`     varchar(32)   COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `to_stage`       varchar(32)   COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- hold / reopen / mismatch / send-back / reject reason. The latest
  -- reopened row is the reason the student sees on the form.
  `reason`         varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- hold events only
  `followup_date`  date DEFAULT NULL,
  -- users.id; NULL when the actor is the student (magic link) or the system
  `actor_id`       int DEFAULT NULL,
  `actor_role_id`  int DEFAULT NULL,
  -- user | applicant | system
  `actor_type`     varchar(16)   COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''user'',
  -- 1 when an Admin / Super Admin performed a stage owner action
  `on_behalf`      boolean    NOT NULL DEFAULT 0,
  -- the row this event produced or used: application_payment, application_sa_review,
  -- application_magic_link ...
  `ref_table`      varchar(48)   COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ref_id`         int DEFAULT NULL,
  `created_at`     datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_asl_application` (`application_id`, `created_at`),
  KEY `idx_asl_to_stage`    (`to_stage`, `created_at`),
  KEY `idx_asl_actor`       (`actor_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT ''application_stage_log already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Seven columns on `applications`, added by ONE instant ALTER:
--   stage              the current stage, so the list can filter, count and
--                      sort by it. NULL = not yet in the workflow (every
--                      existing row, and any row the LMS inserts later); the
--                      API derives a stage for those and writes one only on
--                      their first CRM move.
--   stage_entered_at   when the current stage was entered ("days in stage").
--                      For NULL-stage rows the API falls back to updated_at,
--                      then created_at.
--   hold_at            non-NULL = On Hold (spec: stages 2-6 only; reason and
--                      follow-up date required, enforced by the API and kept
--                      on the 'hold' stage-log row).
--   hold_followup_date drives the list filter "on hold, follow-up due".
--   phone_normalized   the canonical 10-digit Indian mobile of `phone`, or
--                      NULL when phone is not one: exactly what the API's
--                      normalizeIndianMobile() (apps/api/src/students/
--                      indian-mobile.ts) returns - spaces, tabs, CR, LF,
--                      dashes, dots and brackets stripped, then one +91 /
--                      91 / 0 prefix, and the result must be ^[6-9][0-9]{9}$.
--                      The API must set it on every write of `phone` (WS4),
--                      and the duplicate check should read it through
--                      idx_applications_phone_norm. NOT unique: the legacy
--                      data already holds numbers shared by more than one
--                      application. The LMS does not maintain it, so rows
--                      the LMS inserts or edits stay NULL / stale until the
--                      API next writes them or section 9's statement runs
--                      again (it is safe to schedule nightly).
--   remarks            the Add Lead "Quick Notes" (free text).
--   referred_by        users.id of whoever referred a Referral lead (the Add
--                      Lead "Referred By Student" picker) - the same type as
--                      students.referred_by, so a conversion can copy it
--                      across unchanged.
SET @add := CONCAT_WS(', ',
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME = 'stage') = 0,
     'ADD COLUMN `stage` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME = 'stage_entered_at') = 0,
     'ADD COLUMN `stage_entered_at` datetime DEFAULT NULL', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME = 'hold_at') = 0,
     'ADD COLUMN `hold_at` datetime DEFAULT NULL', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME = 'hold_followup_date') = 0,
     'ADD COLUMN `hold_followup_date` date DEFAULT NULL', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME = 'phone_normalized') = 0,
     'ADD COLUMN `phone_normalized` char(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME = 'remarks') = 0,
     'ADD COLUMN `remarks` text COLLATE utf8mb4_unicode_ci DEFAULT NULL', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME = 'referred_by') = 0,
     'ADD COLUMN `referred_by` int DEFAULT NULL', NULL));
SET @stmt := IF(@add = '',
  'SELECT ''applications: 002 columns already present'' AS note',
  CONCAT('ALTER TABLE `applications` ', @add, ', ALGORITHM=INSTANT'));
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Three keys on `applications` (it has no secondary index at all today),
-- added by ONE online ALTER:
--   idx_applications_stage      stage filter + days-in-stage sort;
--   idx_applications_owner      record access (owner = pipeline_user, else
--                               created_by - the rule decorateApplications
--                               and the convert saga already use);
--   idx_applications_phone_norm the indexed duplicate-mobile lookup.
SET @add := CONCAT_WS(', ',
  IF((SELECT COUNT(*) FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND INDEX_NAME = 'idx_applications_stage') = 0,
     'ADD KEY `idx_applications_stage` (`stage`, `stage_entered_at`)', NULL),
  IF((SELECT COUNT(*) FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND INDEX_NAME = 'idx_applications_owner') = 0,
     'ADD KEY `idx_applications_owner` (`pipeline_user`, `created_by`)', NULL),
  IF((SELECT COUNT(*) FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND INDEX_NAME = 'idx_applications_phone_norm') = 0,
     'ADD KEY `idx_applications_phone_norm` (`phone_normalized`)', NULL));
SET @stmt := IF(@add = '',
  'SELECT ''applications: 002 indexes already present'' AS note',
  CONCAT('ALTER TABLE `applications` ', @add, ', ALGORITHM=INPLACE, LOCK=NONE'));
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------
-- 3. Registration fee (stages 4-5), Student Affairs (stages 6-7), numbering.
-- ---------------------------------------------------------------------
-- Pre-conversion registration-fee entries. A mismatch leaves its row and the
-- counsellor makes a new entry, so the history survives. Duplicate
-- transaction numbers are blocked by uq_app_payment_txn_active: the API sets
-- txn_ref_active to the normalised number while the entry is pending or
-- verified and to NULL on mismatch or void - a partial unique index that
-- works on MariaDB, MySQL 8 and `prisma db push` alike.
-- amount and amount_expected are decimal(10,2): ROUND(amount) is mirrored
-- into the INT columns applications.amount and student_payments.amount, and
-- 99,999,999.99 is the largest value whose ROUND() can never overflow them.
-- paid_to / payment_mode hold CRM codes; the LMS mirror maps them (see the
-- header: upcarrera -> 'upCarrera', university -> 'University'; cash ->
-- 'Cash', cheque | dd -> 'Cheque', anything else -> 'Online').
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_payment') = 0,
  'CREATE TABLE `application_payment` (
  `id`                   int NOT NULL AUTO_INCREMENT,
  `application_id`       int NOT NULL,
  `fee_kind`             varchar(32)  COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''registration'',
  -- fee_structure.id the expected amount came from, snapshotted with it so a
  -- later edit or Expire never rewrites a recorded payment
  `fee_structure_id`     int DEFAULT NULL,
  `amount_expected`      decimal(10,2) DEFAULT NULL,
  `amount`               decimal(10,2) NOT NULL,
  -- required by the API when amount <> amount_expected
  `amount_change_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- upcarrera | university  (CRM codes; mapped when mirrored into LMS columns)
  `paid_to`              varchar(16)  COLLATE utf8mb4_unicode_ci NOT NULL,
  -- upi | neft | imps | rtgs | cheque | dd | card | cash  (CRM codes; mapped likewise)
  `payment_mode`         varchar(16)  COLLATE utf8mb4_unicode_ci NOT NULL,
  -- as typed
  `txn_ref`              varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  -- upper-cased, spaces / dashes / slashes removed
  `txn_ref_norm`         varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `txn_ref_active`       varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- API: not in the future (Asia/Kolkata)
  `paid_on`              date NOT NULL,
  -- StorageService key (relative to apps/api/uploads, NOT an LMS path); the
  -- upload helper clips the original name so the key stays < 255
  `proof_path`           varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `proof_mime`           varchar(64)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `proof_size`           int DEFAULT NULL,
  `proof_original_name`  varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- pending | verified | mismatch | void
  `status`               varchar(16)  COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''pending'',
  `entered_by`           int NOT NULL,
  `entered_at`           datetime NOT NULL,
  `verified_by`          int DEFAULT NULL,
  `verified_at`          datetime DEFAULT NULL,
  -- the date Accounts saw the credit on the bank / university statement
  `bank_credit_date`     date DEFAULT NULL,
  `verify_note`          varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mismatch_by`          int DEFAULT NULL,
  `mismatch_at`          datetime DEFAULT NULL,
  `mismatch_reason`      varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by`           int DEFAULT NULL,
  `updated_at`           datetime DEFAULT NULL,
  `deleted_by`           int DEFAULT NULL,
  `deleted_at`           datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_app_payment_txn_active` (`txn_ref_active`),
  KEY `idx_app_payment_application` (`application_id`, `status`),
  KEY `idx_app_payment_queue`       (`status`, `paid_on`),
  KEY `idx_app_payment_txn_norm`    (`txn_ref_norm`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT ''application_payment already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- One row per Student Affairs decision, kept across send-backs: the four
-- spec checks, the decision and its reason; on approve, the student created.
-- Per-document verify / reject lives on application_document (section 4).
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_sa_review') = 0,
  'CREATE TABLE `application_sa_review` (
  `id`              int NOT NULL AUTO_INCREMENT,
  `application_id`  int NOT NULL,
  `identity_ok`     boolean    NOT NULL DEFAULT 0,
  `eligibility_ok`  boolean    NOT NULL DEFAULT 0,
  `legible_ok`      boolean    NOT NULL DEFAULT 0,
  `program_ok`      boolean    NOT NULL DEFAULT 0,
  -- approved | sent_back | rejected
  `decision`        varchar(16)   COLLATE utf8mb4_unicode_ci NOT NULL,
  -- required for sent_back and rejected
  `reason`          varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- users.id of the student created on approve
  `student_user_id` int DEFAULT NULL,
  `reviewed_by`     int NOT NULL,
  `reviewed_at`     datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_asr_application` (`application_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT ''application_sa_review already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Gap-free yearly counters for STU-YYYY-NNNNNN, taken inside the conversion
-- transaction:
--   INSERT INTO doc_sequence (seq_key, seq_year, last_no, updated_at)
--   VALUES ('STU', ?, LAST_INSERT_ID(1), UTC_TIMESTAMP())
--   ON DUPLICATE KEY UPDATE last_no = LAST_INSERT_ID(last_no + 1), updated_at = UTC_TIMESTAMP();
--   SELECT LAST_INSERT_ID();
-- The row lock serialises concurrent conversions; works on both engines.
-- (The counter is `last_no`, not `last_value`: LAST_VALUE is a reserved
-- word in MySQL 8, so the unquoted statement above would fail in CI.)
-- (APP-YYYY-NNNNNN stays derived from applications.application_id, as Add
-- Lead already issues it; seq_key 'APP' is available if the business wants
-- it to restart every year.)
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'doc_sequence') = 0,
  'CREATE TABLE `doc_sequence` (
  `seq_key`    varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `seq_year`   smallint NOT NULL,
  `last_no`    int NOT NULL DEFAULT 0,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`seq_key`, `seq_year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT ''doc_sequence already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- STU-YYYY-NNNNNN, set by the stage-7 conversion. A new column, not
-- students.enrollment_id, which is the university enrolment number the LMS
-- shows. NULL for every existing student (no backfill).
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students'
      AND COLUMN_NAME = 'student_no') = 0,
  'ALTER TABLE `students` ADD COLUMN `student_no` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL, ALGORITHM=INSTANT',
  'SELECT ''students.student_no already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Unique-key guards look for ANY single-column unique key on the column,
-- whatever its name, so a key added by hand under another name is never
-- duplicated.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS s
    WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = 'students'
      AND s.NON_UNIQUE = 0 AND s.SEQ_IN_INDEX = 1 AND s.COLUMN_NAME = 'student_no'
      AND NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS s2
                       WHERE s2.TABLE_SCHEMA = s.TABLE_SCHEMA AND s2.TABLE_NAME = s.TABLE_NAME
                         AND s2.INDEX_NAME = s.INDEX_NAME AND s2.SEQ_IN_INDEX = 2)) = 0,
  'ALTER TABLE `students` ADD UNIQUE KEY `uq_students_student_no` (`student_no`), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''students: a unique key on student_no already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------
-- 4. The magic link and the public student form.
-- ---------------------------------------------------------------------
-- One row per issued link. Only the SHA-256 of the token is stored; the raw
-- 256-bit token exists only in the email. A LIVE link is revoked_at IS NULL
-- AND consumed_at IS NULL AND email_status = 'sent': a resend inserts the
-- new row as 'pending' and revokes the previous link only after the email
-- is accepted, so a failed send never strands a student mid-form.
-- consumed_at is the submission (each consumed link = one submission).
-- Expiry (7 days) is compared in application code in UTC, and the applicant
-- session re-checks this row on every request.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_magic_link') = 0,
  'CREATE TABLE `application_magic_link` (
  `id`              int NOT NULL AUTO_INCREMENT,
  `application_id`  int NOT NULL,
  -- hex(SHA-256(raw token)), lower case
  `token_hash`      char(64)     COLLATE utf8mb4_unicode_ci NOT NULL,
  -- initial | resend | reopen
  `purpose`         varchar(16)  COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''initial'',
  `sent_to_email`   varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- pending | sent | failed
  `email_status`    varchar(16)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email_sent_at`   datetime DEFAULT NULL,
  `email_error`     varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expires_at`      datetime NOT NULL,
  `consumed_at`     datetime DEFAULT NULL,
  `revoked_at`      datetime DEFAULT NULL,
  `revoked_by`      int DEFAULT NULL,
  -- resend | reopen | email_failed | manual | application_closed
  `revoke_reason`   varchar(32)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `first_opened_at` datetime DEFAULT NULL,
  `last_opened_at`  datetime DEFAULT NULL,
  `open_count`      int NOT NULL DEFAULT 0,
  `last_ip`         varchar(45)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by`      int DEFAULT NULL,
  `created_at`      datetime NOT NULL,
  `updated_at`      datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_aml_token_hash` (`token_hash`),
  KEY `idx_aml_application` (`application_id`, `revoked_at`, `consumed_at`),
  KEY `idx_aml_app_created` (`application_id`, `created_at`),
  KEY `idx_aml_expires`     (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT ''application_magic_link already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- One row per application (1:1, created when the first link is sent): the
-- form fields with no legacy column, the per-section completion stamps that
-- drive "3 of 5 steps", eligibility, the declaration and the program-change
-- request. Fields that already have a home are written through to
-- `applications` (dob, gender, nationality, email, second_phone, whatsapp_no,
-- address, state, district, abc_id) and to `qualification`, so counsellor
-- screens, conversion and the LMS keep reading the columns they already read.
-- The reopen reason and the submission history are NOT repeated here: they
-- are the latest 'reopened' stage-log row and the consumed magic links.
-- name_on_certificate is varchar(100) because the conversion copies it into
-- users.name, which is varchar(100).
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_form') = 0,
  'CREATE TABLE `application_form` (
  `id`                          int NOT NULL AUTO_INCREMENT,
  `application_id`              int NOT NULL,
  -- Personal. name_on_certificate becomes users.name (varchar 100) at conversion.
  `name_on_certificate`         varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `father_guardian_name`        varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mother_name`                 varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- general | obc | sc | st | ews | other
  `category`                    varchar(16)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- single | married | other
  `marital_status`              varchar(16)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- the last 4 digits ONLY; a full Aadhaar number is never accepted or stored
  `aadhaar_last4`               char(4)      COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- Contact
  `pin_code`                    char(6)      COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- Education: 10th | 12th | diploma | ug | pg | doctorate
  `highest_qualification`       varchar(16)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- Employment (only when course_admission_rule.requires_employment = 1):
  -- employed | self_employed | unemployed
  `employment_status`           varchar(16)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `total_experience_months`     smallint DEFAULT NULL,
  `current_employer`            varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `current_designation`         varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- JSON array [{employer, designation, from, to}] parsed by the API (LONGTEXT, not JSON)
  `employment_history`          longtext     COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- Program: locked; the student may only ask for a change
  `program_change_request`      varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `program_change_requested_at` datetime DEFAULT NULL,
  -- Section completion stamps (NULL = not complete)
  `personal_saved_at`           datetime DEFAULT NULL,
  `contact_saved_at`            datetime DEFAULT NULL,
  `program_confirmed_at`        datetime DEFAULT NULL,
  `education_saved_at`          datetime DEFAULT NULL,
  `employment_saved_at`         datetime DEFAULT NULL,
  `documents_completed_at`      datetime DEFAULT NULL,
  -- eligible | not_eligible | needs_review
  `eligibility_status`          varchar(16)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `eligibility_detail`          varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `eligibility_checked_at`      datetime DEFAULT NULL,
  -- Declaration (both boxes are required to submit)
  `declaration_accepted_at`     datetime DEFAULT NULL,
  `declaration_version`         varchar(16)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `declaration_ip`              varchar(45)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- the summary PDF of the latest submission (StorageService key)
  `summary_pdf_path`            varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- optimistic concurrency between two tabs, or the student and a correction
  `row_version`                 int NOT NULL DEFAULT 0,
  -- applicant | staff
  `updated_via`                 varchar(16)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by`                  int DEFAULT NULL,
  `created_at`                  datetime NOT NULL,
  `updated_at`                  datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_application_form_app` (`application_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT ''application_form already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Documents uploaded against an APPLICATION, before it is a student, and
-- their Student Affairs verdict. Not student_document: its application_id
-- also holds leads.id, it has no verification state, and the LMS reads it.
-- At conversion the live rows are copied into student_document and
-- student_document_id records the copy (the file must then be somewhere the
-- LMS can serve - file_path is an API storage key, not an LMS path). A
-- replaced document is soft-deleted with its verdict kept; history is in
-- audit_log. label is varchar(50) because it is copied into
-- student_document.label, which is varchar(50).
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_document') = 0,
  'CREATE TABLE `application_document` (
  `id`                  int NOT NULL AUTO_INCREMENT,
  `application_id`      int NOT NULL,
  -- document_requirement.id this upload satisfies
  `requirement_id`      int DEFAULT NULL,
  `document_type_id`    int DEFAULT NULL,
  -- copied to student_document.label (varchar 50) at conversion, hence 50
  `label`               varchar(50)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- StorageService key under application_documents/; never sent to a client
  `file_path`           varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_name`       varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- sniffed from magic bytes: application/pdf | image/jpeg | image/png
  `mime_type`           varchar(64)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `size_bytes`          int DEFAULT NULL,
  `sha256`              char(64)     COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- applicant | staff | legacy (a pre-002 student_document a counsellor attached)
  `uploaded_via`        varchar(16)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploaded_by`         int DEFAULT NULL,
  `magic_link_id`       int DEFAULT NULL,
  -- Student Affairs (stage 6): pending | verified | rejected
  `verification_status` varchar(16)  COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''pending'',
  `reviewed_by`         int DEFAULT NULL,
  `reviewed_at`         datetime DEFAULT NULL,
  `rejection_reason`    varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- the student_document row this is mirrored in: the conversion copy, or
  -- the original for an attached legacy upload
  `student_document_id` int DEFAULT NULL,
  `created_at`          datetime NOT NULL,
  `updated_at`          datetime DEFAULT NULL,
  `deleted_at`          datetime DEFAULT NULL,
  `deleted_by`          int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_appdoc_app`         (`application_id`, `deleted_at`),
  KEY `idx_appdoc_requirement` (`application_id`, `requirement_id`),
  KEY `idx_appdoc_sha`         (`sha256`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT ''application_document already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- The Master Settings document checklist per course level. course_level is
-- the CANONICAL level (certification | diploma | ug | pg | doctorate), not
-- the free text in course.level ("Post Graduate", "Masters", "PG Diploma"):
-- the API classifies course.level with one shared function. The unique key
-- spans soft-deleted rows; re-adding revives the row. Seeded with nothing:
-- an Admin enters the checklist before go-live (decision 39).
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'document_requirement') = 0,
  'CREATE TABLE `document_requirement` (
  `id`               int NOT NULL AUTO_INCREMENT,
  `course_level`     varchar(32)  COLLATE utf8mb4_unicode_ci NOT NULL,
  -- document_type.id
  `document_type_id` int NOT NULL,
  `is_required`      boolean    NOT NULL DEFAULT 1,
  -- NULL = always; employment = only when the course requires employment
  `applies_when`     varchar(16)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `max_files`        smallint NOT NULL DEFAULT 1,
  `help_text`        varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order`       int NOT NULL DEFAULT 0,
  `created_by`       int DEFAULT NULL,
  `updated_by`       int DEFAULT NULL,
  `deleted_by`       int DEFAULT NULL,
  `created_at`       datetime DEFAULT NULL,
  `updated_at`       datetime DEFAULT NULL,
  `deleted_at`       datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_docreq_level_type` (`course_level`, `document_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT ''document_requirement already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- The machine-checkable eligibility rule (and "needs employment") for a
-- course, checked in the form's Education section. Not
-- course.eligibility_criteria, which is free-text copy the LMS displays.
-- No rule = needs_review, which does not block submission.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'course_admission_rule') = 0,
  'CREATE TABLE `course_admission_rule` (
  `id`                    int NOT NULL AUTO_INCREMENT,
  -- course.id (1:1)
  `course_id`             int NOT NULL,
  -- minimum on the ladder 10th < 12th < diploma < ug < pg < doctorate
  `min_qualification`     varchar(16)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `min_percentage`        decimal(5,2) DEFAULT NULL,
  `min_cgpa`              decimal(4,2) DEFAULT NULL,
  `requires_employment`   boolean    NOT NULL DEFAULT 0,
  `min_experience_months` smallint DEFAULT NULL,
  `notes`                 varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by`            int DEFAULT NULL,
  `updated_by`            int DEFAULT NULL,
  `created_at`            datetime DEFAULT NULL,
  `updated_at`            datetime DEFAULT NULL,
  `deleted_at`            datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_course_admission_rule_course` (`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT ''course_admission_rule already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Education records: what the spec asks for and the legacy table cannot
-- hold, added by ONE instant ALTER. The legacy `qualification` (free-text
-- label) and `percentage` (INT) columns keep their meaning: for a
-- percentage score the API also writes ROUND(score_value) into
-- `percentage`, so LMS screens still show it; for a CGPA it leaves
-- `percentage` NULL rather than invent a number. qualification.deleted_at
-- is an INT in this legacy table (1 = deleted), unlike every other table.
--   level_code    10th | 12th | diploma | ug | pg | doctorate
--   institution   school or college name (the legacy table has only board)
--   passing_year  the year of passing (the API validates 1950 - this year)
--   score_type    percentage | cgpa | grade
--   score_value   the exact score
--   score_scale   100 for a percentage, 10 or 4 for a CGPA, so eligibility
--                 compares like with like
SET @add := CONCAT_WS(', ',
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'qualification' AND COLUMN_NAME = 'level_code') = 0,
     'ADD COLUMN `level_code` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'qualification' AND COLUMN_NAME = 'institution') = 0,
     'ADD COLUMN `institution` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'qualification' AND COLUMN_NAME = 'passing_year') = 0,
     'ADD COLUMN `passing_year` smallint DEFAULT NULL', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'qualification' AND COLUMN_NAME = 'score_type') = 0,
     'ADD COLUMN `score_type` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'qualification' AND COLUMN_NAME = 'score_value') = 0,
     'ADD COLUMN `score_value` decimal(5,2) DEFAULT NULL', NULL),
  IF((SELECT COUNT(*) FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'qualification' AND COLUMN_NAME = 'score_scale') = 0,
     'ADD COLUMN `score_scale` decimal(5,2) DEFAULT NULL', NULL));
SET @stmt := IF(@add = '',
  'SELECT ''qualification: 002 columns already present'' AS note',
  CONCAT('ALTER TABLE `qualification` ', @add, ', ALGORITHM=INSTANT'));
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------
-- 5. Catalog: the intake schedule link, tagged courses, intake offerings.
-- ---------------------------------------------------------------------
-- `intake` is a v2 table (present and empty in production). Created here
-- only where it is missing, with exactly the shape schema.prisma had before
-- this file, so the link column below always has a table to land on.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'intake') = 0,
  'CREATE TABLE `intake` (
  `id`           int NOT NULL AUTO_INCREMENT,
  `name`         varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `month`        varchar(20)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `year`         int DEFAULT NULL,
  `start_date`   date DEFAULT NULL,
  `closing_date` date DEFAULT NULL,
  `status`       varchar(20)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by`   int DEFAULT NULL,
  `updated_by`   int DEFAULT NULL,
  `deleted_by`   int DEFAULT NULL,
  `updated_at`   datetime DEFAULT NULL,
  `created_at`   datetime DEFAULT NULL,
  `deleted_at`   datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT ''intake already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- The sessions.session_id this schedule belongs to (1:1). NULLable because
-- schedules can exist before they are linked; UNIQUE so one intake never has
-- two schedules. The API (WS3, academics) creates or links the sessions row
-- whenever it writes a schedule; nothing is backfilled here. The key is
-- named uq_intake_session_id - the name the IN01 work proposed - and is
-- guarded by column, so whichever DDL ran first there is exactly one.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'intake'
      AND COLUMN_NAME = 'session_id') = 0,
  'ALTER TABLE `intake` ADD COLUMN `session_id` int DEFAULT NULL, ALGORITHM=INSTANT',
  'SELECT ''intake.session_id already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS s
    WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = 'intake'
      AND s.NON_UNIQUE = 0 AND s.SEQ_IN_INDEX = 1 AND s.COLUMN_NAME = 'session_id'
      AND NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS s2
                       WHERE s2.TABLE_SCHEMA = s.TABLE_SCHEMA AND s2.TABLE_NAME = s.TABLE_NAME
                         AND s2.INDEX_NAME = s.INDEX_NAME AND s2.SEQ_IN_INDEX = 2)) = 0,
  'ALTER TABLE `intake` ADD UNIQUE KEY `uq_intake_session_id` (`session_id`), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''intake: a unique key on session_id already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Tagged courses (M:N): university X offers course Y, under its own name.
-- Replaces course.university_id as the answer to "which courses does X
-- offer" and "how many universities offer Y"; course.university_id itself
-- is never written by the mapping API. Because a course row can now be
-- tagged to more than one university, the API must take an application's
-- university from applications.university_id first and fall back to
-- course.university_id only for legacy rows where it is NULL. Untagging is
-- a soft delete; the unique key spans soft-deleted rows, so re-tagging
-- revives the old row.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'university_course') = 0,
  'CREATE TABLE `university_course` (
  `id`                     int NOT NULL AUTO_INCREMENT,
  -- university.id
  `university_id`          int NOT NULL,
  -- course.id: the same id applications.course_id and students.course_id store
  `course_id`              int NOT NULL,
  -- the university name for the programme; NULL = course.title
  `university_course_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `university_course_code` varchar(64)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- 1 = offered, 0 = paused (hidden from Add Lead, kept for history)
  `status`                 int DEFAULT 1,
  -- legacy_course (section 9) | ui | sync (nightly job)
  `source`                 varchar(32)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by`             int DEFAULT NULL,
  `updated_by`             int DEFAULT NULL,
  `deleted_by`             int DEFAULT NULL,
  `created_at`             datetime DEFAULT NULL,
  `updated_at`             datetime DEFAULT NULL,
  `deleted_at`             datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_university_course` (`university_id`, `course_id`),
  KEY `idx_university_course_course` (`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT ''university_course already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Offerings: university x course is open for admission in intake Z
-- (intake.id). Add Lead cascades on it, the Intakes screen counts from it,
-- and fee_structure shares its (university_id, course_id, intake_id) key.
-- The API writes a row only for a live, active university_course pair and an
-- intake linked to a session, and untagging soft-deletes the pair's rows.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'university_course_intake') = 0,
  'CREATE TABLE `university_course_intake` (
  `id`            int NOT NULL AUTO_INCREMENT,
  `university_id` int NOT NULL,
  `course_id`     int NOT NULL,
  -- intake.id
  `intake_id`     int NOT NULL,
  -- 1 = offered, 0 = withdrawn early (row kept for history)
  `status`        int DEFAULT 1,
  -- ui | copy | legacy_history (nightly job)
  `source`        varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by`    int DEFAULT NULL,
  `updated_by`    int DEFAULT NULL,
  `deleted_by`    int DEFAULT NULL,
  `created_at`    datetime DEFAULT NULL,
  `updated_at`    datetime DEFAULT NULL,
  `deleted_at`    datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_university_course_intake` (`university_id`, `course_id`, `intake_id`),
  KEY `idx_uci_intake` (`intake_id`),
  KEY `idx_uci_course` (`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT ''university_course_intake already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------
-- 6. Fee structures (spec 3.4).
-- ---------------------------------------------------------------------
-- The master: one row per (university, course, intake), enforced by a real
-- unique key. Fixed components are columns; the totals are recomputed by the
-- API in the same transaction as every save, so the Rs0 guard and fee-range
-- filters are plain SQL. Only Draft rows are deleted (hard, with an audit
-- snapshot); Active rows are expired, never deleted. Stage 4 snapshots the
-- registration fee into application_payment.amount_expected, so nothing
-- here is ever repointed; registration_fee is therefore decimal(10,2), the
-- same as the column it is snapshotted into.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fee_structure') = 0,
  'CREATE TABLE `fee_structure` (
  `id`                 int NOT NULL AUTO_INCREMENT,
  -- FEE-00042, set by the API in the insert transaction
  `code`               varchar(32)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `university_id`      int NOT NULL,
  `course_id`          int NOT NULL,
  -- intake.id (a scheduled intake that has a session_id)
  `intake_id`          int NOT NULL,
  -- draft | active | expired
  `status`             varchar(16)  COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''draft'',
  `currency`           char(3)      COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''INR'',
  -- Components (Phase 1 only USES registration_fee); decimal(10,2) = application_payment.amount_expected
  `registration_fee`   decimal(10,2) DEFAULT NULL,
  -- total | per_year | per_semester
  `course_fee_basis`   varchar(16)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- per basis unit (the whole amount when basis = total)
  `course_fee_amount`  decimal(12,2) DEFAULT NULL,
  -- number of years / semesters; 1 when basis = total
  `course_fee_periods` smallint DEFAULT NULL,
  -- amount x periods, written by the API; "a Rs0 course fee cannot be activated" reads this
  `course_fee_total`   decimal(12,2) DEFAULT NULL,
  `exam_fee`           decimal(12,2) DEFAULT NULL,
  -- one_time | per_year | per_semester
  `exam_fee_basis`     varchar(16)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- fee_structure_item expanded by basis, written by the API
  `other_fees_total`   decimal(12,2) DEFAULT NULL,
  -- course + exam + other, written by the API
  `total_fee`          decimal(12,2) DEFAULT NULL,
  `discount_allowed`   boolean    NOT NULL DEFAULT 0,
  -- 0-100, required when discount_allowed = 1
  `discount_max_pct`   decimal(5,2) DEFAULT NULL,
  -- Instalment plans offered (at least one is required to activate)
  `allow_full`         boolean    NOT NULL DEFAULT 1,
  `allow_per_year`     boolean    NOT NULL DEFAULT 0,
  `allow_per_semester` boolean    NOT NULL DEFAULT 0,
  -- the custom schedule lives in fee_structure_instalment
  `allow_custom`       boolean    NOT NULL DEFAULT 0,
  -- fee_structure.id this was copied from (copy to next intake)
  `copied_from_id`     int DEFAULT NULL,
  `activated_at`       datetime DEFAULT NULL,
  `activated_by`       int DEFAULT NULL,
  `expired_at`         datetime DEFAULT NULL,
  `expired_by`         int DEFAULT NULL,
  `notes`              text         COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by`         int DEFAULT NULL,
  `updated_by`         int DEFAULT NULL,
  `created_at`         datetime DEFAULT NULL,
  `updated_at`         datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fee_structure_key`  (`university_id`, `course_id`, `intake_id`),
  UNIQUE KEY `uq_fee_structure_code` (`code`),
  KEY `idx_fee_structure_intake_status` (`intake_id`, `status`),
  KEY `idx_fee_structure_course` (`course_id`),
  KEY `idx_fee_structure_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT ''fee_structure already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- "Other fees": named extra components (alumni fee, ID card, convocation),
-- replaced wholesale inside the parent's save transaction.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fee_structure_item') = 0,
  'CREATE TABLE `fee_structure_item` (
  `id`               int NOT NULL AUTO_INCREMENT,
  `fee_structure_id` int NOT NULL,
  -- optional: the fee_type label it was picked from
  `fee_type_id`      int DEFAULT NULL,
  `label`            varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount`           decimal(12,2) NOT NULL,
  -- one_time | per_year | per_semester
  `basis`            varchar(16)  COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''one_time'',
  `sort_order`       smallint NOT NULL DEFAULT 0,
  `created_by`       int DEFAULT NULL,
  `created_at`       datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_fee_structure_item_parent` (`fee_structure_id`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT ''fee_structure_item already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- The CUSTOM instalment schedule (allow_custom = 1 only). Due dates are an
-- offset from intake.start_date, so copy-to-next-intake needs no date
-- surgery. On activation SUM(amount) must equal total_fee.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fee_structure_instalment') = 0,
  'CREATE TABLE `fee_structure_instalment` (
  `id`               int NOT NULL AUTO_INCREMENT,
  `fee_structure_id` int NOT NULL,
  -- 1..n
  `seq`              smallint NOT NULL,
  `label`            varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount`           decimal(12,2) NOT NULL,
  -- days after intake.start_date (may be negative)
  `due_offset_days`  int NOT NULL DEFAULT 0,
  `created_by`       int DEFAULT NULL,
  `created_at`       datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fee_structure_instalment_seq` (`fee_structure_id`, `seq`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT ''fee_structure_instalment already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Who collects the fee: upcarrera_collects (upCarrera pays the university a
-- royalty) | university_collects (the university pays upCarrera a
-- commission). Phase 2 commission reads it; stage 4 defaults "paid to" from
-- it. NULL for every university until an Admin sets it; the API requires it
-- on create / edit and refuses to ACTIVATE a fee structure without it.
-- university.category ("Private University" ...) keeps its meaning.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'university'
      AND COLUMN_NAME = 'fee_collection_model') = 0,
  'ALTER TABLE `university` ADD COLUMN `fee_collection_model` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL, ALGORITHM=INSTANT',
  'SELECT ''university.fee_collection_model already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------
-- 7. Roles: a stable key, and the four Phase 1 roles at ids 101-104.
--
--    The API resolves roles through role_key, never through titles (an
--    admin can rename a role on the LMS screen) and never through new
--    hard-coded ids. Only the Super Admin bypass keeps its legacy id, 1.
--    Unique where set: every row without a key holds NULL, and NULLs never
--    clash under a unique key.
-- ---------------------------------------------------------------------
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_role'
      AND COLUMN_NAME = 'role_key') = 0,
  'ALTER TABLE `user_role` ADD COLUMN `role_key` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL, ALGORITHM=INSTANT',
  'SELECT ''user_role.role_key already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS s
    WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = 'user_role'
      AND s.NON_UNIQUE = 0 AND s.SEQ_IN_INDEX = 1 AND s.COLUMN_NAME = 'role_key'
      AND NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS s2
                       WHERE s2.TABLE_SCHEMA = s.TABLE_SCHEMA AND s2.TABLE_NAME = s.TABLE_NAME
                         AND s2.INDEX_NAME = s.INDEX_NAME AND s2.SEQ_IN_INDEX = 2)) = 0,
  'ALTER TABLE `user_role` ADD UNIQUE KEY `uq_user_role_role_key` (`role_key`), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''user_role: a unique key on role_key already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Key the eight legacy roles. The v2 API identifies every one of them
-- (super admin, telecaller, teacher, student, institution, counsellor,
-- admin, client - each is a hard-coded id somewhere in apps/api today).
-- Each is matched on id AND title, so a row whose meaning has changed is
-- left unkeyed (section 10 then shows fewer than 12) instead of being
-- granted the wrong permissions. No title is changed. Re-runs touch nothing
-- (role_key IS NULL). If a key is already used by another row the unique
-- key stops the file - deliberately: look before re-running.
UPDATE `user_role` SET `role_key` = 'super_admin'
 WHERE `id` = 1 AND `role_key` IS NULL AND TRIM(`title`) IN ('Super Admin', 'Superadmin', 'Super Administrator');
UPDATE `user_role` SET `role_key` = 'telecaller'
 WHERE `id` = 2 AND `role_key` IS NULL AND TRIM(`title`) IN ('Telecaller', 'Tele Caller');
UPDATE `user_role` SET `role_key` = 'teacher'
 WHERE `id` = 3 AND `role_key` IS NULL AND TRIM(`title`) = 'Teacher';
UPDATE `user_role` SET `role_key` = 'student'
 WHERE `id` = 4 AND `role_key` IS NULL AND TRIM(`title`) = 'Student';
UPDATE `user_role` SET `role_key` = 'institution'
 WHERE `id` = 5 AND `role_key` IS NULL AND TRIM(`title`) IN ('Institutions', 'Institution');
UPDATE `user_role` SET `role_key` = 'counsellor'
 WHERE `id` = 6 AND `role_key` IS NULL AND TRIM(`title`) IN ('Consultant', 'Counsellor', 'Counselor');
UPDATE `user_role` SET `role_key` = 'admin'
 WHERE `id` = 7 AND `role_key` IS NULL AND TRIM(`title`) = 'Admin';
UPDATE `user_role` SET `role_key` = 'client'
 WHERE `id` = 8 AND `role_key` IS NULL AND TRIM(`title`) = 'Client';

-- The four Phase 1 roles, at the RESERVED ids 101-104 (never AUTO_INCREMENT:
-- see SAFETY). A row an administrator already created AT the reserved id
-- with the same title is adopted (keyed); guard 0c has already stopped the
-- file if a reserved id holds anything else. A same-titled role at some
-- other id is NOT adopted - it could sit on an id the LMS gives a meaning
-- to - and section 10 lists it for the operator to resolve.
UPDATE `user_role` SET `role_key` = 'team_leader'
 WHERE `id` = 101 AND `role_key` IS NULL AND TRIM(`title`) = 'Team Leader';
UPDATE `user_role` SET `role_key` = 'manager'
 WHERE `id` = 102 AND `role_key` IS NULL AND TRIM(`title`) = 'Manager';
UPDATE `user_role` SET `role_key` = 'accounts'
 WHERE `id` = 103 AND `role_key` IS NULL AND TRIM(`title`) = 'Accounts';
UPDATE `user_role` SET `role_key` = 'student_affairs'
 WHERE `id` = 104 AND `role_key` IS NULL AND TRIM(`title`) = 'Student Affairs';

INSERT INTO `user_role` (`id`, `title`, `role_key`, `created_at`, `updated_at`)
SELECT 101, 'Team Leader', 'team_leader', UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `user_role` WHERE `role_key` = 'team_leader')
   AND NOT EXISTS (SELECT 1 FROM `user_role` WHERE `id` = 101);
INSERT INTO `user_role` (`id`, `title`, `role_key`, `created_at`, `updated_at`)
SELECT 102, 'Manager', 'manager', UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `user_role` WHERE `role_key` = 'manager')
   AND NOT EXISTS (SELECT 1 FROM `user_role` WHERE `id` = 102);
INSERT INTO `user_role` (`id`, `title`, `role_key`, `created_at`, `updated_at`)
SELECT 103, 'Accounts', 'accounts', UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `user_role` WHERE `role_key` = 'accounts')
   AND NOT EXISTS (SELECT 1 FROM `user_role` WHERE `id` = 103);
INSERT INTO `user_role` (`id`, `title`, `role_key`, `created_at`, `updated_at`)
SELECT 104, 'Student Affairs', 'student_affairs', UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `user_role` WHERE `role_key` = 'student_affairs')
   AND NOT EXISTS (SELECT 1 FROM `user_role` WHERE `id` = 104);

-- ---------------------------------------------------------------------
-- 8. Permissions: crm:-namespaced slugs, granted by role_key.
--
--    How the LMS reads role_permissions (application/app/Helpers/
--    permission_helper.php), and why these rows cannot change it:
--      * role 1 (Super Admin) uses has_permission_admin(), an INVERTED
--        list - a slug granted to role 1 HIDES that page from LMS Super
--        Admins. So this file, and every later one, grants NOTHING to
--        role 1; PermissionsGuard lets role 1 through regardless.
--      * roles 6 (consultant) and 8 (client) use allow-lists; the LMS never
--        asks about a crm: slug, so granting one changes nothing there.
--      * role 7 (Admin) calls has_permission_sub_admin(), which the LMS
--        never defines (only has_permission_sub_admint exists) - an
--        existing LMS fault, unaffected by these rows.
--      * roles 101-104 match no has_permission branch at all.
--    Rule for 002 and every later migration: grant only crm:-prefixed
--    slugs, never to role_id 1. Every comparison is column = literal, so
--    differing table collations on either engine can never raise
--    "Illegal mix of collations". permissions.title and slug are
--    varchar(50); every value below fits.
-- ---------------------------------------------------------------------
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM applications list', 'crm:applications.index', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:applications.index' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM application view', 'crm:applications.view', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:applications.view' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM application create (add lead)', 'crm:applications.create', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:applications.create' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM application edit (stages 1-2)', 'crm:applications.edit', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:applications.edit' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM application magic link', 'crm:applications.magic-link', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:applications.magic-link' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM application counsellor review', 'crm:applications.review', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:applications.review' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM application hold / resume', 'crm:applications.hold', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:applications.hold' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM application approve (SA)', 'crm:applications.approve', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:applications.approve' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM application reject (SA)', 'crm:applications.reject', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:applications.reject' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM application admin override', 'crm:applications.admin', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:applications.admin' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM registration fee record', 'crm:application-payments.create', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:application-payments.create' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM registration fee queue', 'crm:application-payments.index', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:application-payments.index' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM registration fee verify', 'crm:application-payments.verify', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:application-payments.verify' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM application document review', 'crm:application-documents.review', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:application-documents.review' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM fee structures view', 'crm:fee-structures.index', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:fee-structures.index' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM fee structures manage', 'crm:fee-structures.manage', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:fee-structures.manage' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM catalog view', 'crm:catalog.view', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:catalog.view' AND `deleted_at` IS NULL);
INSERT INTO `permissions` (`title`, `slug`, `created_at`)
SELECT 'CRM catalog manage', 'crm:catalog.manage', UTC_TIMESTAMP() FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `slug` = 'crm:catalog.manage' AND `deleted_at` IS NULL);

-- Grants: one statement per role (52 in all: telecaller 1, counsellor 9,
-- team leader 5, manager 5, accounts 7, student affairs 7, admin 18). A
-- role whose key did not resolve in section 7 simply receives nothing (and
-- section 10 shows it). `r.id <> 1` is belt and braces: role 1 is never
-- granted anything.
INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_on`)
SELECT r.`id`, p.`id`, UTC_TIMESTAMP()
  FROM `user_role` r
  JOIN `permissions` p ON p.`deleted_at` IS NULL AND p.`slug` IN (
       'crm:catalog.view')
 WHERE r.`role_key` = 'telecaller' AND r.`id` <> 1
   AND NOT EXISTS (SELECT 1 FROM `role_permissions` rp
                    WHERE rp.`role_id` = r.`id` AND rp.`permission_id` = p.`id` AND rp.`deleted_at` IS NULL);

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_on`)
SELECT r.`id`, p.`id`, UTC_TIMESTAMP()
  FROM `user_role` r
  JOIN `permissions` p ON p.`deleted_at` IS NULL AND p.`slug` IN (
       'crm:applications.index', 'crm:applications.view', 'crm:applications.create',
       'crm:applications.edit', 'crm:applications.magic-link', 'crm:applications.review',
       'crm:applications.hold', 'crm:application-payments.create', 'crm:catalog.view')
 WHERE r.`role_key` = 'counsellor' AND r.`id` <> 1
   AND NOT EXISTS (SELECT 1 FROM `role_permissions` rp
                    WHERE rp.`role_id` = r.`id` AND rp.`permission_id` = p.`id` AND rp.`deleted_at` IS NULL);

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_on`)
SELECT r.`id`, p.`id`, UTC_TIMESTAMP()
  FROM `user_role` r
  JOIN `permissions` p ON p.`deleted_at` IS NULL AND p.`slug` IN (
       'crm:applications.index', 'crm:applications.view', 'crm:applications.create',
       'crm:applications.hold', 'crm:catalog.view')
 WHERE r.`role_key` IN ('team_leader', 'manager') AND r.`id` <> 1
   AND NOT EXISTS (SELECT 1 FROM `role_permissions` rp
                    WHERE rp.`role_id` = r.`id` AND rp.`permission_id` = p.`id` AND rp.`deleted_at` IS NULL);

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_on`)
SELECT r.`id`, p.`id`, UTC_TIMESTAMP()
  FROM `user_role` r
  JOIN `permissions` p ON p.`deleted_at` IS NULL AND p.`slug` IN (
       'crm:applications.index', 'crm:applications.view', 'crm:applications.hold',
       'crm:application-payments.index', 'crm:application-payments.verify',
       'crm:fee-structures.index', 'crm:catalog.view')
 WHERE r.`role_key` = 'accounts' AND r.`id` <> 1
   AND NOT EXISTS (SELECT 1 FROM `role_permissions` rp
                    WHERE rp.`role_id` = r.`id` AND rp.`permission_id` = p.`id` AND rp.`deleted_at` IS NULL);

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_on`)
SELECT r.`id`, p.`id`, UTC_TIMESTAMP()
  FROM `user_role` r
  JOIN `permissions` p ON p.`deleted_at` IS NULL AND p.`slug` IN (
       'crm:applications.index', 'crm:applications.view', 'crm:applications.hold',
       'crm:applications.approve', 'crm:applications.reject',
       'crm:application-documents.review', 'crm:catalog.view')
 WHERE r.`role_key` = 'student_affairs' AND r.`id` <> 1
   AND NOT EXISTS (SELECT 1 FROM `role_permissions` rp
                    WHERE rp.`role_id` = r.`id` AND rp.`permission_id` = p.`id` AND rp.`deleted_at` IS NULL);

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_on`)
SELECT r.`id`, p.`id`, UTC_TIMESTAMP()
  FROM `user_role` r
  JOIN `permissions` p ON p.`deleted_at` IS NULL AND p.`slug` IN (
       'crm:applications.index', 'crm:applications.view', 'crm:applications.create',
       'crm:applications.edit', 'crm:applications.magic-link', 'crm:applications.review',
       'crm:applications.hold', 'crm:applications.approve', 'crm:applications.reject',
       'crm:applications.admin', 'crm:application-payments.create',
       'crm:application-payments.index', 'crm:application-payments.verify',
       'crm:application-documents.review', 'crm:fee-structures.index',
       'crm:fee-structures.manage', 'crm:catalog.view', 'crm:catalog.manage')
 WHERE r.`role_key` = 'admin' AND r.`id` <> 1
   AND NOT EXISTS (SELECT 1 FROM `role_permissions` rp
                    WHERE rp.`role_id` = r.`id` AND rp.`permission_id` = p.`id` AND rp.`deleted_at` IS NULL);

-- ---------------------------------------------------------------------
-- 9. Backfills. Each writes ONLY a table or column this file created, and
--    each is idempotent: its WHERE clause matches nothing once it has run.
-- ---------------------------------------------------------------------
-- 9a. Tagged courses from the legacy 1:N course.university_id. Reads course
--     and university, writes only university_course. NULL name = "use
--     course.title", so a later course rename still shows. The nightly
--     catalog-sync job re-runs this statement with source 'sync', so
--     courses the LMS creates with a university_id appear within a day.
INSERT INTO `university_course`
       (`university_id`, `course_id`, `university_course_name`, `status`, `source`, `created_at`, `updated_at`)
SELECT c.`university_id`, c.`id`, NULL, 1, 'legacy_course', UTC_TIMESTAMP(), UTC_TIMESTAMP()
  FROM `course` c
  JOIN `university` u ON u.`id` = c.`university_id` AND u.`deleted_at` IS NULL
 WHERE c.`deleted_at` IS NULL
   AND c.`university_id` > 0
   AND NOT EXISTS (SELECT 1 FROM `university_course` x
                    WHERE x.`university_id` = c.`university_id` AND x.`course_id` = c.`id`);

-- 9b. applications.phone_normalized from applications.phone, with exactly
--     the rule of the API's normalizeIndianMobile() (section 2):
--       strip whitespace exactly as JS \s defines it (space, TAB, CR, LF,
--       VT, FF, NBSP, U+1680, U+2000-U+200A, U+2028, U+2029, U+202F,
--       U+205F, U+3000, U+FEFF) and '(', ')', '.', '-'  then
--       ^([+]91|91|0)?[6-9][0-9]{9}$  ->  the last 10 digits,  else NULL.
--     So "98765 43210", "+91 9876543210", "09876543210" and "919876543210"
--     all become 9876543210, "9123456789" stays 9123456789, and "12",
--     "5876543210", "0501234567" or "+971501234567" become NULL. Never
--     LIKE-matched on digits: a number that is not a valid Indian mobile is
--     no duplicate key.
--     It RE-SYNCS: it writes every row whose stored value differs from the
--     value its phone gives (NULL-safe), so a re-run - or a nightly run -
--     also repairs rows the LMS inserted or edited, and a second run right
--     after the first changes 0 rows. Only phone_normalized is written.
--     The COLLATE is load-bearing: in production `phone` is
--     utf8mb4_general_ci and phone_normalized utf8mb4_unicode_ci, and
--     comparing the two without it raises "Illegal mix of collations".
UPDATE `applications`
   SET `phone_normalized` =
       CASE WHEN REGEXP_REPLACE(`phone`, '[\\s\\x{00A0}\\x{1680}\\x{2000}-\\x{200A}\\x{2028}\\x{2029}\\x{202F}\\x{205F}\\x{3000}\\x{FEFF}().-]', '') REGEXP '^([+]91|91|0)?[6-9][0-9]{9}$'
            THEN RIGHT(REGEXP_REPLACE(`phone`, '[\\s\\x{00A0}\\x{1680}\\x{2000}-\\x{200A}\\x{2028}\\x{2029}\\x{202F}\\x{205F}\\x{3000}\\x{FEFF}().-]', ''), 10) END
 WHERE NOT (`phone_normalized` <=>
       (CASE WHEN REGEXP_REPLACE(`phone`, '[\\s\\x{00A0}\\x{1680}\\x{2000}-\\x{200A}\\x{2028}\\x{2029}\\x{202F}\\x{205F}\\x{3000}\\x{FEFF}().-]', '') REGEXP '^([+]91|91|0)?[6-9][0-9]{9}$'
             THEN RIGHT(REGEXP_REPLACE(`phone`, '[\\s\\x{00A0}\\x{1680}\\x{2000}-\\x{200A}\\x{2028}\\x{2029}\\x{202F}\\x{205F}\\x{3000}\\x{FEFF}().-]', ''), 10) END) COLLATE utf8mb4_bin);

-- ---------------------------------------------------------------------
-- 10. Verification - run these and read the numbers before walking away.
-- ---------------------------------------------------------------------
SELECT '002 tables present (expect 15)' AS metric, COUNT(*) AS value
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME IN ('audit_log', 'application_stage_log', 'application_payment',
                      'application_sa_review', 'doc_sequence', 'application_magic_link',
                      'application_form', 'application_document', 'document_requirement',
                      'course_admission_rule', 'university_course', 'university_course_intake',
                      'fee_structure', 'fee_structure_item', 'fee_structure_instalment')
UNION ALL
SELECT '002 columns on existing tables (expect 17)', COUNT(*)
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
SELECT '002 indexes on existing tables (expect 6)', COUNT(DISTINCT TABLE_NAME, INDEX_NAME)
  FROM information_schema.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE()
   AND INDEX_NAME IN ('idx_applications_stage', 'idx_applications_owner', 'idx_applications_phone_norm',
                      'uq_students_student_no', 'uq_user_role_role_key', 'uq_intake_session_id')
UNION ALL
SELECT 'roles with a role_key (expect 12)', COUNT(*) FROM `user_role` WHERE `role_key` IS NOT NULL AND `deleted_at` IS NULL
UNION ALL
SELECT 'Phase 1 roles at ids 101-104 (expect 4)', COUNT(*)
  FROM `user_role`
 WHERE (`id`, `role_key`) IN ((101, 'team_leader'), (102, 'manager'), (103, 'accounts'), (104, 'student_affairs'))
   AND `deleted_at` IS NULL
UNION ALL
SELECT 'Phase 1 roles soft-deleted in the LMS (expect 0)', COUNT(*)
  FROM `user_role` WHERE `id` IN (101, 102, 103, 104) AND `deleted_at` IS NOT NULL
UNION ALL
SELECT 'other roles sharing a Phase 1 title (expect 0)', COUNT(*)
  FROM `user_role`
 WHERE `deleted_at` IS NULL AND `id` NOT IN (101, 102, 103, 104)
   AND TRIM(`title`) IN ('Team Leader', 'Manager', 'Accounts', 'Student Affairs')
UNION ALL
SELECT 'crm: permissions (expect 18)', COUNT(*) FROM `permissions` WHERE `slug` LIKE 'crm:%' AND `deleted_at` IS NULL
UNION ALL
SELECT 'crm: grants (expect 52)', COUNT(*)
  FROM `role_permissions` rp JOIN `permissions` p ON p.`id` = rp.`permission_id`
 WHERE p.`slug` LIKE 'crm:%' AND p.`deleted_at` IS NULL AND rp.`deleted_at` IS NULL
UNION ALL
SELECT 'crm: grants to Super Admin, role 1 (expect 0)', COUNT(*)
  FROM `role_permissions` rp JOIN `permissions` p ON p.`id` = rp.`permission_id`
 WHERE p.`slug` LIKE 'crm:%' AND rp.`role_id` = 1 AND rp.`deleted_at` IS NULL
UNION ALL
SELECT 'crm: grants to roles without a role_key (expect 0)', COUNT(*)
  FROM `role_permissions` rp
  JOIN `permissions` p ON p.`id` = rp.`permission_id`
  LEFT JOIN `user_role` r ON r.`id` = rp.`role_id`
 WHERE p.`slug` LIKE 'crm:%' AND rp.`deleted_at` IS NULL AND r.`role_key` IS NULL
UNION ALL
SELECT 'applications with a stage (expect 0: nothing rewritten)', COUNT(*) FROM `applications` WHERE `stage` IS NOT NULL
UNION ALL
SELECT 'stage-managed applications converted outside the CRM (expect 0)', COUNT(*)
  FROM `applications` WHERE `stage` IS NOT NULL AND `stage` <> 'converted' AND `is_converted` = 1
UNION ALL
SELECT 'applications with a phone (informational)', COUNT(*) FROM `applications` WHERE `phone` IS NOT NULL AND `phone` <> ''
UNION ALL
SELECT 'applications with a canonical mobile in phone_normalized', COUNT(*) FROM `applications` WHERE `phone_normalized` IS NOT NULL
UNION ALL
SELECT 'phone_normalized out of step with phone (expect 0)', COUNT(*)
  FROM `applications`
 WHERE NOT (`phone_normalized` <=>
       (CASE WHEN REGEXP_REPLACE(`phone`, '[\\s\\x{00A0}\\x{1680}\\x{2000}-\\x{200A}\\x{2028}\\x{2029}\\x{202F}\\x{205F}\\x{3000}\\x{FEFF}().-]', '') REGEXP '^([+]91|91|0)?[6-9][0-9]{9}$'
             THEN RIGHT(REGEXP_REPLACE(`phone`, '[\\s\\x{00A0}\\x{1680}\\x{2000}-\\x{200A}\\x{2028}\\x{2029}\\x{202F}\\x{205F}\\x{3000}\\x{FEFF}().-]', ''), 10) END) COLLATE utf8mb4_bin)
UNION ALL
SELECT 'students with a student_no (expect 0)', COUNT(*) FROM `students` WHERE `student_no` IS NOT NULL
UNION ALL
SELECT 'qualification rows with a level_code (expect 0)', COUNT(*) FROM `qualification` WHERE `level_code` IS NOT NULL
UNION ALL
SELECT 'tagged courses (mapping)', COUNT(*) FROM `university_course` WHERE `deleted_at` IS NULL
UNION ALL
SELECT 'tagged courses (legacy column)', COUNT(*)
  FROM `course` c JOIN `university` u ON u.`id` = c.`university_id` AND u.`deleted_at` IS NULL
 WHERE c.`deleted_at` IS NULL AND c.`university_id` > 0
UNION ALL
SELECT 'legacy tagged courses missing a mapping (expect 0)', COUNT(*)
  FROM `course` c JOIN `university` u ON u.`id` = c.`university_id` AND u.`deleted_at` IS NULL
 WHERE c.`deleted_at` IS NULL AND c.`university_id` > 0
   AND NOT EXISTS (SELECT 1 FROM `university_course` x
                    WHERE x.`university_id` = c.`university_id` AND x.`course_id` = c.`id`)
UNION ALL
SELECT 'intake schedules (informational)', COUNT(*) FROM `intake` WHERE `deleted_at` IS NULL
UNION ALL
SELECT 'intake schedules linked to a session (informational)', COUNT(*) FROM `intake` WHERE `session_id` IS NOT NULL AND `deleted_at` IS NULL
UNION ALL
SELECT 'universities without a fee collection model (informational)', COUNT(*)
  FROM `university` WHERE `deleted_at` IS NULL AND `fee_collection_model` IS NULL
UNION ALL
SELECT 'fee structures (0 on first run)', COUNT(*) FROM `fee_structure`;

-- Expected on first run against production: 15, 17, 6, 12, 4, 0, 0, 18, 52,
-- 0, 0, 0, 0; then about 850 applications with a phone, of which most have
-- a canonical mobile (the March 2026 dump: 481 of 516 - the rest are
-- foreign numbers, typos and blanks, correctly NULL), and 0 out of step;
-- 0, 0; the two tagged-course counts equal (134 in the March dump; the old
-- KPI summed only the first 100 universities) and 0 missing; the intake
-- counts are informational (0 in production, whatever IN01 has written
-- elsewhere); every live university without a collection model; 0 fee
-- structures.
--
-- Those zeros are CORRECT. Stages are written by the CRM from the first
-- move onward, STU numbers by the first conversion, and collection models,
-- fee structures and offerings are entered by an Admin through the UI. QA
-- should expect blank collection models and empty fee-structure and
-- offering screens until then, and should NOT log it as a regression.
--
-- If "roles with a role_key" is below 12, run
--   SELECT id, title, role_key FROM user_role ORDER BY id;
-- fix the title (or set the key by hand), and re-run this file: sections 7
-- and 8 then key and grant only what is missing. If "crm: grants" drops
-- below 52 later (an LMS replace-all save of role 6 or 7), re-run this
-- file - as the app user is enough once the DDL is in place.
