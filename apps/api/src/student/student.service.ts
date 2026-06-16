import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListStudentSessionsDto } from './dto/list-sessions.dto';
import { ListFeedDto } from './dto/feed.dto';
import { UpdateStudentProfileDto } from './dto/update-profile.dto';
import { SwitchCourseDto } from './dto/switch-course.dto';
import { SubmitWorkDto } from './dto/submit-work.dto';
import { SessionFeedbackDto } from './dto/session-feedback.dto';
import { PerformanceQueryDto } from './dto/performance.dto';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

// student_status flag on homework & assessment rows (1 = Completed).
const WORK_STATUS_COMPLETED = 1;

/**
 * Student mobile-API parity surface (port of CI4 App/Controllers/Api/Student/*).
 *
 * Every method is scoped to the logged-in student, identified by their *user id*
 * (@CurrentUser('id') in the controller). In this data model a student is a
 * `users` row with role_id = 4 and a matching `students` profile row whose
 * `students.student_id` equals `users.id`.
 *
 * Read-only this phase. Soft-delete (`deleted_at IS NULL`) is honoured throughout.
 *
 * Schema notes that shape these queries:
 *  - `enrol` links a student by `enrol.user_id` (the column is user_id even though
 *    its index is mapped as "student_id"). Legacy CI4 queried enrol.student_id;
 *    the v2 schema column is user_id, which is what we scope by here.
 *  - The v2 `sessions` table is thin (PK session_id, only session_title). The
 *    student<->session link lives on `session_attendance` (student_id + session_id),
 *    so /student/sessions is driven from session_attendance and joins the session
 *    title in. The legacy controller's flat `sessions.student_id` column does not
 *    exist in this schema.
 *  - "Unpaid" invoices == invoice.payment_status = 'pending' (the
 *    invoice_payment_status enum is { pending, paid }).
 */
@Injectable()
export class StudentService {
  constructor(private readonly prisma: PrismaService) {}

  // GET /student/home — dashboard summary for the logged-in student.
  async getHome(userId: number) {
    const [profile, student, courseCount, upcomingSessions, unpaidInvoices] =
      await Promise.all([
        // users row (the identity)
        this.prisma.users.findFirst({
          where: { id: userId, deleted_at: null },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            code: true,
            gender: true,
            profile_picture: true,
            role_id: true,
            university_id: true,
            country_id: true,
            status: true,
          },
        }),
        // students profile row (student_id = users.id)
        this.prisma.students.findFirst({
          where: { student_id: userId, deleted_at: null },
        }),
        // number of courses the student is enrolled in
        this.prisma.enrol.count({
          where: { user_id: userId, deleted_at: null },
        }),
        // next few upcoming attended/scheduled sessions for the student
        this.prisma.session_attendance.findMany({
          where: { student_id: userId, deleted_at: null },
          orderBy: { id: 'desc' },
          take: 5,
        }),
        // unpaid invoices
        this.prisma.invoice.findMany({
          where: {
            student_id: userId,
            payment_status: 'pending',
            deleted_at: null,
          },
          orderBy: { id: 'desc' },
        }),
      ]);

    if (!profile) {
      throw new NotFoundException('Student not found!');
    }

    const unpaidInvoiceTotal = unpaidInvoices.reduce(
      (sum, inv) => sum + (inv.payable_amount ?? 0),
      0,
    );

