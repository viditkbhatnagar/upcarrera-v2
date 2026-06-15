import {
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

  async findAll(page?: number, limit?: number, searchKey?: string) {
    const pg = this.normalizePagination(page, limit);

    // Mirrors the legacy index() search across name/phone/email.
    const where = {
      deleted_at: null,
      role_id: TEACHER_ROLE_ID,
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
