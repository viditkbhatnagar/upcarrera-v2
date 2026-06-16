The backlog arrays enumerate more lines than the `portNeeded` counts in some clusters (one PHP method can map to multiple proposed endpoints, and a few endpoints recur across clusters). I'll report using the per-cluster `counts` blocks as the canonical method-level tally (since those sum cleanly at the cluster level and are what "legacy endpoints" means), note the two arithmetic discrepancies transparently, and use the de-duplicated backlog as the build list. Now I'll write the report.

# upcarrera — Migration Coverage Gap Report

> **Scope.** Every public controller method across all six legacy PHP surfaces (App CRM/Sales, App Students+Academics, App Teachers+Sessions, App Finance+Admin+Platform, Student web portal, Mobile/JSON API) classified as **PORTED**, **SUBSUMED-by-SPA**, **SKIP**, or **PORT_NEEDED**. This is the definitive "what's left for 100%" document for the PHP→TypeScript (NestJS + Prisma + Next.js) port.
>
> **Data-integrity note.** Two clusters had internal arithmetic that did not foot to their stated totals: *Students+Academics* (stated total 145, classified rows sum to 146) and *Finance+Admin+Platform* (stated total 129, classified rows sum to 135). Headline numbers below use the **classified-row sums** (the actual enumerated methods), which are the load-bearing figures. The discrepancy is +7 methods, all on the PORT_NEEDED / SUBSUMED side, so the gap is if anything slightly *understated* by the original totals.

---

## Headline numbers

| Metric | Count | Notes |
|---|---:|---|
| **Total legacy controller methods** | **573** | Sum of all classified rows across 6 clusters |
| **PORTED** — already exists in TS API | **122** | 21.3% of all methods |
| **SUBSUMED** — React SPA replaces, no backend needed | **151** | 26.4% — `ajax_*`/`index`/`view` HTML-fragment renderers |
| **SKIP** — dead / duplicate / broken — do **not** port | **52** | 9.1% — debug stubs, `construction_page()`, `_old` duplicates, `print_r;exit` artifacts |
| **PORT_NEEDED** — the real gap | **248** | 43.3% of all methods; **48.2% of the live surface** |
| **Live surface** (total − skip) | **514** | The denominator that matters |

### Effective functional coverage

```
coverage = (PORTED + SUBSUMED) / (TOTAL − SKIP)
         = (122 + 151) / (573 − 52)
         = 273 / 514
         = 53.1%
```

| | % of live surface |
|---|---:|
| Already PORTED (real backend done) | 23.7% |
| SUBSUMED by SPA (no backend work) | 29.4% |
| **Effective functional coverage** | **53.1%** |
| **Remaining gap (PORT_NEEDED)** | **48.2%** |

> **Read this correctly.** Roughly *half* the live surface is functionally covered, but only ~24% of that is actual ported backend — the other ~29% is HTML-render methods the React SPA absorbs for free. **The remaining build list is 248 PORT_NEEDED methods**, which de-duplicate to roughly **~230 distinct endpoints** once cross-cluster repeats (lead-source CRUD, lead-status CRUD, country CRUD, `get_students_by_teacher`, teacher-by-course filters, admin password-reset, lead activity, demo-session CRUD, etc.) are collapsed. The Mobile/JSON API cluster is the healthiest (49 ported); the Student web portal is the weakest (0 ported, 16 of 36 methods dead).

### Per-cluster breakdown

| Cluster | Total | Ported | Subsumed | Skip | **Port-Needed** | Live coverage |
|---|---:|---:|---:|---:|---:|---:|
| App CRM/Sales | 76 | 9 | 22 | 9 | **36** | 46% |
| App Students+Academics | 146 | 36 | 46 | 3 | **61** | 57% |
| App Teachers+Sessions | 85 | 10 | 27 | 8 | **40** | 48% |
| App Finance+Admin+Platform | 135 | 18 | 49 | 12 | **56** | 54% |
| Student web portal | 36 | 0 | 6 | 16 | **14** | 30% |
| Mobile/JSON API | 95 | 49 | 1 | 4 | **41** | 55% |
| **Total** | **573** | **122** | **151** | **52** | **248** | **53.1%** |

---

## The gap

The PORT_NEEDED backlog, grouped by domain. Each line is a build item. Where a legacy method recurs across clusters (e.g. lead-source CRUD appears in both App and Mobile), it is listed **once** in its primary domain with a `(also: …)` note. **Check the box when the TS endpoint ships and is integration-tested.**

### CRM — Leads & lead lifecycle

- [ ] `GET /api/leads/:id/activity` — ordered `lead_activity` log (status changes, followup dates, remarks) joined to `lead_status` title (legacy: `Leads::ajax_lead_history`, `Api/Lead::history`)
- [ ] `PATCH /api/leads/:id/verify` — set `is_verified=1`, `verified_by`, `verified_at`; also updates name/phone/email/course during the verify step (legacy: `Leads::verify_lead`)
- [ ] `PATCH /api/leads/:id/telecaller` — dedicated assignment action that sets only `telecaller_id` (legacy: `Leads::update_telecaller`)
- [ ] `GET /api/leads/followups` — leads with `lead_status_id=3`, not converted, role-scoped, split into current vs upcoming (`followup_date > today`) buckets; filter by date/source/telecaller/course/manager (legacy: `Followups::index`, `Api/Lead::followups`)
- [ ] `POST /api/subjects/teachers-by-subjects` — body `{subject_ids:[]}`, returns each subject with nested assigned teachers; used in lead-to-student conversion (legacy: `Leads::get_subjects_teachers_students_by_subjects`)
- [ ] `GET /api/courses/:id/subjects-with-teachers` — all subjects for a course, each with assigned teachers; convert flow (legacy: `Leads::get_subjects_teachers_students_by_course`)
- [ ] `GET /api/leads/syllabus` — static enum `[state, cbse, icse, igcse]` for mobile lead form (legacy: `Api/Lead::syllabus`)
- [ ] `GET /api/leads/classes` — static class/grade levels (Early Learning … +2) for mobile lead form (legacy: `Api/Lead::classes`)

### CRM — Lead reference data (Lead source / Lead status / Country)

- [ ] `PATCH /api/lead-sources/:id` — update lead-source title (legacy: `Lead_source::edit`, `Api/Lead_source::edit`)
- [ ] `DELETE /api/lead-sources/:id` — remove a lead source (legacy: `Lead_source::delete`, `Api/Lead_source::delete`)
- [ ] `POST /api/lead-statuses` — create a lead status (legacy: `Lead_status::add`, `Api/Lead_status::add`)
- [ ] `PATCH /api/lead-statuses/:id` — update lead-status title (legacy: `Lead_status::edit`, `Api/Lead_status::edit`)
- [ ] `DELETE /api/lead-statuses/:id` — remove a lead status (legacy: `Lead_status::delete`, `Api/Lead_status::delete`)
- [ ] `POST /api/countries` — create country (title, short_description) (legacy: `Country::add`, `Api/Country::add`)
- [ ] `PATCH /api/countries/:id` — update country (legacy: `Country::edit`, `Api/Country::edit`)
- [ ] `DELETE /api/countries/:id` — delete country (legacy: `Country::delete`, `Api/Country::delete`)

