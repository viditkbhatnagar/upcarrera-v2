import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { CreateSalaryPaymentDto } from './dto/create-salary-payment.dto';
import {
  AssignStudentDto,
  EnrolCourseDto,
  ResetPasswordDto,
  UpdateZoomEmailDto,
} from './dto/reset-password.dto';
import {
  CreateSalaryRateDto,
  UpdateSalaryRateDto,
} from './dto/salary-rate.dto';

/** Legacy role id for teachers/instructors (login_helper.php). */
const TEACHER_ROLE_ID = 3;
const BCRYPT_ROUNDS = 10;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/**
 * Salary computation rule (the legacy Sessions_model::get_total_and_completed_sessions
 * referenced by Teacher_salary.php was MISSING from the source, so this defines a
 * sane rule faithful to the surrounding legacy intent):
 *
 *   - A teacher's payable sessions live in `demo_sessions` (the only table carrying
 *     teacher_id + scheduled_date + from_time/to_time + teacher_status/lead_status).
 *     The bare `sessions` table in this schema has no teacher/duration/status columns.
 *   - "Completed" = teacher_status = true (DB comment: 0=pending, 1=completed).
 *   - Duration band is derived from (to_time - from_time) in minutes, bucketed to the
 *     nearest of {30, 45, 60}. Anything <= ~37min -> 30, <= ~52min -> 45, else -> 60.
 *     Rows with no usable time pair fall back to the 60-min band.
 *   - Each completed session is paid at the teacher's per-band rate from `teacher_salary`
 *     (salary_30 / salary_45 / salary_1).
 *   - A "confirmed demo" = a completed session where BOTH teacher_status AND lead_status
 *     are true; each such session additionally earns `salary_confirmed_demo`. This mirrors
 *     the legacy total = salary_30 + salary_45 + salary_1 + confirmed_demo_salary.
 *   - Date range filters inclusively on scheduled_date (legacy: >= from, <= to).
 *   - Missing rate row or no sessions -> all zeros, never throws.
 */
const BAND_30_MAX_MINUTES = 37; // <= 37min counts as a 30-min slot
const BAND_45_MAX_MINUTES = 52; // <= 52min counts as a 45-min slot, else 60-min
const MS_PER_MINUTE = 60_000;

/**
 * Port of CI4 App\Controllers\App\{Teachers, Teacher_schedules, Teacher_salary}.
 * A teacher is a `users` row with role_id=3. The legacy schema uses manual
 * timestamp columns (no auto timestamps), so we set created_at/updated_at by hand,
 * and "delete" by stamping deleted_at instead of removing the row.
 */
