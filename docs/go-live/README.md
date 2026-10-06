# Phase 1 go-live — operations master data

Phase 1 of the Admission CRM is **built, deployed, and tested** on production
(`admin.upcarrera.com`, student form at `admissions.upcarrera.com/apply`). The
code is done. What remains before full go-live is the **real master data**, which
the Phase 1 Specification requires to be *"approved by operations"* — it can't be
invented by engineering because it drives real behaviour (fees, eligibility,
which programs are open, who can log in).

Fill in the templates in [`templates/`](templates/) and send them back; we load
them the same day. Each file has a header row and **one EXAMPLE row — delete the
example before sending.**

## Fill order (later files reference earlier ones)

| # | File | Feeds | Spec | Key rules |
|---|------|-------|------|-----------|
| 1 | `02_universities.csv` | University Master | 3.1 | `name` unique; `type` ∈ Private/Deemed/State/Central/Open School Board; `mode` ∈ Online/ODL/Regular; **`fee_collection_model` ∈ upcarrera_collects/university_collects (required)**; city + state required |
| 2 | `03_courses.csv` | Courses | 3.2 | `level` ∈ UG/PG/Diploma/Certificate/School; `specialisation` required unless "General"; duration in years + semesters |
| 3 | `04_university_courses.csv` | Tagged courses | 3.2 | links a university to a course it offers; `university_course_name` optional (its own name for it) |
| 4 | `05_intakes.csv` | Intakes | 3.3 | `year` 2020–2035; `closing_date` on/before `start_date`; status (Upcoming/Open/Closed) is derived from today |
| 5 | `06_intake_offerings.csv` | Which program is open in which intake | 3.3 | the (university, course) must already be tagged (file 3); only **open** intakes appear in Add Lead |
| 6 | `07_fee_structures.csv` | Fee Structure master | 3.4 | one row per **university × course × intake** (unique); a ₹0 course fee can't be activated; Phase 1 uses only the **registration fee**, but capture the full plan now; `other_fees` = `Label:amount:basis` separated by `\|` |
| 7 | `08_document_requirements.csv` | SA document checklist + student form | 1.3 | `course_level` ∈ certification/diploma/ug/pg/doctorate; `applies_when` = always or employment; required docs **block** SA approval until verified |
| 8 | `09_course_eligibility.csv` | Eligibility shown on the form + checked at submit | 3.2 | `min_percentage` **or** `min_cgpa`; `requires_employment` + `min_experience_months` where relevant |
| 9 | `01_users.csv` | Staff logins | 1.1 | `employee_id` unique (e.g. UC-1024, never from the phone); `email`+`mobile` unique; `role` ∈ Super Admin/Admin/Manager/Team Leader/Counsellor/Accounts/Student Affairs; **`reports_to_email` required for Counsellor and Team Leader**; status ∈ Active/Inactive/Locked. Creating a user sends an invite email to set the password. |
| 10 | `10_dropdowns.csv` | Master Settings dropdowns | 1.3 | `type` = lead_source / rejection_reason / send_back_reason |

Already handled in code (no sheet needed): payment modes (UPI, NEFT, RTGS, cash,
cheque, card), "paid to" (upCarrera / university), qualification levels, states,
districts, nationality. Email sends via the Microsoft 365 account already
configured on the server.

## Before loading
The spec asks for a one-time **clean-up** of the live catalog: duplicate / empty
courses, typos ("Administartion", "Busniess"), universities missing a location,
and invalid intake years. Flag these in the sheets (or we clean them during the
load) so the validation rules stop them recurring.

## After loading — UAT sign-off (spec, Module "Test cases and sign-off")
The engineering test suite (602 automated tests) already covers the 24 scenarios
(access-denied, duplicate checks, magic-link expiry, required-document block, fee
mismatch, convert, audit, etc.). Operations then does the human acceptance:

- [ ] Run the **24 test cases** (spec pages 15–17) with real master data
- [ ] Walk **20 real test students** Add Lead → Converted, using real
      Counsellor / Accounts / Student Affairs logins
- [ ] Confirm stage counts, report totals and list totals agree
- [ ] Confirm Phase 1 emails arrive from the upCarrera domain (not spam)
- [ ] Confirm lms.upcarrera.com still works normally (shared database)

> Do the 20-student walk on **staging / with disposable test leads**, not by
> converting real applicants — each conversion creates a real student + fee row
> and a STU number in the shared database.

## Open questions for the group (spec page 18)
1. Email service — confirm the **Microsoft 365** account already wired is the one to use.
2. Magic link by **email only** for Phase 1 (WhatsApp/SMS later)?
3. Do any universities need **extra application-form fields** (DEB ID, photo signature, parents' income for scholarships)?
4. Registration fee paid to the **university** — what proof does Accounts check (receipt / portal screenshot)?
