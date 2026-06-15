import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  FollowupReportQueryDto,
  ReportQueryDto,
} from './dto/report-query.dto';
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
}
