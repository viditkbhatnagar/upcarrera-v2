import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import {
  Clock,
  Send,
  GraduationCap,
  RefreshCw,
  FileCheck2,
  MoreHorizontal,
  Filter,
  Download,
  CalendarRange,
  Activity,
  FileSignature,
  Loader2,
  AlertTriangle,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/enrollment/")({
  head: () => ({
    meta: [
      { title: "Enrollment Dashboard — upCarrera" },
      { name: "description", content: "Monitor enrollment processing and student progression across universities, courses and intakes." },
    ],
  }),
  component: EnrollmentDashboard,
});

type Tint = "primary" | "accent" | "success" | "warning" | "info";

const tintMap: Record<Tint, string> = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/10 text-accent",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning-foreground",
  info: "bg-primary/10 text-primary",
};

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// --- Live API wiring -------------------------------------------------------
// KPI counts come from GET /students/stats, whose service method studentStats()
// returns { total, by_status: { Pending, "In Progress", Enrolled, "Passed Out",
// Dropout, Cancelled } } (admissionStatusCounts groupBy over admission_status).
// The total applications count comes from GET /applications, whose
// listApplications() returns { items, total, page, limit }.
//
// Fields the API does NOT provide on this dashboard — the monthly enrolment
// trend series, per-university pending/submitted/confirmed/progression-due
// breakdown, per-intake approved/enrolled/pending split, and a live activity
// feed — are rendered as empty states / 0 rather than fabricated.
interface StudentStats {
  total: number;
  by_status: Record<string, number>;
}

interface ApplicationsList {
  items: unknown[];
  total: number;
  page: number;
  limit: number;
}

// Recent-enrollments table source: GET /students returns each `students` row
// decorated server-side with its joined display fields — name (users),
// university_title (course -> university), course_title (course) and a human
// admission_status_label — plus the raw enrollment_date column. We render those
// real values directly (no #id fallbacks).
interface ApiStudentRow {
  id: number | string;
  enrollment_date: string | null;
  created_at: string | null;
  name: string | null;
  university_title: string | null;
  course_title: string | null;
  admission_status_label: string | null;
}

interface StudentsListResponse {
  items: ApiStudentRow[];
  total: number;
  page: number;
  limit: number;
}

// admission_status_label -> badge styling. Falls back to neutral for unmapped.
const STATUS_BADGE: Record<string, string> = {
  Pending: "bg-warning/15 text-warning-foreground ring-warning/20",
  "In Progress": "bg-primary/10 text-primary ring-primary/20",
  Enrolled: "bg-success/10 text-success ring-success/20",
  "Passed Out": "bg-accent/10 text-accent ring-accent/20",
  Dropout: "bg-muted text-muted-foreground ring-border",
  Cancelled: "bg-destructive/10 text-destructive ring-destructive/20",
};

function statusBadge(label: string | null): string {
  return (label && STATUS_BADGE[label]) || "bg-muted text-muted-foreground ring-border";
}

