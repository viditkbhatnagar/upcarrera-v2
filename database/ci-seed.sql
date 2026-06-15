-- CI seed — minimal deterministic fixture (NO PII). For GitHub Actions e2e only.
-- The schema is created by `prisma db push` from apps/api/prisma/schema.prisma.
-- Admin login used by the e2e suite: upcarrera.superadmin / upcarrera@2024
-- (the password below is a bcrypt hash of that string).
SET FOREIGN_KEY_CHECKS = 0;

INSERT INTO user_role (id, title) VALUES
 (1,'Super Admin'),(2,'Telecaller'),(3,'Teacher'),(4,'Student'),
 (5,'Institutions'),(6,'Consultant'),(7,'Admin'),(8,'Client');

INSERT INTO users (id, role_id, name, username, email, phone, password, status, created_at) VALUES
 (1,1,'Super Admin','upcarrera.superadmin','admin@ci.local','9000000000',
  '$2a$10$bW4rF4ui7AlzxspQ7HWHl.9QnqbBa2O4PxrGAln/bllhOL1QKBqtW',1,NOW()),
 (2,4,'CI Student','ci.student','student@ci.local','9000000001',
  '$2a$10$bW4rF4ui7AlzxspQ7HWHl.9QnqbBa2O4PxrGAln/bllhOL1QKBqtW',1,NOW());

INSERT INTO course (id, title, short_name, stream, total_duration, total_amount, study_mode, is_lms_course, created_at) VALUES
 (1,'CI Course','CIC','Management','2',1000,'Online',0,NOW());

INSERT INTO students (id, student_id, course_id, admission_status, address, consultant_id, created_at) VALUES
 (1,2,1,2,'CI Address',1,NOW());

INSERT INTO lead_status (id, title, created_at) VALUES
 (1,'Pending',NOW()),(3,'Follow-up',NOW()),(4,'Not interested',NOW()),(5,'Confirmed',NOW());

INSERT INTO lead_source (id, title, created_at) VALUES
 (1,'Website',NOW()),(2,'Referral',NOW());

INSERT INTO invoice (id, student_id, course_id, payment_status, total_amount, discount_amount, payable_amount, date, created_at) VALUES
 (1,2,1,'pending',1000,0,1000,CURDATE(),NOW());

SET FOREIGN_KEY_CHECKS = 1;
