import {
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../integrations/email.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { ListSessionsDto } from './dto/list-sessions.dto';
import { BulkSessionsDto, WeekdayToken } from './dto/bulk-sessions.dto';
import { CreateDemoSessionDto } from './dto/create-demo-session.dto';
import { UpdateDemoSessionDto } from './dto/update-demo-session.dto';
import { ShareDemoSessionDto } from './dto/share-demo-session.dto';
import { ListDemoSessionsDto } from './dto/list-demo-sessions.dto';
import { ListSessionRequestsDto } from './dto/list-session-requests.dto';
import { UpdateSessionRequestDto } from './dto/update-session-request.dto';
import { SessionReportQueryDto } from './dto/session-report-query.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/** Maps weekday tokens to JS Date.getDay() values (0 = Sunday … 6 = Saturday). */
const WEEKDAY_INDEX: Record<WeekdayToken, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const MS_PER_MINUTE = 60_000;

/** session_requests.status value once a request is approved (legacy: 1). */
const SESSION_REQUEST_APPROVED = 1;

/**
 * Port of the CI4 Sessions (Session_old.php), Demo_sessions.php and
 * Session_request.php controllers, backed by Sessions_model / Demo_sessions_model
 * / Session_requests_model.
 *
 * NOTE on the `sessions` table: per schema.prisma it is thin — PK is `session_id`
 * (NOT `id`) and the only business column is `session_title`. The legacy
 * Session_old.php controller referenced teacher_id / student_id / course_id /
 * scheduled_date, but those columns live on the demo_sessions table, so they are
 * NOT exposed on the /sessions endpoints here.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  // ----------------------------------------------------------------------- //
  // sessions (live classes)                                                 //
  // ----------------------------------------------------------------------- //

  async listSessions(query: ListSessionsDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const where: Prisma.sessionsWhereInput = { deleted_at: null };

    const [items, total] = await Promise.all([
      this.prisma.sessions.findMany({
        where,
        orderBy: { session_id: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.sessions.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getSession(id: number) {
    const session = await this.prisma.sessions.findFirst({
      where: { session_id: id, deleted_at: null },
    });
    if (!session) {
      throw new NotFoundException('Session not found!');
    }
    return session;
  }

  async createSession(dto: CreateSessionDto) {
    const now = new Date();
    return this.prisma.sessions.create({
      data: {
        session_title: dto.session_title ?? null,
        created_at: now,
        updated_at: now,
      },
    });
  }

  async updateSession(id: number, dto: UpdateSessionDto) {
    await this.getSession(id);
    return this.prisma.sessions.update({
      where: { session_id: id },
      data: {
        ...dto,
        updated_at: new Date(),
      },
    });
  }

  async removeSession(id: number) {
    await this.getSession(id);
    await this.prisma.sessions.update({
      where: { session_id: id },
      data: { deleted_at: new Date() },
    });
    return { session_id: id };
  }

  /**
   * Bulk-schedule sessions for a month. Port of Sessions::timetable_add():
   * for every selected weekday, enumerate each occurrence in `month`
   * (YYYY-MM) that is today or later, and insert one `sessions` row.
   *
   * Schema note: the thin `sessions` table only persists session_title (per the
   * porting note above), so the student/teacher/course/subject identifiers and
   * from/to times in the payload are validated + echoed back for the caller but
   * not stored on each row. We return the generated `dates` plus the inserted
   * row count and ids so the client retains the full scheduling picture.
   */
  async bulkCreateSessions(dto: BulkSessionsDto, userId?: number) {
    const dates = this.enumerateWeekdayDates(dto.month, dto.weekdays);
    const now = new Date();

    // Insert one thin `sessions` row per matching date. We loop (rather than
    // createMany) so we can return the created ids and stay consistent with the
    // legacy per-row insert semantics.
    const created = await Promise.all(
      dates.map((date) =>
        this.prisma.sessions.create({
          data: {
            session_title: dto.session_title ?? null,
            created_by: userId ?? null,
            created_at: now,
            updated_at: now,
          },
          select: { session_id: true },
        }),
      ),
    );

    return {
      inserted: created.length,
      session_ids: created.map((c) => c.session_id),
      dates,
      // Echoed for parity — these columns do not exist on the thin sessions table.
      scheduling: {
        student_id: dto.student_id ?? null,
        teacher_id: dto.teacher_id ?? null,
        course_id: dto.course_id ?? null,
        subject_id: dto.subject_id ?? null,
        from_time: dto.from_time ?? null,
        to_time: dto.to_time ?? null,
      },
    };
  }

  /**
   * All dates in `month` (YYYY-MM) that fall on one of `weekdays` and are today
   * or in the future. Returns ISO 'YYYY-MM-DD' strings in chronological order.
   */
  private enumerateWeekdayDates(
    month: string,
    weekdays: WeekdayToken[],
  ): string[] {
    const [year, mon] = month.split('-').map((v) => Number(v));
    const wanted = new Set(weekdays.map((d) => WEEKDAY_INDEX[d]));

    // Midnight today, for the "today or later" cutoff (legacy: $date >= now).
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const out: string[] = [];
    // mon is 1-based; JS months are 0-based.
    const monthIndex = mon - 1;
    const daysInMonth = new Date(year, mon, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, monthIndex, day);
      if (!wanted.has(date.getDay())) continue;
      if (date < today) continue;
      const m = String(mon).padStart(2, '0');
      const d = String(day).padStart(2, '0');
      out.push(`${year}-${m}-${d}`);
    }
    return out;
  }

  // ----------------------------------------------------------------------- //
  // teachers_schedules lookups (bulk-scheduling helpers)                    //
  // ----------------------------------------------------------------------- //

  /**
   * Distinct dates a teacher has schedule rows for. Port of
   * Sessions::get_teacher_schedule_dates() — returns ISO 'YYYY-MM-DD' strings.
   */
  async getTeacherAvailableDates(teacherId: number): Promise<string[]> {
    const rows = await this.prisma.teachers_schedules.findMany({
      where: { teacher_id: teacherId, deleted_at: null, date: { not: null } },
      select: { date: true },
      orderBy: { date: 'asc' },
    });

    const seen = new Set<string>();
    for (const row of rows) {
      if (!row.date) continue;
      seen.add(this.toDateString(row.date));
    }
    return [...seen];
  }

  /**
   * A teacher's schedule slots for a given date, sorted by start_time ascending.
   * Port of Sessions::get_teacher_schedule_times() — each entry carries the
   * schedule row id plus the raw start/end times so the client can label slots.
   */
  async getTeacherAvailableTimes(teacherId: number, date: string) {
    const slots = await this.prisma.teachers_schedules.findMany({
      where: {
        teacher_id: teacherId,
        date: new Date(`${date}T00:00:00.000Z`),
        deleted_at: null,
      },
      select: { id: true, start_time: true, end_time: true },
      orderBy: { start_time: 'asc' },
    });

    return slots.map((slot) => ({
      value: slot.id,
      start_time: slot.start_time,
      end_time: slot.end_time,
    }));
  }

  /**
   * Attendance roll for a single session. Mirrors the legacy attendance view,
   * which read session_attendance (students) joined with the session.
   */
  async getSessionAttendance(id: number) {
    await this.getSession(id);
    const [students, teachers] = await Promise.all([
      this.prisma.session_attendance.findMany({
        where: { session_id: id, deleted_at: null },
        orderBy: { id: 'desc' },
      }),
      this.prisma.session_attendance_teacher.findMany({
        where: { session_id: id, deleted_at: null },
        orderBy: { id: 'desc' },
      }),
    ]);
    return { session_id: id, students, teachers };
  }

  // ----------------------------------------------------------------------- //
  // demo_sessions                                                           //
  // ----------------------------------------------------------------------- //

  async listDemoSessions(query: ListDemoSessionsDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const where: Prisma.demo_sessionsWhereInput = { deleted_at: null };
    if (query.teacher_id !== undefined) where.teacher_id = query.teacher_id;
    if (query.lead_id !== undefined) where.lead_id = query.lead_id;
    if (query.course_id !== undefined) where.course_id = query.course_id;

    const [items, total] = await Promise.all([
      this.prisma.demo_sessions.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.demo_sessions.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async createDemoSession(dto: CreateDemoSessionDto) {
    const now = new Date();
    return this.prisma.demo_sessions.create({
      data: {
        session_no: dto.session_no ?? null,
        session_title: dto.session_title ?? null,
        lead_id: dto.lead_id ?? null,
        course_id: dto.course_id ?? null,
        subject_id: dto.subject_id ?? null,
        teacher_id: dto.teacher_id ?? null,
        schedule_id: dto.schedule_id ?? null,
        scheduled_date: dto.scheduled_date ? new Date(dto.scheduled_date) : null,
        from_time: dto.from_time ? new Date(`1970-01-01T${dto.from_time}`) : null,
        to_time: dto.to_time ? new Date(`1970-01-01T${dto.to_time}`) : null,
        teacher_status: dto.teacher_status ?? false,
        lead_status: dto.lead_status ?? false,
        teacher_remarks: dto.teacher_remarks ?? null,
        lead_remarks: dto.lead_remarks ?? null,
        created_at: now,
        updated_at: now,
      },
    });
    // TODO(phase-3): the legacy add() also created the Zoom meeting. See
    // createZoomMeeting() below.
  }

  private async getDemoSession(id: number) {
    const demo = await this.prisma.demo_sessions.findFirst({
      where: { id, deleted_at: null },
    });
    if (!demo) {
      throw new NotFoundException('Demo session not found!');
    }
    return demo;
  }

  /**
   * Update a demo session. Port of Demo_sessions::edit(). When `schedule_id` is
   * supplied, from_time/to_time are resolved from the matching
   * teachers_schedules row (start_time/end_time), overriding any from/to_time in
   * the body — mirroring the legacy flow where the schedule drove the slot.
   */
  async updateDemoSession(id: number, dto: UpdateDemoSessionDto, userId?: number) {
    await this.getDemoSession(id);

    const data: Prisma.demo_sessionsUpdateInput = { updated_at: new Date() };

    if (dto.session_no !== undefined) data.session_no = dto.session_no;
    if (dto.session_title !== undefined) data.session_title = dto.session_title;
    if (dto.lead_id !== undefined) data.lead_id = dto.lead_id;
    if (dto.course_id !== undefined) data.course_id = dto.course_id;
    if (dto.subject_id !== undefined) data.subject_id = dto.subject_id;
    if (dto.teacher_id !== undefined) data.teacher_id = dto.teacher_id;
    if (dto.scheduled_date !== undefined) {
      data.scheduled_date = dto.scheduled_date
        ? new Date(dto.scheduled_date)
        : null;
    }
    if (dto.teacher_status !== undefined) data.teacher_status = dto.teacher_status;
    if (dto.lead_status !== undefined) data.lead_status = dto.lead_status;
    if (dto.teacher_remarks !== undefined) data.teacher_remarks = dto.teacher_remarks;
    if (dto.lead_remarks !== undefined) data.lead_remarks = dto.lead_remarks;
    if (userId !== undefined) data.updated_by = userId;

    if (dto.schedule_id !== undefined) {
      data.schedule_id = dto.schedule_id;
      // Resolve slot times from the schedule row, like the legacy edit().
      const schedule =
        dto.schedule_id != null
          ? await this.prisma.teachers_schedules.findFirst({
              where: { id: dto.schedule_id, deleted_at: null },
              select: { start_time: true, end_time: true },
            })
          : null;
      if (schedule) {
        data.from_time = schedule.start_time;
        data.to_time = schedule.end_time;
      }
    } else {
      // No schedule_id — fall back to any explicit body times.
      if (dto.from_time !== undefined) {
        data.from_time = dto.from_time
          ? new Date(`1970-01-01T${dto.from_time}`)
          : null;
      }
      if (dto.to_time !== undefined) {
        data.to_time = dto.to_time
          ? new Date(`1970-01-01T${dto.to_time}`)
          : null;
      }
    }

    return this.prisma.demo_sessions.update({ where: { id }, data });
  }

  async removeDemoSession(id: number) {
    await this.getDemoSession(id);
    await this.prisma.demo_sessions.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
    return { id };
  }

  /**
   * Share a demo session's meeting link. Port of Demo_sessions::share_link():
   *   - resolves the meeting link from the teacher's user row (users.meeting_link);
   *   - if EmailService is configured and an email is present, sends the invite;
   *   - always returns a wa.me deeplink the client can open.
   *
   * EmailService is env-gated: if Brevo creds are absent it throws
   * 'Email not configured'. We surface that as email_sent=false rather than
   * failing the whole request, so the WhatsApp link is still returned.
   */
  async shareDemoSession(id: number, dto: ShareDemoSessionDto) {
    const demo = await this.getDemoSession(id);

    let meetingLink = '';
    if (demo.teacher_id != null) {
      const teacher = await this.prisma.users.findFirst({
        where: { id: demo.teacher_id },
        select: { meeting_link: true },
      });
      meetingLink = teacher?.meeting_link ?? '';
    }

    const leadName = dto.lead_name ?? '';
    const dateLabel = demo.scheduled_date
      ? this.toDateString(demo.scheduled_date)
      : '';
    const timeLabel = [
      demo.from_time ? this.toTimeString(demo.from_time) : '',
      demo.to_time ? this.toTimeString(demo.to_time) : '',
    ]
      .filter(Boolean)
      .join(' ');

    // wa.me deeplink (legacy used api.whatsapp.com/send). Number is code+number
    // with non-digits stripped, per the legacy concatenation.
    const waNumber = `${dto.whatsapp_code ?? ''}${dto.whatsapp ?? ''}`.replace(
      /\D/g,
      '',
    );
    const waText = encodeURIComponent(
      `To join the session, please click the link: ${meetingLink}`,
    );
    const whatsappLink = waNumber
      ? `https://wa.me/${waNumber}?text=${waText}`
      : `https://wa.me/?text=${waText}`;

    let emailSent = false;
    let emailError: string | null = null;
    if (dto.email) {
      try {
        await this.email.sendEmail({
          to: dto.email,
          name: leadName || dto.email,
          subject: 'Join Our Demo Session!',
          html: this.buildShareEmailHtml(
            leadName,
            dateLabel,
            timeLabel,
            meetingLink,
          ),
        });
        emailSent = true;
      } catch (err) {
        // EmailService throws ServiceUnavailableException when not configured.
        emailError = (err as Error).message;
      }
    }

    return {
      id,
      meeting_link: meetingLink,
      email_sent: emailSent,
      email_error: emailError,
      whatsapp_link: whatsappLink,
    };
  }

  /** Demo-session invite email body — port of the legacy share_link() template. */
  private buildShareEmailHtml(
    leadName: string,
    dateLabel: string,
    timeLabel: string,
    meetingLink: string,
  ): string {
    return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f5f5;color:#333;padding:20px;">
  <div style="max-width:600px;margin:0 auto;padding:30px;background:#fff;border-radius:10px;text-align:center;">
    <h1 style="color:#2c3e50;">Welcome!</h1>
    <p>Dear ${leadName || 'there'},</p>
    <p>We are excited to invite you to our upcoming demo session. Here are the details:</p>
    <div style="background:#ecf0f1;padding:20px;border-radius:10px;margin:20px 0;text-align:left;">
      <p><strong>Date:</strong> ${dateLabel}</p>
      <p><strong>Time:</strong> ${timeLabel}</p>
    </div>
    <p>To join the session, please click the link below:</p>
    <a href="${meetingLink}" style="display:inline-block;padding:10px 20px;color:#fff;background:#145bb8;border-radius:5px;text-decoration:none;">Join Now</a>
  </div>
</body></html>`;
  }

  // ----------------------------------------------------------------------- //
  // session_requests (extra-session requests)                               //
  // ----------------------------------------------------------------------- //

  async listSessionRequests(query: ListSessionRequestsDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const where: Prisma.session_requestsWhereInput = { deleted_at: null };
    if (query.student_id !== undefined) where.student_id = query.student_id;
    if (query.course_id !== undefined) where.course_id = query.course_id;
    if (query.status !== undefined) where.status = query.status;

    const [items, total] = await Promise.all([
      this.prisma.session_requests.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.session_requests.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async updateSessionRequest(id: number, dto: UpdateSessionRequestDto) {
    const existing = await this.prisma.session_requests.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) {
      throw new NotFoundException('Session request not found!');
    }
    return this.prisma.session_requests.update({
      where: { id },
      data: {
        ...dto,
        updated_at: new Date(),
      },
    });
  }

  /**
   * Approve an extra-session request: copy its course/subject onto a brand-new
   * `sessions` row and mark the request approved (status = 1). Port of the
   * legacy Session_request approve flow (ajax_approve + edit), adapted to the
   * thin `sessions` table — only the columns that exist there are written; the
   * student/course/subject identifiers from the request are echoed back in the
   * response for the caller.
   */
  async approveSessionRequest(id: number, userId?: number) {
    const reqRow = await this.prisma.session_requests.findFirst({
      where: { id, deleted_at: null },
    });
    if (!reqRow) {
      throw new NotFoundException('Session request not found!');
    }

    const now = new Date();
    const session = await this.prisma.sessions.create({
      data: {
        session_title: null,
        created_by: userId ?? null,
        created_at: now,
        updated_at: now,
      },
      select: { session_id: true },
    });

    const request = await this.prisma.session_requests.update({
      where: { id },
      data: {
        status: SESSION_REQUEST_APPROVED,
        updated_by: userId ?? null,
        updated_at: now,
      },
    });

    return { session, request };
  }

  /** Soft-delete an extra-session request. */
  async removeSessionRequest(id: number) {
    const reqRow = await this.prisma.session_requests.findFirst({
      where: { id, deleted_at: null },
    });
    if (!reqRow) {
      throw new NotFoundException('Session request not found!');
    }
    await this.prisma.session_requests.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
    return { id };
  }

  // ----------------------------------------------------------------------- //
  // reports (teacher session attendance)                                    //
  // ----------------------------------------------------------------------- //

  /**
   * Teacher session attendance report. Port of Session_report::index() — joins
   * session_attendance_teacher to its teacher (users) and session (sessions),
   * with per-row duration in minutes (TIMESTAMPDIFF(MINUTE, start, end)) and an
   * optional inclusive date window.
   */
  async getSessionReport(query: SessionReportQueryDto) {
    // Build the optional inclusive date window as a plain object, then assign it
    // once. Avoids mutating a union-typed `where.date` field in place.
    const dateRange: { gte?: Date; lte?: Date } = {};
    if (query.from_date) {
      dateRange.gte = new Date(`${query.from_date}T00:00:00.000Z`);
    }
    if (query.to_date) {
      dateRange.lte = new Date(`${query.to_date}T23:59:59.999Z`);
    }

    const where: Prisma.session_attendance_teacherWhereInput = {
      deleted_at: null,
      ...(query.from_date || query.to_date ? { date: dateRange } : {}),
    };

    const rows = await this.prisma.session_attendance_teacher.findMany({
      where,
      orderBy: { id: 'desc' },
    });

    // Batch-resolve teacher names and session titles (avoid N+1).
    const teacherIds = [
      ...new Set(
        rows
          .map((r) => r.teacher_id)
          .filter((t): t is number => t != null),
      ),
    ];
    const sessionIds = [
      ...new Set(
        rows
          .map((r) => r.session_id)
          .filter((s): s is number => s != null),
      ),
    ];

    const teachers = teacherIds.length
      ? await this.prisma.users.findMany({
          where: { id: { in: teacherIds } },
          select: { id: true, name: true },
        })
      : [];
    const sessions = sessionIds.length
      ? await this.prisma.sessions.findMany({
          where: { session_id: { in: sessionIds } },
          select: { session_id: true, session_title: true },
        })
      : [];

    const teacherById = new Map(teachers.map((t) => [t.id, t.name]));
    const sessionById = new Map(
      sessions.map((s) => [s.session_id, s.session_title]),
    );

    return rows.map((row) => ({
      ...row,
      teacher_name: row.teacher_id != null ? (teacherById.get(row.teacher_id) ?? null) : null,
      session_name: row.session_id != null ? (sessionById.get(row.session_id) ?? null) : null,
      duration: this.minutesBetween(row.start_time, row.end_time),
    }));
  }

  // ----------------------------------------------------------------------- //
  // formatting helpers                                                      //
  // ----------------------------------------------------------------------- //

  /** Duration in whole minutes between two @db.Time values, or null. */
  private minutesBetween(
    start: Date | null,
    end: Date | null,
  ): number | null {
    if (!start || !end) return null;
    return Math.round((end.getTime() - start.getTime()) / MS_PER_MINUTE);
  }

  /** ISO 'YYYY-MM-DD' for a @db.Date value (stored at UTC midnight). */
  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  /** 'HH:mm:ss' for a @db.Time value. */
  private toTimeString(time: Date): string {
    return time.toISOString().slice(11, 19);
  }

  // ----------------------------------------------------------------------- //
  // phase-3 stubs                                                           //
  // ----------------------------------------------------------------------- //

  /**
   * Zoom meeting creation + Meeting SDK signature generation. The legacy app
   * read zoom_id / zoom_password / meeting_link off the teacher's user row and
   * surfaced them per session. Implementing the Zoom REST/SDK integration is out
   * of scope for this phase.
   */
  // TODO(phase-3): Zoom meeting creation + SDK signatures.
  createZoomMeeting(): never {
    throw new NotImplementedException(
      'Zoom meeting creation + SDK signatures — phase 3',
    );
  }
}