    return {
      profile,
      student,
      counts: {
        courses: courseCount,
        upcoming_sessions: upcomingSessions.length,
        unpaid_invoices: unpaidInvoices.length,
      },
      upcoming_sessions: upcomingSessions,
      unpaid_invoices: unpaidInvoices,
      unpaid_invoice_total: unpaidInvoiceTotal,
    };
  }

  // GET /student/courses — the student's enrolled courses (enrol -> course).
  async getCourses(userId: number) {
    const enrolments = await this.prisma.enrol.findMany({
      where: { user_id: userId, deleted_at: null },
      orderBy: { id: 'desc' },
    });

    const courseIds = [
      ...new Set(
        enrolments
          .map((e) => e.course_id)
          .filter((id): id is number => id != null),
      ),
    ];

    if (courseIds.length === 0) {
      return { items: [], total: 0 };
    }

    const courses = await this.prisma.course.findMany({
      where: { id: { in: courseIds }, deleted_at: null },
      orderBy: { id: 'desc' },
    });

    return { items: courses, total: courses.length };
  }

  // GET /student/sessions — sessions the student is linked to (paginated).
  // Driven from session_attendance (student_id), with the session title joined in.
  async getSessions(userId: number, query: ListStudentSessionsDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const where: Prisma.session_attendanceWhereInput = {
      student_id: userId,
      deleted_at: null,
    };

    const [attendance, total] = await Promise.all([
      this.prisma.session_attendance.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.session_attendance.count({ where }),
    ]);

    // Enrich each attendance row with its session title (thin sessions table).
    const sessionIds = [
      ...new Set(
        attendance
          .map((a) => a.session_id)
          .filter((id): id is number => id != null),
      ),
    ];

    const sessions = sessionIds.length
      ? await this.prisma.sessions.findMany({
          where: { session_id: { in: sessionIds }, deleted_at: null },
        })
      : [];
    const titleById = new Map(
      sessions.map((s) => [s.session_id, s.session_title ?? null]),
    );

    const items = attendance.map((a) => ({
      ...a,
      session_title: a.session_id != null ? titleById.get(a.session_id) ?? null : null,
    }));

    return { items, total, page, limit };
  }

  // GET /student/invoices — invoices where student_id = me.
  async getInvoices(userId: number) {
    const items = await this.prisma.invoice.findMany({
      where: { student_id: userId, deleted_at: null },
      orderBy: { id: 'desc' },
    });
    return { items, total: items.length };
  }

  // GET /student/assessments — assessment rows where student_id = me.
  async getAssessments(userId: number) {
    const items = await this.prisma.assessment.findMany({
      where: { student_id: userId, deleted_at: null },
      orderBy: { id: 'desc' },
    });
    return { items, total: items.length };
  }

  // ===========================================================================
  // Profile (GET/PATCH /student/profile) — port of CI4 App/Profile.
  // The student row is the identity hub: users (name/email/phone/dob/picture) +
  // students profile (dob/address/course_id/etc).
  // ===========================================================================

  private async requireStudentUser(userId: number) {
    const user = await this.prisma.users.findFirst({
      where: { id: userId, deleted_at: null },
    });
    if (!user) {
      throw new NotFoundException('Student not found!');
    }
    return user;
  }

  // GET /student/profile
  async getProfile(userId: number) {
    const user = await this.requireStudentUser(userId);
    const student = await this.prisma.students.findFirst({
      where: { student_id: userId, deleted_at: null },
    });
    const { password: _pw, prev_password: _ppw, otp: _otp, ...safeUser } = user;
    return { profile: safeUser, student };
  }

  // PATCH /student/profile — updates own users fields + students.dob.
  async updateProfile(userId: number, dto: UpdateStudentProfileDto) {
    await this.requireStudentUser(userId);
    const now = new Date();

    const userData: Prisma.usersUpdateInput = { updated_at: now, updated_by: userId };
    if (dto.name !== undefined) userData.name = dto.name;
    if (dto.email !== undefined) userData.email = dto.email;
    if (dto.phone !== undefined) userData.phone = dto.phone;
    if (dto.profile_picture !== undefined) userData.profile_picture = dto.profile_picture;
    if (dto.dob !== undefined) userData.dob = new Date(dto.dob);

    await this.prisma.users.update({ where: { id: userId }, data: userData });

    // Mirror dob onto the students profile row when present.
    if (dto.dob !== undefined) {
      const student = await this.prisma.students.findFirst({
        where: { student_id: userId, deleted_at: null },
        select: { id: true },
      });
      if (student) {
        await this.prisma.students.update({
          where: { id: student.id },
          data: { dob: new Date(dto.dob), updated_at: now, updated_by: userId },
        });
      }
    }

    return this.getProfile(userId);
  }

  // ===========================================================================
  // Enrolled courses & primary-course switch.
  // ===========================================================================

  // GET /student/enrolled-courses — enrol -> course (+ subject) enriched.
  async getEnrolledCourses(userId: number) {
    const enrolments = await this.prisma.enrol.findMany({
      where: { user_id: userId, deleted_at: null },
      orderBy: { id: 'desc' },
    });

    const courseIds = [
      ...new Set(enrolments.map((e) => e.course_id).filter((id): id is number => id != null)),
    ];
    const subjectIds = [
      ...new Set(enrolments.map((e) => e.subject_id).filter((id): id is number => id != null)),
    ];

    const [courses, subjects] = await Promise.all([
      courseIds.length
        ? this.prisma.course.findMany({ where: { id: { in: courseIds }, deleted_at: null } })
        : Promise.resolve([]),
      subjectIds.length
        ? this.prisma.subjects.findMany({ where: { id: { in: subjectIds }, deleted_at: null } })
        : Promise.resolve([]),
    ]);

    const courseById = new Map(courses.map((c) => [c.id, c]));
    const subjectById = new Map(subjects.map((s) => [s.id, s]));

    const items = enrolments.map((e) => ({
      enrol_id: e.id,
      course_id: e.course_id,
      subject_id: e.subject_id,
      teacher_id: e.teacher_id,
      university_id: e.university_id,
      course: e.course_id != null ? courseById.get(e.course_id) ?? null : null,
      subject: e.subject_id != null ? subjectById.get(e.subject_id) ?? null : null,
    }));

    return { items, total: items.length };
  }

  // POST /student/switch-course — set students.course_id to a course the
  // student is actually enrolled in.
  async switchCourse(userId: number, dto: SwitchCourseDto) {
    const student = await this.prisma.students.findFirst({
      where: { student_id: userId, deleted_at: null },
      select: { id: true },
    });
    if (!student) {
      throw new NotFoundException('Student not found!');
    }

    const enrolment = await this.prisma.enrol.findFirst({
      where: { user_id: userId, course_id: dto.courseId, deleted_at: null },
      select: { id: true },
    });
    if (!enrolment) {
      throw new NotFoundException('You are not enrolled in this course');
    }

    const now = new Date();
    const updated = await this.prisma.students.update({
      where: { id: student.id },
      data: { course_id: dto.courseId, updated_at: now, updated_by: userId },
    });
    return { student: updated };
  }

  // ===========================================================================
  // Feed (announcements). The `feed` table is ABSENT from the v2 schema.
  // TODO(prod-table): port the `feed` table and replace this empty page.
  // ===========================================================================

  // GET /student/feed
  async getFeed(query: ListFeedDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    // TODO(prod-table): `feed` model does not exist in schema.prisma.
    return { items: [], total: 0, page, limit };
  }

  // ===========================================================================
  // Live classes. The `live_class` table is ABSENT. We derive a best-effort
  // listing from `session_attendance` (student's sessions) joined to the thin
  // `sessions` table, since real-time class metadata is not modelled here.
  // ===========================================================================

  // GET /student/live-classes
  async getLiveClasses(userId: number) {
    const attendance = await this.prisma.session_attendance.findMany({
      where: { student_id: userId, deleted_at: null },
      orderBy: { id: 'desc' },
    });

    const sessionIds = [
      ...new Set(attendance.map((a) => a.session_id).filter((id): id is number => id != null)),
    ];
    const sessions = sessionIds.length
      ? await this.prisma.sessions.findMany({
          where: { session_id: { in: sessionIds }, deleted_at: null },
        })
      : [];
    const titleById = new Map(sessions.map((s) => [s.session_id, s.session_title ?? null]));

    // TODO(prod-table): `live_class` model absent — derived from session_attendance.
    const items = attendance.map((a) => ({
      id: a.id,
      session_id: a.session_id,
      session_title: a.session_id != null ? titleById.get(a.session_id) ?? null : null,
      date: a.date,
      start_time: a.start_time,
      end_time: a.end_time,
    }));

    return { items, total: items.length };
  }

  // GET /student/live-classes/:id — one derived live class (by attendance id).
  async getLiveClass(userId: number, id: number) {
    const a = await this.prisma.session_attendance.findFirst({
      where: { id, student_id: userId, deleted_at: null },
    });
    if (!a) {
      // TODO(prod-table): `live_class` model absent — no derived class found.
      throw new NotFoundException('Live class not found');
    }
    const session =
      a.session_id != null
        ? await this.prisma.sessions.findFirst({
            where: { session_id: a.session_id, deleted_at: null },
          })
        : null;
    return {
      id: a.id,
      session_id: a.session_id,
      session_title: session?.session_title ?? null,
      date: a.date,
      start_time: a.start_time,
      end_time: a.end_time,
    };
  }

  // ===========================================================================
  // Materials. `lesson` / `lesson_file` tables are ABSENT from the schema.
  // TODO(prod-table): port lessons/lesson_files; return empty shapes for now.
  // ===========================================================================

  // GET /student/courses/:id/materials
  async getCourseMaterials(_courseId: number) {
    // TODO(prod-table): `lesson`/`lesson_file` models do not exist.
    return { materials: [], practice: [] };
  }

  // GET /student/subjects/:id/materials
  async getSubjectMaterials(_subjectId: number) {
    // TODO(prod-table): `lesson`/`lesson_file` models do not exist.
    return { materials: [], practice: [] };
  }

  // GET /student/materials/:id
  async getMaterial(_id: number) {
    // TODO(prod-table): `lesson`/`lesson_file` models do not exist.
    return { materials: [], practice: [] };
  }

  // ===========================================================================
  // Plans & payment. `package` / `subject_package` tables are ABSENT.
  // TODO(prod-table): port package/subject_package + EaseBuzz config.
  // ===========================================================================

  // GET /student/courses/:id/plans
  async getCoursePlans(_courseId: number) {
    // TODO(prod-table): `package`/`subject_package` models do not exist.
    return { items: [], total: 0 };
  }

  // GET /student/plans/:id
  async getPlan(_id: number) {
    // TODO(prod-table): `package`/`subject_package` models do not exist.
    return { plan: null };
  }

  // POST /student/plans/initiate-payment
  async initiatePlanPayment(_userId: number, _dto: InitiatePaymentDto) {
    // TODO(prod-table): `package`/`subject_package` models + EaseBuzz config absent.
    // Legacy User/Plans::generate_payment built an EaseBuzz redirect URL; here we
    // return a well-formed "not configured" init shape so clients can branch on it.
    return {
      gateway: 'easebuzz',
      configured: false,
      payment_url: null,
      message: 'Payment gateway is not configured in this environment',
    };
  }

  // ===========================================================================
  // Progress — derived from assessment + homework completion/marks since the
  // legacy per-lesson progress table is ABSENT.
  // ===========================================================================

  private parseMark(mark: string | null | undefined): number | null {
    if (mark == null || mark === '') return null;
    const n = Number(mark);
    return Number.isFinite(n) ? n : null;
  }

  // GET /student/progress
  async getProgress(userId: number) {
    const [homework, assessments] = await Promise.all([
      this.prisma.homework.findMany({
        where: { student_id: userId, deleted_at: null },
        orderBy: { id: 'desc' },
      }),
      this.prisma.assessment.findMany({
        where: { student_id: userId, deleted_at: null },
        orderBy: { id: 'desc' },
      }),
    ]);

    const homeworkCompleted = homework.filter(
      (h) => h.student_status === WORK_STATUS_COMPLETED,
    ).length;
    const assessmentCompleted = assessments.filter(
      (a) => a.student_status === WORK_STATUS_COMPLETED,
    ).length;

    const examScores = assessments
      .map((a) => ({
        assessment_id: a.id,
        title: a.title ?? null,
        mark: this.parseMark(a.mark),
      }))
      .filter((s) => s.mark != null);

    const homeworkTotal = homework.length;
    const assessmentTotal = assessments.length;

    return {
      // TODO(prod-table): per-lesson `lesson` progress absent — lesson_progress is 0.
      lesson_progress: { completed: 0, total: 0, percent: 0 },
      homework: {
        completed: homeworkCompleted,
        total: homeworkTotal,
        percent: homeworkTotal ? Math.round((homeworkCompleted / homeworkTotal) * 100) : 0,
      },
      assessments: {
        completed: assessmentCompleted,
        total: assessmentTotal,
        percent: assessmentTotal
          ? Math.round((assessmentCompleted / assessmentTotal) * 100)
          : 0,
      },
      exam_scores: examScores,
    };
  }

  // ===========================================================================
  // Subjects. `lesson` table is ABSENT — return subject detail + empty lessons.
  // ===========================================================================

  // GET /student/subjects/:id
  async getSubject(id: number) {
    const subject = await this.prisma.subjects.findFirst({
      where: { id, deleted_at: null },
    });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }
    // TODO(prod-table): `lesson` model absent — lessons returned empty.
    return { subject, lessons: [] };
  }

  // ===========================================================================
  // Homework — list + submit.
  // ===========================================================================

  // GET /student/homework — homework rows where student_id = me.
  async getHomework(userId: number) {
    const items = await this.prisma.homework.findMany({
      where: { student_id: userId, deleted_at: null },
      orderBy: { id: 'desc' },
    });
    return { items, total: items.length };
  }

  // POST /student/homework/:id/submit — record answer + answer_file, mark done.
  async submitHomework(userId: number, id: number, dto: SubmitWorkDto) {
    const row = await this.prisma.homework.findFirst({
      where: { id, student_id: userId, deleted_at: null },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('Homework not found');
    }
    const now = new Date();
    const updated = await this.prisma.homework.update({
      where: { id: row.id },
      data: {
        student_status: WORK_STATUS_COMPLETED,
        ...(dto.answer !== undefined ? { answer: dto.answer } : {}),
        ...(dto.answer_file !== undefined ? { answer_file: dto.answer_file } : {}),
        updated_at: now,
        updated_by: userId,
      },
    });
    return { homework: updated };
  }

  // POST /student/assessments/:id/submit — record answer + answer_file, mark done.
  async submitAssessment(userId: number, id: number, dto: SubmitWorkDto) {
    const row = await this.prisma.assessment.findFirst({
      where: { id, student_id: userId, deleted_at: null },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('Assessment not found');
    }
    const now = new Date();
    const updated = await this.prisma.assessment.update({
      where: { id: row.id },
      data: {
        student_status: WORK_STATUS_COMPLETED,
        ...(dto.answer !== undefined ? { answer: dto.answer } : {}),
        ...(dto.answer_file !== undefined ? { answer_file: dto.answer_file } : {}),
        updated_at: now,
        updated_by: userId,
      },
    });
    return { assessment: updated };
  }

  // ===========================================================================
  // Session feedback — write a feedback row + mark attendance complete.
  // ===========================================================================

  // POST /student/sessions/:id/feedback  (:id is the session_attendance row id)
  async submitSessionFeedback(userId: number, attendanceId: number, dto: SessionFeedbackDto) {
    const attendance = await this.prisma.session_attendance.findFirst({
      where: { id: attendanceId, student_id: userId, deleted_at: null },
    });
    if (!attendance) {
      throw new NotFoundException('Session not found');
    }

    const now = new Date();

    // NOTE: `session_feedback` is teacher-shaped (no student_id/rating/remarks
    // columns). We persist rating -> session_status and remarks -> problem_faced,
    // tagging ownership with created_by = me.
    // TODO(prod-table): add a student-feedback schema (student_id/rating/remarks).
    const feedback = await this.prisma.session_feedback.create({
      data: {
        session_id: attendance.session_id ?? null,
        session_status: dto.rating != null ? String(dto.rating) : null,
        problem_faced: dto.remarks ?? null,
        created_at: now,
        created_by: userId,
        updated_at: now,
        updated_by: userId,
      },
    });

    // Mark the student's attendance row as completed (stamped).
    await this.prisma.session_attendance.update({
      where: { id: attendance.id },
      data: { updated_at: now, updated_by: userId },
    });

    return { feedback };
  }

  // ===========================================================================
  // Performance — marks/attendance/assessment summary for the student.
  // Port of CI4 Api/Student/Performance::index (?course_id=).
  // ===========================================================================

  // GET /student/performance?course_id=
  async getPerformance(userId: number, query: PerformanceQueryDto) {
    const courseId = query.course_id;
    const courseFilter = courseId != null ? { course_id: courseId } : {};

    const [homework, assessments, attendanceCount] = await Promise.all([
      this.prisma.homework.findMany({
        where: { student_id: userId, deleted_at: null, ...courseFilter },
        orderBy: { id: 'desc' },
      }),
      this.prisma.assessment.findMany({
        where: { student_id: userId, deleted_at: null, ...courseFilter },
        orderBy: { id: 'desc' },
      }),
      this.prisma.session_attendance.count({
        where: { student_id: userId, deleted_at: null },
      }),
    ]);

    const assessmentMarks = assessments
      .map((a) => this.parseMark(a.mark))
      .filter((m): m is number => m != null);
    const homeworkMarks = homework
      .map((h) => this.parseMark(h.mark))
      .filter((m): m is number => m != null);

    const avg = (arr: number[]) =>
      arr.length ? Math.round((arr.reduce((s, n) => s + n, 0) / arr.length) * 100) / 100 : null;

    return {
      course_id: courseId ?? null,
      attendance: { sessions_attended: attendanceCount },
      homework: {
        total: homework.length,
        completed: homework.filter((h) => h.student_status === WORK_STATUS_COMPLETED).length,
        average_mark: avg(homeworkMarks),
      },
      assessments: {
        total: assessments.length,
        completed: assessments.filter((a) => a.student_status === WORK_STATUS_COMPLETED).length,
        average_mark: avg(assessmentMarks),
        marks: assessments.map((a) => ({
          assessment_id: a.id,
          title: a.title ?? null,
          mark: this.parseMark(a.mark),
          status: a.student_status === WORK_STATUS_COMPLETED ? 'Completed' : 'Pending',
        })),
      },
    };
  }
}
