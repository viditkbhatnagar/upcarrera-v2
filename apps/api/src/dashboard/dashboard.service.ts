import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Port of CI4 App\Controllers\App\Dashboard (index / admin_dashboard /
 * consultant_dashboard).
 *
 * Legacy role ids (login_helper.php): admin = 1, telecaller/education-manager = 2,
 * student = 4, consultant = 6. The legacy index() branched: consultant ->
 * consultant view, admin -> admin view, else -> a telecaller-scoped lead/student
 * view (scoped by users.telecaller_id / leads.telecaller_id).
 *
 * Money columns are mixed types in this schema (payment.paid_amount is Float,
 * invoice.payable_amount is Float, the commission columns are Decimal). Every
 * aggregate is coerced to a plain `number` via toNumber() so the JSON envelope
 * never leaks a Prisma.Decimal object. All queries use groupBy/aggregate (no
 * N+1) and every path returns zeros on empty data.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // Legacy role ids (login_helper.php).
  private static readonly ROLE_ADMIN = 1;
  private static readonly ROLE_STUDENT = 4;
  private static readonly ROLE_CONSULTANT = 6;

  // consultant_target.type (Consultant_target::index): 1 = points target.
  private static readonly TARGET_TYPE_POINTS = 1;

  // students.admission_status -> label map (admin_dashboard $map).
  private static readonly ADMISSION_STATUS_LABELS: Record<number, string> = {
    0: 'Pending',
    1: 'In progress',
    2: 'Enrolled',
    3: 'Pass out',
    4: 'Dropout',
    5: 'Cancelled',
  };

  // Legacy lead_status_id used for the "follow up" bucket (index()).
  private static readonly LEAD_STATUS_FOLLOW_UP = 3;

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /** Coerce a Float / Decimal / number / null aggregate result to a plain number. */
  private toNumber(value: Prisma.Decimal | number | null | undefined): number {
    if (value === null || value === undefined) return 0;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isNaN(n) ? 0 : n;
  }

  /** First day of the current month at 00:00 (date-only, matches @db.Date columns). */
  private monthStart(year: number, month0: number): Date {
    return new Date(year, month0, 1);
  }

  /** First day of the NEXT month — used as an exclusive upper bound. */
  private nextMonthStart(year: number, month0: number): Date {
    return new Date(year, month0 + 1, 1);
  }

  // ===========================================================================
  // GET /dashboard — role-aware summary
  // ===========================================================================

  /**
   * Role-aware headline metrics for the authenticated user. Ports the legacy
   * index() branching:
   *   - admin (role 1): everything, unscoped.
   *   - consultant (role 6): students scoped by students.consultant_id; leads
   *     have no consultant column, so leads are scoped by telecaller_id = self
   *     (best-effort, matches the legacy non-admin branch).
   *   - other (telecaller etc.): leads & students scoped by telecaller_id = self.
   *
   * income.paid_today ports Payment_model::get_current_day_income (SUM
   * paid_amount where payment_date = today). income.pending ports
   * get_total_pending_amount (SUM invoice.payable_amount - SUM payment.paid_amount).
   */
  async getOverview(userId: number, roleId: number | null | undefined) {
    const isAdmin = roleId === DashboardService.ROLE_ADMIN;
    const isConsultant = roleId === DashboardService.ROLE_CONSULTANT;

    // --- lead scope -----------------------------------------------------------
    const leadWhere: Prisma.leadsWhereInput = { deleted_at: null };
    if (!isAdmin) {
      // Non-admins only see their own telecaller leads (legacy else-branch).
      leadWhere.telecaller_id = userId;
    }

    // --- student scope --------------------------------------------------------
    // Students are `users` rows (role 4). Consultants scope by the students
    // profile table (students.consultant_id); telecallers by users.telecaller_id.
    const studentUserWhere: Prisma.usersWhereInput = {
      deleted_at: null,
      role_id: DashboardService.ROLE_STUDENT,
    };
    if (isConsultant) {
      const profiles = await this.prisma.students.findMany({
        where: { consultant_id: userId, deleted_at: null },
        select: { student_id: true },
      });
      const ids = [...new Set(profiles.map((p) => p.student_id))];
      // in: [] would match every row in Prisma's filter, so guard with -1.
      studentUserWhere.id = { in: ids.length > 0 ? ids : [-1] };
    } else if (!isAdmin) {
      studentUserWhere.telecaller_id = userId;
    }

    const [
      leadGroups,
      followUpCount,
      activeStudents,
      totalStudents,
      courseCount,
      income,
      recentLeads,
      recentStudents,
    ] = await Promise.all([
      // Lead totals split by converted/open in one grouped query.
      this.prisma.leads.groupBy({
        by: ['is_converted'],
        where: leadWhere,
        _count: { _all: true },
      }),
      this.prisma.leads.count({
        where: {
          ...leadWhere,
          lead_status_id: DashboardService.LEAD_STATUS_FOLLOW_UP,
        },
      }),
      this.prisma.users.count({ where: { ...studentUserWhere, status: 1 } }),
      this.prisma.users.count({ where: studentUserWhere }),
      this.prisma.course.count({ where: { deleted_at: null } }),
      this.computeIncome(),
      this.prisma.leads.findMany({
        where: leadWhere,
        orderBy: { id: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          phone: true,
          email: true,
          lead_status_id: true,
          is_converted: true,
          created_at: true,
        },
      }),
      this.prisma.users.findMany({
        where: studentUserWhere,
        orderBy: { id: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          status: true,
          created_at: true,
        },
      }),
    ]);

    const totalLeads = leadGroups.reduce((s, g) => s + g._count._all, 0);
    // is_converted is an Int (0/1); "open" leads are the unconverted ones.
    const openLeads = leadGroups
      .filter((g) => g.is_converted !== 1)
      .reduce((s, g) => s + g._count._all, 0);

    return {
      role_id: roleId ?? null,
      scope: isAdmin ? 'admin' : isConsultant ? 'consultant' : 'telecaller',
      leads: {
        total: totalLeads,
        open: openLeads,
        converted: totalLeads - openLeads,
        follow_up: followUpCount,
      },
      students: {
        total: totalStudents,
        active: activeStudents,
        discontinued: totalStudents - activeStudents,
      },
      courses: { total: courseCount },
      income,
      recent: {
        leads: recentLeads,
        students: recentStudents,
      },
    };
  }

  /**
   * income.paid_today + paid_total + pending. Pending mirrors the legacy
   * get_total_pending_amount: SUM(invoice.payable_amount) - SUM(payment.paid_amount),
   * both across all live rows. Negative pending is clamped to 0.
   */
  private async computeIncome() {
    const today = new Date();
    const dayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const dayEnd = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 1,
    );

    const [paidTodayAgg, paidTotalAgg, payableAgg] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          deleted_at: null,
          payment_date: { gte: dayStart, lt: dayEnd },
        },
        _sum: { paid_amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { deleted_at: null },
        _sum: { paid_amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { deleted_at: null },
        _sum: { payable_amount: true },
      }),
    ]);

    const paidToday = this.toNumber(paidTodayAgg._sum.paid_amount);
    const paidTotal = this.toNumber(paidTotalAgg._sum.paid_amount);
    const payableTotal = this.toNumber(payableAgg._sum.payable_amount);
    const pending = Math.max(payableTotal - paidTotal, 0);

    return {
      paid_today: paidToday,
      paid_total: paidTotal,
      payable_total: payableTotal,
      pending,
    };
  }

  // ===========================================================================
  // GET /dashboard/admin — org-wide aggregates
  // ===========================================================================

  /**
   * Org-wide admin aggregates. Ports admin_dashboard():
   *   - enrollment counts by admission_status (mapped to labels).
   *   - students by state / gender / university.
   *   - 12-month achieved-points vs target-points trend for the given year.
   * Everything is one groupBy/aggregate per dimension (no per-row N+1).
   */
  async getAdminMetrics(year: number) {
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);

    const [
      admissionGroups,
      stateGroups,
      genderGroups,
      universityGroups,
      enrolledThisYear,
      totalStudents,
    ] = await Promise.all([
      // admission_status histogram (students table).
      this.prisma.students.groupBy({
        by: ['admission_status'],
        where: { deleted_at: null },
        _count: { _all: true },
      }),
      // students.state histogram (date in students profile).
      this.prisma.students.groupBy({
        by: ['state'],
        where: { deleted_at: null },
        _count: { _all: true },
      }),
      // gender lives on the users row (role 4).
      this.prisma.users.groupBy({
        by: ['gender'],
        where: { deleted_at: null, role_id: DashboardService.ROLE_STUDENT },
        _count: { _all: true },
      }),
      // university_id lives on the users row (role 4).
      this.prisma.users.groupBy({
        by: ['university_id'],
        where: { deleted_at: null, role_id: DashboardService.ROLE_STUDENT },
        _count: { _all: true },
      }),
      // Students enrolled in the selected year, for the monthly trend +
      // achieved points (joined to specialisation points by course).
      this.prisma.students.findMany({
        where: {
          deleted_at: null,
          enrollment_date: { gte: yearStart, lt: yearEnd },
        },
        select: { course_id: true, enrollment_date: true },
      }),
      this.prisma.students.count({ where: { deleted_at: null } }),
    ]);

    // --- admission_status card counts ----------------------------------------
    const byAdmissionStatus = this.labelAdmissionCounts(admissionGroups);

    // --- students by state ----------------------------------------------------
    const byState = stateGroups
      .map((g) => ({
        state:
          g.state && g.state.trim() !== '' ? g.state.trim() : 'Not Specified',
        count: g._count._all,
      }))
      // collapse blanks/nulls that mapped to the same bucket
      .reduce<Record<string, number>>((acc, row) => {
        acc[row.state] = (acc[row.state] ?? 0) + row.count;
        return acc;
      }, {});
    const studentsByState = this.sortStateBuckets(byState);

    // --- gender ---------------------------------------------------------------
    const studentGender = { Male: 0, Female: 0, Others: 0 };
    for (const g of genderGroups) {
      const key = (g.gender ?? '').toLowerCase();
      if (key === 'male') studentGender.Male += g._count._all;
      else if (key === 'female') studentGender.Female += g._count._all;
      else studentGender.Others += g._count._all;
    }

    // --- university -----------------------------------------------------------
    const studentsByUniversity = await this.resolveUniversityNames(
      universityGroups,
    );

    // --- 12-month trend (achieved points vs target points) -------------------
    const pointByCourse = await this.pointByCourseMap(
      [...new Set(enrolledThisYear.map((s) => s.course_id))].filter(
        (c): c is number => c != null,
      ),
    );

    const achievedPointsChart = new Array<number>(12).fill(0);
    const enrollmentsChart = new Array<number>(12).fill(0);
    for (const s of enrolledThisYear) {
      if (!s.enrollment_date) continue;
      const m = new Date(s.enrollment_date).getMonth();
      enrollmentsChart[m] += 1;
      if (s.course_id != null) {
        achievedPointsChart[m] += pointByCourse.get(s.course_id) ?? 0;
      }
    }

    const targetPointsChart = await this.targetPointsByMonth(year, null);

    return {
      year,
      total_students: totalStudents,
      card_count: { ...byAdmissionStatus, total: totalStudents },
      students_by_state: studentsByState,
      student_gender: studentGender,
      students_by_university: studentsByUniversity,
      trends: {
        months: this.monthLabels(),
        enrollments: enrollmentsChart,
        achieved_points: achievedPointsChart,
        target_points: targetPointsChart,
      },
    };
  }

  // ===========================================================================
  // GET /dashboard/consultant — consultant-scoped (role 6)
  // ===========================================================================

  /**
   * Consultant-scoped dashboard (consultant_dashboard()). Scoped to the
   * authenticated consultant's students (students.consultant_id = self):
   *   - current-month target points vs achieved points + achievement %.
   *   - current-month admissions count.
   *   - 12-month achieved-points / target-points / revenue trend.
   * Revenue = SUM(invoice.payable_amount) for the consultant's students,
   * bucketed by the invoice month (invoice.date / falls back to created_at).
   */
  async getConsultantMetrics(consultantId: number, year: number) {
    const now = new Date();
    const monthStart = this.monthStart(now.getFullYear(), now.getMonth());
    const monthEnd = this.nextMonthStart(now.getFullYear(), now.getMonth());

    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);

    const [profilesThisMonth, profilesThisYear, currentTarget] =
      await Promise.all([
        this.prisma.students.findMany({
          where: {
            consultant_id: consultantId,
            deleted_at: null,
            enrollment_date: { gte: monthStart, lt: monthEnd },
          },
          select: { course_id: true },
        }),
        this.prisma.students.findMany({
          where: {
            consultant_id: consultantId,
            deleted_at: null,
            enrollment_date: { gte: yearStart, lt: yearEnd },
          },
          select: { student_id: true, course_id: true, enrollment_date: true },
        }),
        // Current points target whose window contains today (legacy view query).
        this.prisma.consultant_target.findFirst({
          where: {
            consultant_id: consultantId,
            type: DashboardService.TARGET_TYPE_POINTS,
            deleted_at: null,
            from_date: { lte: now },
            to_date: { gte: now },
          },
          select: { value: true },
        }),
      ]);

    // Points map for every course referenced this year (one query).
    const courseIds = [
      ...new Set([
        ...profilesThisMonth.map((p) => p.course_id),
        ...profilesThisYear.map((p) => p.course_id),
      ]),
    ].filter((c): c is number => c != null);
    const pointByCourse = await this.pointByCourseMap(courseIds);

    const achievedPoints = profilesThisMonth.reduce(
      (sum, p) =>
        sum + (p.course_id != null ? (pointByCourse.get(p.course_id) ?? 0) : 0),
      0,
    );
    const targetPoint = this.toNumber(currentTarget?.value ?? 0);
    const achievementPercentage =
      targetPoint > 0
        ? Math.round((achievedPoints / targetPoint) * 10000) / 100
        : 0;

    // --- 12-month trends ------------------------------------------------------
    const achievedPointsChart = new Array<number>(12).fill(0);
    const admissionsChart = new Array<number>(12).fill(0);
    for (const p of profilesThisYear) {
      if (!p.enrollment_date) continue;
      const m = new Date(p.enrollment_date).getMonth();
      admissionsChart[m] += 1;
      if (p.course_id != null) {
        achievedPointsChart[m] += pointByCourse.get(p.course_id) ?? 0;
      }
    }

    const targetPointsChart = await this.targetPointsByMonth(year, consultantId);
    const revenueChart = await this.consultantRevenueByMonth(
      [...new Set(profilesThisYear.map((p) => p.student_id))],
      year,
    );

    return {
      year,
      target_point: targetPoint,
      achieved_points: achievedPoints,
      achievement_percentage: achievementPercentage,
      admissions_count: profilesThisMonth.length,
      trends: {
        months: this.monthLabels(),
        achieved_points: achievedPointsChart,
        target_points: targetPointsChart,
        admissions: admissionsChart,
        revenue: revenueChart,
      },
    };
  }

  // ===========================================================================
  // Shared aggregation helpers
  // ===========================================================================

  /** Label admission_status group counts, zero-filling every known status. */
  private labelAdmissionCounts(
    groups: { admission_status: number | null; _count: { _all: number } }[],
  ): Record<string, number> {
    const out: Record<string, number> = {};
    for (const label of Object.values(
      DashboardService.ADMISSION_STATUS_LABELS,
    )) {
      out[label] = 0;
    }
    for (const g of groups) {
      const label =
        DashboardService.ADMISSION_STATUS_LABELS[g.admission_status ?? 0] ??
        'Pending';
      out[label] += g._count._all;
    }
    return out;
  }

  /** Sort state buckets desc by count, pinning "Not Specified" to the end. */
  private sortStateBuckets(
    buckets: Record<string, number>,
  ): { state: string; count: number }[] {
    const entries = Object.entries(buckets);
    const notSpecified = entries.filter(([s]) => s === 'Not Specified');
    const rest = entries
      .filter(([s]) => s !== 'Not Specified')
      .sort((a, b) => b[1] - a[1]);
    return [...rest, ...notSpecified].map(([state, count]) => ({
      state,
      count,
    }));
  }

  /**
   * Resolve university_id buckets to names (one findMany), pinning the
   * null-university bucket to the end as "Others (No University)".
   */
  private async resolveUniversityNames(
    groups: { university_id: number | null; _count: { _all: number } }[],
  ): Promise<{ university_id: number | null; name: string; count: number }[]> {
    const ids = groups
      .map((g) => g.university_id)
      .filter((id): id is number => id != null);

    const universities =
      ids.length > 0
        ? await this.prisma.university.findMany({
            where: { id: { in: ids } },
            select: { id: true, title: true },
          })
        : [];
    const nameById = new Map(universities.map((u) => [u.id, u.title]));

    const named = groups
      .filter((g) => g.university_id != null)
      .map((g) => ({
        university_id: g.university_id,
        name: nameById.get(g.university_id as number) ?? 'Unknown',
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count);

    const others = groups
      .filter((g) => g.university_id == null)
      .reduce((sum, g) => sum + g._count._all, 0);

    if (others > 0) {
      named.push({
        university_id: null,
        name: 'Others (No University)',
        count: others,
      });
    }
    return named;
  }

  /**
   * Sum specialisations.point per course_id (point is a Text column, so each
   * value is coerced to a number). One findMany, returns a course_id -> points
   * map. Empty input -> empty map (never throws).
   */
  private async pointByCourseMap(
    courseIds: number[],
  ): Promise<Map<number, number>> {
    const ids = [...new Set(courseIds)].filter((c) => c != null);
    if (ids.length === 0) return new Map();

    const specs = await this.prisma.specialisations.findMany({
      where: { course_id: { in: ids }, deleted_at: null },
      select: { course_id: true, point: true },
    });

    const map = new Map<number, number>();
    for (const spec of specs) {
      if (spec.course_id == null) continue;
      const n = Number(spec.point);
      const add = Number.isNaN(n) ? 0 : n;
      map.set(spec.course_id, (map.get(spec.course_id) ?? 0) + add);
    }
    return map;
  }

  /**
   * 12-element array of target `value` for each month of `year`. A month's
   * target is the points-target row whose [from_date,to_date] window overlaps
   * that month. When consultantId is null, sums org-wide targets (admin view);
   * otherwise scopes to that consultant. One query, bucketed in memory.
   */
  private async targetPointsByMonth(
    year: number,
    consultantId: number | null,
  ): Promise<number[]> {
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);

    const targets = await this.prisma.consultant_target.findMany({
      where: {
        type: DashboardService.TARGET_TYPE_POINTS,
        deleted_at: null,
        ...(consultantId != null ? { consultant_id: consultantId } : {}),
        // Any target whose window intersects the year.
        from_date: { lt: yearEnd },
        to_date: { gte: yearStart },
      },
      select: { value: true, from_date: true, to_date: true },
    });

    const chart = new Array<number>(12).fill(0);
    for (let m = 0; m < 12; m++) {
      const mStart = this.monthStart(year, m);
      const mEnd = this.nextMonthStart(year, m);
      for (const t of targets) {
        if (!t.from_date || !t.to_date) continue;
        const from = new Date(t.from_date);
        const to = new Date(t.to_date);
        // window [from,to] overlaps month [mStart,mEnd)
        if (from < mEnd && to >= mStart) {
          chart[m] += this.toNumber(t.value);
        }
      }
    }
    return chart;
  }

  /**
   * 12-element monthly revenue (SUM invoice.payable_amount) for the given
   * students, bucketed by invoice month. invoice.date is the billing date;
   * when absent we fall back to created_at. One findMany + in-memory bucketing.
   */
  private async consultantRevenueByMonth(
    studentUserIds: number[],
    year: number,
  ): Promise<number[]> {
    const ids = [...new Set(studentUserIds)].filter((n) => n != null);
    const chart = new Array<number>(12).fill(0);
    if (ids.length === 0) return chart;

    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);

    const invoices = await this.prisma.invoice.findMany({
      where: { student_id: { in: ids }, deleted_at: null },
      select: { payable_amount: true, date: true, created_at: true },
    });

    for (const inv of invoices) {
      const when = inv.date ?? inv.created_at;
      if (!when) continue;
      const d = new Date(when);
      if (d < yearStart || d >= yearEnd) continue;
      chart[d.getMonth()] += this.toNumber(inv.payable_amount);
    }
    return chart;
  }

  /** Short month labels for chart axes (Jan..Dec). */
  private monthLabels(): string[] {
    return [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
  }
}