### CRM — Telecallers & Consultants (role-scoped user classes)

- [ ] `GET /api/telecallers` — users with `role_id=2`, `?search` filter (legacy: `Telecallers::index`)
- [ ] `POST /api/telecallers` — create `role_id=2` user with profile-picture upload (legacy: `Telecallers::add`)
- [ ] `PATCH /api/telecallers/:id` — update telecaller profile incl. optional picture (legacy: `Telecallers::edit`)
- [ ] `GET /api/consultants` — users with `role_id=6`, search/status filters, university lookup map (legacy: `Consultant::index`)
- [ ] `GET /api/consultants/:id` — consultant profile + country join + enrolled-students list + total count (legacy: `Consultant::view`)
- [ ] `POST /api/consultants` — create `role_id=6` user with consultant fields (gender, dob, doj, languages, qualification, `assigned_universities` JSON), picture, welcome email (legacy: `Consultant::add`)
- [ ] `PATCH /api/consultants/:id` — update consultant fields incl. `assigned_universities` JSON (legacy: `Consultant::edit`)
- [ ] `GET /api/consultants/:id/universities` — list universities assigned to a consultant (legacy: `Consultant::assigned_universities`)
- [ ] `PUT /api/consultants/:id/universities` — replace the entire `assigned_universities` set (legacy: `Consultant::add_university`)
- [ ] `DELETE /api/consultants/:id/universities/:university_id` — remove one university from the JSON array (legacy: `Consultant::delete_university`)

### CRM — Consultant & sales analytics

- [ ] `GET /api/consultants/performance` — all consultants with `total_students` and total fee revenue (legacy: `Consultant::performance`)
- [ ] `GET /api/consultants/:id/performance` — single-consultant detail: student list, totals, fee revenue (legacy: `Consultant::view_performance`)
- [ ] `GET /api/consultants/admissions` — cross-consultant admissions list (all `role_id=4` + students join), filter search/status/university, total fee (legacy: `Consultant::admissions`)
- [ ] `GET /api/consultants/admissions/:student_id` — single student full profile in consultant context (enrollment, documents, academic summaries, consultant info) (legacy: `Consultant::view_admission`)
- [ ] `GET /api/reports/consultant-performance` — consultants with per-consultant student count and total fee; filter search/status/university (legacy: `Reports::consultant_performance_report`)

### CRM — Consultant targets (entirely unported entity)

- [ ] `GET /api/consultant-targets` — targets + user-name join, computed performance % in two modes (type=1 specialisation points, type=2 student count); filter search/type/state (legacy: `Consultant_target::index`)
- [ ] `GET /api/consultant-targets/:id` — single target + consultant name (legacy: `Consultant_target::view`)
- [ ] `POST /api/consultant-targets` — create target (type, date range, value) with overlapping-date-range conflict validation (legacy: `Consultant_target::add`)
- [ ] `PATCH /api/consultant-targets/:id` — update target type/dates/value (legacy: `Consultant_target::edit`)
- [ ] `DELETE /api/consultant-targets/:id` — delete target (legacy: `Consultant_target::delete`)

### CRM — Sales teams (entirely unported domain — `sales_model`)

- [ ] `GET /api/sales-teams` — list teams; filter course/university/leader/consultant (legacy: `Sales::index`)
- [ ] `GET /api/sales-teams/:id` — single team + university/consultant/course lookups (legacy: `Sales::view`)
- [ ] `POST /api/sales-teams` — create team (name, leader, members JSON, university_id, course_id, status) (legacy: `Sales::add`)
- [ ] `PATCH /api/sales-teams/:id` — update team (legacy: `Sales::edit`)
- [ ] `DELETE /api/sales-teams/:id` — delete team (legacy: `Sales::delete`)
- [ ] `GET /api/sales-teams/performance` — per-team `total_amount` + `success_percentage` from member student enrollments (legacy: `Sales::performance`)
- [ ] `GET /api/sales-teams/insights` — per-team breakdown incl. per-member revenue detail (legacy: `Sales::insights`)

### CRM — Reports

- [ ] `GET /api/reports/leads/by-country` — leads filtered by `country_id` + date range + telecaller, with per-status breakdown counts (legacy: `Country_report::index`)
- [ ] `GET /api/reports/calls` — call-log summary (incoming/outgoing/missed/declined counts, unique contacts) + lead-source and emigration-country breakdowns; filter date/telecaller. **Reads `call_log` table — no TS equivalent exists at all** (legacy: `Api/Report::index`)

### Applications / Candidates pipeline

- [ ] `POST /api/applications` — create application **with seeded default qualifications (10th/12th/Degree) and document stubs (Signature/Aadhar/Photo)** atomically; also direct candidate creation `is_converted=1` (legacy: `Application::add`, `Api/Candidate::add`)
- [ ] `PATCH /api/applications/:id` — update personal/contact/address/`is_archived`; status-only path appends a `candidate_activity` row (legacy: `Application::edit`, `Api/Candidate::update`)
- [ ] `DELETE /api/applications/:id` — hard-delete application (legacy: `Application::delete`, `Api/Candidate::delete`)
- [ ] `PATCH /api/applications/:id/course-fee` — update amount, paid_date, payment_mode, payment_to, fee_receipt (legacy: `Application::edit_course_fee`)
- [ ] `PATCH /api/applications/:id/academic` — set university/course/specialisation/session/pipeline/source/admission_status (legacy: `Application::academic`)
- [ ] `PATCH /api/applications/:id/qualifications` — bulk-update board/percentage/certificate/marksheet with file uploads (legacy: `Application::edit_qualification`)
- [ ] `PATCH /api/applications/documents/:id` — update label / replace file for an application document (legacy: `Application::document_edit`)
- [ ] `GET /api/applications/:id/activity` — `candidate_activity` log joined to `candidate_status` (distinct table from `lead_activity`) (legacy: `Api/Candidate::history`)
- [ ] `GET /api/candidate-statuses` — candidate status lookup list (separate from `lead_status`) (legacy: `Api/Candidate::candidate_status`)
- [ ] `GET /api/users?pipeline_type=consultant|client` — id+name list filtered by pipeline role (consultant=`role_id 6`, client=`role_id 8`) for application academic / academic-edit dropdowns (legacy: `Application::get_pipe_user`, `Academic::get_users_by_pipeline`)
- [ ] `GET /api/states?country=:name` — states for a country; **two variants**: proxy to `countriesnow.space` (legacy: `Students::fetchStates`) **and** local `states` table (legacy: `Application::fetchStates`)

### Students — lifecycle & profile

