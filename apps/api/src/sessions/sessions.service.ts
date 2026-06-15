import {
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { ListSessionsDto } from './dto/list-sessions.dto';
import { CreateDemoSessionDto } from './dto/create-demo-session.dto';
import { ListDemoSessionsDto } from './dto/list-demo-sessions.dto';
import { ListSessionRequestsDto } from './dto/list-session-requests.dto';
import { UpdateSessionRequestDto } from './dto/update-session-request.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

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
  constructor(private readonly prisma: PrismaService) {}

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
    // TODO(phase-3): the legacy add() also resolved from_time/to_time from
    // teachers_schedules by schedule_id and created the Zoom meeting. See
    // createZoomMeeting() below.
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
