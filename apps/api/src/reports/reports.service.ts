import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  FollowupReportQueryDto,
  ReportQueryDto,
} from './dto/report-query.dto';
import { EnrollmentReportQueryDto } from './dto/enrollment-report-query.dto';
import { TeacherSalaryReportQueryDto } from './dto/teacher-salary-report-query.dto';
import { InvoiceReportQueryDto } from './dto/invoice-report-query.dto';
import { FeePaymentReportQueryDto } from './dto/fee-payment-report-query.dto';
import { CourseReportQueryDto } from './dto/course-report-query.dto';
import { ConsultantPerformanceReportQueryDto } from './dto/consultant-performance-report-query.dto';
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

/** Role id of consultant users (legacy `users.role_id => 6`). */
const CONSULTANT_ROLE_ID = 6;

/** Stable CSV column order for the fee-payment report (header-only on empty). */
const FEE_PAYMENT_CSV_HEADERS = [
  'student_id',
  'student_name',
  'email',
  'university_id',
  'finance_id',
  'tuition_fees',
  'exam_fees',
  'misc_fees',
  'scholarship_details',
  'payment_status',
] as const;

/** Stable CSV column order for the consultant-performance report. */
const CONSULTANT_PERF_CSV_HEADERS = [
  'consultant_id',
  'name',
  'email',
  'phone',
  'status',
  'total_students',
  'total_revenue',
] as const;

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

  // ---- invoice report ------------------------------------------------------

  /**
   * GET /reports/invoices — invoice rows in the date window with per-invoice
   * paid totals, plus grand totals. Ports CI4 Invoice.php::index() (the row set
   * the Invoice_report view rendered): filter on invoice.date and optional
   * course_id / student_id, join the student name (users) and course title, and
   * fold each invoice's payments into total_paid + payment_count.
   *
   * Money columns are mixed types app-wide, so every amount is coerced via
   * toNumber. Student names, course titles, and payments are batch-resolved to
   * avoid the legacy N+1 (one payment query per invoice).
   */
  async invoices(query: InvoiceReportQueryDto): Promise<ReportResult<{
    rows: Array<{
      id: number;
      student_id: number | null;
      student_name: string | null;
      course_id: number | null;
      course_name: string | null;
      date: string | null;
      due_date: string | null;
      total_amount: number;
      discount_amount: number;
      payable_amount: number;
      total_paid: number;
      payment_count: number;
    }>;
    totals: {
      total_amount: number;
      discount_amount: number;
      payable_amount: number;
      total_paid: number;
      count: number;
    };
  }>> {
    const where: Prisma.invoiceWhereInput = { deleted_at: null };
    const range = this.dateRange(query.from_date, query.to_date);
    if (range) {
      where.date = range;
    }
    if (query.course_id !== undefined) {
      where.course_id = query.course_id;
    }
    if (query.student_id !== undefined) {
      where.student_id = query.student_id;
    }

    const invoiceRows = await this.prisma.invoice.findMany({
      where,
      orderBy: { id: 'desc' },
    });

    // Batch-resolve student users, course titles, and payments (avoid N+1).
    const studentIds = [
      ...new Set(invoiceRows.map((i) => i.student_id).filter((id) => id != null)),
    ] as number[];
    const courseIds = [
      ...new Set(invoiceRows.map((i) => i.course_id).filter((id) => id != null)),
    ] as number[];
    const invoiceIds = invoiceRows.map((i) => i.id);

    const [students, courses, payments] = await Promise.all([
      studentIds.length
        ? this.prisma.users.findMany({
            where: { id: { in: studentIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as Array<{ id: number; name: string | null }>),
      courseIds.length
        ? this.prisma.course.findMany({
            where: { id: { in: courseIds } },
            select: { id: true, title: true },
          })
        : Promise.resolve([] as Array<{ id: number; title: string | null }>),
      invoiceIds.length
        ? this.prisma.payment.findMany({
            where: { invoice_id: { in: invoiceIds }, deleted_at: null },
            select: { invoice_id: true, paid_amount: true },
          })
        : Promise.resolve(
            [] as Array<{ invoice_id: number | null; paid_amount: number | null }>,
          ),
    ]);

    const studentNameById = new Map(students.map((s) => [s.id, s.name]));
    const courseTitleById = new Map(courses.map((c) => [c.id, c.title]));

    // Fold payments into per-invoice paid total + count.
    const paidByInvoice = new Map<number, { total: number; count: number }>();
    for (const p of payments) {
      if (p.invoice_id == null) continue;
      const acc = paidByInvoice.get(p.invoice_id) ?? { total: 0, count: 0 };
      acc.total += this.toNumber(p.paid_amount);
      acc.count += 1;
      paidByInvoice.set(p.invoice_id, acc);
    }

    const rows = invoiceRows.map((inv) => {
      const paid = paidByInvoice.get(inv.id) ?? { total: 0, count: 0 };
      return {
        id: inv.id,
        student_id: inv.student_id,
        student_name:
          inv.student_id != null
            ? studentNameById.get(inv.student_id) ?? null
            : null,
        course_id: inv.course_id,
        course_name:
          inv.course_id != null
            ? courseTitleById.get(inv.course_id) ?? null
            : null,
        date: inv.date ? inv.date.toISOString().slice(0, 10) : null,
        due_date: inv.due_date ? inv.due_date.toISOString().slice(0, 10) : null,
        total_amount: this.toNumber(inv.total_amount),
        discount_amount: this.toNumber(inv.discount_amount),
        payable_amount: this.toNumber(inv.payable_amount),
        total_paid: paid.total,
        payment_count: paid.count,
      };
    });

    const totals = rows.reduce(
      (acc, r) => ({
        total_amount: acc.total_amount + r.total_amount,
        discount_amount: acc.discount_amount + r.discount_amount,
        payable_amount: acc.payable_amount + r.payable_amount,
        total_paid: acc.total_paid + r.total_paid,
        count: acc.count + 1,
      }),
      {
        total_amount: 0,
        discount_amount: 0,
        payable_amount: 0,
        total_paid: 0,
        count: 0,
      },
    );

    return {
      data: { rows, totals },
      csv: {
        rows: rows.map((r) => ({
          id: r.id,
          student_name: r.student_name ?? '',
          course_name: r.course_name ?? '',
          date: r.date ?? '',
          due_date: r.due_date ?? '',
          total_amount: r.total_amount,
          discount_amount: r.discount_amount,
          payable_amount: r.payable_amount,
          total_paid: r.total_paid,
          payment_count: r.payment_count,
        })),
        headers: [
          'id',
          'student_name',
          'course_name',
          'date',
          'due_date',
          'total_amount',
          'discount_amount',
          'payable_amount',
          'total_paid',
          'payment_count',
        ],
      },
    };
  }

  // ---- fee-payment report --------------------------------------------------

  /**
   * GET /reports/fee-payment (and the GET /reports/fee variant) — student-role
   * users joined to their `finance` row, filtered by users.created_at range,
   * users.university_id, and finance.payment_status. Ports
   * Fee_payment_report.php::fee_report() / Reports.php::fee_report() (same body).
   *
   * Schema notes (verified): finance.student_id = users.id; finance carries
   * tuitionFees / examFees / miscFees (Int?), scholarship_details, payment_status
   * (VarChar(20)). There is no Prisma relation between users and finance, so the
   * two are batch-joined in code (no N+1). Fee columns are coerced to number.
   */
  async feePayment(query: FeePaymentReportQueryDto): Promise<ReportResult<{
    rows: Array<{
      student_id: number;
      student_name: string | null;
      email: string | null;
      university_id: number | null;
      finance_id: number | null;
      tuition_fees: number;
      exam_fees: number;
      misc_fees: number;
      scholarship_details: string | null;
      payment_status: string | null;
    }>;
    totals: { tuition_fees: number; exam_fees: number; misc_fees: number; count: number };
  }>> {
    const userWhere: Prisma.usersWhereInput = {
      role_id: STUDENT_ROLE_ID,
      deleted_at: null,
    };
    const range = this.dateRange(query.from_date, query.to_date);
    if (range) {
      userWhere.created_at = range;
    }
    if (query.university_id !== undefined) {
      userWhere.university_id = query.university_id;
    }

    const studentUsers = await this.prisma.users.findMany({
      where: userWhere,
      select: {
        id: true,
        name: true,
        email: true,
        university_id: true,
      },
      orderBy: { id: 'desc' },
    });

    if (studentUsers.length === 0) {
      return {
        data: {
          rows: [],
          totals: { tuition_fees: 0, exam_fees: 0, misc_fees: 0, count: 0 },
        },
        csv: { rows: [], headers: FEE_PAYMENT_CSV_HEADERS.slice() },
      };
    }

    // Finance rows for those students (inner-join semantics: the legacy used a
    // plain join on finance, so only students WITH a finance row appear).
    const financeWhere: Prisma.financeWhereInput = {
      student_id: { in: studentUsers.map((u) => u.id) },
      deleted_at: null,
    };
    if (query.payment_status !== undefined) {
      financeWhere.payment_status = query.payment_status;
    }
    const financeRows = await this.prisma.finance.findMany({
      where: financeWhere,
    });

    const userById = new Map(studentUsers.map((u) => [u.id, u]));

    const rows = financeRows.map((f) => {
      const user = userById.get(f.student_id);
      return {
        student_id: f.student_id,
        student_name: user?.name ?? null,
        email: user?.email ?? null,
        university_id: user?.university_id ?? null,
        finance_id: f.id,
        tuition_fees: this.toNumber(f.tuitionFees),
        exam_fees: this.toNumber(f.examFees),
        misc_fees: this.toNumber(f.miscFees),
        scholarship_details: f.scholarship_details,
        payment_status: f.payment_status,
      };
    });

    const totals = rows.reduce(
      (acc, r) => ({
        tuition_fees: acc.tuition_fees + r.tuition_fees,
        exam_fees: acc.exam_fees + r.exam_fees,
        misc_fees: acc.misc_fees + r.misc_fees,
        count: acc.count + 1,
      }),
      { tuition_fees: 0, exam_fees: 0, misc_fees: 0, count: 0 },
    );

    return {
      data: { rows, totals },
      csv: {
        rows: rows.map((r) => ({
          student_id: r.student_id,
          student_name: r.student_name ?? '',
          email: r.email ?? '',
          university_id: r.university_id ?? '',
          finance_id: r.finance_id ?? '',
          tuition_fees: r.tuition_fees,
          exam_fees: r.exam_fees,
          misc_fees: r.misc_fees,
          scholarship_details: r.scholarship_details ?? '',
          payment_status: r.payment_status ?? '',
        })),
        headers: FEE_PAYMENT_CSV_HEADERS.slice(),
      },
    };
  }

  // ---- course report -------------------------------------------------------

  /**
   * GET /reports/courses — courses in the created_at window (optionally filtered
   * by level), with active/inactive counts. Ports
   * Fee_payment_report.php::course_wise_report(): the view rendered the course
   * list plus the count of status=1 (active) vs not (inactive).
   *
   * course.status is an Int? (1 = active in the legacy view); anything other
   * than 1 — including NULL — is counted inactive, matching the legacy
   * `if (status == 1) active else inactive` branch.
   */
  async courses(query: CourseReportQueryDto): Promise<ReportResult<{
    active_count: number;
    inactive_count: number;
    total: number;
    rows: Array<{
      id: number;
      title: string | null;
      level: string | null;
      stream: string | null;
      university_id: number | null;
      status: number | null;
      created_at: string | null;
    }>;
  }>> {
    const where: Prisma.courseWhereInput = { deleted_at: null };
    const range = this.dateRange(query.from_date, query.to_date);
    if (range) {
      where.created_at = range;
    }
    if (query.level !== undefined) {
      where.level = query.level;
    }

    const courseRows = await this.prisma.course.findMany({
      where,
      select: {
        id: true,
        title: true,
        level: true,
        stream: true,
        university_id: true,
        status: true,
        created_at: true,
      },
      orderBy: { id: 'desc' },
    });

    let activeCount = 0;
    let inactiveCount = 0;
    const rows = courseRows.map((c) => {
      if (c.status === 1) {
        activeCount += 1;
      } else {
        inactiveCount += 1;
      }
      return {
        id: c.id,
        title: c.title,
        level: c.level,
        stream: c.stream,
        university_id: c.university_id,
        status: c.status,
        created_at: c.created_at ? c.created_at.toISOString() : null,
      };
    });

    return {
      data: {
        active_count: activeCount,
        inactive_count: inactiveCount,
        total: rows.length,
        rows,
      },
      csv: {
        rows: rows.map((r) => ({
          id: r.id,
          title: r.title ?? '',
          level: r.level ?? '',
          stream: r.stream ?? '',
          university_id: r.university_id ?? '',
          status: r.status ?? '',
          created_at: r.created_at ?? '',
        })),
        headers: [
          'id',
          'title',
          'level',
          'stream',
          'university_id',
          'status',
          'created_at',
        ],
      },
    };
  }

  // ---- consultant performance report ---------------------------------------

  /**
   * GET /reports/consultant-performance — every consultant (role_id = 6) with
   * their student count and revenue. Ports Reports.php::consultant_performance_
   * report(): filter consultants by search_key (name/phone/email LIKE) and
   * status, then for each count their students and sum a revenue figure.
   *
   * ADAPTATION: the legacy summed `students.fee`, but this migration's `students`
   * model has NO `fee` column. Revenue is therefore the sum of PAID amounts on
   * the consultant's students' invoices (invoice.student_id = the student user's
   * id; payment.invoice_id; non-deleted), which is the faithful "revenue"
   * reading and uses only real columns. The per-consultant student count is the
   * number of non-deleted `students` rows with that consultant_id.
   *
   * Avoids the legacy N+1 (one students query per consultant): students are
   * grouped by consultant_id once, and all relevant invoices/payments are loaded
   * in two queries and folded in memory.
   */
  async consultantPerformance(
    query: ConsultantPerformanceReportQueryDto,
  ): Promise<ReportResult<{
    rows: Array<{
      consultant_id: number;
      name: string | null;
      email: string | null;
      phone: string | null;
      status: number | null;
      total_students: number;
      total_revenue: number;
    }>;
    totals: { total_students: number; total_revenue: number; consultants: number };
  }>> {
    const where: Prisma.usersWhereInput = {
      role_id: CONSULTANT_ROLE_ID,
      deleted_at: null,
    };
    if (query.search_key) {
      const key = query.search_key;
      where.OR = [
        { name: { contains: key } },
        { phone: { contains: key } },
        { email: { contains: key } },
      ];
    }
    if (query.status !== undefined) {
      where.status = query.status;
    }

    const consultants = await this.prisma.users.findMany({
      where,
      select: { id: true, name: true, email: true, phone: true, status: true },
      orderBy: { id: 'asc' },
    });

    if (consultants.length === 0) {
      return {
        data: {
          rows: [],
          totals: { total_students: 0, total_revenue: 0, consultants: 0 },
        },
        csv: { rows: [], headers: CONSULTANT_PERF_CSV_HEADERS.slice() },
      };
    }

    const consultantIds = consultants.map((c) => c.id);

    // All non-deleted students attached to these consultants, in one pass. We
    // keep both the per-consultant count and the student->consultant map (the
    // latter to attribute invoice revenue back to the right consultant).
    const studentRows = await this.prisma.students.findMany({
      where: { consultant_id: { in: consultantIds }, deleted_at: null },
      select: { student_id: true, consultant_id: true },
    });

    const studentCountByConsultant = new Map<number, number>();
    const consultantByStudentUser = new Map<number, number>();
    for (const s of studentRows) {
      studentCountByConsultant.set(
        s.consultant_id,
        (studentCountByConsultant.get(s.consultant_id) ?? 0) + 1,
      );
      // student_id is the student's users.id; map it to its consultant so we can
      // attribute invoice/payment revenue. If a student user is shared across
      // consultants (shouldn't happen), the last write wins — acceptable here.
      consultantByStudentUser.set(s.student_id, s.consultant_id);
    }

    // Revenue: paid amounts on these students' invoices. Resolve invoices for
    // the student users, then their payments, and fold paid -> consultant.
    const studentUserIds = [...consultantByStudentUser.keys()];
    const revenueByConsultant = new Map<number, number>();
    if (studentUserIds.length > 0) {
      const invoices = await this.prisma.invoice.findMany({
        where: { student_id: { in: studentUserIds }, deleted_at: null },
        select: { id: true, student_id: true },
      });
      const invoiceConsultant = new Map<number, number>();
      for (const inv of invoices) {
        if (inv.student_id == null) continue;
        const consultantId = consultantByStudentUser.get(inv.student_id);
        if (consultantId !== undefined) {
          invoiceConsultant.set(inv.id, consultantId);
        }
      }
      const invoiceIds = [...invoiceConsultant.keys()];
      if (invoiceIds.length > 0) {
        const payments = await this.prisma.payment.findMany({
          where: { invoice_id: { in: invoiceIds }, deleted_at: null },
          select: { invoice_id: true, paid_amount: true },
        });
        for (const p of payments) {
          if (p.invoice_id == null) continue;
          const consultantId = invoiceConsultant.get(p.invoice_id);
          if (consultantId === undefined) continue;
          revenueByConsultant.set(
            consultantId,
            (revenueByConsultant.get(consultantId) ?? 0) +
              this.toNumber(p.paid_amount),
          );
        }
      }
    }

    const rows = consultants.map((c) => ({
      consultant_id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      status: c.status,
      total_students: studentCountByConsultant.get(c.id) ?? 0,
      total_revenue: revenueByConsultant.get(c.id) ?? 0,
    }));

    const totals = rows.reduce(
      (acc, r) => ({
        total_students: acc.total_students + r.total_students,
        total_revenue: acc.total_revenue + r.total_revenue,
        consultants: acc.consultants + 1,
      }),
      { total_students: 0, total_revenue: 0, consultants: 0 },
    );

    return {
      data: { rows, totals },
      csv: {
        rows: rows.map((r) => ({
          consultant_id: r.consultant_id,
          name: r.name ?? '',
          email: r.email ?? '',
          phone: r.phone ?? '',
          status: r.status ?? '',
          total_students: r.total_students,
          total_revenue: r.total_revenue,
        })),
        headers: CONSULTANT_PERF_CSV_HEADERS.slice(),
      },
    };
  }

  /**
   * Call-log summary. Port of App\Controllers\Api\Report::index()'s
   * call_overview block (incoming/outgoing/missed/declined counts + distinct
   * contacts).
   *
   * TODO(prod-table): the `call_log` table is NOT present in schema.prisma, so
   * there is nothing to aggregate here. We return a well-formed zeroed summary
   * (HTTP 200) rather than referencing a non-existent prisma model. When the
   * production `call_log` table is added, aggregate by `type`
   * (1=incoming, 2=outgoing, 3=missed, 0=declined) over the optional date /
   * telecaller window and count distinct phone numbers for unique_contacts.
   */
  calls(): {
    incoming: number;
    outgoing: number;
    missed: number;
    declined: number;
    unique_contacts: number;
  } {
    return {
      incoming: 0,
      outgoing: 0,
      missed: 0,
      declined: 0,
      unique_contacts: 0,
    };
  }
}