function formatDate(value: string | null): string {
  if (!value) return EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

type KpiDef = {
  label: string;
  statusKey: string | null; // null -> use applications total
  icon: typeof FileCheck2;
  tint: Tint;
  hint: string;
};

// Each card maps to a real admission_status bucket from /students/stats, except
// "Total Applications" which is sourced from /applications total.
const KPI_DEFS: KpiDef[] = [
  { label: "Total Applications", statusKey: null, icon: FileCheck2, tint: "primary", hint: "All admission applications" },
  { label: "Enrollment Pending", statusKey: "Pending", icon: Clock, tint: "warning", hint: "Awaiting processing" },
  { label: "In Progress", statusKey: "In Progress", icon: FileSignature, tint: "info", hint: "Being processed" },
  { label: "Successfully Enrolled", statusKey: "Enrolled", icon: GraduationCap, tint: "success", hint: "Confirmed enrolment" },
  { label: "Passed Out", statusKey: "Passed Out", icon: Send, tint: "accent", hint: "Completed students" },
  { label: "Re-registration Pending", statusKey: "Dropout", icon: RefreshCw, tint: "primary", hint: "Dropout / continuing" },
];

// Funnel stages mapped onto the same real admission_status buckets.
const FUNNEL_DEFS: { stage: string; statusKey: string; icon: typeof FileCheck2; tint: Tint }[] = [
  { stage: "Pending", statusKey: "Pending", icon: Clock, tint: "warning" },
  { stage: "In Progress", statusKey: "In Progress", icon: FileSignature, tint: "info" },
  { stage: "Enrolled", statusKey: "Enrolled", icon: GraduationCap, tint: "success" },
  { stage: "Passed Out", statusKey: "Passed Out", icon: Send, tint: "accent" },
  { stage: "Dropout", statusKey: "Dropout", icon: RefreshCw, tint: "primary" },
];

const EMPTY = "—";

function KPICard({
  k,
  value,
  loading,
}: {
  k: KpiDef;
  value: number;
  loading: boolean;
}) {
  const Icon = k.icon;
  return (
    <button className="group text-left rounded-2xl border border-border bg-surface p-5 shadow-card transition hover:shadow-card-hover hover:-translate-y-0.5">
      <div className="flex items-start justify-between">
        <div className={`grid h-11 w-11 place-items-center rounded-xl ${tintMap[k.tint]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-5 text-[13px] font-medium text-muted-foreground">{k.label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        {loading ? (
          <div className="h-7 w-16 animate-pulse rounded bg-muted" />
        ) : (
          <div className="text-2xl font-bold tracking-tight text-foreground">
            {value.toLocaleString()}
          </div>
        )}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{k.hint}</div>
    </button>
  );
}

function EnrollmentDashboard() {
  // Live admission-status counts (drives KPIs + funnel).
  const statsQuery = useQuery({
    queryKey: ["enrollment", "student-stats"],
    queryFn: () => apiGet<StudentStats>("/students/stats"),
  });

  // Live total applications count (drives the "Total Applications" KPI).
  const applicationsQuery = useQuery({
    queryKey: ["enrollment", "applications", "count"],
    queryFn: () => apiGet<ApplicationsList>("/applications", { page: 1, limit: 1 }),
  });

  // Live recent enrollments — newest students with their joined university /
  // course / status names for the recent-enrollments table.
  const recentQuery = useQuery({
    queryKey: ["enrollment", "recent-students"],
    queryFn: () => apiGet<StudentsListResponse>("/students", { page: 1, limit: 8 }),
  });

  const byStatus = statsQuery.data?.by_status;
  const applicationsTotal = applicationsQuery.data?.total ?? 0;

  const recentRows = useMemo(() => recentQuery.data?.items ?? [], [recentQuery.data]);
  const recentLoading = recentQuery.isLoading;
  const recentError = recentQuery.isError;

  const statsLoading = statsQuery.isLoading;
  const statsError = statsQuery.isError;

  const kpiValueFor = (k: KpiDef): number => {
    if (k.statusKey === null) return applicationsTotal;
    return byStatus?.[k.statusKey] ?? 0;
  };

  const kpiLoadingFor = (k: KpiDef): boolean =>
    k.statusKey === null ? applicationsQuery.isLoading : statsLoading;

  // Funnel bars from the same real status buckets.
  const funnel = useMemo(
    () =>
      FUNNEL_DEFS.map((f) => ({
        ...f,
        count: byStatus?.[f.statusKey] ?? 0,
      })),
    [byStatus],
  );
  const maxFunnel = useMemo(() => Math.max(1, ...funnel.map((f) => f.count)), [funnel]);

  // The monthly trend series is not provided by the API — render an empty chart
  // state rather than fabricate a series.
  const trend: number[] = [];
  const hasTrend = trend.length > 0;

  // Intake / activity breakdowns are not exposed by the API for this dashboard —
  // render explicit empty states (no fabricated rows).
  const intakes: never[] = [];
  const activities: never[] = [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Enrollment Management</div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Enrollment Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor enrollment processing and student progression.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-muted">
            <Filter className="h-4 w-4" /> Filters
          </button>
          <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-muted">
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      {/* KPIs */}
      {statsError ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-12 text-center shadow-card">
          <AlertTriangle className="h-10 w-10 text-red-500/60" />
          <div className="text-sm font-semibold text-foreground">Couldn’t load enrollment stats</div>
          <div className="text-xs text-muted-foreground">
            {statsQuery.error instanceof Error ? statsQuery.error.message : "Please try again."}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {KPI_DEFS.map((k) => (
            <KPICard key={k.label} k={k} value={kpiValueFor(k)} loading={kpiLoadingFor(k)} />
          ))}
        </div>
      )}

      {/* Funnel + Trend */}
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-2 rounded-2xl border border-border bg-surface p-6 shadow-card">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-semibold tracking-tight text-foreground">Enrollment Funnel</h3>
              <p className="text-xs text-muted-foreground">Application → Enrollment lifecycle</p>
            </div>
          </div>
          {statsLoading ? (
            <div className="mt-8 flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground/50" />
              <div className="text-sm text-muted-foreground">Loading funnel…</div>
            </div>
          ) : (
            <div className="mt-5 space-y-2.5">
              {funnel.map((f, i) => {
                const Icon = f.icon;
                const pct = (f.count / maxFunnel) * 100;
                return (
                  <div key={f.stage}>
                    <div className="rounded-xl border border-border/70 p-3 transition hover:bg-muted/40">
                      <div className="flex items-center gap-3">
                        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tintMap[f.tint]}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-foreground">{f.stage}</span>
                            <span className="font-semibold tabular-nums text-foreground">{f.count.toLocaleString()}</span>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className={`h-full rounded-full ${tintMap[f.tint].split(" ")[0].replace("/10", "")}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                    {i < funnel.length - 1 && (
                      <div className="my-1 flex justify-center">
                        <div className="h-3 w-px bg-border" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="xl:col-span-3 rounded-2xl border border-border bg-surface p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold tracking-tight text-foreground">Enrollment Trend</h3>
              <p className="text-xs text-muted-foreground">Monthly enrolled students</p>
            </div>
          </div>

          {hasTrend ? (
            <div className="mt-6 flex h-56 items-end gap-2.5">
              {trend.map((v, i) => {
                const maxTrend = Math.max(1, ...trend);
                const h = (v / maxTrend) * 100;
                return (
                  <div key={i} className="group relative flex flex-1 flex-col items-center gap-1.5">
                    <div className="relative w-full">
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background opacity-0 transition group-hover:opacity-100">
                        {v}
                      </div>
                      <div
                        className="w-full rounded-md bg-gradient-to-t from-primary to-primary/60 transition-all group-hover:from-accent group-hover:to-accent/70"
                        style={{ height: `${Math.max(h * 1.6, 12)}px` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-6 flex h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center">
              <CalendarRange className="h-8 w-8 text-muted-foreground/40" />
              <div className="text-sm font-semibold text-foreground">No trend data</div>
              <div className="max-w-xs text-xs text-muted-foreground">
                Monthly enrolment history isn’t available from the API yet.
              </div>
            </div>
          )}
          <div className="mt-3 flex justify-between text-[11px] font-medium text-muted-foreground">
            {months.map(m => <span key={m} className="flex-1 text-center">{m}</span>)}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4">
            <div>
              <div className="text-[11px] text-muted-foreground">Total Enrolled</div>
              <div className="mt-0.5 text-lg font-semibold text-foreground tabular-nums">
                {statsLoading ? EMPTY : (byStatus?.["Enrolled"] ?? 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Peak Month</div>
              <div className="mt-0.5 text-lg font-semibold text-foreground">{EMPTY}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Avg / Month</div>
              <div className="mt-0.5 text-lg font-semibold text-foreground tabular-nums">{EMPTY}</div>
            </div>
          </div>
        </div>
      </div>

      {/* University + Intake summaries */}
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface shadow-card">
          <div className="flex items-center justify-between p-6 pb-4">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground">Recent Enrollments</h3>
                <p className="text-xs text-muted-foreground">Newest students by university, course &amp; status</p>
              </div>
            </div>
            <button className="text-xs font-semibold text-accent hover:underline">View all</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-2.5 font-semibold">Student</th>
                  <th className="px-3 py-2.5 font-semibold">University</th>
                  <th className="px-3 py-2.5 font-semibold">Course</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-6 py-2.5 font-semibold text-right">Enrolled</th>
                </tr>
              </thead>
              <tbody>
                {recentLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground/50" />
                        <div className="text-sm text-muted-foreground">Loading recent enrollments…</div>
                      </div>
                    </td>
                  </tr>
                ) : recentError ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <AlertTriangle className="h-8 w-8 text-red-500/60" />
                        <div className="text-sm font-semibold text-foreground">Couldn’t load recent enrollments</div>
                        <div className="text-xs text-muted-foreground">
                          {recentQuery.error instanceof Error ? recentQuery.error.message : "Please try again."}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : recentRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="h-8 w-8 text-muted-foreground/40" />
                        <div className="text-sm font-semibold text-foreground">No recent enrollments</div>
                        <div className="text-xs text-muted-foreground">
                          No students have been enrolled yet.
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  recentRows.map((s) => (
                    <tr key={String(s.id)} className="border-b border-border last:border-0 transition hover:bg-muted/40">
                      <td className="px-6 py-3">
                        <div className="font-medium text-foreground">
                          {s.name && s.name.trim() !== "" ? s.name : EMPTY}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">UPC00{s.id}</div>
                      </td>
                      <td className="px-3 py-3 text-foreground">
                        {s.university_title && s.university_title.trim() !== "" ? s.university_title : EMPTY}
                      </td>
                      <td className="px-3 py-3 text-foreground">
                        {s.course_title && s.course_title.trim() !== "" ? s.course_title : EMPTY}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${statusBadge(s.admission_status_label)}`}
                        >
                          {s.admission_status_label && s.admission_status_label.trim() !== ""
                            ? s.admission_status_label
                            : EMPTY}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right text-muted-foreground tabular-nums">
                        {formatDate(s.enrollment_date ?? s.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface shadow-card">
          <div className="flex items-center justify-between p-6 pb-4">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/10 text-accent">
                <CalendarRange className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground">Intake Summary</h3>
                <p className="text-xs text-muted-foreground">Enrollment status by intake session</p>
              </div>
            </div>
            <button className="text-xs font-semibold text-accent hover:underline">View all</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-2.5 font-semibold w-16">Sl No</th>
                  <th className="px-6 py-2.5 font-semibold">Intake</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Approved</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Enrolled</th>
                  <th className="px-6 py-2.5 font-semibold text-right">Pending</th>
                </tr>
              </thead>
              <tbody>
                {intakes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <CalendarRange className="h-8 w-8 text-muted-foreground/40" />
                        <div className="text-sm font-semibold text-foreground">No intake breakdown</div>
                        <div className="text-xs text-muted-foreground">
                          Per-intake enrolment status isn’t available from the API yet.
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent Activities */}
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-success/10 text-success">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold tracking-tight text-foreground">Recent Activities</h3>
              <p className="text-xs text-muted-foreground">Live enrollment events across teams &amp; universities</p>
            </div>
          </div>
        </div>

        {activities.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
            <Activity className="h-8 w-8 text-muted-foreground/40" />
            <div className="text-sm font-semibold text-foreground">No recent activity</div>
            <div className="max-w-sm text-xs text-muted-foreground">
              An enrolment activity feed isn’t available from the API yet.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
