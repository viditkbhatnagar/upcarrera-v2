import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListStudentSessionsDto } from './dto/list-sessions.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

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
}