@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizePagination(page?: number, limit?: number) {
    const safePage = page && page > 0 ? page : DEFAULT_PAGE;
    const safeLimit = limit && limit > 0 ? limit : DEFAULT_LIMIT;
    return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
  }

  // --- Teachers (users where role_id=3) -------------------------------------

  async findAll(
    page?: number,
    limit?: number,
    searchKey?: string,
    courseId?: number,
    subjectId?: number,
  ) {
    const pg = this.normalizePagination(page, limit);

    // ?course_id / ?subject_id narrow to teachers assigned to that course via
    // teachers_subjects (port of Teachers::get_teacher_by_course). A subject
    // resolves to its course (subjects.course_id) first; an unknown subject or a
    // course with no assigned teachers yields an empty, well-formed page.
    let courseFilterIds: number[] | undefined;
    let effectiveCourseId = courseId;
    if (subjectId !== undefined && effectiveCourseId === undefined) {
      const subject = await this.prisma.subjects.findFirst({
        where: { id: subjectId, deleted_at: null },
        select: { course_id: true },
      });
      // Unknown subject (or one with no course) -> impossible course id so the
      // result is an empty page rather than every teacher.
      effectiveCourseId = subject?.course_id ?? -1;
    }
    if (effectiveCourseId !== undefined) {
      const links = await this.prisma.teachers_subjects.findMany({
        where: { course_id: effectiveCourseId, deleted_at: null },
        select: { user_id: true },
      });
      courseFilterIds = [
        ...new Set(
          links
            .map((l) => l.user_id)
            .filter((id): id is number => id !== null),
        ),
      ];
      if (courseFilterIds.length === 0) {
        // No teacher assigned to this course -> empty, still well-formed.
        return { items: [], total: 0, page: pg.page, limit: pg.limit };
      }
    }

    // Mirrors the legacy index() search across name/phone/email.
    const where = {
      deleted_at: null,
      role_id: TEACHER_ROLE_ID,
      ...(courseFilterIds ? { id: { in: courseFilterIds } } : {}),
      ...(searchKey
        ? {
            OR: [
              { name: { contains: searchKey } },
              { phone: { contains: searchKey } },
              { email: { contains: searchKey } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.users.findMany({
        where,
        skip: pg.skip,
        take: pg.limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.users.count({ where }),
    ]);

    return { items: items.map((u) => this.stripSecrets(u)), total, page: pg.page, limit: pg.limit };
  }

  async findOne(id: number) {
    const teacher = await this.prisma.users.findFirst({
      where: { id, deleted_at: null, role_id: TEACHER_ROLE_ID },
    });
    if (!teacher) {
      throw new NotFoundException('Teacher not found!');
    }
    return this.stripSecrets(teacher);
  }

  async create(dto: CreateTeacherDto) {
    const now = new Date();
    const hashed = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const teacher = await this.prisma.users.create({
      data: {
        name: dto.name,
        username: dto.username,
        password: hashed,
        code: dto.code,
        phone: dto.phone,
        email: dto.email,
        gender: dto.gender,
        region: dto.region,
        highest_qualification: dto.highest_qualification,
        languages_spoken: dto.languages_spoken,
        profile_picture: dto.profile_picture,
        zoom_id: dto.zoom_id,
        zoom_email: dto.zoom_email,
        zoom_password: dto.zoom_password,
        meeting_link: dto.meeting_link,
        status: dto.status ?? 1,
        role_id: TEACHER_ROLE_ID,
        created_at: now,
        updated_at: now,
      },
    });

    // TODO(phase-3): provision a Zoom user (ZoomService::createUser) and persist
    // zoom_id/zoom_email/zoom_password from the gateway response.
    return this.stripSecrets(teacher);
  }

  async update(id: number, dto: UpdateTeacherDto) {
    await this.findOne(id); // 404 if missing / not a teacher

    const now = new Date();
    const data: Record<string, unknown> = { updated_at: now };

    // Copy through only the fields actually supplied (legacy edit was partial).
    const assignable: (keyof UpdateTeacherDto)[] = [
      'name',
      'username',
      'code',
      'phone',
      'email',
      'gender',
      'region',
      'highest_qualification',
      'languages_spoken',
      'profile_picture',
      'zoom_id',
      'zoom_email',
      'zoom_password',
      'meeting_link',
      'status',
    ];
    for (const key of assignable) {
      if (dto[key] !== undefined) {
        data[key] = dto[key];
      }
    }

    // Re-hash the password only when a new one is provided.
    if (dto.password !== undefined && dto.password !== '') {
      data.password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    }

    const teacher = await this.prisma.users.update({ where: { id }, data });
    return this.stripSecrets(teacher);
  }

  async remove(id: number) {
    await this.findOne(id); // 404 if missing / not a teacher

    const now = new Date();
    await this.prisma.users.update({
      where: { id },
      data: { deleted_at: now, updated_at: now },
    });
    return { id };
  }

  // --- Teacher schedules ----------------------------------------------------

  async findSchedules(page?: number, limit?: number, teacherId?: number) {
    const pg = this.normalizePagination(page, limit);
    const where = {
      deleted_at: null,
      ...(teacherId ? { teacher_id: teacherId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.teachers_schedules.findMany({
        where,
        skip: pg.skip,
        take: pg.limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.teachers_schedules.count({ where }),
    ]);

    return { items, total, page: pg.page, limit: pg.limit };
  }

  async createSchedule(dto: CreateScheduleDto) {
    const now = new Date();
    return this.prisma.teachers_schedules.create({
      data: {
        teacher_id: dto.teacher_id,
        date: dto.date ? new Date(dto.date) : undefined,
        start_time: dto.start_time ? new Date(`1970-01-01T${dto.start_time}Z`) : undefined,
        end_time: dto.end_time ? new Date(`1970-01-01T${dto.end_time}Z`) : undefined,
        created_at: now,
        updated_at: now,
      },
    });
  }

  // --- Teacher subjects -----------------------------------------------------

  async findSubjects(page?: number, limit?: number, userId?: number) {
    const pg = this.normalizePagination(page, limit);
    const where = {
      deleted_at: null,
      ...(userId ? { user_id: userId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.teachers_subjects.findMany({
        where,
        skip: pg.skip,
        take: pg.limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.teachers_subjects.count({ where }),
    ]);

    return { items, total, page: pg.page, limit: pg.limit };
  }

  async createSubject(dto: CreateSubjectDto) {
    const now = new Date();
    return this.prisma.teachers_subjects.create({
      data: {
        user_id: dto.user_id,
        course_id: dto.course_id,
        created_at: now,
        updated_at: now,
      },
    });
  }

  // --- Teacher salary rates (read-only this phase) --------------------------

  async findSalaryRates(page?: number, limit?: number, teacherId?: number) {
    const pg = this.normalizePagination(page, limit);
    const where = {
      deleted_at: null,
      ...(teacherId ? { teacher_id: teacherId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.teacher_salary.findMany({
        where,
        skip: pg.skip,
        take: pg.limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.teacher_salary.count({ where }),
    ]);

    return { items, total, page: pg.page, limit: pg.limit };
  }

  // --- Teacher change requests ----------------------------------------------

  async findChangeRequests(page?: number, limit?: number, teacherId?: number) {
    const pg = this.normalizePagination(page, limit);
    const where = {
      deleted_at: null,
      ...(teacherId ? { teacher_id: teacherId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.teacher_change_request.findMany({
        where,
        skip: pg.skip,
        take: pg.limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.teacher_change_request.count({ where }),
    ]);

    return { items, total, page: pg.page, limit: pg.limit };
  }

  // --- Salary computation & payments ----------------------------------------

  /** Bucket a session's wall-clock length to one of the rate bands. */
  private durationBand(
    fromTime: Date | null,
    toTime: Date | null,
  ): 30 | 45 | 60 {
    if (!fromTime || !toTime) {
      return 60; // no usable time pair -> default to the 1-hour band
    }
    const minutes = (toTime.getTime() - fromTime.getTime()) / MS_PER_MINUTE;
    if (minutes <= 0) {
      return 60; // malformed / inverted range -> default band
    }
    if (minutes <= BAND_30_MAX_MINUTES) return 30;
    if (minutes <= BAND_45_MAX_MINUTES) return 45;
    return 60;
  }

  /**
   * Compute a teacher's payable salary for completed demo_sessions whose
   * scheduled_date falls inclusively within [from, to]. Returns a breakdown of
   * per-band counts/rates/subtotals, the confirmed-demo bonus, and the grand total.
   *
   * Never throws on "no data": a missing rate row or zero sessions yields zeros.
   * See the rule documented at the top of this file.
   */
  async computeSalary(teacherId: number, from: string, to: string) {
    // Normalise the inclusive day range. `to` is pushed to end-of-day so a
    // session scheduled on the `to` date is included.
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);

    const [rate, sessions] = await Promise.all([
      this.prisma.teacher_salary.findFirst({
        where: { teacher_id: teacherId, deleted_at: null },
        orderBy: { id: 'desc' },
      }),
      this.prisma.demo_sessions.findMany({
        where: {
          teacher_id: teacherId,
          deleted_at: null,
          teacher_status: true, // completed (DB comment: 1 = completed)
          scheduled_date: { gte: fromDate, lte: toDate },
        },
        select: {
          from_time: true,
          to_time: true,
          lead_status: true,
        },
      }),
    ]);

    const rate30 = rate?.salary_30 ?? 0;
    const rate45 = rate?.salary_45 ?? 0;
    const rate60 = rate?.salary_1 ?? 0;
    const demoRate = rate?.salary_confirmed_demo ?? 0;

    const counts: Record<30 | 45 | 60, number> = { 30: 0, 45: 0, 60: 0 };
    let demoCount = 0;

    for (const s of sessions) {
      const band = this.durationBand(s.from_time, s.to_time);
      counts[band] += 1;
      // A "confirmed demo" is a completed session the lead also confirmed.
      if (s.lead_status === true) {
        demoCount += 1;
      }
    }

    const bands = [
      { duration: 30, count: counts[30], rate: rate30, subtotal: counts[30] * rate30 },
      { duration: 45, count: counts[45], rate: rate45, subtotal: counts[45] * rate45 },
      { duration: 60, count: counts[60], rate: rate60, subtotal: counts[60] * rate60 },
    ];

    const demo = {
      count: demoCount,
      rate: demoRate,
      subtotal: demoCount * demoRate,
    };

    const total =
      bands.reduce((sum, b) => sum + b.subtotal, 0) + demo.subtotal;

    return {
      teacher_id: teacherId,
      from,
      to,
      has_rate: !!rate,
      completed_sessions: sessions.length,
      bands,
      demo,
      total,
    };
  }

  /**
   * Record a salary payout for a teacher (port of Teacher_salary::make_payment).
   * `period` ("YYYY-MM") is split into the legacy month (zero-padded) / year columns.
   * Wrapped in a transaction: the teacher is re-validated and the row inserted atomically.
   */
  async createSalaryPayment(dto: CreateSalaryPaymentDto, paidBy: number) {
    const now = new Date();

    // Split "YYYY-MM" -> month (zero-padded "01".."12") / year, matching legacy columns.
    const [yearPart, monthPart] = dto.period.split('-');
    const month = (monthPart ?? '').padStart(2, '0');
    const year = yearPart ?? '';

    const paymentDate = dto.payment_date ? new Date(dto.payment_date) : now;

    return this.prisma.$transaction(async (tx) => {
      const teacher = await tx.users.findFirst({
        where: {
          id: dto.teacher_id,
          deleted_at: null,
          role_id: TEACHER_ROLE_ID,
        },
        select: { id: true },
      });
      if (!teacher) {
        throw new NotFoundException('Teacher not found!');
      }

      return tx.salary_payment.create({
        data: {
          teacher_id: dto.teacher_id,
          paid_amount: dto.paid_amount,
          month,
          year,
          payment_date: paymentDate,
          payment_type: dto.payment_type ?? null,
          reference_no: dto.reference_no ?? null,
          remark: dto.remark ?? null,
          created_at: now,
          created_by: paidBy,
          updated_at: now,
          updated_by: paidBy,
        },
      });
    });
  }

  // --- Teacher relations: students & schedules (calendar) -------------------

  /**
   * Students taught by a teacher. The teacher's assigned courses come from
   * teachers_subjects.course_id; enrolments for those courses (plus any enrol
   * row directly keyed to the teacher) resolve to the student users.
   *
   * Ports the intent of Enrol_model::get_students_by_teacher — note the v2
   * `enrol` table keys students on `user_id` (the legacy `student_id` column was
   * renamed; its index map is still "student_id"). Returns the student rows plus
   * active/discontinued tallies (users.status: 1 = active, else discontinued).
   */
  async findStudents(teacherId: number) {
    await this.findOne(teacherId); // 404 if missing / not a teacher

    const subjectLinks = await this.prisma.teachers_subjects.findMany({
      where: { user_id: teacherId, deleted_at: null },
      select: { course_id: true },
    });
    const courseIds = [
      ...new Set(
        subjectLinks
          .map((l) => l.course_id)
          .filter((id): id is number => id !== null),
      ),
    ];

    // Enrolments matching either the teacher directly or one of their courses.
    const enrolWhere = {
      deleted_at: null,
      OR: [
        { teacher_id: teacherId },
        ...(courseIds.length ? [{ course_id: { in: courseIds } }] : []),
      ],
    };

    const enrolments = await this.prisma.enrol.findMany({
      where: enrolWhere,
      select: { user_id: true },
    });
    const studentIds = [
      ...new Set(
        enrolments
          .map((e) => e.user_id)
          .filter((id): id is number => id !== null),
      ),
    ];

    if (studentIds.length === 0) {
      return {
        items: [],
        total_students: 0,
        active_students_count: 0,
        discontinued_students_count: 0,
      };
    }

    const students = await this.prisma.users.findMany({
      where: { id: { in: studentIds }, deleted_at: null },
      orderBy: { id: 'desc' },
    });

    const items = students.map((s) => this.stripSecrets(s));
    const active = students.filter((s) => s.status === 1).length;

    return {
      items,
      total_students: students.length,
      active_students_count: active,
      discontinued_students_count: students.length - active,
    };
  }

  /**
   * A teacher's schedule rows shaped as FullCalendar-style events
   * {id,title,start,end}. `start`/`end` combine teachers_schedules.date with the
   * stored from/to time-of-day (Prisma surfaces `@db.Time` as a 1970-epoch Date).
   * Rows with no date are skipped (an all-day event has no usable start).
   */
  async findScheduleEvents(teacherId: number) {
    await this.findOne(teacherId); // 404 if missing / not a teacher

    const rows = await this.prisma.teachers_schedules.findMany({
      where: { teacher_id: teacherId, deleted_at: null },
      orderBy: { date: 'asc' },
    });

    const events = rows
      .filter((r) => r.date !== null)
      .map((r) => ({
        id: r.id,
        title: 'Schedule',
        start: this.combineDateTime(r.date, r.start_time),
        end: this.combineDateTime(r.date, r.end_time),
      }));

    return { items: events, total: events.length };
  }

  /** Merge a Date-only day with a Time-only (1970-epoch) value into one ISO. */
  private combineDateTime(day: Date | null, time: Date | null): string | null {
    if (!day) {
      return null;
    }
    const result = new Date(day.getTime());
    if (time) {
      result.setUTCHours(
        time.getUTCHours(),
        time.getUTCMinutes(),
        time.getUTCSeconds(),
        0,
      );
    }
    return result.toISOString();
  }

  // --- Credentials: password / zoom-email / device --------------------------

  /**
   * Update a teacher's username + password (port of Teachers::reset_password).
   * The current hash is preserved in users.prev_password; the username must not
   * already belong to a different user. Backs both PATCH /:id/password and
   * PATCH /:id/reset-password.
   */
  async resetPassword(id: number, dto: ResetPasswordDto) {
    const teacher = await this.prisma.users.findFirst({
      where: { id, deleted_at: null, role_id: TEACHER_ROLE_ID },
      select: { id: true, password: true },
    });
    if (!teacher) {
      throw new NotFoundException('Teacher not found!');
    }

    // Legacy uniqueness guard: reject a username owned by another user.
    const clash = await this.prisma.users.findFirst({
      where: { username: dto.username, id: { not: id }, deleted_at: null },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException('Username Already Exists');
    }

    const now = new Date();
    const updated = await this.prisma.users.update({
      where: { id },
      data: {
        username: dto.username,
        prev_password: teacher.password ?? null,
        password: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        updated_at: now,
      },
    });
    return this.stripSecrets(updated);
  }

  /** Set users.zoom_email for a teacher (PATCH /:id/zoom-email). */
  async updateZoomEmail(id: number, dto: UpdateZoomEmailDto) {
    await this.findOne(id); // 404 if missing / not a teacher
    const now = new Date();
    const updated = await this.prisma.users.update({
      where: { id },
      data: { zoom_email: dto.zoom_email, updated_at: now },
    });
    return this.stripSecrets(updated);
  }

  /**
   * Clear the teacher's device binding (port of Instructor::change_device).
   *
   * NOTE: the v2 `users` model has NO `device_id` column, so there is nothing to
   * clear. We still 404 on an unknown teacher and bump updated_at, returning a
   * `cleared:false` flag so callers can see the no-op. If the column is later
   * added to the schema, set `device_id: null` here.
   */
  async clearDevice(id: number) {
    await this.findOne(id); // 404 if missing / not a teacher
    const now = new Date();
    await this.prisma.users.update({
      where: { id },
      data: { updated_at: now },
    });
    return {
      id,
      cleared: false,
      note: 'users.device_id column is absent in this schema; nothing to clear.',
    };
  }

  // --- teachers_subjects deletion -------------------------------------------

  /**
   * Remove a teacher-subject (course link) row. teachers_subjects carries a
   * deleted_at column, so this is a soft delete (stamp deleted_at), matching the
   * rest of the module. 404 if the row is missing or already deleted.
   */
  async removeSubject(id: number) {
    const row = await this.prisma.teachers_subjects.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('Teacher subject not found!');
    }
    const now = new Date();
    await this.prisma.teachers_subjects.update({
      where: { id },
      data: { deleted_at: now, updated_at: now },
    });
    return { id };
  }

  // --- instructor_enrol -> enrol (table absent in v2; see NOTE) -------------
  //
  // The legacy `instructor_enrol` / `instructor_student` tables do NOT exist in
  // this schema. The closest analogue is `enrol` (user_id=student, teacher_id,
  // course_id). Enrolled-courses are therefore the DISTINCT course_ids on a
  // teacher's enrol rows; assigning a course writes an enrol row for the teacher.

  /** Distinct courses a teacher is enrolled to teach (via enrol.teacher_id). */
  async findEnrolledCourses(teacherId: number) {
    await this.findOne(teacherId); // 404 if missing / not a teacher

    const rows = await this.prisma.enrol.findMany({
      where: { teacher_id: teacherId, deleted_at: null },
      orderBy: { id: 'desc' },
    });

    const courseIds = [
      ...new Set(
        rows
          .map((r) => r.course_id)
          .filter((id): id is number => id !== null),
      ),
    ];
    const courses = courseIds.length
      ? await this.prisma.course.findMany({
          where: { id: { in: courseIds }, deleted_at: null },
          select: { id: true, title: true, short_name: true },
        })
      : [];
    const courseById = new Map(courses.map((c) => [c.id, c]));

    const items = rows.map((r) => ({
      id: r.id,
      course_id: r.course_id,
      course_title:
        r.course_id !== null ? courseById.get(r.course_id)?.title ?? null : null,
      created_at: r.created_at,
    }));

    return { items, total: items.length };
  }

  /**
   * Assign a course to a teacher (port of Instructor::enrol_course) by writing
   * an `enrol` row. Idempotent: a non-deleted enrol row for the same
   * teacher+course is rejected as a duplicate.
   */
  async addEnrolledCourse(
    teacherId: number,
    dto: EnrolCourseDto,
    actorId: number,
  ) {
    await this.findOne(teacherId); // 404 if missing / not a teacher
    const courseId = Number(dto.course_id);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      throw new BadRequestException('course_id is required');
    }

    const existing = await this.prisma.enrol.findFirst({
      where: { teacher_id: teacherId, course_id: courseId, deleted_at: null },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Already Enrolled to this course');
    }

    const now = new Date();
    return this.prisma.enrol.create({
      data: {
        teacher_id: teacherId,
        course_id: courseId,
        created_at: now,
        created_by: actorId,
        updated_at: now,
        updated_by: actorId,
      },
    });
  }

  /**
   * Un-assign a course from a teacher (port of Instructor::enrol_delete). Soft
   * deletes the matching enrol row (enrol carries deleted_at). 404 if no such
   * active enrolment exists for this teacher+course.
   */
  async removeEnrolledCourse(
    teacherId: number,
    courseId: number,
    actorId: number,
  ) {
    await this.findOne(teacherId); // 404 if missing / not a teacher
    const row = await this.prisma.enrol.findFirst({
      where: { teacher_id: teacherId, course_id: courseId, deleted_at: null },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('Enrolled course not found!');
    }
    const now = new Date();
    await this.prisma.enrol.update({
      where: { id: row.id },
      data: { deleted_at: now, updated_at: now, deleted_by: actorId },
    });
    return { id: row.id };
  }

  // --- assigned-students (instructor_student absent -> enrol; see NOTE) ------

  /**
   * Students assigned to a teacher (port of Instructor::students). The legacy
   * `instructor_student` table is ABSENT in v2, so assignments live on the
   * `enrol` table as rows with both teacher_id and user_id set. Returns the
   * enrolment id (the "assignment id" used for deletion) joined to student/course.
   */
  async findAssignedStudents(teacherId: number) {
    await this.findOne(teacherId); // 404 if missing / not a teacher

    const rows = await this.prisma.enrol.findMany({
      where: { teacher_id: teacherId, deleted_at: null, user_id: { not: null } },
      orderBy: { id: 'desc' },
    });

    const studentIds = [
      ...new Set(
        rows.map((r) => r.user_id).filter((id): id is number => id !== null),
      ),
    ];
    const courseIds = [
      ...new Set(
        rows.map((r) => r.course_id).filter((id): id is number => id !== null),
      ),
    ];
    const [students, courses] = await Promise.all([
      studentIds.length
        ? this.prisma.users.findMany({
            where: { id: { in: studentIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      courseIds.length
        ? this.prisma.course.findMany({
            where: { id: { in: courseIds } },
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
    ]);
    const studentById = new Map(students.map((s) => [s.id, s]));
    const courseById = new Map(courses.map((c) => [c.id, c]));

    const items = rows.map((r) => ({
      assignment_id: r.id,
      student_id: r.user_id,
      student_name:
        r.user_id !== null ? studentById.get(r.user_id)?.name ?? null : null,
      course_id: r.course_id,
      course_title:
        r.course_id !== null ? courseById.get(r.course_id)?.title ?? null : null,
      created_at: r.created_at,
    }));

    return { items, total: items.length };
  }

  /**
   * Assign a student to a teacher (port of Instructor::assign_student). Writes
   * an `enrol` row carrying teacher_id + user_id (+ optional course_id). Mirrors
   * the legacy add (no duplicate guard on the legacy side, so none here).
   */
  async assignStudent(teacherId: number, dto: AssignStudentDto, actorId: number) {
    await this.findOne(teacherId); // 404 if missing / not a teacher
    const studentId = Number(dto.student_id);
    if (!Number.isInteger(studentId) || studentId <= 0) {
      throw new BadRequestException('student_id is required');
    }
    const courseId =
      dto.course_id !== undefined ? Number(dto.course_id) : undefined;

    const now = new Date();
    const row = await this.prisma.enrol.create({
      data: {
        teacher_id: teacherId,
        user_id: studentId,
        course_id: courseId,
        created_at: now,
        created_by: actorId,
        updated_at: now,
        updated_by: actorId,
      },
    });
    return { assignment_id: row.id, ...row };
  }

  /**
   * Un-assign a student (port of Instructor::assign_delete). Soft deletes the
   * enrol row by its id (the assignment id), scoped to this teacher. 404 if it
   * is missing, already deleted, or belongs to another teacher.
   */
  async removeAssignedStudent(
    teacherId: number,
    assignmentId: number,
    actorId: number,
  ) {
    await this.findOne(teacherId); // 404 if missing / not a teacher
    const row = await this.prisma.enrol.findFirst({
      where: { id: assignmentId, teacher_id: teacherId, deleted_at: null },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('Assigned student not found!');
    }
    const now = new Date();
    await this.prisma.enrol.update({
      where: { id: assignmentId },
      data: { deleted_at: now, updated_at: now, deleted_by: actorId },
    });
    return { id: assignmentId };
  }

  // --- Salary rates: create / update ----------------------------------------

  /** Create a teacher_salary rate row (POST /teacher-salary-rates). */
  async createSalaryRate(dto: CreateSalaryRateDto, actorId: number) {
    // Validate the teacher exists (and is a teacher) before creating a rate.
    const teacher = await this.prisma.users.findFirst({
      where: { id: dto.teacher_id, deleted_at: null, role_id: TEACHER_ROLE_ID },
      select: { id: true },
    });
    if (!teacher) {
      throw new NotFoundException('Teacher not found!');
    }

    const now = new Date();
    return this.prisma.teacher_salary.create({
      data: {
        teacher_id: dto.teacher_id,
        salary_30: dto.salary_30 ?? null,
        salary_45: dto.salary_45 ?? null,
        salary_1: dto.salary_1 ?? null,
        salary_confirmed_demo: dto.salary_confirmed_demo ?? null,
        created_at: now,
        created_by: actorId,
        updated_at: now,
        updated_by: actorId,
      },
    });
  }

  /** Partial update of a teacher_salary rate row (PATCH /teacher-salary-rates/:id). */
  async updateSalaryRate(id: number, dto: UpdateSalaryRateDto, actorId: number) {
    const row = await this.prisma.teacher_salary.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('Salary rate not found!');
    }

    const now = new Date();
    const data: Record<string, unknown> = { updated_at: now, updated_by: actorId };
    const assignable: (keyof UpdateSalaryRateDto)[] = [
      'salary_30',
      'salary_45',
      'salary_1',
      'salary_confirmed_demo',
    ];
    for (const key of assignable) {
      if (dto[key] !== undefined) {
        data[key] = dto[key];
      }
    }
    return this.prisma.teacher_salary.update({ where: { id }, data });
  }

  // --- Salary payments listing & summary ------------------------------------

  /** Inclusive [start,end] Date window for a `YYYY-MM` month string. */
  private monthWindow(month: string): { start: Date; end: Date } {
    const [yearStr, monthStr] = month.split('-');
    const year = Number(yearStr);
    const monthIdx = Number(monthStr) - 1; // 0-based
    const start = new Date(Date.UTC(year, monthIdx, 1, 0, 0, 0, 0));
    // Day 0 of the next month = last day of this month.
    const end = new Date(Date.UTC(year, monthIdx + 1, 0, 23, 59, 59, 999));
    return { start, end };
  }

  /**
   * Salary payouts recorded for a teacher, newest first. `?month=YYYY-MM`
   * filters on payment_date within that calendar month (legacy report window).
   */
  async findSalaryPayments(teacherId: number, month?: string) {
    await this.findOne(teacherId); // 404 if missing / not a teacher

    const where: Record<string, unknown> = {
      teacher_id: teacherId,
      deleted_at: null,
    };
    if (month) {
      const { start, end } = this.monthWindow(month);
      where.payment_date = { gte: start, lte: end };
    }

    const items = await this.prisma.salary_payment.findMany({
      where,
      orderBy: { id: 'desc' },
    });
    const total_paid = items.reduce((sum, p) => sum + (p.paid_amount ?? 0), 0);

    return { items, total: items.length, total_paid, month: month ?? null };
  }

  /**
   * Per-band session-count x rate breakdown for a teacher over a calendar month
   * (port of Teacher_salary_report::index, which combined the salary computation
   * with the month's payments). Reuses the same band/demo rule as computeSalary,
   * then subtracts the month's recorded payments to surface the balance.
   */
  async salarySummary(teacherId: number, month: string) {
    await this.findOne(teacherId); // 404 if missing / not a teacher

    const { start, end } = this.monthWindow(month);
    const from = start.toISOString().slice(0, 10);
    const to = end.toISOString().slice(0, 10);

    const [computed, payments] = await Promise.all([
      this.computeSalary(teacherId, from, to),
      this.prisma.salary_payment.findMany({
        where: {
          teacher_id: teacherId,
          deleted_at: null,
          payment_date: { gte: start, lte: end },
        },
        select: { paid_amount: true },
      }),
    ]);

    const total_paid = payments.reduce(
      (sum, p) => sum + (p.paid_amount ?? 0),
      0,
    );

    return {
      teacher_id: teacherId,
      month,
      bands: computed.bands,
      demo: computed.demo,
      completed_sessions: computed.completed_sessions,
      has_rate: computed.has_rate,
      total_salary: computed.total,
      total_paid,
      balance: computed.total - total_paid,
    };
  }

  // --- Phase-3 sagas (not implemented this phase) ---------------------------

  /**
   * TODO(phase-3): port Teachers::add Zoom provisioning — call ZoomService to
   * create the teacher's Zoom user, then persist zoom_id/zoom_email/zoom_password.
   */
  provisionZoomUser(_teacherId: number): never {
    throw new NotImplementedException('Zoom user provisioning — phase 3');
  }

  // --- Helpers --------------------------------------------------------------

  /** Never leak password hashes / zoom credentials in API responses. */
  private stripSecrets<T extends { password?: string | null; zoom_password?: string | null; prev_password?: string | null }>(
    user: T,
  ): Omit<T, 'password' | 'zoom_password' | 'prev_password'> {
    const { password, zoom_password, prev_password, ...rest } = user;
    return rest;
  }
}
