-- =====================================================================
-- 004 - Staff self-serve password reset + session invalidation
--
-- Phase 1 go-live follow-up. Adds a production-grade password-recovery path for
-- STAFF (the CRM login accounts in `users`), mirroring the already-reviewed WS5
-- applicant magic-link security model:
--
--   * `password_reset` - one row per issued one-time code (OTP). The DB stores
--     ONLY a bcrypt hash of the 6-digit code (never the code itself); the code
--     lives only in the email. Short expiry, single active code per user, a hard
--     attempt cap (brute-force guard on the 6-digit space) and a 24h issuance cap.
--   * `users.password_changed_at` - the instant the password last changed via a
--     reset (self-serve OR admin). The staff JwtStrategy rejects any token issued
--     before this, so a reset immediately invalidates every older session (the
--     point of account recovery / an admin lock-out). NULL for every existing
--     row, so NO current session is affected until a password is actually reset.
--
-- SAFETY. Additive, idempotent, no data rewritten. One guarded CREATE TABLE and
-- one guarded INSTANT column add. Re-running it is a no-op. The LMS never reads
-- either object. The app user is DML-only, so apply as MariaDB root.
--
-- APPLY (as MariaDB root, after a backup):
--   mysql --defaults-file=<creds> lms_upcarrera < database/migrations/004-staff-password-reset.sql
-- or via CyberPanel phpMyAdmin: select lms_upcarrera, Import this file.
-- If phpMyAdmin's Import resolves DATABASE() to information_schema (as it did for
-- 003), run the two fully-qualified statements at the bottom of this file in the
-- SQL tab instead.
-- =====================================================================

SET SESSION lock_wait_timeout = 10;
SET SESSION innodb_lock_wait_timeout = 10;

-- ---- password_reset (guarded CREATE) --------------------------------------
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'password_reset') = 0,
  'CREATE TABLE `password_reset` (
    `id`            int          NOT NULL AUTO_INCREMENT,
    `user_id`       int          NOT NULL,
    -- bcrypt($2) hash of the 6-digit code; the plaintext code is only ever emailed.
    `otp_hash`      varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
    `expires_at`    datetime     NOT NULL,
    `consumed_at`   datetime     DEFAULT NULL,
    `revoked_at`    datetime     DEFAULT NULL,
    -- failed verify attempts against this code; the code is burned at the cap.
    `attempt_count` int          NOT NULL DEFAULT 0,
    `sent_to_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    -- pending | sent | failed
    `email_status`  varchar(16)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `email_error`   varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `last_ip`       varchar(45)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `created_at`    datetime     NOT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_pwreset_user`    (`user_id`, `created_at`),
    KEY `idx_pwreset_expires` (`expires_at`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT ''password_reset already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ---- users.password_changed_at (guarded INSTANT add) ----------------------
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'password_changed_at') = 0,
  'ALTER TABLE `users` ADD COLUMN `password_changed_at` datetime DEFAULT NULL, ALGORITHM=INSTANT',
  'SELECT ''users.password_changed_at already present'' AS note');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ---- Verification (expect: 1, 1) ------------------------------------------
SELECT 'password_reset table (want 1)' AS metric, COUNT(*) AS value
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'password_reset'
UNION ALL
SELECT 'users.password_changed_at (want 1)', COUNT(*)
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_changed_at';

-- =====================================================================
-- phpMyAdmin SQL-tab fallback (run these if the guarded Import above errors with
-- #1044 because DATABASE() resolved to information_schema — as happened for 003).
-- Both are safe to run once; re-running errors harmlessly ("already exists").
-- =====================================================================
-- CREATE TABLE `lms_upcarrera`.`password_reset` (
--   `id` int NOT NULL AUTO_INCREMENT,
--   `user_id` int NOT NULL,
--   `otp_hash` varchar(100) NOT NULL,
--   `expires_at` datetime NOT NULL,
--   `consumed_at` datetime DEFAULT NULL,
--   `revoked_at` datetime DEFAULT NULL,
--   `attempt_count` int NOT NULL DEFAULT 0,
--   `sent_to_email` varchar(255) DEFAULT NULL,
--   `email_status` varchar(16) DEFAULT NULL,
--   `email_error` varchar(255) DEFAULT NULL,
--   `last_ip` varchar(45) DEFAULT NULL,
--   `created_at` datetime NOT NULL,
--   PRIMARY KEY (`id`),
--   KEY `idx_pwreset_user` (`user_id`,`created_at`),
--   KEY `idx_pwreset_expires` (`expires_at`)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ALTER TABLE `lms_upcarrera`.`users` ADD COLUMN `password_changed_at` datetime DEFAULT NULL;