- [ ] `PATCH /api/students/:id/dropout` — set `admission_status=dropout` + `drop_out_at` timestamp (legacy: `Students::drop_student`)
- [ ] `PATCH /api/students/:id/credentials` — update username + password hash for student portal login (legacy: `Students::ajax_edit_password`)
- [ ] `GET /api/students?referred_by=:clientId` — students referred by a specific client (legacy: `Students::referred_students`)
- [ ] `PATCH /api/students/documents/:id` — update label / replace file on a student document (legacy: `Students::document_edit`)
- [ ] `DELETE /api/students/documents/:id` — delete a student document (legacy: `Students::document_delete`)
- [ ] `GET /api/students/:id/enrolled-courses` — courses a student is enrolled in (from `enrol` table) (legacy: `Students::get_enrolled_courses`)
- [ ] `GET /api/students?course_id=&subject_id=&teacher_id=` — filter enrolled students by course+subject+teacher (legacy: `Students::get_students_by_course_subject_teacher`, `Demo_sessions::get_students_by_course_subject_teacher`)
- [ ] `GET /api/students?subject_id=&teacher_id=` — filter enrolled students by subject+teacher (legacy: `Students::get_students_by_subject_teacher`)
- [ ] `GET /api/students?teacher_id=:id` — students enrolled under a teacher, for assessment/homework dropdowns (legacy: `Assessment::get_students_by_teacher`, `Homework::get_students_by_teacher`)

### Students — enrolment & qualifications (mobile + academic)

- [ ] `POST /api/students/:id/enrolments` — enrol student in course/subject under teacher with session count (dup check) (legacy: `Api/Students::enrol_subjects`)
- [ ] `DELETE /api/students/enrolments/:id` — remove an enrolment record (legacy: `Api/Students::delete_enrolled_subject`)
- [ ] `PATCH /api/students/:id/qualifications` — bulk-update board/percentage/certificate/marksheet with files (legacy: `Academic::edit_qualification`)
- [ ] `DELETE /api/students/:id/qualifications/:qual` — clear (nullify) a qualification level's data (legacy: `Academic::delete_qualification`)

### Students — finance & academic-grade JSON columns

- [ ] `GET /api/students/finance` — students with `finance` table fields (tuition/exam/misc fees, scholarship, payment_status) (legacy: `Students::finance`)
- [ ] `POST /api/students/:id/finance` — create a `finance` record (legacy: `Students::finance_add`)
- [ ] `PATCH /api/students/:id/finance` — update a `finance` record (legacy: `Students::finance_edit`)
- [ ] `GET /api/students/finance-summary` — students joined to `finance` for the course-finance view (legacy: `Course::student_index`)
- [ ] `GET /api/students/:id/academic-grades` — read legacy JSON columns (courses, course_status, attendance, midtermGrades) (legacy: `Course::student_view`, `Academic::view`)
- [ ] `PATCH /api/students/:id/academic-grades` — write legacy JSON course/grade/attendance/payment fields (legacy: `Course::student_edit`)
- [ ] `GET /api/students/:id/courses` — enrolled courses from the legacy JSON `courses` column (legacy: `Course::student_course`)

### Academic management pipeline (`enrol`-writing)

- [ ] `GET /api/academic/students` — students with enrollment_id/application_id/admission_status; filter role/telecaller/institution/status (legacy: `Academic::index`)
- [ ] `PATCH /api/academic/students/:id` — update academic fields (university/course/specialisation/session/consultant/admission_status/pipeline) **AND insert an `enrol` record** (legacy: `Academic::edit`)

### Enrollment reports (pipeline + PDF)

- [ ] `GET /api/reports/enrollments` — students with full 6-status admission breakdown (pending/progress/enrolled/passout/dropout/cancelled); filter university/course/session/consultant/source/date (legacy: `Students::university_enrolment`, `Enrollment::all_enrollments`)
- [ ] `GET /api/reports/enrollments/university-wise` — per-university stats (total + 6 status counts) (legacy: `Enrollment::university_wise`)
- [ ] `GET /api/reports/enrollments/intake-wise` — per-session/intake stats (total + 6 status counts), newest-first (legacy: `Enrollment::intake_wise`)
- [ ] `GET /api/reports/enrollments/university/:id/pdf` — stream mPDF university enrollment report (legacy: `Enrollment::print_university_report`)
- [ ] `GET /api/reports/enrollments/intake/:id/pdf` — stream mPDF intake/session enrollment report (legacy: `Enrollment::print_intake_report`)

### Candidate document store (`upload_documents` — leads/applicants)

- [ ] `GET /api/candidates/:id/documents` — list candidate uploaded docs (distinct from `student_documents`) (legacy: `Upload_document::index`)
- [ ] `POST /api/candidates/:id/documents` — upload candidate doc (title, document_type FK) (legacy: `Upload_document::add`)
- [ ] `PATCH /api/candidates/documents/:id` — update title/type / replace file (legacy: `Upload_document::edit`)
- [ ] `DELETE /api/candidates/documents/:id` — delete candidate doc (legacy: `Upload_document::delete`)

### Catalog CRUD gaps (write halves missing in TS)

- [ ] `POST /api/document-types` · `PATCH /api/document-types/:id` · `DELETE /api/document-types/:id` (legacy: `Document_type::add/edit/delete`)
- [ ] `POST /api/colleges` · `PATCH /api/colleges/:id` · `DELETE /api/colleges/:id` (legacy: `College::add/edit/delete`)
- [ ] `POST /api/visa-types` · `PATCH /api/visa-types/:id` · `DELETE /api/visa-types/:id` (legacy: `Visa_type::add/edit/delete`)
- [ ] `POST /api/fee-types … wait` → see Finance section for `PATCH/DELETE /api/fee-types/:id`

### Courses — flags, LMS, knowledge base, cascading filters

- [ ] `PATCH /api/courses/:id/lms` — toggle `is_lms_course` flag (legacy: `Course::add_to_lms`)
- [ ] `GET /api/courses?lms=1` — LMS courses with per-course enrollment count (legacy: `Course::lms_course`)
- [ ] `PATCH /api/courses/:id/status` — update course status active/inactive/pending (legacy: `Course::change_status`)
- [ ] `GET /api/courses/knowledge-base` — courses grouped by university, searchable (legacy: `Course::knowledge_base`)
- [ ] `GET /api/courses?university_id=&institution_id=` — cascading course dropdown filter (legacy: `Course::fetch_course`, `Semester::fetch_course`, `Group_course::fetch_courses_by_university`, `Academic::get_courses`)

### Universities & Institutions

- [ ] `GET /api/universities/knowledge-base` — searchable university list w/ country (legacy: `University::knowledge_base`)
- [ ] `GET /api/users/:id/university` — university detail associated with a user (legacy: `University::current_university`)
- [ ] `GET /api/institutions?university_id=:id` — institution users (`role_id=5`) for a university (cascading dropdown) (legacy: `University::fetch_institutions_by_university`)
- [ ] `GET /api/institutions` — list `role_id=5` users w/ name/phone/email search (legacy: `Institutions::index`)
- [ ] `POST /api/institutions` — create `role_id=5` user w/ university association (legacy: `Institutions::add`)
- [ ] `PATCH /api/institutions/:id` — update institution profile (legacy: `Institutions::edit`)
- [ ] `PATCH /api/institutions/:id/password` — reset username + password for institution (legacy: `Institutions::reset_password`)
- [ ] `DELETE /api/institutions/:id` — delete institution user (legacy: `Institutions::delete`)

