import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  FollowupReportQueryDto,
  ReportQueryDto,
} from './dto/report-query.dto';
import { EnrollmentReportQueryDto } from './dto/enrollment-report-query.dto';
import { TeacherSalaryReportQueryDto } from './dto/teacher-salary-report-query.dto';
import { CsvRow } from './reports.csv';

/**
 * Reporting aggregations.
 *
 * Ports the intent of CI4 App/Controllers/App/{Lead_report,Students_report,
 * Income_report,Followup_report}.php. Those controllers fetched full row sets
 * and counted in PHP; here we push the aggregation into MySQL via Prisma
 * groupBy / aggregate / $queryRaw.
 *
 * Field-name notes (verified against schema.prisma):
 *  - leads.created_at, leads.lead_status_id (Int), leads.lead_source_id (String!)
 *  - students.created_at, students.admission_status (Int), students.course_id (Int)
 *  - payment.created_on (NOT created_at), payment.payment_date (Date),
 *    payment.paid_amount (Float, money columns are mixed types app-wide)
 *  - Follow-up lead_status_id is 3 (Followup_report.php hard-codes it).
 */

/** lead_status_id used by the legacy Followup report. */
const FOLLOWUP_LEAD_STATUS_ID = 3;

/**
 * students.admission_status integer codes, per the legacy Enrollment.php
 * switch (0 Pending .. 5 Cancelled). The order here is the canonical order all
 * enrollment reports emit (so every university/intake always lists all 6).
 */
const ADMISSION_STATUS = {
  PENDING: 0,
  IN_PROGRESS: 1,
  ENROLLED: 2,
  PASSOUT: 3,
  DROPOUT: 4,
  CANCELLED: 5,
} as const;

/** Ordered status code + human label pairs for enrollment groupings. */
const ADMISSION_STATUS_META: ReadonlyArray<{ code: number; label: string }> = [
  { code: ADMISSION_STATUS.PENDING, label: 'Pending' },
  { code: ADMISSION_STATUS.IN_PROGRESS, label: 'In Progress' },
  { code: ADMISSION_STATUS.ENROLLED, label: 'Enrolled' },
  { code: ADMISSION_STATUS.PASSOUT, label: 'Passout' },
  { code: ADMISSION_STATUS.DROPOUT, label: 'Dropout' },
  { code: ADMISSION_STATUS.CANCELLED, label: 'Cancelled' },
];

/** Role id of student users (legacy `users.role_id => 4`). */
const STUDENT_ROLE_ID = 4;

/** Role id of teacher/instructor users (legacy `users.role_id => 3`). */
const TEACHER_ROLE_ID = 3;

/**
 * Duration-band thresholds for the teacher-salary report — identical rule to
 * TeachersService.computeSalary (kept local so the reports module has no
 * cross-module dependency on TeachersService).
 */
const BAND_30_MAX_MINUTES = 37;
const BAND_45_MAX_MINUTES = 52;
const MS_PER_MINUTE = 60_000;

/** Flat status tally shared by the enrollment PDFs (matches legacy $stats). */
export interface EnrollmentStatusCounts {
  total: number;
  pending: number;
  in_progress: number;
  enrolled: number;
  passout: number;
  dropout: number;
  cancelled: number;
}

/** Each report method returns the structured payload plus flattened CSV rows. */
export interface ReportResult<T> {
  data: T;
  csv: { rows: CsvRow[]; headers: string[] };
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- shared helpers ------------------------------------------------------

  /**
   * Build an inclusive DateTime range filter for the given column.
   * `from` covers from 00:00:00, `to` covers through 23:59:59.999 of that day
   * (mirrors the legacy `date(col) >=` / `<=` and `00:00:00`/`23:59:59` bounds).
   * Returns undefined when neither bound is supplied so the filter is omitted.
   */
  private dateRange(
    from?: string,
    to?: string,
  ): { gte?: Date; lte?: Date } | undefined {
    if (!from && !to) {
      return undefined;
    }
    const range: { gte?: Date; lte?: Date } = {};
    if (from) {
      range.gte = new Date(`${from}T00:00:00.000`);
    }
    if (to) {
      range.lte = new Date(`${to}T23:59:59.999`);
    }
    return range;
  }

  /** Coerce a mixed-type money/count value (Decimal | Float | BigInt | null) to a number. */
  private toNumber(value: unknown): number {
    if (value === null || value === undefined) {
      return 0;
    }
    // Prisma.Decimal, BigInt, string, number all survive Number(...) round-trip.
    const n = Number(value as Prisma.Decimal | bigint | string | number);
    return Number.isFinite(n) ? n : 0;
  }

  // ---- leads report --------------------------------------------------------

