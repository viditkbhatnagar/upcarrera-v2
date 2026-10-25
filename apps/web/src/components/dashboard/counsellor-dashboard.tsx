import { useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  ClipboardList,
  GraduationCap,
  Percent,
  Target,
  Timer,
  TrendingUp,
  UserMinus,
  Users,
} from "lucide-react";
import { KpiCard } from "@/components/counsellor/dashboard/kpi-card";
import { TargetProgress } from "@/components/counsellor/dashboard/target-progress";
import { AdmissionsChart } from "@/components/counsellor/dashboard/admissions-chart";
import { CoursePerformance } from "@/components/counsellor/dashboard/course-performance";
import { RecentActivity } from "@/components/counsellor/dashboard/recent-activity";
import { RecentTables } from "@/components/counsellor/dashboard/recent-tables";
import {
  useApplicationsSummary,
  useStudentsSummary,
} from "@/components/counsellor/dashboard/use-dashboard-data";
import { useConsultantMetrics } from "@/components/counsellor/use-consultant-metrics";

const nf = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-IN");

/**
 * Counsellor dashboard (Naji's design) wired to the real, counsellor-scoped APIs:
 *   GET /dashboard/consultant -> target / achieved / % / month + YTD enrollments, chart trends
 *   GET /applications         -> application counts per stage, newest applications
 *   GET /students             -> enrolled total, dropouts, course mix
 * Metrics with no real backing (period-over-period deltas) are omitted.
 */
export function CounsellorDashboard() {
  const navigate = useNavigate();
  const metrics = useConsultantMetrics();
  const apps = useApplicationsSummary();
  const students = useStudentsSummary();

  const m = metrics.data;
  const counts = apps.data?.counts;
  const pct = Math.round(m?.achievement_percentage ?? 0);
  const remaining = Math.max(0, (m?.target_point ?? 0) - (m?.achieved_points ?? 0));
  const ytdEnrollments = (m?.trends.admissions ?? []).reduce((a, b) => a + b, 0);
  const monthName = new Date().toLocaleDateString("en-IN", { month: "long" });

  const goApps = () => navigate({ to: "/students/applications" });
  const goEnr = () => navigate({ to: "/students/students" });

  return (
    <>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Monthly Target Points"
          value={nf(m?.target_point)}
          icon={Target}
          tone="primary"
          progress={m ? 100 : undefined}
          sub={`Goal for ${monthName}`}
          loading={metrics.isLoading}
        />
        <KpiCard
          label="Target Achieved"
          value={nf(m?.achieved_points)}
          icon={TrendingUp}
          tone="success"
          progress={pct}
          sub={m && m.target_point > 0 ? `${nf(remaining)} points to go` : "No target set"}
          loading={metrics.isLoading}
        />
        <KpiCard
          label="Achieved %"
          value={`${pct}%`}
          icon={Percent}
          tone="info"
          progress={pct}
          sub="Of this month's target"
          loading={metrics.isLoading}
        />
        <KpiCard
          label="Current Month Enrollments"
          value={nf(m?.admissions_count)}
          icon={Users}
          tone="success"
          sub="Enrolled this month"
          loading={metrics.isLoading}
        />
        <KpiCard
          label="Enrollments - YTD"
          value={nf(ytdEnrollments)}
          icon={CalendarDays}
          tone="primary"
          sub="Year-to-date enrollments"
          loading={metrics.isLoading}
        />
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Applications"
          value={nf(apps.data?.total)}
          icon={ClipboardList}
          tone="info"
          sub="Open My Applications"
          loading={apps.isLoading}
          onClick={goApps}
        />
        <KpiCard
          label="Approval Waiting"
          value={nf(counts?.sa_verification)}
          icon={Timer}
          tone="warning"
          sub="Forms awaiting approval"
          loading={apps.isLoading}
          onClick={goApps}
        />
        <KpiCard
          label="Total Enrollments"
          value={nf(students.data?.total)}
          icon={GraduationCap}
          tone="success"
          sub="Open My Enrollments"
          loading={students.isLoading}
          onClick={goEnr}
        />
        <KpiCard
          label="Dropout Students"
          value={nf(students.data?.counts.by_status["Dropout"])}
          icon={UserMinus}
          tone="destructive"
          sub="Marked as dropout"
          loading={students.isLoading}
          onClick={goEnr}
        />
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        <TargetProgress
          target={m?.target_point ?? 0}
          achieved={m?.achieved_points ?? 0}
          loading={metrics.isLoading}
        />
        <div className="lg:col-span-2">
          <AdmissionsChart trends={m?.trends} year={m?.year} loading={metrics.isLoading} />
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CoursePerformance
            students={students.data?.items}
            total={students.data?.total ?? 0}
            loading={students.isLoading}
          />
        </div>
        <RecentActivity rows={apps.data?.items} loading={apps.isLoading} />
      </div>

      <RecentTables counts={counts} />
    </>
  );
}
