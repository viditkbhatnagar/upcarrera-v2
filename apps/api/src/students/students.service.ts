import {
  ConflictException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { ListStudentsDto } from './dto/list-students.dto';
import { ListApplicationsDto } from './dto/list-applications.dto';
import { UpdateCredentialsDto } from './dto/update-credentials.dto';
import { UpsertFinanceDto } from './dto/finance.dto';
import { ListFinanceDto } from './dto/list-finance.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { AcademicGradesDto } from './dto/academic-grades.dto';
import { UpdateQualificationsDto } from './dto/update-qualifications.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { ApplicationCourseFeeDto } from './dto/application-course-fee.dto';
import { ApplicationAcademicDto } from './dto/application-academic.dto';
import { ListAcademicStudentsDto } from './dto/list-academic-students.dto';
import { UpdateAcademicStudentDto } from './dto/update-academic-student.dto';
import { CreateEnrolmentDto } from './dto/create-enrolment.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/** admission_status value for a dropped-out student (legacy dropout pipeline). */
const ADMISSION_STATUS_DROPOUT = 4;

/** role_id for students in the users table (legacy convention). */
const STUDENT_ROLE_ID = 4;

/** bcrypt cost factor, matching the rest of the codebase. */
const BCRYPT_ROUNDS = 10;

/**
 * Port of CI4 App/Students + App/Application read/write CRUD.
 * Legacy uses manual timestamps and soft-delete (deleted_at IS NULL), both honoured here.
 */
@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  // GET /students — paginate + optional filters.
  //   ?admission_status        — students.admission_status
  //   ?referred_by             — students.referred_by
  //   ?course_id / ?subject_id / ?teacher_id — enrolled students only.
  //
  // The enrolment filters resolve to a set of student *user ids* via the `enrol`
  // table (enrol.user_id = users.id = students.student_id). teacher_id is also
  // honoured through teachers_subjects.course_id (a teacher's assigned courses),
  // unioned with any direct enrol.teacher_id match. Ports the legacy
  // get_students_by_course_subject_teacher + university_enrolment filters.
  async listStudents(query: ListStudentsDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const studentIdFilter = await this.resolveEnrolmentStudentIds(query);
    // An enrolment filter was requested but matched no enrolments -> empty page.
    if (studentIdFilter !== undefined && studentIdFilter.length === 0) {
      return { items: [], total: 0, page, limit };
    }

    const where = {
      deleted_at: null,
      ...(query.admission_status !== undefined
        ? { admission_status: query.admission_status }
        : {}),
      ...(query.referred_by !== undefined
        ? { referred_by: query.referred_by }
        : {}),
      ...(studentIdFilter !== undefined
        ? { student_id: { in: studentIdFilter } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.students.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.students.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Resolve the course/subject/teacher enrolment filters to a list of student user
   * ids (which equal students.student_id). Returns `undefined` when no enrolment
   * filter was supplied (so the caller leaves student_id unconstrained), or a
   * possibly-empty id list otherwise.
   */
  private async resolveEnrolmentStudentIds(
    query: ListStudentsDto,
  ): Promise<number[] | undefined> {
    const { course_id, subject_id, teacher_id } = query;
    if (
      course_id === undefined &&
      subject_id === undefined &&
      teacher_id === undefined
    ) {
      return undefined;
    }

    // teacher_id may also be expressed as "courses this teacher is assigned to"
    // via teachers_subjects. Union those course ids with an explicit course_id
    // filter (when both are present, the explicit course_id still applies via the
    // enrol where-clause below, so the union only broadens the teacher match).
    let teacherCourseIds: number[] | undefined;
    if (teacher_id !== undefined) {
      const links = await this.prisma.teachers_subjects.findMany({
        where: { user_id: teacher_id, deleted_at: null },
        select: { course_id: true },
      });
      teacherCourseIds = [
        ...new Set(
          links
            .map((l) => l.course_id)
            .filter((c): c is number => c != null),
        ),
      ];
    }

    const enrolments = await this.prisma.enrol.findMany({
      where: {
        deleted_at: null,
        ...(subject_id !== undefined ? { subject_id } : {}),
        ...(teacher_id !== undefined ? { teacher_id } : {}),
        ...(course_id !== undefined ? { course_id } : {}),
      },
      select: { user_id: true },
    });

    const ids = new Set(
      enrolments
        .map((e) => e.user_id)
        .filter((u): u is number => u != null),
    );

    // Fold in students enrolled in any course the teacher is assigned to.
    if (teacherCourseIds && teacherCourseIds.length > 0) {
      const byTeacherCourse = await this.prisma.enrol.findMany({
        where: {
          deleted_at: null,
          course_id: { in: teacherCourseIds },
          ...(subject_id !== undefined ? { subject_id } : {}),
        },
        select: { user_id: true },
      });
      for (const e of byTeacherCourse) {
        if (e.user_id != null) ids.add(e.user_id);
      }
    }

    return [...ids];
  }

  // GET /students/:id
  async getStudent(id: number) {
    const student = await this.prisma.students.findFirst({
      where: { id, deleted_at: null },
    });
    if (!student) {
      throw new NotFoundException('Student not found!');
    }
    return student;
  }

  // POST /students
  async createStudent(dto: CreateStudentDto) {
    const now = new Date();
    return this.prisma.students.create({
      data: {
        ...this.toStudentData(dto),
        // student_id, address and consultant_id are required (NOT NULL) columns.
        student_id: dto.student_id,
        address: dto.address,
        consultant_id: dto.consultant_id,
        created_at: now,
        updated_at: now,
      },
    });
  }

  // PATCH /students/:id
  async updateStudent(id: number, dto: UpdateStudentDto) {
    await this.getStudent(id); // 404 if missing or already soft-deleted
    return this.prisma.students.update({
      where: { id },
      data: {
        ...this.toStudentData(dto),
        updated_at: new Date(),
      },
    });
  }

  // DELETE /students/:id — soft delete (set deleted_at = now).
  async deleteStudent(id: number) {
    await this.getStudent(id);
    await this.prisma.students.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
    return { id };
  }

  // GET /students/:id/documents
  async getStudentDocuments(id: number) {
    await this.getStudent(id);
    return this.prisma.student_document.findMany({
      where: { student_id: id, deleted_at: null },
      orderBy: { student_document_id: 'desc' },
    });
  }

  // GET /students/:id/qualifications
  async getStudentQualifications(id: number) {
    await this.getStudent(id);
    // NOTE: qualification.deleted_at is an Int? in the legacy schema (not a timestamp);
    // "not deleted" is still represented as NULL.
    return this.prisma.qualification.findMany({
      where: { student_id: id, deleted_at: null },
      orderBy: { qualification_id: 'desc' },
    });
  }

  // GET /applications — paginate.
  async listApplications(query: ListApplicationsDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const where = { deleted_at: null };

    const [items, total] = await Promise.all([
      this.prisma.applications.findMany({
        where,
        skip,
        take: limit,
        orderBy: { application_id: 'desc' },
      }),
      this.prisma.applications.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  // GET /applications/:id
  async getApplication(applicationId: number) {
    const application = await this.prisma.applications.findFirst({
      where: { application_id: applicationId, deleted_at: null },
    });
    if (!application) {
      throw new NotFoundException('Application not found!');
    }
    return application;
  }

  /**
   * POST /applications/:id/convert — application -> student saga.
   * Port of App/Controllers/App/Application::convert().
   *
   * One interactive transaction performs, atomically:
   *   1. users            — a role_id=4 (student) account, password = bcrypt(phone)
   *   2. student_payments — a 'Registration Fee' / 'Paid' row (legacy student_fee)
   *   3. students         — the student profile row (student_id = new user id),
   *                         with adm_pipeline derived from the creator's role
   *   4. qualification    — stamp the new student_id onto the application's rows
   *   5. student_document — stamp the new student_id onto the application's rows
   *   6. applications     — flag converted (is_converted=1, converted_by, converted_at)
   *
   * Returns { user_id, student_id }.
   */
  async convertApplication(applicationId: number, actorUserId: number) {
    const application = await this.getApplication(applicationId); // 404 if missing/deleted

    if (application.is_converted === 1) {
      throw new ConflictException('Application is already converted!');
    }

    const CONSULTANT_ROLE_ID = 6;
    const CLIENT_ROLE_ID = 8;

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      // Password defaults to the applicant's phone (legacy behaviour).
      const hashedPassword = await bcrypt.hash(application.phone ?? '', 10);

      // 1. users row (role_id = 4 student)
      const user = await tx.users.create({
        data: {
          name: application.name ?? null,
          email: application.email ?? null,
          code: application.code ?? null,
          phone: application.phone ?? null,
          university_id: application.university_id ?? null,
          gender: application.gender ?? null,
          country_id: application.country_id ?? null,
          profile_picture: application.cropped_image ?? null,
          dob: application.dob ?? null,
          role_id: STUDENT_ROLE_ID,
          status: 1,
          password: hashedPassword,
          created_by: actorUserId,
          updated_by: actorUserId,
          created_at: now,
          updated_at: now,
        },
      });

      // 2. registration fee — legacy student_fee == student_payments table.
      await tx.student_payments.create({
        data: {
          installment_details: 'Registration Fee',
          amount: application.amount ?? null,
          paid_date: application.paid_date ?? null,
          payment_mode: application.payment_mode ?? null,
          payment_to: application.payment_to ?? null,
          status: 'Paid',
          student_id: user.id,
          created_by: application.created_by ?? actorUserId,
          created_at: application.created_at ?? now,
        },
      });

      // The admission pipeline depends on the role of whoever created the application.
      const creator = application.created_by
        ? await tx.users.findUnique({
            where: { id: application.created_by },
            select: { role_id: true },
          })
        : null;
      const creatorRoleId = creator?.role_id ?? null;

      let admPipeline = 'consultant';
      let consultantId = application.created_by ?? actorUserId;
      let pipelineUser = application.pipeline_user ?? null;

      if (creatorRoleId === CONSULTANT_ROLE_ID) {
        admPipeline = 'consultant';
        consultantId = application.created_by ?? actorUserId;
        pipelineUser = application.created_by ?? null;
      } else if (creatorRoleId === CLIENT_ROLE_ID) {
        admPipeline = 'client';
        pipelineUser = application.created_by ?? null;
      }

      // Derive age in whole years from the applicant's DOB, when present.
      const age = application.dob
        ? Math.floor(
            (now.getTime() - new Date(application.dob).getTime()) /
              (365.25 * 24 * 60 * 60 * 1000),
          )
        : null;

      // 3. students profile row (student_id = new user id)
      await tx.students.create({
        data: {
          student_id: user.id,
          age,
          enrollment_id: application.enrollment_id ?? null,
          application_id: application.custom_application_id ?? null,
          abc_id: application.abc_id ?? null,
          dob: application.dob ?? null,
          nationality: application.nationality ?? null,
          second_code:
            application.second_code != null
              ? String(application.second_code)
              : null,
          second_phone: application.second_phone ?? null,
          whatsapp_no: application.whatsapp_no ?? null,
          state: application.state ?? null,
          district: application.district ?? null,
          // address is a NOT NULL column.
          address: application.address ?? '',
          session_id: application.session_id ?? null,
          source: application.source ?? null,
          admission_status:
            application.admission_status != null
              ? Number(application.admission_status)
              : null,
          // consultant_id is a NOT NULL column.
          consultant_id: consultantId,
          specialisation_id: application.specialisation_id ?? null,
          course_id: application.course_id ?? null,
          enrollment_date: application.enrollment_date ?? null,
          referred_by: application.created_by ?? null,
          adm_pipeline: admPipeline,
          pipeline_user: pipelineUser,
          created_by: actorUserId,
          updated_by: actorUserId,
          created_at: now,
          updated_at: now,
        },
      });

      // 4. stamp the new student onto the application's qualification rows.
      await tx.qualification.updateMany({
        where: { application_id: application.application_id },
        data: {
          student_id: user.id,
          updated_at: now,
          updated_by: actorUserId,
        },
      });

      // 5. stamp the new student onto the application's document rows.
      await tx.student_document.updateMany({
        where: { application_id: application.application_id },
        data: {
          student_id: user.id,
          updated_at: now,
          updated_by: actorUserId,
        },
      });

      // 6. mark the application converted.
      await tx.applications.update({
        where: { application_id: application.application_id },
        data: {
          is_converted: 1,
          converted_by: actorUserId,
          converted_at: now,
          updated_by: actorUserId,
          updated_at: now,
        },
      });

      return { user_id: user.id, student_id: user.id };
    });
  }

  // POST /students/:id/documents — document upload.
  // Legacy: file move + student_document insert.
  uploadDocument(_id: number): never {
    // TODO(phase-3): port document upload (file storage + student_document insert).
    throw new NotImplementedException('Document upload — phase 3');
  }

  // ===========================================================================
  // Student lifecycle: dropout + credentials
  // ===========================================================================

  /**
   * PATCH /students/:id/dropout — mark the student as dropped out.
   * Sets students.admission_status = 4 (dropout) and stamps drop_out_at = now on
   * the linked users row (drop_out_at lives on `users`, not `students`). Ports the
   * legacy drop_student flow, adapted to the dropout admission_status the task
   * specifies. 404 if the student is missing or soft-deleted.
   */
  async dropoutStudent(id: number) {
    const student = await this.getStudent(id); // 404 if missing/soft-deleted
    const now = new Date();

    const updated = await this.prisma.students.update({
      where: { id },
      data: { admission_status: ADMISSION_STATUS_DROPOUT, updated_at: now },
    });

    // drop_out_at is a users column; the student's user id is students.student_id.
    await this.prisma.users.updateMany({
      where: { id: student.student_id },
      data: { drop_out_at: now, updated_at: now },
    });

    return updated;
  }

  /**
   * PATCH /students/:id/credentials — update the student's login username + password.
   * Operates on the linked users row (students.student_id = users.id). Username must
   * be unique across other users (legacy duplicate check). Password is bcrypt-hashed
   * when supplied. Ports App/Students::ajax_edit_password.
   */
  async updateCredentials(id: number, dto: UpdateCredentialsDto) {
    const student = await this.getStudent(id); // 404 if missing/soft-deleted
    const userId = student.student_id;
    const now = new Date();

    // Reject a username already taken by a different user.
    const clash = await this.prisma.users.findFirst({
      where: { username: dto.username, id: { not: userId }, deleted_at: null },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException('Username Already Exists');
    }

    const passwordHash =
      dto.password !== undefined
        ? await bcrypt.hash(dto.password, BCRYPT_ROUNDS)
        : undefined;

    await this.prisma.users.update({
      where: { id: userId },
      data: {
        username: dto.username,
        ...(passwordHash !== undefined ? { password: passwordHash } : {}),
        updated_at: now,
      },
    });
    return { id, user_id: userId };
  }

  // ===========================================================================
  // Enrolled courses
  // ===========================================================================

  /**
   * GET /students/:id/enrolled-courses — the courses the student is enrolled in.
   * Resolves enrol rows for the student's user id (enrol.user_id), then loads the
   * distinct non-deleted courses. Ports App/Students::get_enrolled_courses.
   */
  async getEnrolledCourses(id: number) {
    const student = await this.getStudent(id);

    const enrolments = await this.prisma.enrol.findMany({
      where: { user_id: student.student_id, deleted_at: null },
      select: { course_id: true },
    });

    const courseIds = [
      ...new Set(
        enrolments
          .map((e) => e.course_id)
          .filter((c): c is number => c != null),
      ),
    ];
    if (courseIds.length === 0) {
      return [];
    }

    return this.prisma.course.findMany({
      where: { id: { in: courseIds }, deleted_at: null },
      orderBy: { id: 'asc' },
    });
  }

  // ===========================================================================
  // Student finance (finance.student_id = users.id)
  // ===========================================================================

  /**
   * GET /students/finance — students (role 4) joined to their finance row.
   * Ports App/Students::finance: optional date range on users.created_at and a
   * university_id filter. Paginated. Each item is the user row plus the finance
   * fields (null finance fields when the student has no finance row yet).
   */
  async listFinance(query: ListFinanceDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const userWhere = {
      role_id: STUDENT_ROLE_ID,
      deleted_at: null,
      ...(query.university_id !== undefined
        ? { university_id: query.university_id }
        : {}),
      ...(query.from_date && query.to_date
        ? {
            created_at: {
              gte: new Date(`${query.from_date}T00:00:00`),
              lte: new Date(`${query.to_date}T23:59:59`),
            },
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.users.findMany({
        where: userWhere,
        skip,
        take: limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.users.count({ where: userWhere }),
    ]);

    // Batch-load finance rows for the page (no N+1).
    const userIds = users.map((u) => u.id);
    const financeRows = userIds.length
      ? await this.prisma.finance.findMany({
          where: { student_id: { in: userIds }, deleted_at: null },
        })
      : [];
    const financeByStudent = new Map(
      financeRows.map((f) => [f.student_id, f]),
    );

    const items = users.map((u) => {
      const fin = financeByStudent.get(u.id);
      return {
        ...u,
        finance_id: fin?.id ?? null,
        tuitionFees: fin?.tuitionFees ?? null,
        examFees: fin?.examFees ?? null,
        miscFees: fin?.miscFees ?? null,
        scholarship_details: fin?.scholarship_details ?? null,
        payment_status: fin?.payment_status ?? null,
      };
    });

    return { items, total, page, limit };
  }

  /**
   * GET /students/finance-summary — aggregate fee totals across all students'
   * finance rows, plus the per-payment-status breakdown. A lightweight companion
   * to the finance list (the legacy UI rendered these counters above the table).
   */
  async financeSummary() {
    const rows = await this.prisma.finance.findMany({
      where: { deleted_at: null },
      select: {
        tuitionFees: true,
        examFees: true,
        miscFees: true,
        payment_status: true,
      },
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.tuitionFees += r.tuitionFees ?? 0;
        acc.examFees += r.examFees ?? 0;
        acc.miscFees += r.miscFees ?? 0;
        return acc;
      },
      { tuitionFees: 0, examFees: 0, miscFees: 0 },
    );

    const byPaymentStatus: Record<string, number> = {};
    for (const r of rows) {
      const key = r.payment_status ?? 'Unknown';
      byPaymentStatus[key] = (byPaymentStatus[key] ?? 0) + 1;
    }

    return {
      count: rows.length,
      totals: {
        ...totals,
        grandTotal: totals.tuitionFees + totals.examFees + totals.miscFees,
      },
      byPaymentStatus,
    };
  }

  /**
   * POST /students/:id/finance — create the student's finance row.
   * finance.student_id is the student's user id (= students.student_id). Ports
   * App/Students::finance_add. 404 if the student is missing/soft-deleted.
   */
  async createFinance(id: number, dto: UpsertFinanceDto) {
    const student = await this.getStudent(id);
    const now = new Date();
    return this.prisma.finance.create({
      data: {
        student_id: student.student_id,
        tuitionFees: dto.tuitionFees ?? null,
        examFees: dto.examFees ?? null,
        miscFees: dto.miscFees ?? null,
        scholarship_details: dto.scholarship_details ?? null,
        payment_status: dto.payment_status ?? null,
        created_at: now,
      },
    });
  }

  /**
   * PATCH /students/:id/finance — update the student's finance row.
   * Updates the most recent non-deleted finance row for the student's user id.
   * Ports App/Students::finance_edit. 404 if the student or its finance row is
   * missing.
   */
  async updateFinance(id: number, dto: UpsertFinanceDto) {
    const student = await this.getStudent(id);
    const existing = await this.prisma.finance.findFirst({
      where: { student_id: student.student_id, deleted_at: null },
      orderBy: { id: 'desc' },
    });
    if (!existing) {
      throw new NotFoundException('Finance record not found!');
    }

    return this.prisma.finance.update({
      where: { id: existing.id },
      data: {
        ...(dto.tuitionFees !== undefined
          ? { tuitionFees: dto.tuitionFees }
          : {}),
        ...(dto.examFees !== undefined ? { examFees: dto.examFees } : {}),
        ...(dto.miscFees !== undefined ? { miscFees: dto.miscFees } : {}),
        ...(dto.scholarship_details !== undefined
          ? { scholarship_details: dto.scholarship_details }
          : {}),
        ...(dto.payment_status !== undefined
          ? { payment_status: dto.payment_status }
          : {}),
        updated_at: new Date(),
      },
    });
  }

  // ===========================================================================
  // Student documents (update / delete by document id)
  // ===========================================================================

  /** Loads a non-deleted student_document by id, or 404s. */
  private async getDocumentOr404(documentId: number) {
    const doc = await this.prisma.student_document.findFirst({
      where: { student_document_id: documentId, deleted_at: null },
    });
    if (!doc) {
      throw new NotFoundException('Document not found!');
    }
    return doc;
  }

  /**
   * PATCH /students/documents/:id — update a student_document's label / file.
   * Ports App/Students::document_edit.
   */
  async updateDocument(documentId: number, dto: UpdateDocumentDto) {
    await this.getDocumentOr404(documentId);
    return this.prisma.student_document.update({
      where: { student_document_id: documentId },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.file !== undefined ? { file: dto.file } : {}),
        updated_at: new Date(),
      },
    });
  }

  /**
   * DELETE /students/documents/:id — soft-delete a student_document.
   * Ports App/Students::document_delete (the legacy model soft-deletes).
   */
  async deleteDocument(documentId: number) {
    await this.getDocumentOr404(documentId);
    await this.prisma.student_document.update({
      where: { student_document_id: documentId },
      data: { deleted_at: new Date() },
    });
    return { student_document_id: documentId };
  }

  // ===========================================================================
  // Legacy JSON academic columns on `students`
  // ===========================================================================

  /** Parses a legacy JSON LongText column, tolerating null / malformed values. */
  private parseJsonColumn(raw: string | null): unknown {
    if (raw == null || raw === '') return null;
    try {
      return JSON.parse(raw);
    } catch {
      // Legacy data is not always valid JSON; surface the raw string rather than
      // throwing so reads never 500 on dirty rows.
      return raw;
    }
  }

  /**
   * GET /students/:id/academic-grades — the parsed JSON progress columns.
   * Reads the legacy LongText columns (courses/course_status/attendance/
   * midtermGrades/finalGrades/paymentStatus) and JSON-parses each.
   */
  async getAcademicGrades(id: number) {
    const student = await this.getStudent(id);
    return {
      courses: this.parseJsonColumn(student.courses),
      course_status: this.parseJsonColumn(student.course_status),
      attendance: this.parseJsonColumn(student.attendance),
      midtermGrades: this.parseJsonColumn(student.midtermGrades),
      finalGrades: this.parseJsonColumn(student.finalGrades),
      paymentStatus: this.parseJsonColumn(student.paymentStatus),
    };
  }

  /**
   * PATCH /students/:id/academic-grades — persist the JSON progress columns.
   * Only the supplied fields are written; each is JSON-stringified into its
   * LongText column.
   */
  async updateAcademicGrades(id: number, dto: AcademicGradesDto) {
    await this.getStudent(id);

    const stringify = (v: unknown) =>
      typeof v === 'string' ? v : JSON.stringify(v);

    await this.prisma.students.update({
      where: { id },
      data: {
        ...(dto.courses !== undefined
          ? { courses: stringify(dto.courses) }
          : {}),
        ...(dto.course_status !== undefined
          ? { course_status: stringify(dto.course_status) }
          : {}),
        ...(dto.attendance !== undefined
          ? { attendance: stringify(dto.attendance) }
          : {}),
        ...(dto.midtermGrades !== undefined
          ? { midtermGrades: stringify(dto.midtermGrades) }
          : {}),
        ...(dto.finalGrades !== undefined
          ? { finalGrades: stringify(dto.finalGrades) }
          : {}),
        ...(dto.paymentStatus !== undefined
          ? { paymentStatus: stringify(dto.paymentStatus) }
          : {}),
        updated_at: new Date(),
      },
    });
    return this.getAcademicGrades(id);
  }

  /**
   * GET /students/:id/courses — the parsed legacy students.courses JSON column.
   * A focused companion to academic-grades for the courses list specifically.
   */
  async getStudentCourses(id: number) {
    const student = await this.getStudent(id);
    return { courses: this.parseJsonColumn(student.courses) };
  }

  // ===========================================================================
  // Student qualifications (bulk update / nullify one level)
  // ===========================================================================

  /**
   * PATCH /students/:id/qualifications — bulk-update the student's qualification
   * rows. Each row is matched by its `qualification` label (10th/12th/Degree) and
   * updated in place. Mirrors the existing GET semantics (qualification.student_id
   * matched against the route :id). Ports App/Academic::edit_qualification.
   */
  async updateStudentQualifications(id: number, dto: UpdateQualificationsDto) {
    await this.getStudent(id);
    const now = new Date();

    const results: Array<{ qualification: string; updated: number }> = [];
    for (const row of dto.qualifications) {
      const updated = await this.prisma.qualification.updateMany({
        where: {
          student_id: id,
          qualification: row.qualification,
          deleted_at: null,
        },
        data: {
          ...(row.board !== undefined ? { board: row.board } : {}),
          ...(row.percentage !== undefined
            ? { percentage: row.percentage }
            : {}),
          ...(row.certificate !== undefined
            ? { certificate: row.certificate }
            : {}),
          ...(row.marksheet !== undefined ? { marksheet: row.marksheet } : {}),
          updated_at: now,
        },
      });
      results.push({ qualification: row.qualification, updated: updated.count });
    }

    return { results };
  }

  /**
   * DELETE /students/:id/qualifications/:qual — nullify a single qualification
   * level's details (board/percentage/certificate/marksheet) without removing the
   * row. Ports App/Academic::delete_qualification (a soft "clear", not a delete).
   */
  async clearStudentQualification(id: number, qualification: string) {
    await this.getStudent(id);
    const result = await this.prisma.qualification.updateMany({
      where: { student_id: id, qualification, deleted_at: null },
      data: {
        board: null,
        percentage: null,
        certificate: null,
        marksheet: null,
        updated_at: new Date(),
      },
    });
    if (result.count === 0) {
      throw new NotFoundException('Qualification not found!');
    }
    return { qualification, cleared: result.count };
  }

  // ===========================================================================
  // Academic students surface (GET/PATCH /academic/students)
  // ===========================================================================

  /**
   * GET /academic/students — list students (role 4) with their enrollment_id /
   * application_id / admission_status. Optional admission_status and university_id
   * filters. Ports App/Academic::index. Paginated.
   */
  async listAcademicStudents(query: ListAcademicStudentsDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    // university_id lives on the users table; resolve matching student user ids first.
    let universityStudentIds: number[] | undefined;
    if (query.university_id !== undefined) {
      const users = await this.prisma.users.findMany({
        where: {
          role_id: STUDENT_ROLE_ID,
          university_id: query.university_id,
          deleted_at: null,
        },
        select: { id: true },
      });
      universityStudentIds = users.map((u) => u.id);
      if (universityStudentIds.length === 0) {
        return { items: [], total: 0, page, limit };
      }
    }

    const where = {
      deleted_at: null,
      ...(query.admission_status !== undefined
        ? { admission_status: query.admission_status }
        : {}),
      ...(universityStudentIds !== undefined
        ? { student_id: { in: universityStudentIds } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.students.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'desc' },
        select: {
          id: true,
          student_id: true,
          enrollment_id: true,
          application_id: true,
          admission_status: true,
          consultant_id: true,
          course_id: true,
        },
      }),
      this.prisma.students.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * GET /academic/students/:id — the academic view of one student.
   * :id is the student's user id (students.student_id = users.id), matching the
   * legacy route. 404 if not found / soft-deleted.
   */
  async getAcademicStudent(userId: number) {
    const student = await this.prisma.students.findFirst({
      where: { student_id: userId, deleted_at: null },
    });
    if (!student) {
      throw new NotFoundException('Student not found!');
    }
    return student;
  }

  /**
   * PATCH /academic/students/:id — update a student's academic fields.
   * :id is the student's user id. Updates the `students` row (academic fields) and,
   * when supplied, users.university_id. Ports App/Academic::edit.
   */
  async updateAcademicStudent(userId: number, dto: UpdateAcademicStudentDto) {
    const student = await this.getAcademicStudent(userId);
    const now = new Date();
    const { university_id, ...studentFields } = dto;

    if (university_id !== undefined) {
      await this.prisma.users.updateMany({
        where: { id: userId },
        data: { university_id, updated_at: now },
      });
    }

    return this.prisma.students.update({
      where: { id: student.id },
      data: { ...studentFields, updated_at: now },
    });
  }

  // ===========================================================================
  // Applications: create + edit steps + qualifications + delete + document edit
  // ===========================================================================

  /**
   * POST /applications — create an application and seed 3 default qualification
   * rows (10th / 12th / Degree). Ports App/Application::add (bio step + qualification
   * seeding). Document seeding (Signature/Aadhar/Photo) is intentionally left to the
   * document-upload surface.
   */
  async createApplication(dto: CreateApplicationDto, actorUserId: number) {
    const now = new Date();
    const { dob, enrollment_date, ...rest } = dto;

    const application = await this.prisma.applications.create({
      data: {
        ...rest,
        ...(dob !== undefined ? { dob: new Date(dob) } : {}),
        ...(enrollment_date !== undefined
          ? { enrollment_date: new Date(enrollment_date) }
          : {}),
        is_converted: 0,
        is_archived: false,
        created_by: actorUserId,
        created_at: now,
      },
    });

    // Seed the three default qualification levels for this application.
    const DEFAULT_QUALIFICATIONS = ['10th', '12th', 'Degree'];
    await this.prisma.qualification.createMany({
      data: DEFAULT_QUALIFICATIONS.map((qualification) => ({
        // student_id is NOT NULL in the schema; 0 marks "not yet a student"
        // (gets stamped with the real user id at conversion time).
        student_id: 0,
        application_id: application.application_id,
        qualification,
        created_by: actorUserId,
        created_at: now,
      })),
    });

    return application;
  }

  /**
   * PATCH /applications/:id — generic bio/contact update.
   * Ports the App/Application edit bio step.
   */
  async updateApplication(
    applicationId: number,
    dto: UpdateApplicationDto,
    actorUserId: number,
  ) {
    await this.getApplication(applicationId);
    const { dob, enrollment_date, ...rest } = dto;
    return this.prisma.applications.update({
      where: { application_id: applicationId },
      data: {
        ...rest,
        ...(dob !== undefined ? { dob: new Date(dob) } : {}),
        ...(enrollment_date !== undefined
          ? { enrollment_date: new Date(enrollment_date) }
          : {}),
        updated_by: actorUserId,
        updated_at: new Date(),
      },
    });
  }

  /**
   * PATCH /applications/:id/course-fee — update the registration/course fee fields.
   * Ports App/Application::edit_course_fee.
   */
  async updateApplicationCourseFee(
    applicationId: number,
    dto: ApplicationCourseFeeDto,
    actorUserId: number,
  ) {
    await this.getApplication(applicationId);
    const { paid_date, ...rest } = dto;
    return this.prisma.applications.update({
      where: { application_id: applicationId },
      data: {
        ...rest,
        ...(paid_date !== undefined ? { paid_date: new Date(paid_date) } : {}),
        updated_by: actorUserId,
        updated_at: new Date(),
      },
    });
  }

  /**
   * PATCH /applications/:id/academic — update the academic/admission fields.
   * Legacy force-sets admission_status = 0 (false) on this step; preserved here.
   * Ports App/Application::academic.
   */
  async updateApplicationAcademic(
    applicationId: number,
    dto: ApplicationAcademicDto,
    actorUserId: number,
  ) {
    await this.getApplication(applicationId);
    return this.prisma.applications.update({
      where: { application_id: applicationId },
      data: {
        ...dto,
        admission_status: false,
        updated_by: actorUserId,
        updated_at: new Date(),
      },
    });
  }

  /**
   * PATCH /applications/:id/qualifications — bulk-update the application's
   * qualification rows, matched by `qualification` label. Ports
   * App/Application::edit_qualification.
   */
  async updateApplicationQualifications(
    applicationId: number,
    dto: UpdateQualificationsDto,
    actorUserId: number,
  ) {
    await this.getApplication(applicationId);
    const now = new Date();

    const results: Array<{ qualification: string; updated: number }> = [];
    for (const row of dto.qualifications) {
      const updated = await this.prisma.qualification.updateMany({
        where: {
          application_id: applicationId,
          qualification: row.qualification,
          deleted_at: null,
        },
        data: {
          ...(row.board !== undefined ? { board: row.board } : {}),
          ...(row.percentage !== undefined
            ? { percentage: row.percentage }
            : {}),
          ...(row.certificate !== undefined
            ? { certificate: row.certificate }
            : {}),
          ...(row.marksheet !== undefined ? { marksheet: row.marksheet } : {}),
          updated_at: now,
          updated_by: actorUserId,
        },
      });
      results.push({ qualification: row.qualification, updated: updated.count });
    }

    return { results };
  }

  /**
   * DELETE /applications/:id — hard delete (legacy remove() removed the row).
   * 404 if the application is missing/already deleted.
   */
  async deleteApplication(applicationId: number) {
    await this.getApplication(applicationId);
    await this.prisma.applications.delete({
      where: { application_id: applicationId },
    });
    return { application_id: applicationId };
  }

  /**
   * PATCH /applications/documents/:id — update an application document's label/file.
   * Shares the student_document table with student docs. Ports
   * App/Application::document_edit.
   */
  async updateApplicationDocument(documentId: number, dto: UpdateDocumentDto) {
    return this.updateDocument(documentId, dto);
  }

  /**
   * Maps DTO fields to the Prisma `students` shape, converting date strings to Date
   * objects and dropping the required-column fields handled explicitly by the caller.
   */
  private toStudentData(dto: CreateStudentDto | UpdateStudentDto) {
    const { dob, enrollment_date, ...rest } = dto;
    // student_id/address/consultant_id are set explicitly on create; for update they
    // pass through `rest` only when present. Date strings are converted to Date objects.
    return {
      ...rest,
      ...(dob !== undefined ? { dob: new Date(dob) } : {}),
      ...(enrollment_date !== undefined
        ? { enrollment_date: new Date(enrollment_date) }
        : {}),
    };
  }

  // ===========================================================================
  // Application activity / candidate statuses (legacy Candidate controller)
  // ===========================================================================

  /**
   * GET /applications/:id/activity — the candidate activity log for an
   * application. The legacy `candidate_activity` table is ABSENT from the current
   * Prisma schema, so we cannot query it without breaking compilation. Validate
   * the application exists (404 otherwise) and return a well-formed empty list.
   * TODO(prod-table): once a `candidate_activity` model exists, replace the empty
   * `items` with the real log filtered by application id, ordered newest-first.
   */
  async getApplicationActivity(
    applicationId: number,
  ): Promise<{ items: unknown[]; total: number }> {
    await this.getApplication(applicationId); // 404 if missing/soft-deleted
    return { items: [], total: 0 };
  }

  /**
   * GET /candidate-statuses — the candidate status options. The legacy
   * `candidate_status` table is ABSENT from the current Prisma schema, so we
   * return an empty list rather than reference a non-existent model.
   * TODO(prod-table): once a `candidate_status` model exists, return its live
   * (deleted_at IS NULL) rows ordered by id.
   */
  async getCandidateStatuses(): Promise<{ items: unknown[]; total: number }> {
    return { items: [], total: 0 };
  }

  // ===========================================================================
  // Student enrolments (enrol table; enrol.user_id = users.id)
  // ===========================================================================

  /**
   * POST /students/:id/enrolments — create an `enrol` row linking a student
   * (the :id param is the student record id) to a course, and optionally a
   * subject/teacher. Validates the student exists, then resolves the student's
   * underlying users.id (students.student_id) for enrol.user_id.
   *
   * NOTE: `dto.session_count` is accepted for API parity but the `enrol` table has
   * no column for it in the current schema.
   * TODO(prod-table): persist session count once `enrol` gains the column.
   */
  async createEnrolment(
    studentId: number,
    dto: CreateEnrolmentDto,
    actorUserId: number,
  ) {
    const student = await this.getStudent(studentId); // 404 if missing
    const now = new Date();

    return this.prisma.enrol.create({
      data: {
        user_id: student.student_id,
        ...(dto.course_id !== undefined ? { course_id: dto.course_id } : {}),
        ...(dto.subject_id !== undefined ? { subject_id: dto.subject_id } : {}),
        ...(dto.teacher_id !== undefined ? { teacher_id: dto.teacher_id } : {}),
        created_by: actorUserId,
        created_at: now,
        updated_at: now,
      },
    });
  }

  /**
   * DELETE /students/enrolments/:id — soft-delete an `enrol` row (set deleted_at).
   * 404 if the row is missing or already soft-deleted.
   */
  async deleteEnrolment(enrolId: number, actorUserId: number) {
    const existing = await this.prisma.enrol.findFirst({
      where: { id: enrolId, deleted_at: null },
    });
    if (!existing) {
      throw new NotFoundException('Enrolment not found!');
    }
    const now = new Date();
    await this.prisma.enrol.update({
      where: { id: enrolId },
      data: { deleted_at: now, deleted_by: actorUserId, updated_at: now },
    });
    return { id: enrolId };
  }
}