  /**
   * Counts of leads grouped by lead_status_id and by lead_source_id, plus the
   * total, within the created_at date range. Ports Lead_report.php.
   */
  async leads(query: ReportQueryDto): Promise<ReportResult<{
    total: number;
    by_status: Array<{ lead_status_id: number | null; count: number }>;
    by_source: Array<{ lead_source_id: string | null; count: number }>;
  }>> {
    const where: Prisma.leadsWhereInput = { deleted_at: null };
    const createdAt = this.dateRange(query.from, query.to);
    if (createdAt) {
      where.created_at = createdAt;
    }

    // Independent read-only aggregates run in parallel. Using Promise.all (not
    // the array form of $transaction) preserves Prisma's precise groupBy result
    // types — the tuple form widens `_count` and breaks `row._count._all`.
    const [byStatusRaw, bySourceRaw, total] = await Promise.all([
      this.prisma.leads.groupBy({
        by: ['lead_status_id'],
        where,
        _count: { _all: true },
        orderBy: { lead_status_id: 'asc' },
      }),
      this.prisma.leads.groupBy({
        by: ['lead_source_id'],
        where,
        _count: { _all: true },
        orderBy: { lead_source_id: 'asc' },
      }),
      this.prisma.leads.count({ where }),
    ]);

    const byStatus = byStatusRaw.map((row) => ({
      lead_status_id: row.lead_status_id,
      count: row._count._all,
    }));
    const bySource = bySourceRaw.map((row) => ({
      lead_source_id: row.lead_source_id,
      count: row._count._all,
    }));

    const data = { total, by_status: byStatus, by_source: bySource };

    // CSV: a single flat table tagged by dimension so both groupings export.
    const rows: CsvRow[] = [
      ...byStatus.map((r) => ({
        dimension: 'lead_status_id',
        key: r.lead_status_id ?? '',
        count: r.count,
      })),
      ...bySource.map((r) => ({
        dimension: 'lead_source_id',
        key: r.lead_source_id ?? '',
        count: r.count,
      })),
    ];

    return { data, csv: { rows, headers: ['dimension', 'key', 'count'] } };
  }

  // ---- leads-by-country report ---------------------------------------------

  /**
   * Leads grouped by country_id, each with a per-lead_status_id breakdown, plus
   * a per-country total and the grand total. Filters: created_at date range and
   * an optional telecaller_id. Extends the Lead_report.php status tally with the
   * country dimension.
   *
   * Uses a single groupBy on [country_id, lead_status_id] then folds the flat
   * rows into the nested shape — one query, no N+1.
   */
  async leadsByCountry(query: FollowupReportQueryDto): Promise<ReportResult<{
    total: number;
    by_country: Array<{
      country_id: number | null;
      total: number;
      by_status: Array<{ lead_status_id: number | null; count: number }>;
    }>;
  }>> {
    const where: Prisma.leadsWhereInput = { deleted_at: null };
    const createdAt = this.dateRange(query.from, query.to);
    if (createdAt) {
      where.created_at = createdAt;
    }
    if (query.telecaller_id !== undefined) {
      where.telecaller_id = query.telecaller_id;
    }

    const grouped = await this.prisma.leads.groupBy({
      by: ['country_id', 'lead_status_id'],
      where,
      _count: { _all: true },
      orderBy: [{ country_id: 'asc' }, { lead_status_id: 'asc' }],
    });

    // Fold flat (country, status) rows into nested per-country buckets,
    // preserving the groupBy ordering via an insertion-ordered Map.
    const byCountryMap = new Map<
      number | null,
      {
        country_id: number | null;
        total: number;
        by_status: Array<{ lead_status_id: number | null; count: number }>;
      }
    >();

    for (const row of grouped) {
      const count = row._count._all;
      let bucket = byCountryMap.get(row.country_id);
      if (!bucket) {
        bucket = { country_id: row.country_id, total: 0, by_status: [] };
        byCountryMap.set(row.country_id, bucket);
      }
      bucket.total += count;
      bucket.by_status.push({
        lead_status_id: row.lead_status_id,
        count,
      });
    }

    const byCountry = [...byCountryMap.values()];
    const total = byCountry.reduce((sum, c) => sum + c.total, 0);

    const data = { total, by_country: byCountry };

    // CSV: one flat row per (country, status) pair so the breakdown exports.
    const rows: CsvRow[] = grouped.map((row) => ({
      country_id: row.country_id ?? '',
      lead_status_id: row.lead_status_id ?? '',
      count: row._count._all,
    }));

    return {
      data,
      csv: { rows, headers: ['country_id', 'lead_status_id', 'count'] },
    };
  }

  // ---- students report -----------------------------------------------------