### Semesters, subjects, group courses

- [ ] `GET /api/semesters?course_id=:id` — semesters for a course (dropdown) (legacy: `Semester::fetch_semesters`)
- [ ] `GET /api/semesters?university_id=:id` — semesters filtered by university (legacy: `Semester::fetch_semester_by_university_id`)
- [ ] `GET /api/semesters/:id/fee` — `semester_fee` for a semester (legacy: `Semester::fetch_semesters_amount`)
- [ ] `GET /api/subjects?course_id=:id` — subjects for a course (dropdown) (legacy: `Subjects::get_subject_by_course`, `Demo_sessions::get_subject_by_course`)
- [ ] `GET /api/group-courses` — course bundles w/ date-range filter (legacy: `Group_course::index`)
- [ ] `POST /api/group-courses` — create bundle (name, course_ids JSON) (legacy: `Group_course::add`)
- [ ] `PATCH /api/group-courses/:id` — update bundle (legacy: `Group_course::edit`)
- [ ] `DELETE /api/group-courses/:id` — delete bundle (legacy: `Group_course::delete`)

### Assessments & Homework (admin CRUD — no admin endpoints today)

- [ ] `GET /api/assessments` — list w/ student+teacher name resolution (legacy: `Assessment::index`)
- [ ] `POST /api/assessments` — create assessment for student by teacher (legacy: `Assessment::add`)
- [ ] `PATCH /api/assessments/:id` — update assessment (legacy: `Assessment::edit`)
- [ ] `DELETE /api/assessments/:id` — delete assessment (legacy: `Assessment::delete`)
- [ ] `GET /api/reports/assessments` — assessments w/ student/teacher/course detail + date filter (legacy: `Assessment_report::index`)
- [ ] `GET /api/homework` — list w/ name resolution (legacy: `Homework::index`)
- [ ] `POST /api/homework` — create homework (legacy: `Homework::add`)
- [ ] `PATCH /api/homework/:id` — update homework (legacy: `Homework::edit`)
- [ ] `DELETE /api/homework/:id` — delete homework (legacy: `Homework::delete`)
- [ ] `GET /api/reports/homework` — homework report w/ detail + date filter (legacy: `Home_work_report::index`)

### Teachers — profile, credentials, subject assignments

- [ ] `GET /api/teachers/:id/students` — students enrolled under a teacher (via `enrol_model`) (legacy: `Teachers::teachers_student`)
- [ ] `GET /api/teachers/:id/schedules` — schedule slots as FullCalendar events (id,title,start,end) (legacy: `Teachers::teachers_schedules`)
- [ ] `PATCH /api/teachers/:id/reset-password` — update username + bcrypt password, storing `prev_password` (legacy: `Teachers::reset_password`; **merge** with `Teachers::edit_password` which is the same minus `prev_password`)
- [ ] `GET /api/teachers?course_id=:id` — teachers assigned to a course (legacy: `Teachers::get_teacher_by_course`, `Demo_sessions::get_teacher_by_course`)
- [ ] `GET /api/teachers?course_id=:id&subject_id=:id` — teachers for a course+subject via `teachers_subjects` join (legacy: `Demo_sessions::get_teacher_by_course_and_subject`)
- [ ] `DELETE /api/teacher-subjects/:id` — remove a teacher-subject assignment (legacy: `Teachers::delete_teacher_subject`, `Api/Teachers::delete_assigned_subject`)
- [ ] `PATCH /api/teachers/:id/zoom-email` — persist `zoom_email` field (legacy: `Teachers::add_zoom_email`)

### Instructors (separate `instructor_enrol` / `instructor_students` tables)

- [ ] `GET /api/teachers/:id/enrolled-courses` — instructor course enrollments (`instructor_enrol`) (legacy: `Instructor::course`)
- [ ] `POST /api/teachers/:id/enrolled-courses` — assign instructor to teach a course (legacy: `Instructor::enrol_course`)
- [ ] `DELETE /api/teachers/:id/enrolled-courses/:courseId` — remove instructor-course enrollment (legacy: `Instructor::enrol_delete`)
- [ ] `GET /api/teachers/:id/assigned-students` — instructor→student→course map (`instructor_students`) (legacy: `Instructor::students`)
- [ ] `POST /api/teachers/:id/assigned-students` — create instructor-student-course assignment (legacy: `Instructor::assign_student`)
- [ ] `DELETE /api/teachers/:id/assigned-students/:assignmentId` — remove assignment (legacy: `Instructor::assign_delete`)
- [ ] `PATCH /api/teachers/:id/device` — clear `device_id` (mobile binding reset) (legacy: `Instructor::change_device`)

### Teacher salary (rates, payments, computed summaries)

- [ ] `POST /api/teacher-salary-rates` — create 4-tier rate row (salary_30/45/1/confirmed_demo) w/ dup guard (legacy: `Teacher_salary::add_salary`)
- [ ] `PATCH /api/teacher-salary-rates/:id` — update all four rate values (legacy: `Teacher_salary::edit_salary`)
- [ ] `GET /api/teachers/:id/salary-payments` — salary payment history (legacy: `Teacher_salary::ajax_payment_history`)
- [ ] `GET /api/teachers/:id/salary-payments?month=YYYY-MM` — payments filtered by month/year (legacy: `Teacher_salary::get_teacher_salary_by_month`)
- [ ] `GET /api/teachers/:id/salary-summary?month=YYYY-MM` — **computed**: session-based breakdown (30/45/60-min + confirmed-demo counts × rates), total_paid, balance (legacy: `Teacher_salary::ajax_make_payment`)
- [ ] `GET /api/reports/teacher-salary?month=YYYY-MM` — per-teacher salary report across all teachers (session counts, computed salary, paid, balance) (legacy: `Teacher_salary_report::index`)

### Sessions — bulk scheduling, availability, reschedule, requests

- [ ] `POST /api/sessions/bulk` (a.k.a. `bulk-schedule`) — create sessions for selected weekdays across a month (one row per matching date) (legacy: `Sessions::timetable_add`, `Students::add_sessions`)
- [ ] `GET /api/teacher-schedules/available-dates?teacher_id=:id` — dates a teacher has availability (legacy: `Sessions::get_teacher_schedule_dates`)
- [ ] `GET /api/teacher-schedules/available-times?teacher_id=:id&date=YYYY-MM-DD` — sorted slots (id, start, end) for teacher+date (legacy: `Sessions::get_teacher_schedule_times`)
- [ ] `PATCH /api/sessions/:id/reschedule` — date/time-only update (legacy: `Api/Sessions::reschedule`)
- [ ] `GET /api/reports/sessions?from_date=&to_date=` — teacher session attendance report w/ `TIMESTAMPDIFF` duration in minutes (legacy: `Session_report::index`)
- [ ] `PATCH /api/session-requests/:id/approve` — promote a session request into a full `sessions` row (copy all fields) (legacy: `Session_request::edit`)
- [ ] `DELETE /api/session-requests/:id` — delete a session request (legacy: `Session_request::delete`)

