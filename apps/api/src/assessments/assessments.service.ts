import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListAssessmentsDto } from './dto/list-assessments.dto';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto } from './dto/update-assessment.dto';
import { CreateHomeworkDto } from './dto/create-homework.dto';
import { UpdateHomeworkDto } from './dto/update-homework.dto';
import { AssessmentReportQueryDto } from './dto/report-query.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/** role_id for students in the users table (legacy convention). */
const STUDENT_ROLE_ID = 4;
/** role_id for teachers in the users table (legacy convention). */
const TEACHER_ROLE_ID = 3;

interface NamedRow {
  student_id?: number | null;
  teacher_id?: number | null;
  course_id?: number | null;
}

interface NameLookups {
  studentNames: Map<number, string | null>;
  teacherNames: Map<number, string | null>;
  courseTitles: Map<number, string | null>;
}

/**
 * Port of CI4 App\Assessment, App\Homework, App\Assessment_report and
 * App\Home_work_report.
 *
 * The `assessment` and `homework` tables share an identical column set, so the
 * CRUD and name-resolution logic is parameterised over a small delegate handle
 * rather than duplicated.
 *
 * Conventions (matching the rest of the API):
 *  - Lists & reads filter `deleted_at: null` (soft delete).
 *  - Delete stamps `deleted_at` with a JS Date (no hard delete) — the legacy
 *    Base_model::remove() did the same.
 *  - Create/update stamp created_at / updated_at manually, and force
 *    teacher_status / student_status = 0 on create (legacy behaviour).
 *  - Student / teacher names and course titles are resolved with bulk `IN`
 *    lookups against `users` / `course` (no N+1).
 */