  /**
   * Counts of students grouped by admission_status and by course_id, plus the
   * total, within the created_at date range. Ports Students_report.php.
   */
  async students(query: ReportQueryDto): Promise<ReportResult<{
    total: number;
    by_admission_status: Array<{ admission_status: number | null; count: number }>;
    by_course: Array<{ course_id: number | null; count: number }>;
  }>> {
    const where: Prisma.studentsWhereInput = { deleted_at: null };
    const createdAt = this.dateRange(query.from, query.to);
    if (createdAt) {
      where.created_at = createdAt;
    }

    // Independent read-only aggregates run in parallel. Using Promise.all (not
    // the array form of $transaction) preserves Prisma's precise groupBy result
    // types — the tuple form widens `_count` and breaks `row._count._all`.
    const [byStatusRaw, byCourseRaw, total] = await Promise.all([
      this.prisma.students.groupBy({
        by: ['admission_status'],
        where,
        _count: { _all: true },
        orderBy: { admission_status: 'asc' },
      }),
      this.prisma.students.groupBy({
        by: ['course_id'],
        where,
        _count: { _all: true },
        orderBy: { course_id: 'asc' },
      }),
      this.prisma.students.count({ where }),
    ]);

    const byAdmission = byStatusRaw.map((row) => ({
      admission_status: row.admission_status,
      count: row._count._all,
    }));
    const byCourse = byCourseRaw.map((row) => ({
      course_id: row.course_id,
      count: row._count._all,
    }));

    const data = {
      total,
      by_admission_status: byAdmission,
      by_course: byCourse,
    };

    const rows: CsvRow[] = [
      ...byAdmission.map((r) => ({
        dimension: 'admission_status',
        key: r.admission_status ?? '',
        count: r.count,
      })),
      ...byCourse.map((r) => ({
        dimension: 'course_id',
        key: r.course_id ?? '',
        count: r.count,
      })),
    ];

    return { data, csv: { rows, headers: ['dimension', 'key', 'count'] } };
  }

  // ---- income report -------------------------------------------------------

  /**
   * Sum of payment.paid_amount grouped by calendar month (YYYY-MM), plus the
   * grand total. Ports Income_report.php (which summed paid_amount per period).
   *
   * Uses $queryRaw because Prisma groupBy cannot group by a derived month
   * expression. Money columns are mixed types app-wide, so values are coerced.
   * Month is derived from COALESCE(payment_date, created_on) — payment_date is
   * the business date when set, created_on is the row insert timestamp.
   */
  async income(query: ReportQueryDto): Promise<ReportResult<{
    grand_total: number;
    by_month: Array<{ month: string; total: number }>;
  }>> {
    const range = this.dateRange(query.from, query.to);

    // Filter on the same COALESCE(payment_date, created_on) we group by, so the
    // date window and the month bucket stay consistent. deleted_at IS NULL keeps
    // soft-deleted payments out.
    const conditions: Prisma.Sql[] = [Prisma.sql`deleted_at IS NULL`];
    if (range?.gte) {
      conditions.push(
        Prisma.sql`COALESCE(payment_date, created_on) >= ${range.gte}`,
      );
    }
    if (range?.lte) {
      conditions.push(
        Prisma.sql`COALESCE(payment_date, created_on) <= ${range.lte}`,
      );
    }
    const whereSql = Prisma.join(conditions, ' AND ');

    const raw = await this.prisma.$queryRaw<
      Array<{ month: string | null; total: unknown }>
    >(Prisma.sql`
      SELECT
        DATE_FORMAT(COALESCE(payment_date, created_on), '%Y-%m') AS month,
        SUM(paid_amount) AS total
      FROM payment
      WHERE ${whereSql}
      GROUP BY month
      ORDER BY month ASC
    `);

    const byMonth = raw
      // A NULL month means both date columns were NULL — drop it from the buckets.
      .filter((r) => r.month !== null)
      .map((r) => ({ month: r.month as string, total: this.toNumber(r.total) }));

    const grandTotal = byMonth.reduce((sum, r) => sum + r.total, 0);

    const data = { grand_total: grandTotal, by_month: byMonth };

    const rows: CsvRow[] = byMonth.map((r) => ({
      month: r.month,
      total: r.total,
    }));

    return { data, csv: { rows, headers: ['month', 'total'] } };
  }

  // ---- followups report ----------------------------------------------------