### Demo sessions

- [ ] `PATCH /api/demo-sessions/:id` — update demo session, resolving from/to_time via `schedule_id` (legacy: `Demo_sessions::edit`, `Api/Demo_session::edit`)
- [ ] `DELETE /api/demo-sessions/:id` — delete demo session (legacy: `Demo_sessions::delete`, `Api/Demo_session::delete`)
- [ ] `PATCH /api/demo-sessions/:id/reschedule` — schedule-only update (legacy: `Api/Demo_session::reschedule`)
- [ ] `GET /api/courses/:id/schedule-context` — `[{subject, teachers:[], students:[]}]` per subject for bulk demo scheduling UI (legacy: `Demo_sessions::get_subjects_teachers_students_by_course`)
- [ ] `POST /api/demo-sessions/:id/share` — send meeting link to lead via HTML email + return WhatsApp deeplink (legacy: `Demo_sessions::share_link`)

### Zoom integration (admin + launch + SDK)

- [ ] `GET /api/zoom/users` — proxy Zoom `listUsers`, active accounts (legacy: `Zoom_users::index`)
- [ ] `GET /api/zoom/users/pending` — proxy Zoom `listPendingUsers` (legacy: `Zoom_users::pending`)
- [ ] `POST /api/zoom/users` — invite user via Zoom `addUser` (legacy: `Zoom_users::add`; also the side-effect of `Teachers::add`)
- [ ] `DELETE /api/zoom/users/:userId` — remove user via Zoom `deleteUser` (legacy: `Zoom_users::delete_user`)
- [ ] `GET /api/sessions/:id/zoom-launch` — session data to render the Join/Start page (legacy: `Zoom::index`)
- [ ] `GET /api/sessions/:id/zoom-start` — `live_settings` (SDK keys) + session data for host-start view (legacy: `Zoom::start`)
- [ ] `GET /api/sessions/zoom-jwt?meeting_number=X` — generate Zoom SDK JWT for mobile join (legacy: `Api/Student/Sessions::generate_jwt_token`)

### Finance — Invoices & payments

- [ ] `GET /api/invoices/students-by-course?course_id=:id` — converted students + course amount, for invoice creation (legacy: `Invoice::getStudentsbycourse`)
- [ ] `PATCH /api/invoices/:id/due-date` — update due_date **and upsert `invoice_crone_job` reminder rows** (legacy: `Invoice::update_due`)
- [ ] `GET /api/invoices?student_id=:id` — per-student invoices w/ payment-count + total-paid aggregation (legacy: `Invoice::canditate`)
- [ ] `GET /api/reports/invoices?from_date=&to_date=&course_id=&student_id=` — invoice report (legacy placeholder page exists; data layer needed) (legacy: `Invoice_report::index`)
- [ ] `POST /api/payments` — record payment **with commission calculation** (referral_commission_individual, refferal_commision_institution, university_commision_amount based on who created the lead) + flip invoice `payment_status` when fully paid (legacy: `Payment::add`)
- [ ] `DELETE /api/payments/:id` — delete a payment (legacy: `Payment::delete`)
- [ ] `PATCH /api/fee-types/:id` · `DELETE /api/fee-types/:id` (legacy: `Fee_type::edit/delete`)
- [ ] `POST /api/invoices/process-due-reminders` — **cron** job: read `invoice_crone_job` for today's due/reminder entries, send HTML reminder emails (public, cron-fired) (legacy: `Api/Invoice::invoice_due_updates`)

### Finance — Commission plans & student/university commission

- [ ] `GET /api/commission-plans?student_id=:id` — per-student commission installments (expected amount/date, received amount/date) (legacy: `Fee::list_commission_plan`)
- [ ] `POST /api/students/:id/commission-plan` — add expected commission installment (legacy: `Fee::add_commission_plan`)
- [ ] `PATCH /api/students/commission-plan/:id` — update expected amount/date (legacy: `Fee::edit_commission_plan`)
- [ ] `PATCH /api/students/commission-plan/:id/amount-received` — record actual received amount + date (legacy: `Fee::edit_amount_received`)
- [ ] `DELETE /api/students/commission-plan/:id` — delete installment row (legacy: `Fee::delete_commission_plan`)
- [ ] `GET /api/finance/student-commission?from_date=&to_date=&university_id=&commission_status=` — all students w/ upcarrera_commission, received, balance (legacy: `Fee::student_fee_commission`)
- [ ] `PATCH /api/students/:id/upcarrera-commission` — set/update `upcarrera_commission` on a student (legacy: `Fee::edit_commission`)
- [ ] `GET /api/finance/university-commission?from_date=&to_date=&university_id=&commission_status=` — university-level aggregation (students, commission added/pending, total/received/balance) (legacy: `Fee::university_fee_commission`)
- [ ] `GET /api/finance/fee-status?referred_by=:id&from_date=&to_date=&university_id=` — students referred by a user w/ finance fee fields (legacy: `Fee::fee_status`)
- [ ] `GET /api/finance/students/:id` — finance-specific student detail (fee, course_status, paymentStatus from students join) (legacy: `Fee::view`, `Finance::view`)
- [ ] `GET /api/university-commission?university_id=` — students w/ commission context (pipeline, admission_status, consultant, client referral) (legacy: `University_commission::index`)
- [ ] `POST /api/university-commission/collect` — accumulate `collected_commission_of_university` on an invoice (legacy: `University_commission::collect`)

### Finance — Fee management (installments, special fees, payment status)

- [ ] `GET /api/fee-management/installments?…` — students w/ installment status (added/partially/not_added), special-fee overrides, course amounts (reads `student_payments`, `special_fee`, `specialisations`) (legacy: `Fee_management::installmets`)
- [ ] `GET /api/fee-management/students/:id/installments` — per-student installment list, specialisation amount, special fee, balance (legacy: `Fee_management::manage_installmets`)
- [ ] `POST /api/fee-management/students/:id/installments` — add `student_payments` row, validated against total/special-fee cap (legacy: `Fee_management::add_installment`)
- [ ] `PATCH /api/fee-management/installments/:id` — update an installment (legacy: `Fee_management::edit_installment`)
- [ ] `POST /api/fee-management/students/:id/special-fee` — upsert special-fee override for a student's specialisation (legacy: `Fee_management::add_special_fee`)
- [ ] `GET /api/fee-management/course-fee?…` — course-fee vs installment progress (legacy `installment_model`; may merge with `/installments`) (legacy: `Fee_management::course_fee`)
- [ ] `GET /api/fee-management/payment-status?…` — classify `student_payments` as OVERDUE/DUE/UPCOMING/PAID by due date (legacy: `Fee_management::payment_status`)

### Finance — Reports

- [ ] `GET /api/reports/fee-payment?from_date=&to_date=&university_id=&payment_status=` — students w/ `finance` table fee breakdown (legacy: `Fee_payment_report::fee_report`, `Reports::fee_report`)
- [ ] `GET /api/reports/courses?from_date=&to_date=&level=` — courses w/ active/inactive counts (legacy: `Fee_payment_report::course_wise_report`)
- [ ] `GET /api/finance/students?from_date=&to_date=` — all `role_id=4` w/ students-join fields (enrollment_id, dob, gender, address, fee, enrollment_status, admission_status), role-scoped (legacy: `Finance::index`)

