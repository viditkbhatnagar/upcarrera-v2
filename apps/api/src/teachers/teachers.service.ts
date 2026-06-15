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

/** Legacy role id for teachers/instructors (login_helper.php). */
const TEACHER_ROLE_ID = 3;
const BCRYPT_ROUNDS = 10;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

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

  // --- Phase-3 sagas (not implemented this phase) ---------------------------

  /**
   * TODO(phase-3): port Teacher_salary::compute — aggregate salary_payment +
   * teacher_salary rates against teachers_schedules / completed sessions to
   * derive payable amounts. Multi-table read + write, out of scope for CRUD phase.
   */
  computeSalary(_teacherId: number, _month: string, _year: string): never {
    throw new NotImplementedException('Salary computation — phase 3');
  }

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
