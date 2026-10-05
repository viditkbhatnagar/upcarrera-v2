import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normaliseCatalogName } from './academics.service';
import { IntakeSessionsQueryDto } from './dto/intake-sessions-query.dto';
import { CreateIntakeSessionDto } from './dto/create-intake-session.dto';
import { UpdateIntakeSessionDto } from './dto/update-intake-session.dto';

/**
 * THE INTAKE MASTER (QA IN01).
 *
 * Two tables call themselves "intake" in this database:
 *
 *  - `sessions` (session_id, session_title) is the legacy CRM's intake list.
 *    students.session_id and applications.session_id point at it, the New
 *    Application / Add Lead "Intake" picker reads it, and the legacy
 *    Enrollment::intake_wise report grouped by it. It has NO date columns.
 *  - `intake` (name, month, year, start_date, closing_date, status) was added
 *    by v2 for schedules. Nothing references it — no student, application or
 *    course row carries an intake.id — and it is empty in production.
 *
 * So the only intake list the data can actually be filed under is `sessions`,
 * and this service serves it as the master both the Intakes screen and
 * Intake-wise Enrollment read. Linking `intake` schedules to it needs a column
 * (intake.session_id) and is a later, schema-phase job.
 *
 * Nothing here writes a date. The dates shown per intake are read from
 * students.enrollment_date, which holds legacy typos (0025-08-30 for
 * 2025-08-30, 0226-… for 2026-…). Those are NOT folded into the first/last
 * enrolment window — they are counted and returned verbatim as
 * `invalid_enrollment_dates`, so the screen can say so instead of printing a
 * plausible-looking wrong year.
 */

/** Oldest enrolment date treated as plausible. */
export const ENROLLMENT_DATE_MIN_YEAR = 2000;
/** How many years past the current one an enrolment date may plausibly sit. */
const ENROLLMENT_DATE_FUTURE_YEARS = 5;
/** Invalid dates echoed back per intake, as examples for the operator. */
const INVALID_DATE_SAMPLES = 3;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 100;

/** students.admission_status codes -> labels (same map as StudentsService). */
const ADMISSION_STATUS_LABELS: ReadonlyArray<{ code: number; label: string }> = [
  { code: 0, label: 'Pending' },
  { code: 1, label: 'In Progress' },
  { code: 2, label: 'Enrolled' },
  { code: 3, label: 'Passed Out' },
  { code: 4, label: 'Dropout' },
  { code: 5, label: 'Cancelled' },
];
const UNKNOWN_STATUS_LABEL = 'Unknown';
const ENROLLED_CODE = 2;
const PENDING_CODES = new Set([0, 1]);

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * Month and year as written in an intake's title ("July 2025", "Jan-2026
 * Batch", "2025 Sept"). Display/filter only — nothing is ever written from it.
 * A title with no recognisable month or 4-digit 19xx/20xx year yields null for
 * that part rather than a guess.
 */
export function parseIntakePeriod(title: string | null | undefined): {
  month: string | null;
  year: number | null;
} {
  const text = (title ?? '').toLowerCase();
  let month: string | null = null;
  for (const name of MONTH_NAMES) {
    const short = name.slice(0, 3).toLowerCase();
    const extra = name === 'September' ? '|sept' : '';
    const re = new RegExp(`(^|[^a-z])(${name.toLowerCase()}|${short}${extra})([^a-z]|$)`);
    if (re.test(text)) {
      month = name;
      break;
    }
  }
  const yearMatch = /(^|[^0-9])((?:19|20)[0-9]{2})([^0-9]|$)/.exec(text);
  return { month, year: yearMatch ? Number(yearMatch[2]) : null };
}