### Admin / Platform — Users, passwords, clients, RBAC

- [ ] `POST /api/users/:id/reset-password` — admin-side reset (password + username uniqueness check); covers Admin, Administrator, Sub_admin, Accountants, Clients surfaces (legacy: `Admin::reset_password`, `Sub_admin::reset_password`, `Accountants::reset_password`, `Clients::reset_password`)
- [ ] `POST /api/users/:id/change-password` — self-service password change, no username change (legacy: `Profile::reset_password`)
- [ ] `PATCH /api/users/me` — authenticated user updates own profile (name/phone/email/picture) (legacy: `Api/User::update`)
- [ ] `POST /api/users/me/switch-role` — set `current_role` for multi-role users; returns refreshed userdata (legacy: `Api/User::switch_role`)
- [ ] `GET /api/clients?partnership_status=&country_id=` — `role_id=8` users + countries join + business profile (legacy: `Clients::index`)
- [ ] `POST /api/clients` — dual-table write (users + `clients`: business_name, commission_model, university[], course[], agreement file) (legacy: `Clients::add`)
- [ ] `PATCH /api/clients/:id` — dual-table update (legacy: `Clients::edit`)
- [ ] `GET /api/clients/:id` — client detail incl. clients-table fields (legacy: `Clients::view`)
- [ ] `GET /api/role-permissions?role_id=:id` — permissions assigned to a role (legacy: `Roles_permission::get_permissions_by_role`)
- [ ] `GET /api/role-permissions/unassigned?role_id=:id` — permissions NOT yet assigned to a role (legacy: `Roles_permission::get_unassigned_permissions`)
- [ ] `PUT /api/role-permissions` — replace a role's permission set (delete-then-insert by slug) (legacy: `Roles_permission::add`)
- [ ] `POST /api/permissions` · `PATCH /api/permissions/:id` · `DELETE /api/permissions/:id` (legacy: `Permissions::add/edit/delete`)
- [ ] `POST /api/roles` · `PATCH /api/roles/:id` · `DELETE /api/roles/:id` (legacy: `User_role::add/edit/delete`)

### Admin / Platform — Dashboards, notifications, resources, files, mobile config

- [ ] `GET /api/dashboard` — role-aware metrics (leads/students/income paid+pending/course counts) for admin/telecaller (legacy: `Dashboard::index`)
- [ ] `GET /api/dashboard/admin` — admin aggregates (enrollment counts; students by state/status/gender/university/course/source; pipeline; course groups; consultant rankings by point+count; target-vs-achieved chart) (legacy: `Dashboard::admin_dashboard`)
- [ ] `GET /api/dashboard/consultant` — consultant-scoped (target_point, achievedPoints, admissions, monthly chart, gender/source/university charts, rankings) (legacy: `Dashboard::consultant_dashboard`)
- [ ] `PATCH /api/notifications/:id` · `DELETE /api/notifications/:id` (legacy: `Notifications::edit/delete`)
- [ ] `GET /api/resources/folders?folder_id=&user_type=` — folder/file browser scoped by user_type (legacy: `Resources::index`/`Resources::client`)
- [ ] `POST /api/resources/folders` · `PATCH /api/resources/folders/:id` · `DELETE /api/resources/folders/:id` (legacy: `Resources::add_folder/rename_folder/delete_folder`)
- [ ] `POST /api/resources/files` — upload resource file to folder (multipart; path/type/size/user_type) (legacy: `Resources::add_file`)
- [ ] `DELETE /api/resources/files/:id` — delete resource file (legacy: `Resources::delete_file`)
- [ ] `GET /api/files/serve?item=:encoded_path` — decode token, stream **any** private uploaded file (profile pictures, agreements, resource files) with correct Content-Type + auth (legacy: `FileController::serveFile`)
- [ ] `GET /api/app/version` — `ios_version`, `android_version`, `ios_register_show` (public, no auth; called on app launch) (legacy: `Api/App::app_version`)
- [ ] `GET /privacy-policy` — static page; **Next.js route**, not a NestJS endpoint (legacy: `Home::privacy_policy`)

### Student web portal (React; almost entirely greenfield — 0 ported)

- [ ] `GET /api/student/profile` — authenticated student's own name/email/phone/dob/image (legacy: `User\Profile::index` — *runtime-fatal namespace, capability real*)
- [ ] `PATCH /api/student/profile` — student updates own name/email/phone/dob/image (legacy: `User\Profile::edit`)
- [ ] `GET /api/student/enrolled-courses` — enriched enrolled courses w/ full `course_data` (title, thumbnail, subjects) (legacy: `User\Course::enrolled_courses`)
- [ ] `POST /api/student/switch-course` — update student's active `course_id` (legacy: `User\Course::switch_course`)
- [ ] `GET /api/student/feed` — paginated feed/announcement posts visible to student (legacy: `User\Feed::index`)
- [ ] `GET /api/student/live-classes` — upcoming + past live classes for enrolled course(s) (legacy: `User\Live_class::index`)
- [ ] `GET /api/student/live-classes/:id` — single live-class detail (Zoom link, schedule, topic) (legacy: `User\Live::index`)
- [ ] `GET /api/student/courses/:id/materials` — `{materials:[], practice:[]}` PDFs across all course lessons (legacy: `User\Materials::course_materials`)
- [ ] `GET /api/student/subjects/:id/materials` — `{materials:[], practice:[]}` PDFs across subject lessons (legacy: `User\Materials::subject_materials`)
- [ ] `GET /api/student/materials/:id` — resolve/redirect to a lesson material file URL (legacy: `User\Materials::materials_view`)
- [ ] `GET /api/student/subjects/:id` — subject + lessons list + per-lesson video count + practice link (legacy: `User\Subject::index`)
- [ ] `GET /api/student/progress` — lesson completion, exam scores, overall course progress (legacy: `User\Progress::index` — *greenfield; PHP was a stub*)
- [ ] `GET /api/student/courses/:id/plans` — subscription packages for a course w/ purchase-status enrichment (legacy: `User\Plans::index`)
- [ ] `GET /api/student/plans/:id` — plan detail (subject breakdown, amounts, discounts, expiry) (legacy: `User\Plans::plan_details`)
- [ ] `POST /api/student/plans/initiate-payment` — compute total from package + subject selections, return **Easebuzz** checkout URL. ⚠️ **Easebuzz gateway is not integrated in the TS layer at all** — existing Razorpay endpoints are a different gateway (legacy: `User\Plans::generate_payment`)

### Student mobile API — sessions, assessments, homework, performance