  /**
   * Count of Follow-up leads (lead_status_id = 3) grouped by telecaller_id,
   * within the created_at date range, with the nearest upcoming followup_date
   * per telecaller. Ports Followup_report.php.
   */
  async followups(query: FollowupReportQueryDto): Promise<ReportResult<{
    total: number;
    by_telecaller: Array<{
      telecaller_id: number | null;
      count: number;
      upcoming_followup_date: string | null;
    }>;
  }>> {
    const where: Prisma.leadsWhereInput = {
      deleted_at: null,
      lead_status_id: FOLLOWUP_LEAD_STATUS_ID,
    };
    const createdAt = this.dateRange(query.from, query.to);
    if (createdAt) {
      where.created_at = createdAt;
    }
    if (query.telecaller_id !== undefined) {
      where.telecaller_id = query.telecaller_id;
    }

    // Count per telecaller.
    const grouped = await this.prisma.leads.groupBy({
      by: ['telecaller_id'],
      where,
      _count: { _all: true },
    });

    // Nearest upcoming follow-up (>= today) per telecaller, fetched in one pass.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = await this.prisma.leads.groupBy({
      by: ['telecaller_id'],
      where: { ...where, followup_date: { gte: today } },
      _min: { followup_date: true },
    });
    const upcomingByTelecaller = new Map<number | null, Date | null>(
      upcoming.map((u) => [u.telecaller_id, u._min.followup_date ?? null]),
    );

    const byTelecaller = grouped.map((row) => {
      const next = upcomingByTelecaller.get(row.telecaller_id) ?? null;
      return {
        telecaller_id: row.telecaller_id,
        count: row._count._all,
        upcoming_followup_date: next ? next.toISOString().slice(0, 10) : null,
      };
    });

    const total = byTelecaller.reduce((sum, r) => sum + r.count, 0);

    const data = { total, by_telecaller: byTelecaller };

    const rows: CsvRow[] = byTelecaller.map((r) => ({
      telecaller_id: r.telecaller_id ?? '',
      count: r.count,
      upcoming_followup_date: r.upcoming_followup_date ?? '',
    }));

    return {
      data,
      csv: {
        rows,
        headers: ['telecaller_id', 'count', 'upcoming_followup_date'],
      },
    };
  }

  // ---- enrollment reports --------------------------------------------------
  //
  // Ports App/Controllers/App/Enrollment.php (all_enrollments / university_wise
  // / intake_wise / print_*). Notes on field placement:
  //  - `university_id` lives on `users` (users.id = students.student_id), NOT on
  //    the students row, so the university dimension/filter is resolved by first
  //    looking up the student-role users for that university and matching on
  //    students.student_id. There is no Prisma relation between the two tables.
  //  - the intake dimension is students.session_id (direct).
  //  - the legacy date filter targets students.enrollment_date.

  /**
   * Maps an ordered [{admission_status, count}] list (all 6 statuses, missing
   * ones zero-filled) plus a total. Shared by every enrollment grouping so the
   * output always carries the full status spectrum in canonical order.
   */
  private buildStatusBreakdown(countsByStatus: Map<number, number>): {
    total: number;
    by_status: Array<{ admission_status: number; label: string; count: number }>;
  } {
    const by_status = ADMISSION_STATUS_META.map((meta) => ({
      admission_status: meta.code,
      label: meta.label,
      count: countsByStatus.get(meta.code) ?? 0,
    }));
    const total = by_status.reduce((sum, s) => sum + s.count, 0);
    return { total, by_status };
  }

  /** Flattens a status map into the legacy EnrollmentStatusCounts shape. */
  private toStatusCounts(
    countsByStatus: Map<number, number>,
  ): EnrollmentStatusCounts {
    return {
      total: [...countsByStatus.values()].reduce((sum, c) => sum + c, 0),
      pending: countsByStatus.get(ADMISSION_STATUS.PENDING) ?? 0,
      in_progress: countsByStatus.get(ADMISSION_STATUS.IN_PROGRESS) ?? 0,
      enrolled: countsByStatus.get(ADMISSION_STATUS.ENROLLED) ?? 0,
      passout: countsByStatus.get(ADMISSION_STATUS.PASSOUT) ?? 0,
      dropout: countsByStatus.get(ADMISSION_STATUS.DROPOUT) ?? 0,
      cancelled: countsByStatus.get(ADMISSION_STATUS.CANCELLED) ?? 0,
    };
  }

  /**
   * Resolves the set of `students.student_id` values that belong to a given
   * university. university_id lives on `users` (role_id = 4 / student), so we
   * fetch those user ids and use them to scope the students query. Returns the
   * id list; an empty list means "no matching students".
   */
  private async studentIdsForUniversity(universityId: number): Promise<number[]> {
    const users = await this.prisma.users.findMany({
      where: {
        role_id: STUDENT_ROLE_ID,
        university_id: universityId,
        deleted_at: null,
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  /**
   * Builds the students WHERE clause shared by the enrollment list/grouping
   * endpoints from the common filters (date range on enrollment_date +
   * session_id). The university_id filter is applied separately by the caller
   * (it requires the users lookup above) so it can short-circuit on no matches.
   */
  private enrollmentBaseWhere(
    query: EnrollmentReportQueryDto,
  ): Prisma.studentsWhereInput {
    const where: Prisma.studentsWhereInput = { deleted_at: null };
    const range = this.dateRange(query.from, query.to);
    if (range) {
      where.enrollment_date = range;
    }
    if (query.session_id !== undefined) {
      where.session_id = query.session_id;
    }
    return where;
  }

  /**
   * Applies the optional university_id filter to a students where-clause.
   * Returns the clause to use, or null when the university has no students (so
   * the caller can return an all-zero result without querying).
   */
  private async applyUniversityFilter(
    where: Prisma.studentsWhereInput,
    universityId: number | undefined,
  ): Promise<Prisma.studentsWhereInput | null> {
    if (universityId === undefined) {
      return where;
    }
    const ids = await this.studentIdsForUniversity(universityId);
    if (ids.length === 0) {
      return null;
    }
    return { ...where, student_id: { in: ids } };
  }

  /** Groups students by admission_status under a where-clause into a status map. */
  private async countByAdmissionStatus(
    where: Prisma.studentsWhereInput,
  ): Promise<Map<number, number>> {
    const grouped = await this.prisma.students.groupBy({
      by: ['admission_status'],
      where,
      _count: { _all: true },
    });
    const map = new Map<number, number>();
    for (const row of grouped) {
      // Legacy treats NULL/out-of-range statuses as un-bucketed; keep only the
      // 6 known codes so totals match the canonical breakdown.
      if (row.admission_status !== null) {
        map.set(row.admission_status, row._count._all);
      }
    }
    return map;
  }

  /**
   * GET /reports/enrollments — overall students-by-admission_status tally (all 6
   * statuses, zero-filled) with the total, honouring the university/session/date
   * filters. Ports the status-count block of all_enrollments().
   */
  async enrollments(query: EnrollmentReportQueryDto): Promise<ReportResult<{
    total: number;
    by_status: Array<{ admission_status: number; label: string; count: number }>;
  }>> {
    const base = this.enrollmentBaseWhere(query);
    const where = await this.applyUniversityFilter(base, query.university_id);

    const countsByStatus =
      where === null
        ? new Map<number, number>()
        : await this.countByAdmissionStatus(where);

    const data = this.buildStatusBreakdown(countsByStatus);

    const rows: CsvRow[] = data.by_status.map((s) => ({
      admission_status: s.admission_status,
      label: s.label,
      count: s.count,
    }));

    return {
      data,
      csv: { rows, headers: ['admission_status', 'label', 'count'] },
    };
  }

  /**
   * GET /reports/enrollments/university-wise — per-university enrollment stats,
   * each with the full 6-status breakdown + total. Ports university_wise().
   *
   * Strategy: fetch all student-role users (id -> university_id), group all
   * matching students by [student_id-derived university, admission_status] in a
   * single pass. We avoid the legacy N+1 (one query per university) by grouping
   * students by [student_id, admission_status] once and folding via the user map.
   */
  async enrollmentsUniversityWise(
    query: EnrollmentReportQueryDto,
  ): Promise<ReportResult<{
    by_university: Array<{
      university_id: number;
      university_name: string | null;
      total: number;
      by_status: Array<{ admission_status: number; label: string; count: number }>;
    }>;
  }>> {
    // university list (for names + stable ordering), and the student-user map.
    const universityWhere: Prisma.universityWhereInput = { deleted_at: null };
    if (query.university_id !== undefined) {
      universityWhere.id = query.university_id;
    }
    const [universities, studentUsers] = await Promise.all([
      this.prisma.university.findMany({
        where: universityWhere,
        select: { id: true, title: true },
        orderBy: { title: 'asc' },
      }),
      this.prisma.users.findMany({
        where: { role_id: STUDENT_ROLE_ID, deleted_at: null },
        select: { id: true, university_id: true },
      }),
    ]);

    // user id -> university id
    const userUniversity = new Map<number, number | null>(
      studentUsers.map((u) => [u.id, u.university_id ?? null]),
    );

    // Group students by [student_id, admission_status] under the date/session
    // filter, then fold into per-university status maps via userUniversity.
    const grouped = await this.prisma.students.groupBy({
      by: ['student_id', 'admission_status'],
      where: this.enrollmentBaseWhere(query),
      _count: { _all: true },
    });

    const perUniversity = new Map<number, Map<number, number>>();
    for (const row of grouped) {
      if (row.admission_status === null) continue;
      const uniId = userUniversity.get(row.student_id);
      if (uniId === undefined || uniId === null) continue;
      let statusMap = perUniversity.get(uniId);
      if (!statusMap) {
        statusMap = new Map<number, number>();
        perUniversity.set(uniId, statusMap);
      }
      statusMap.set(
        row.admission_status,
        (statusMap.get(row.admission_status) ?? 0) + row._count._all,
      );
    }

    const by_university = universities.map((uni) => {
      const breakdown = this.buildStatusBreakdown(
        perUniversity.get(uni.id) ?? new Map<number, number>(),
      );
      return {
        university_id: uni.id,
        university_name: uni.title,
        total: breakdown.total,
        by_status: breakdown.by_status,
      };
    });

    const data = { by_university };

    // CSV: one flat row per (university, status) pair.
    const rows: CsvRow[] = by_university.flatMap((u) =>
      u.by_status.map((s) => ({
        university_id: u.university_id,
        university_name: u.university_name ?? '',
        admission_status: s.admission_status,
        label: s.label,
        count: s.count,
      })),
    );

    return {
      data,
      csv: {
        rows,
        headers: [
          'university_id',
          'university_name',
          'admission_status',
          'label',
          'count',
        ],
      },
    };
  }

  /**
   * GET /reports/enrollments/intake-wise — per-session/intake enrollment stats,
   * each with the full 6-status breakdown + total, newest session first. Ports
   * intake_wise() (which ordered sessions by created_at desc).
   */
  async enrollmentsIntakeWise(
    query: EnrollmentReportQueryDto,
  ): Promise<ReportResult<{
    by_intake: Array<{
      session_id: number;
      session_title: string | null;
      created_at: string | null;
      total: number;
      by_status: Array<{ admission_status: number; label: string; count: number }>;
    }>;
  }>> {
    // sessions newest-first (created_at desc) for stable ordering + titles.
    const sessionWhere: Prisma.sessionsWhereInput = { deleted_at: null };
    if (query.session_id !== undefined) {
      sessionWhere.session_id = query.session_id;
    }

    // The university_id filter scopes which students count (resolved via users).
    const base = this.enrollmentBaseWhere(query);
    const scoped = await this.applyUniversityFilter(base, query.university_id);

    const [sessions, grouped] = await Promise.all([
      this.prisma.sessions.findMany({
        where: sessionWhere,
        select: { session_id: true, session_title: true, created_at: true },
        orderBy: { created_at: 'desc' },
      }),
      scoped === null
        ? Promise.resolve(
            [] as Array<{
              session_id: number | null;
              admission_status: number | null;
              _count: { _all: number };
            }>,
          )
        : this.prisma.students.groupBy({
            by: ['session_id', 'admission_status'],
            where: scoped,
            _count: { _all: true },
          }),
    ]);

    const perSession = new Map<number, Map<number, number>>();
    for (const row of grouped) {
      if (row.session_id === null || row.admission_status === null) continue;
      let statusMap = perSession.get(row.session_id);
      if (!statusMap) {
        statusMap = new Map<number, number>();
        perSession.set(row.session_id, statusMap);
      }
      statusMap.set(
        row.admission_status,
        (statusMap.get(row.admission_status) ?? 0) + row._count._all,
      );
    }

    const by_intake = sessions.map((session) => {
      const breakdown = this.buildStatusBreakdown(
        perSession.get(session.session_id) ?? new Map<number, number>(),
      );
      return {
        session_id: session.session_id,
        session_title: session.session_title,
        created_at: session.created_at
          ? session.created_at.toISOString()
          : null,
        total: breakdown.total,
        by_status: breakdown.by_status,
      };
    });

    const data = { by_intake };

    const rows: CsvRow[] = by_intake.flatMap((i) =>
      i.by_status.map((s) => ({
        session_id: i.session_id,
        session_title: i.session_title ?? '',
        admission_status: s.admission_status,
        label: s.label,
        count: s.count,
      })),
    );

    return {
      data,
      csv: {
        rows,
        headers: [
          'session_id',
          'session_title',
          'admission_status',
          'label',
          'count',
        ],
      },
    };
  }

  // ---- enrollment PDF row loaders ------------------------------------------
  //
  // Used by EnrollmentPdfService. Each returns the status tally plus the
  // per-student rows the legacy print_* templates rendered. Student name/email
  // and consultant name come from `users` (no Prisma relation), so they're
  // batch-resolved to avoid N+1.

  /**
   * Loads the status tally + per-student rows for a single university. Mirrors
   * print_university_report(): all student-role users at the university, joined
   * to their students row, course title, session title, consultant name.
   */
  async enrollmentRowsForUniversity(universityId: number): Promise<{
    counts: EnrollmentStatusCounts;
    rows: Array<{
      name: string | null;
      email: string | null;
      university_name: string | null;
      course_name: string | null;
      session_title: string | null;
      consultant_name: string | null;
      enrollment_date: Date | null;
      status_label: string;
    }>;
  }> {
    const studentIds = await this.studentIdsForUniversity(universityId);
    const where: Prisma.studentsWhereInput =
      studentIds.length === 0
        ? { id: -1 } // no matches — yields an empty set without a broad scan
        : { deleted_at: null, student_id: { in: studentIds } };

    return this.loadEnrollmentRows(where, universityId);
  }

  /**
   * Loads the status tally + per-student rows for a single session/intake.
   * Mirrors print_intake_report().
   */
  async enrollmentRowsForSession(sessionId: number): Promise<{
    counts: EnrollmentStatusCounts;
    rows: Array<{
      name: string | null;
      email: string | null;
      university_name: string | null;
      course_name: string | null;
      session_title: string | null;
      consultant_name: string | null;
      enrollment_date: Date | null;
      status_label: string;
    }>;
  }> {
    const where: Prisma.studentsWhereInput = {
      deleted_at: null,
      session_id: sessionId,
    };
    return this.loadEnrollmentRows(where, undefined);
  }

  /**
   * Shared loader: fetches the matching students, batch-resolves the related
   * users (student + consultant), course titles, session titles, and (when not
   * pre-known) university titles, then assembles flat display rows + the tally.
   */
  private async loadEnrollmentRows(
    where: Prisma.studentsWhereInput,
    knownUniversityId: number | undefined,
  ): Promise<{
    counts: EnrollmentStatusCounts;
    rows: Array<{
      name: string | null;
      email: string | null;
      university_name: string | null;
      course_name: string | null;
      session_title: string | null;
      consultant_name: string | null;
      enrollment_date: Date | null;
      status_label: string;
    }>;
  }> {
    const students = await this.prisma.students.findMany({
      where,
      orderBy: { id: 'asc' },
    });

    if (students.length === 0) {
      return { counts: this.toStatusCounts(new Map()), rows: [] };
    }

    // Collect FK ids to batch-resolve (avoid N+1).
    const studentUserIds = [...new Set(students.map((s) => s.student_id))];
    const consultantIds = [
      ...new Set(students.map((s) => s.consultant_id).filter((id) => id != null)),
    ] as number[];
    const courseIds = [
      ...new Set(students.map((s) => s.course_id).filter((id) => id != null)),
    ] as number[];
    const sessionIds = [
      ...new Set(students.map((s) => s.session_id).filter((id) => id != null)),
    ] as number[];

    const [studentUsers, consultants, courses, sessions] = await Promise.all([
      this.prisma.users.findMany({
        where: { id: { in: studentUserIds } },
        select: { id: true, name: true, email: true, university_id: true },
      }),
      consultantIds.length
        ? this.prisma.users.findMany({
            where: { id: { in: consultantIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as Array<{ id: number; name: string | null }>),
      courseIds.length
        ? this.prisma.course.findMany({
            where: { id: { in: courseIds } },
            select: { id: true, title: true },
          })
        : Promise.resolve([] as Array<{ id: number; title: string | null }>),
      sessionIds.length
        ? this.prisma.sessions.findMany({
            where: { session_id: { in: sessionIds } },
            select: { session_id: true, session_title: true },
          })
        : Promise.resolve(
            [] as Array<{ session_id: number; session_title: string | null }>,
          ),
    ]);

    const userById = new Map(
      studentUsers.map((u) => [
        u.id,
        { name: u.name, email: u.email, university_id: u.university_id },
      ]),
    );
    const consultantById = new Map(consultants.map((c) => [c.id, c.name]));
    const courseById = new Map(courses.map((c) => [c.id, c.title]));
    const sessionById = new Map(sessions.map((s) => [s.session_id, s.session_title]));

    // University titles: resolve any referenced university ids (when not fixed).
    const universityIds = knownUniversityId
      ? [knownUniversityId]
      : ([
          ...new Set(
            studentUsers.map((u) => u.university_id).filter((id) => id != null),
          ),
        ] as number[]);
    const universities = universityIds.length
      ? await this.prisma.university.findMany({
          where: { id: { in: universityIds } },
          select: { id: true, title: true },
        })
      : [];
    const universityById = new Map(universities.map((u) => [u.id, u.title]));

    const statusLabelByCode = new Map(
      ADMISSION_STATUS_META.map((m) => [m.code, m.label]),
    );

    const countsByStatus = new Map<number, number>();
    const rows = students.map((s) => {
      const user = userById.get(s.student_id);
      const uniId = user?.university_id ?? null;
      if (s.admission_status !== null) {
        countsByStatus.set(
          s.admission_status,
          (countsByStatus.get(s.admission_status) ?? 0) + 1,
        );
      }
      return {
        name: user?.name ?? null,
        email: user?.email ?? null,
        university_name:
          uniId != null ? universityById.get(uniId) ?? null : null,
        course_name: s.course_id != null ? courseById.get(s.course_id) ?? null : null,
        session_title:
          s.session_id != null ? sessionById.get(s.session_id) ?? null : null,
        consultant_name:
          s.consultant_id != null
            ? consultantById.get(s.consultant_id) ?? null
            : null,
        enrollment_date: s.enrollment_date,
        status_label:
          s.admission_status != null
            ? statusLabelByCode.get(s.admission_status) ?? 'Unknown'
            : 'Unknown',
      };
    });

    return { counts: this.toStatusCounts(countsByStatus), rows };
  }

  // ---- teacher salary report -----------------------------------------------

  /** Inclusive UTC [start,end] window for a `YYYY-MM` month string. */
  private monthWindow(month: string): { start: Date; end: Date } {
    const [yearStr, monthStr] = month.split('-');
    const year = Number(yearStr);
    const monthIdx = Number(monthStr) - 1;
    const start = new Date(Date.UTC(year, monthIdx, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, monthIdx + 1, 0, 23, 59, 59, 999));
    return { start, end };
  }

  /** Bucket a demo-session wall-clock length to a {30,45,60} rate band. */
  private durationBand(
    fromTime: Date | null,
    toTime: Date | null,
  ): 30 | 45 | 60 {
    if (!fromTime || !toTime) {
      return 60;
    }
    const minutes = (toTime.getTime() - fromTime.getTime()) / MS_PER_MINUTE;
    if (minutes <= 0) return 60;
    if (minutes <= BAND_30_MAX_MINUTES) return 30;
    if (minutes <= BAND_45_MAX_MINUTES) return 45;
    return 60;
  }

  /**
   * Per-teacher salary report for a calendar month (port of
   * Teacher_salary_report::index). For every role_id=3 user it computes the
   * band x rate breakdown of completed demo_sessions in the month, the
   * confirmed-demo bonus, the month's recorded payments, and the resulting
   * balance. `month` defaults to the current month when omitted.
   */
  async teacherSalary(
    query: TeacherSalaryReportQueryDto,
  ): Promise<ReportResult<{
    month: string;
    rows: Array<{
      teacher_id: number;
      teacher_name: string | null;
      completed_sessions: number;
      total_salary: number;
      total_paid: number;
      balance: number;
    }>;
    totals: { total_salary: number; total_paid: number; balance: number };
  }>> {
    const month = query.month ?? new Date().toISOString().slice(0, 7);
    const { start, end } = this.monthWindow(month);

    const teachers = await this.prisma.users.findMany({
      where: { role_id: TEACHER_ROLE_ID, deleted_at: null },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });

    if (teachers.length === 0) {
      return {
        data: {
          month,
          rows: [],
          totals: { total_salary: 0, total_paid: 0, balance: 0 },
        },
        csv: {
          rows: [],
          headers: [
            'teacher_id',
            'teacher_name',
            'completed_sessions',
            'total_salary',
            'total_paid',
            'balance',
          ],
        },
      };
    }

    const teacherIds = teachers.map((t) => t.id);

    // Load all rate rows, completed sessions, and payments for the month in
    // three queries, then fold per teacher (avoids an N+1 per teacher).
    const [rates, sessions, payments] = await Promise.all([
      this.prisma.teacher_salary.findMany({
        where: { teacher_id: { in: teacherIds }, deleted_at: null },
        orderBy: { id: 'desc' },
      }),
      this.prisma.demo_sessions.findMany({
        where: {
          teacher_id: { in: teacherIds },
          deleted_at: null,
          teacher_status: true,
          scheduled_date: { gte: start, lte: end },
        },
        select: {
          teacher_id: true,
          from_time: true,
          to_time: true,
          lead_status: true,
        },
      }),
      this.prisma.salary_payment.findMany({
        where: {
          teacher_id: { in: teacherIds },
          deleted_at: null,
          payment_date: { gte: start, lte: end },
        },
        select: { teacher_id: true, paid_amount: true },
      }),
    ]);

    // Latest rate row wins (findMany above is ordered id desc, so the first seen
    // per teacher is the newest).
    const rateByTeacher = new Map<number, (typeof rates)[number]>();
    for (const r of rates) {
      if (r.teacher_id != null && !rateByTeacher.has(r.teacher_id)) {
        rateByTeacher.set(r.teacher_id, r);
      }
    }

    const paidByTeacher = new Map<number, number>();
    for (const p of payments) {
      if (p.teacher_id != null) {
        paidByTeacher.set(
          p.teacher_id,
          (paidByTeacher.get(p.teacher_id) ?? 0) + (p.paid_amount ?? 0),
        );
      }
    }

    const rows = teachers.map((t) => {
      const rate = rateByTeacher.get(t.id);
      const rate30 = rate?.salary_30 ?? 0;
      const rate45 = rate?.salary_45 ?? 0;
      const rate60 = rate?.salary_1 ?? 0;
      const demoRate = rate?.salary_confirmed_demo ?? 0;

      const own = sessions.filter((s) => s.teacher_id === t.id);
      let salary = 0;
      let demoCount = 0;
      for (const s of own) {
        const band = this.durationBand(s.from_time, s.to_time);
        salary += band === 30 ? rate30 : band === 45 ? rate45 : rate60;
        if (s.lead_status === true) {
          demoCount += 1;
        }
      }
      const totalSalary = salary + demoCount * demoRate;
      const totalPaid = paidByTeacher.get(t.id) ?? 0;

      return {
        teacher_id: t.id,
        teacher_name: t.name,
        completed_sessions: own.length,
        total_salary: totalSalary,
        total_paid: totalPaid,
        balance: totalSalary - totalPaid,
      };
    });

    const totals = rows.reduce(
      (acc, r) => ({
        total_salary: acc.total_salary + r.total_salary,
        total_paid: acc.total_paid + r.total_paid,
        balance: acc.balance + r.balance,
      }),
      { total_salary: 0, total_paid: 0, balance: 0 },
    );

    return {
      data: { month, rows, totals },
      csv: {
        rows: rows.map((r) => ({ ...r, teacher_name: r.teacher_name ?? '' })),
        headers: [
          'teacher_id',
          'teacher_name',
          'completed_sessions',
          'total_salary',
          'total_paid',
          'balance',
        ],
      },
    };
  }
}