/** YYYY-MM-DD of a DATE column, verbatim — including a year like 0025. */
function isoDay(d: Date | null | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

interface Rollup {
  students_count: number;
  enrolled_count: number;
  pending_count: number;
  by_status: Array<{ label: string; count: number }>;
  first_enrollment_date: string | null;
  last_enrollment_date: string | null;
  invalid_enrollment_dates: { count: number; samples: string[] };
}

class RollupBuilder {
  private readonly status = new Map<string, number>();
  private first: string | null = null;
  private last: string | null = null;
  private invalidCount = 0;
  private readonly invalid = new Map<string, number>();

  addStatus(code: number | null, count: number) {
    const label =
      ADMISSION_STATUS_LABELS.find((s) => s.code === code)?.label ?? UNKNOWN_STATUS_LABEL;
    this.status.set(label, (this.status.get(label) ?? 0) + count);
  }

  addRange(min: string | null, max: string | null) {
    if (min && (this.first === null || min < this.first)) this.first = min;
    if (max && (this.last === null || max > this.last)) this.last = max;
  }

  addInvalid(day: string | null, count: number) {
    if (!day) return;
    this.invalidCount += count;
    this.invalid.set(day, (this.invalid.get(day) ?? 0) + count);
  }

  build(): Rollup {
    const by_status = [
      ...ADMISSION_STATUS_LABELS.map((s) => s.label),
      UNKNOWN_STATUS_LABEL,
    ].map((label) => ({ label, count: this.status.get(label) ?? 0 }));
    const students_count = by_status.reduce((sum, s) => sum + s.count, 0);
    const label = (code: number) =>
      ADMISSION_STATUS_LABELS.find((s) => s.code === code)!.label;
    return {
      students_count,
      enrolled_count: this.status.get(label(ENROLLED_CODE)) ?? 0,
      pending_count: [...PENDING_CODES].reduce(
        (sum, code) => sum + (this.status.get(label(code)) ?? 0),
        0,
      ),
      by_status,
      first_enrollment_date: this.first,
      last_enrollment_date: this.last,
      invalid_enrollment_dates: {
        count: this.invalidCount,
        samples: [...this.invalid.keys()].sort().slice(0, INVALID_DATE_SAMPLES),
      },
    };
  }
}

@Injectable()
export class IntakeMasterService {
  constructor(private readonly prisma: PrismaService) {}

  /** The plausible window for students.enrollment_date, as YYYY-MM-DD bounds. */
  private dateWindow(now: Date = new Date()) {
    return {
      min: `${ENROLLMENT_DATE_MIN_YEAR}-01-01`,
      max: `${now.getUTCFullYear() + ENROLLMENT_DATE_FUTURE_YEARS}-12-31`,
    };
  }

  /** Course ids for a university (course.university_id), or undefined when unfiltered. */
  private async coursesOfUniversity(universityId?: number): Promise<number[] | undefined> {
    if (universityId === undefined) return undefined;
    const rows = await this.prisma.course.findMany({
      where: { university_id: universityId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /**
   * The students the roll-ups count. A student's university is its course's
   * university (the same derivation the Students list displays), so a
   * university filter resolves to that university's course ids.
   */
  private studentScope(
    query: IntakeSessionsQueryDto,
    universityCourseIds: number[] | undefined,
  ): Prisma.studentsWhereInput {
    const and: Prisma.studentsWhereInput[] = [{ deleted_at: null }];
    if (query.course_id !== undefined) and.push({ course_id: query.course_id });
    if (universityCourseIds !== undefined) {
      and.push({ course_id: { in: universityCourseIds } });
    }
    if (query.from !== undefined || query.to !== undefined) {
      and.push({
        enrollment_date: {
          ...(query.from !== undefined ? { gte: new Date(`${query.from}T00:00:00Z`) } : {}),
          ...(query.to !== undefined ? { lte: new Date(`${query.to}T00:00:00Z`) } : {}),
        },
      });
    }
    return { AND: and };
  }

  /** Applications have their own university_id; fall back to the course's university. */
  private applicationScope(
    query: IntakeSessionsQueryDto,
    universityCourseIds: number[] | undefined,
  ): Prisma.applicationsWhereInput {
    const and: Prisma.applicationsWhereInput[] = [{ deleted_at: null }];
    if (query.course_id !== undefined) and.push({ course_id: query.course_id });
    if (query.university_id !== undefined) {
      and.push({
        OR: [
          { university_id: query.university_id },
          {
            university_id: null,
            course_id: { in: universityCourseIds ?? [] },
          },
        ],
      });
    }
    return { AND: and };
  }

  /**
   * GET /intakes/sessions — every live intake in the master, each with its
   * applications count, the 7-bucket admission-status breakdown of its
   * students, the first/last PLAUSIBLE enrolment date, and the implausible
   * dates it holds (verbatim). `unassigned` rolls up students with no intake
   * or with an intake id that no longer exists, so the totals reconcile with
   * the Students list.
   *
   * Cost: one query for the page, one for all live ids, and four grouped
   * aggregates over students/applications — independent of the row count.
   */
  async list(query: IntakeSessionsQueryDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const window = this.dateWindow();
    const minDate = new Date(`${window.min}T00:00:00Z`);
    const maxDate = new Date(`${window.max}T00:00:00Z`);

    const sessionWhere: Prisma.sessionsWhereInput = {
      deleted_at: null,
      ...(query.search ? { session_title: { contains: query.search } } : {}),
    };

    const universityCourseIds = await this.coursesOfUniversity(query.university_id);
    const students = this.studentScope(query, universityCourseIds);
    const applications = this.applicationScope(query, universityCourseIds);

    const [rows, total, liveIds, statusGroups, rangeGroups, invalidGroups, appGroups] =
      await Promise.all([
        this.prisma.sessions.findMany({
          where: sessionWhere,
          orderBy: { session_id: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.sessions.count({ where: sessionWhere }),
        this.prisma.sessions.findMany({
          where: { deleted_at: null },
          select: { session_id: true },
        }),
        this.prisma.students.groupBy({
          by: ['session_id', 'admission_status'],
          where: students,
          _count: { _all: true },
        }),
        this.prisma.students.groupBy({
          by: ['session_id'],
          where: {
            AND: [students, { enrollment_date: { gte: minDate, lte: maxDate } }],
          },
          _min: { enrollment_date: true },
          _max: { enrollment_date: true },
        }),
        this.prisma.students.groupBy({
          by: ['session_id', 'enrollment_date'],
          where: {
            AND: [
              students,
              {
                OR: [
                  { enrollment_date: { lt: minDate } },
                  { enrollment_date: { gt: maxDate } },
                ],
              },
            ],
          },
          _count: { _all: true },
        }),
        this.prisma.applications.groupBy({
          by: ['session_id'],
          where: applications,
          _count: { _all: true },
        }),
      ]);

    const live = new Set(liveIds.map((r) => r.session_id));
    /** Bucket key: a live session id, or null for "no / unknown intake". */
    const keyOf = (sessionId: number | null) =>
      sessionId !== null && live.has(sessionId) ? sessionId : null;

    const rollups = new Map<number | null, RollupBuilder>();
    const builder = (key: number | null) => {
      let b = rollups.get(key);
      if (!b) {
        b = new RollupBuilder();
        rollups.set(key, b);
      }
      return b;
    };
    for (const g of statusGroups) {
      builder(keyOf(g.session_id)).addStatus(g.admission_status, g._count._all);
    }
    for (const g of rangeGroups) {
      builder(keyOf(g.session_id)).addRange(
        isoDay(g._min.enrollment_date),
        isoDay(g._max.enrollment_date),
      );
    }
    for (const g of invalidGroups) {
      builder(keyOf(g.session_id)).addInvalid(isoDay(g.enrollment_date), g._count._all);
    }
    const appCounts = new Map<number | null, number>();
    for (const g of appGroups) {
      const key = keyOf(g.session_id);
      appCounts.set(key, (appCounts.get(key) ?? 0) + g._count._all);
    }

    const items = rows.map((r) => ({
      session_id: r.session_id,
      session_title: r.session_title,
      created_at: r.created_at,
      period: parseIntakePeriod(r.session_title),
      applications_count: appCounts.get(r.session_id) ?? 0,
      ...(rollups.get(r.session_id) ?? new RollupBuilder()).build(),
    }));

    return {
      items,
      total,
      page,
      limit,
      unassigned: {
        applications_count: appCounts.get(null) ?? 0,
        ...(rollups.get(null) ?? new RollupBuilder()).build(),
      },
      date_window: window,
    };
  }

  private async getLive(id: number) {
    const row = await this.prisma.sessions.findFirst({
      where: { session_id: id, deleted_at: null },
    });
    if (!row) throw new NotFoundException('Intake not found!');
    return row;
  }

  /** 409 when another live intake already uses this title (case/space-insensitive). */
  private async assertTitleFree(title: string, exceptId?: number) {
    const key = normaliseCatalogName(title);
    const rows = await this.prisma.sessions.findMany({
      where: { deleted_at: null },
      select: { session_id: true, session_title: true },
    });
    const clash = rows.find(
      (r) => r.session_id !== exceptId && normaliseCatalogName(r.session_title) === key,
    );
    if (clash) {
      throw new ConflictException(
        `An intake named "${clash.session_title}" already exists (#${clash.session_id})`,
      );
    }
  }

  /** POST /intakes/sessions — adds an intake applications can be filed under. */
  async create(dto: CreateIntakeSessionDto) {
    await this.assertTitleFree(dto.session_title);
    const now = new Date();
    return this.prisma.sessions.create({
      data: { session_title: dto.session_title, created_at: now, updated_at: now },
    });
  }

  /**
   * PATCH /intakes/sessions/:id — renames an intake. The id is what students
   * and applications reference, so a rename re-labels them without touching a
   * single student or application row. Re-saving the same title is a no-op
   * check, not a conflict.
   */
  async rename(id: number, dto: UpdateIntakeSessionDto) {
    await this.getLive(id);
    await this.assertTitleFree(dto.session_title, id);
    return this.prisma.sessions.update({
      where: { session_id: id },
      data: { session_title: dto.session_title, updated_at: new Date() },
    });
  }
}