- [ ] `POST /api/student/sessions/:id/feedback` — mark session complete, submit rating+remarks, optionally file a teacher-change request (writes `students_status`, `student_rating`, `student_remarks` + `teacher_change_request`) (legacy: `Api/Student/Sessions::submit_feedback`)
- [ ] `POST /api/sessions/:id/attendance/checkin` — student records attendance start (date+start_time), idempotent (legacy: `Api/Student/Sessions::session_attendance`)
- [ ] `PATCH /api/sessions/:id/attendance/checkout` — student records end_time (legacy: `Api/Student/Sessions::session_attendance_update`)
- [ ] `POST /api/student/assessments/:id/submit` — submit answer text + file attachments, set `student_status=1` (legacy: `Api/Student/Assessments::submit_feedback`)
- [ ] `GET /api/student/homework` — homework assigned to student (status, marks, due) — *PORT_NEEDED pending schema confirmation: if `Homework_model` is a separate table from assessments* (legacy: `Api/Student/Home_work::index`)
- [ ] `POST /api/student/homework/:id/submit` — submit homework answer + files, set `student_status=1` (legacy: `Api/Student/Home_work::submit_feedback`)
- [ ] `GET /api/student/performance?course_id=X` — performance metrics by course (marks, attendance %, assessment scores) (legacy: `Api/Student/Performance::index`)

---

## Subsumed by the SPA

**151 methods (29.4% of the live surface) are SUBSUMED** — the React/Next.js SPA replaces them with zero new backend work. **This is not missing work**; counting it as a gap would roughly double the apparent backlog. The categories:

- **`ajax_add` / `ajax_edit` / `ajax_view` / `ajax_reset_password` / `ajax_assign_*` modal fragments** — In CodeIgniter these return server-rendered HTML snippets (a Bootstrap modal body) that were injected into the DOM. The SPA renders these as native React dialog components and populates them from the existing `GET` JSON endpoints (`GET /api/leads/:id`, `GET /api/teachers/:id`, reference lists, etc.). No data is written by these methods — they are pure view renderers. This is the single largest SUBSUMED bucket.
- **`index` list-page renderers** — Methods like `Leads::index`, `Students::index` (HTML variant), `Teachers::index`, `Course::index`, the user-role admin lists (`Admin`, `Administrator`, `Sub_admin`, `Accountants`), `Invoice::index`, `Fee_type::index`, `Permissions::index`, `User_role::index` render an HTML table whose data already comes from a ported `GET` endpoint (`GET /api/leads`, `GET /api/users?role_id=…`, etc.). The status-count aggregations that some of these did inline move into the SPA.
- **`fetch_course` (Leads variant)** — returns HTML `<option>` tags; the SPA filters client-side or passes a query param to the existing list endpoint.
- **Reference-bundle helpers** — `Api/Lead::lead_form` returned a bundle of dropdown lookups (courses, countries, managers, statuses, sources); the SPA fetches these individually from already-ported `GET` endpoints, so no aggregate endpoint is needed.
- **Auth page shells** — `Login::index`, `students_login`, `otp`, `logout` render the login/OTP page chrome and POST credentials. The credential check is already ported (`POST /api/auth/login`, `POST /api/integrations/otp/verify`); the page shells become Next.js pages and logout is client-side JWT/cookie clearing.
- **Zoom `meeting` view** (`Zoom::meeting`) — static iframe shell, rendered directly by the React meeting-embed component.
- **Student-portal HTML shells** — `User\Dashboard::index`, `User\My_course::index`, `User\Course::my_course`, `User\Exams::exam`, `User\Notifications::index`, `User\Payment::index` are pure shells whose data is served by ported student endpoints (`GET /api/student/home`, `/api/student/courses`, `/api/student/assessments`, `/api/notifications/mine`, `/api/student/invoices`).

> **Net:** every SUBSUMED method is accounted for by an *existing* JSON endpoint plus an SPA component. The only residual risk is the handful of `index` methods that performed **inline aggregation** (status counts, payment summaries) — those aggregations must be confirmed present in the corresponding `GET` endpoint or pushed to the client, but they require no new route.

---

## Skip list

**52 methods (9.1%) are intentionally NOT ported.** Porting any of these would reproduce dead or broken behavior.

### Debug / test stubs (hardcoded data, `print_r;exit`, `test_` prefix)

| Method | Reason |
|---|---|
| `Sales::edit_password` | `print_r($this->data['edit_data']); exit;` on the GET branch — broken dev artifact; POST duplicates `Consultant::edit_password`/`Telecallers::reset_password` |
| `Application::add_old` | Body starts `echo '<pre>'; print_r(); exit;` — never reaches real logic |
| `Application::test_mail` | Debug method, hardcoded recipient |
| `Academic::edit_payment` | `echo '<pre>'; print_r(); exit;` immediately |
| `Teachers::addInstructor` | Hardcoded `php.trogon@gmail.com`, not wired to real data |
| `Teachers::listUsers` | Raw `print_r`/`exit` Zoom dump |
| `Teachers::removeUser` | Hardcoded Zoom userId literal |
| `Teachers::test_zoom_user` | Hardcoded credentials, `test_` prefix |
| `Sessions::ajax_timetable_add_test` | Alternate "test" timetable modal view |
| `Api/Login::other` | Returns fake user IDs — dead test method |
| `S3Upload::*` (index, list_files, generateDownloadLink, downloadBatch, uploadBatch, compress_image) | All operate on hardcoded test files / placeholder S3 config — example code, not routed features (6 methods) |
| `Home::leads` | Bare view, no data — abandoned stub |

### `construction_page()` placeholders (under-construction, non-functional)

`Sales::admissions`, `Sales::sourse_performance`, `Sales::log`, `Sales::overview`, `Consultant::overview`, `Consultant::revenue`, `Consultant::source_analytics`, `Fee::commission_status` — all immediately call `construction_page()`; code after the return is unreachable.

### Broken-at-source (wrong model / undefined dependency)

| Method | Reason |
|---|---|
| `Consultant::ajax_view` | Calls `$this->college_model->get()` — wrong model loaded; broken in PHP |
| `Demo_sessions::get_students_by_course_subject_teacher` | References undefined `$students_model` — broken in PHP. *(Note: the behavior is re-listed as PORT_NEEDED under Students filters — the **intent** is ported, not the broken implementation.)* |

### `_old` / superseded duplicate controllers & methods

- **`Instructor` controller** — `add`, `edit`, `delete` are older duplicates of `Teachers::*` using stale field names (`country_code`, `user_email`, `zoom_id`, `zoom_password`). *(Its instructor-enrollment methods — `course`, `enrol_course`, `students`, etc. — are PORT_NEEDED, not skipped, because they touch the distinct `instructor_enrol`/`instructor_students` tables.)*
- **`Session` (Session.php) class** — `index`, `add`, `edit`, `delete` are bare stubs storing only `session_title`; superseded by the active `Sessions` class in `Session_old.php` (4 methods).
- **`University_commission_old`** — `index`, `ajax_collect`, `collect` superseded by current `University_commission` (3 methods).
- **`Lessons::index_old`** — explicitly named backup implementation.

### Student-portal methods that are out-of-scope or dead