@Injectable()
export class AssessmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private resolvePaging(query: { page?: number; limit?: number }) {
    const page = query.page && query.page > 0 ? query.page : DEFAULT_PAGE;
    const limit = query.limit && query.limit > 0 ? query.limit : DEFAULT_LIMIT;
    return { page, limit, skip: (page - 1) * limit, take: limit };
  }

  /** Builds the soft-delete + optional student/teacher/course where-clause. */
  private listWhere(query: ListAssessmentsDto) {
    return {
      deleted_at: null,
      ...(query.student_id !== undefined
        ? { student_id: query.student_id }
        : {}),
      ...(query.teacher_id !== undefined
        ? { teacher_id: query.teacher_id }
        : {}),
      ...(query.course_id !== undefined ? { course_id: query.course_id } : {}),
    };
  }

  /**
   * Resolve the student names (role 4), teacher names (role 3) and course
   * titles referenced by `rows` in three bulk queries. Returns lookup Maps so
   * callers can decorate each row without re-querying (no N+1).
   */
  private async resolveNames(rows: NamedRow[]): Promise<NameLookups> {
    const collect = (pick: (r: NamedRow) => number | null | undefined) => [
      ...new Set(
        rows
          .map(pick)
          .filter((v): v is number => v != null && Number.isFinite(v)),
      ),
    ];

    const studentIds = collect((r) => r.student_id);
    const teacherIds = collect((r) => r.teacher_id);
    const courseIds = collect((r) => r.course_id);

    const [students, teachers, courses] = await Promise.all([
      studentIds.length
        ? this.prisma.users.findMany({
            where: { id: { in: studentIds }, role_id: STUDENT_ROLE_ID },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      teacherIds.length
        ? this.prisma.users.findMany({
            where: { id: { in: teacherIds }, role_id: TEACHER_ROLE_ID },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      courseIds.length
        ? this.prisma.course.findMany({
            where: { id: { in: courseIds }, deleted_at: null },
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
    ]);

    return {
      studentNames: new Map(students.map((s) => [s.id, s.name])),
      teacherNames: new Map(teachers.map((t) => [t.id, t.name])),
      courseTitles: new Map(courses.map((c) => [c.id, c.title])),
    };
  }

  /** Decorates one row with resolved student_name / teacher_name / course_title. */
  private decorate<T extends NamedRow>(row: T, names: NameLookups) {
    return {
      ...row,
      student_name:
        row.student_id != null
          ? (names.studentNames.get(row.student_id) ?? null)
          : null,
      teacher_name:
        row.teacher_id != null
          ? (names.teacherNames.get(row.teacher_id) ?? null)
          : null,
      course_title:
        row.course_id != null
          ? (names.courseTitles.get(row.course_id) ?? null)
          : null,
    };
  }

  // ---------------------------------------------------------------------------
  // assessment -> /assessments
  // ---------------------------------------------------------------------------

  async listAssessments(query: ListAssessmentsDto) {
    const { page, limit, skip, take } = this.resolvePaging(query);
    const where = this.listWhere(query);

    const [rows, total] = await Promise.all([
      this.prisma.assessment.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'desc' },
      }),
      this.prisma.assessment.count({ where }),
    ]);

    const names = await this.resolveNames(rows);
    const items = rows.map((row) => this.decorate(row, names));

    return { items, total, page, limit };
  }

  async getAssessment(id: number) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id, deleted_at: null },
    });
    if (!assessment) {
      throw new NotFoundException('Assessment not found!');
    }
    return assessment;
  }

  async createAssessment(dto: CreateAssessmentDto, actorUserId: number) {
    const { due_date, ...rest } = dto;
    const now = new Date();
    return this.prisma.assessment.create({
      data: {
        ...rest,
        ...(due_date !== undefined ? { due_date: new Date(due_date) } : {}),
        // Legacy Assessment::add() always seeds both statuses to 0.
        teacher_status: 0,
        student_status: 0,
        created_by: actorUserId,
        created_at: now,
      },
    });
  }

  async updateAssessment(
    id: number,
    dto: UpdateAssessmentDto,
    actorUserId: number,
  ) {
    await this.getAssessment(id); // 404 if missing/soft-deleted
    const { due_date, ...rest } = dto;
    return this.prisma.assessment.update({
      where: { id },
      data: {
        ...rest,
        ...(due_date !== undefined ? { due_date: new Date(due_date) } : {}),
        updated_by: actorUserId,
        updated_at: new Date(),
      },
    });
  }

  async deleteAssessment(id: number, actorUserId: number) {
    await this.getAssessment(id);
    await this.prisma.assessment.update({
      where: { id },
      data: { deleted_at: new Date(), deleted_by: actorUserId },
    });
    return { id };
  }

  // ---------------------------------------------------------------------------
  // homework -> /homework
  // ---------------------------------------------------------------------------

  async listHomework(query: ListAssessmentsDto) {
    const { page, limit, skip, take } = this.resolvePaging(query);
    const where = this.listWhere(query);

    const [rows, total] = await Promise.all([
      this.prisma.homework.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'desc' },
      }),
      this.prisma.homework.count({ where }),
    ]);

    const names = await this.resolveNames(rows);
    const items = rows.map((row) => this.decorate(row, names));

    return { items, total, page, limit };
  }

  async getHomework(id: number) {
    const homework = await this.prisma.homework.findFirst({
      where: { id, deleted_at: null },
    });
    if (!homework) {
      throw new NotFoundException('Homework not found!');
    }
    return homework;
  }

  async createHomework(dto: CreateHomeworkDto, actorUserId: number) {
    const { due_date, ...rest } = dto;
    const now = new Date();
    return this.prisma.homework.create({
      data: {
        ...rest,
        ...(due_date !== undefined ? { due_date: new Date(due_date) } : {}),
        // Legacy Homework::add() always seeds both statuses to 0.
        teacher_status: 0,
        student_status: 0,
        created_by: actorUserId,
        created_at: now,
      },
    });
  }

  async updateHomework(id: number, dto: UpdateHomeworkDto, actorUserId: number) {
    await this.getHomework(id); // 404 if missing/soft-deleted
    const { due_date, ...rest } = dto;
    return this.prisma.homework.update({
      where: { id },
      data: {
        ...rest,
        ...(due_date !== undefined ? { due_date: new Date(due_date) } : {}),
        updated_by: actorUserId,
        updated_at: new Date(),
      },
    });
  }

  async deleteHomework(id: number, actorUserId: number) {
    await this.getHomework(id);
    await this.prisma.homework.update({
      where: { id },
      data: { deleted_at: new Date(), deleted_by: actorUserId },
    });
    return { id };
  }

  // ---------------------------------------------------------------------------
  // reports -> /reports/assessments, /reports/homework
  // ---------------------------------------------------------------------------

  /**
   * Translate the optional `from` / `to` (YYYY-MM-DD) window into a created_at
   * Prisma filter. Mirrors the legacy all-or-nothing behaviour: the window is
   * only applied when BOTH bounds are present (created_at >= from 00:00:00 AND
   * created_at <= to 23:59:59).
   */
  private createdAtWindow(query: AssessmentReportQueryDto) {
    if (!query.from || !query.to) {
      return {};
    }
    return {
      created_at: {
        gte: new Date(`${query.from}T00:00:00`),
        lte: new Date(`${query.to}T23:59:59`),
      },
    };
  }

  async assessmentReport(query: AssessmentReportQueryDto) {
    const where = { deleted_at: null, ...this.createdAtWindow(query) };
    const rows = await this.prisma.assessment.findMany({
      where,
      select: {
        student_id: true,
        teacher_id: true,
        course_id: true,
        student_status: true,
      },
    });
    return this.buildReport(rows);
  }

  async homeworkReport(query: AssessmentReportQueryDto) {
    const where = { deleted_at: null, ...this.createdAtWindow(query) };
    const rows = await this.prisma.homework.findMany({
      where,
      select: {
        student_id: true,
        teacher_id: true,
        course_id: true,
        student_status: true,
      },
    });
    return this.buildReport(rows);
  }

  /**
   * Aggregate the assessment/homework rows per student — total / completed /
   * pending counts — then decorate each bucket with the student name, the
   * (most-recent) teacher name and course title, resolved via bulk lookups.
   *
   * The legacy report grouped only by student and exposed total/completed/
   * pending. We keep those counts and additionally surface teacher/course
   * details (this task requirement) taken from the student's latest row in the
   * window. `student_status = 1` is "completed", everything else is "pending"
   * (matching the legacy CASE expression).
   */
  private async buildReport(
    rows: Array<{
      student_id: number | null;
      teacher_id: number | null;
      course_id: number | null;
      student_status: number | null;
    }>,
  ) {
    interface Bucket {
      student_id: number | null;
      teacher_id: number | null;
      course_id: number | null;
      total_count: number;
      completed_count: number;
      pending_count: number;
    }

    const buckets = new Map<number, Bucket>();

    // Legacy joins on users.id = student_id, so rows without a student_id are
    // dropped from the report (an INNER JOIN would exclude them).
    for (const row of rows) {
      if (row.student_id == null) continue;
      const existing = buckets.get(row.student_id);
      const bucket: Bucket = existing ?? {
        student_id: row.student_id,
        teacher_id: row.teacher_id,
        course_id: row.course_id,
        total_count: 0,
        completed_count: 0,
        pending_count: 0,
      };
      bucket.total_count += 1;
      if (row.student_status === 1) {
        bucket.completed_count += 1;
      } else {
        bucket.pending_count += 1;
      }
      // Keep the most recent (last-seen) teacher/course association.
      bucket.teacher_id = row.teacher_id;
      bucket.course_id = row.course_id;
      buckets.set(row.student_id, bucket);
    }

    const list = [...buckets.values()];
    const names = await this.resolveNames(list);

    return list.map((bucket) => ({
      student_id: bucket.student_id,
      student_name:
        bucket.student_id != null
          ? (names.studentNames.get(bucket.student_id) ?? null)
          : null,
      teacher_id: bucket.teacher_id,
      teacher_name:
        bucket.teacher_id != null
          ? (names.teacherNames.get(bucket.teacher_id) ?? null)
          : null,
      course_id: bucket.course_id,
      course_title:
        bucket.course_id != null
          ? (names.courseTitles.get(bucket.course_id) ?? null)
          : null,
      total_count: bucket.total_count,
      completed_count: bucket.completed_count,
      pending_count: bucket.pending_count,
    }));
  }
}