- **Runtime-fatal + no real capability** — `User\All_course::index`, `User\Category::index`, `User\Document::index`, `User\Materials::index` (superseded by `course_materials`/`subject_materials`), `User\Lessons::index`/`index_old`, `User\My_subjects::index` — fatal `App\Controllers\App\UserBaseController` namespace **and** either pure shells (data covered by `GET /api/courses*`) or out-of-portal-scope admin browsing.
- **Pure stubs (logic commented out, no model)** — `User\Assignment::index`/`details`, `User\Details::index`, `User\Events::index`, `User\Exams::index`/`calendar`, `User\Practice::index`.
- **Teacher/host actions inside the student portal** — `User\Live::start`, `User\Live::meeting` — host views, not student capabilities.
- **Infrastructure** — `User\UserBaseController::__construct` (abstract base, no route).

### Mobile API non-routable

- `Api/Api` base class (all methods private/protected), `Api/Example` (loose array literal, not a class), `Api/Invoice::send_reminder_email` (private helper invoked by the cron method).

---

## Suggested port order

Sequenced hardest-and-most-valuable-first. Each batch is independently shippable behind the strangler-fig proxy. Effort tags are relative (S/M/L/XL).

### Phase 1 — Revenue & finance core *(highest business risk; commission logic is money-correctness-critical)* — **XL**
The finance surface has the most unported business logic and directly touches money, so it leads.
1. **Payments + commission engine** — `POST /api/payments` with the full referral/institution/university commission calculation + invoice `payment_status` flip; `DELETE /api/payments/:id`. **Port the commission math under test first** — it is the single most error-prone piece.
2. **Invoices** — `students-by-course`, `:id/due-date` (+ `invoice_crone_job` upsert), `?student_id=` view, `process-due-reminders` cron, invoice report.
3. **Commission plans + student/university commission** — the full `Fee` + `University_commission` set (11 endpoints).
4. **Fee management** — installments, special-fee, payment-status classification (7 endpoints).
5. **Finance reports** — fee-payment, courses, finance students.

### Phase 2 — Dashboards & analytics *(highest-visibility surface; many cross-model aggregations)* — **L**
1. `GET /api/dashboard` + `/admin` + `/consultant` — the landing surface for every internal role; large aggregation but unblocks the whole admin UI.
2. Consultant analytics — `performance`, `:id/performance`, `admissions`, `view_admission`, `reports/consultant-performance`.
3. Enrollment reports incl. the two **mPDF** endpoints (pick the PDF library early — this is the one infra decision here).
4. `reports/calls` (requires a `call_log` table that has no TS schema yet — **schema decision needed**), `reports/sessions`, `reports/teacher-salary`, `reports/assessments`, `reports/homework`, `reports/leads/by-country`.

### Phase 3 — Unported domain entities *(net-new tables/modules, no TS scaffolding today)* — **L**
1. **Sales teams** (7), **Consultant targets** (5 — includes date-range conflict validation), **Group courses** (4).
2. **Clients** (dual-table users+`clients`, 4) and **Institutions** (`role_id=5`, 8 incl. password reset).
3. **Teacher salary** rates + payments + computed monthly summary (6 — the salary-summary aggregation is the hard one).
4. **Instructor** enrol/assign tables (`instructor_enrol`/`instructor_students`, 7).

### Phase 4 — Lead/candidate lifecycle completion *(CRM workflow correctness)* — **M**
1. Lead actions: `/activity`, `/verify`, `/telecaller`, `followups` (with current/upcoming buckets), convert-flow helpers (`teachers-by-subjects`, `subjects-with-teachers`).
2. Applications/candidates: `POST` with seeded qualifications+doc-stubs, `PATCH`, `DELETE`, `/course-fee`, `/academic`, `/qualifications`, activity log, candidate statuses, document edit.
3. Telecallers + Consultants user-class CRUD and `assigned_universities` management.
4. Academic pipeline (`/academic/students` with `enrol`-write), student qualifications bulk-edit/delete, finance/academic-grade JSON-column endpoints.

### Phase 5 — Student web portal *(0% ported; mostly greenfield but self-contained)* — **L**
1. Self-service: `GET/PATCH /api/student/profile`, `enrolled-courses`, `switch-course`, `progress`, `feed`, `subjects/:id`.
2. Materials: course/subject materials + material view.
3. Live classes (list + detail).
4. **Plans + Easebuzz payment** — ⚠️ **net-new gateway integration**; scope the Easebuzz SDK work separately, it is not covered by existing Razorpay code.

### Phase 6 — Mobile student write-paths & Zoom *(self-contained, depends on session entities from earlier phases)* — **M**
1. Session feedback + attendance check-in/check-out, assessment/homework submit, student homework list, student performance.
2. Zoom admin (`/zoom/users` CRUD), launch/start data endpoints, mobile SDK JWT.
3. `PATCH /api/users/me`, `switch-role`, `GET /api/app/version`.

### Phase 7 — CRUD & infra cleanup *(low-complexity, high-count; close the long tail)* — **S**
1. **Reference-data write halves** (highest count, lowest risk): lead-sources, lead-statuses, countries, document-types, colleges, visa-types, fee-types, permissions, roles, notifications — each `POST/PATCH/DELETE`. Many recur across App + Mobile clusters and collapse to one implementation each.
2. **RBAC**: role-permissions read/unassigned/replace.
3. **Cross-cutting helpers** (build once, reuse everywhere): `?course_id=`/`?university_id=`/`?subject_id=`/`?teacher_id=` cascading filters for courses/subjects/semesters/teachers/students; `pipeline_type` user filter; `GET /api/states`.
4. **Admin/self password endpoints**: `POST /api/users/:id/reset-password` (one endpoint covers 5 surfaces), `POST /api/users/:id/change-password`.
5. **File serving**: `GET /api/files/serve` (general private-file streamer — note the security-hardening opportunity vs. the legacy obfuscated-token scheme), Resources folder/file CRUD.
6. **Demo sessions** + **session requests** CRUD/reschedule, **sessions** bulk-schedule + availability + reschedule, demo-session share.
7. `GET /privacy-policy` Next.js page; teacher reset/edit-password (merge into one), zoom-email, device-reset, teacher-subject delete, teacher `:id/students` & `:id/schedules`.

> **Dependency note for sequencing.** Phases 1–4 share a hard dependency on three schema decisions that should be made *before* Phase 1 starts: (a) the `finance` table vs. `invoices/payments` split, (b) the `call_log` table (no TS schema), and (c) the PDF generation library (replacing mPDF). The cross-cutting cascading-filter helpers in Phase 7 are referenced by forms throughout Phases 3–6 — consider pulling those forward if frontend work blocks on them.

---

**Bottom line:** the port is **53.1% functionally covered**. The real build list is **248 PORT_NEEDED methods (~230 distinct endpoints after de-dup)**, concentrated in finance/commission logic, analytics dashboards, four entirely-unported domains (sales teams, consultant targets, instructors, clients), the greenfield student web portal, and a long tail of reference-data CRUD write-halves. Closing Phases 1–4 lifts coverage past the point where the legacy CRM/finance app can be retired; Phases 5–7 finish the student-facing and long-tail surfaces.