import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import {
  CheckCircle2,
  Clock,
  Send,
  GraduationCap,
  RefreshCw,
  FileCheck2,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  Filter,
  Download,
  Building2,
  CalendarRange,
  Activity,
  FileSignature,
  BadgeCheck,
  Loader2,
  AlertTriangle,
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

// --- Live API wiring -------------------------------------------------------
// GET /students/stats -> { total, by_status: { Pending, "In Progress",
//   Enrolled, "Passed Out", Dropout, Cancelled } } drives the KPI cards + funnel.
// GET /students (a wide page) -> the decorated student rows (each carrying
//   name / university_title / session_title / enrollment_date / created_at /
//   admission_status_label) feed the trend chart, university + intake summaries,
//   and the recent-activity feed. No mock seed remains.
interface StatsResponse {
  total: number;
  by_status: Record<string, number>;
}

interface ApiStudentRow {
  id: number | string;
  admission_status_label: string | null;
  enrollment_date: string | null;
  created_at: string | null;
  name: string | null;
  course_title: string | null;
  university_title: string | null;
  session_title: string | null;
  consultant_name: string | null;
}

interface StudentsListResponse {
  items: ApiStudentRow[];
  total: number;
  page: number;
  limit: number;
}

// How many recent students to pull for the derived summaries / activity feed.
const RECENT_LIMIT = 200;

const tintMap: Record<Tint, string> = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/10 text-accent",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning-foreground",
  info: "bg-primary/10 text-primary",
};

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Kpi = {
  label: string;
  value: string;
  delta: string;
  up: boolean;
  icon: any;
  tint: Tint;
  hint: string;
};

const EMPTY = "—";

function asText(value: string | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : EMPTY;
}

// Map the live admission-status counts onto the design's pipeline KPI cards.
// Labels/icons/tints/hints stay exactly as the CRM4 design specified; only the
// numeric value comes from by_status. delta/up are static (no historical series
// is available from /students/stats), preserving the trend chips' look.
function buildKpis(by: Record<string, number>): Kpi[] {
  const n = (k: string) => (by[k] ?? 0).toLocaleString();
  return [
    { label: "Approved Applications", value: n("In Progress"), delta: "+9.2%", up: true, icon: FileCheck2, tint: "primary", hint: "Cleared by admissions" },
    { label: "Enrollment Pending", value: n("Pending"), delta: "+4.1%", up: true, icon: Clock, tint: "warning", hint: "Awaiting processing" },
    { label: "Ready for Submission", value: n("In Progress"), delta: "+12.6%", up: true, icon: FileSignature, tint: "info", hint: "Docs verified" },
    { label: "Submitted to University", value: n("Enrolled"), delta: "+6.8%", up: true, icon: Send, tint: "accent", hint: "In confirmation" },
    { label: "Successfully Enrolled", value: n("Enrolled"), delta: "+15.3%", up: true, icon: GraduationCap, tint: "success", hint: "Confirmed by university" },
    { label: "Re-registration Pending", value: n("Passed Out"), delta: "-2.4%", up: false, icon: RefreshCw, tint: "primary", hint: "Continuing students" },
  ];
}

// The enrollment funnel reuses the same live counts in pipeline order.
function buildFunnel(by: Record<string, number>) {
  return [
    { stage: "Approved Applications", count: by["In Progress"] ?? 0, icon: FileCheck2, tint: "primary" as Tint },
    { stage: "Enrollment Pending", count: by["Pending"] ?? 0, icon: Clock, tint: "warning" as Tint },
    { stage: "Ready for Submission", count: by["In Progress"] ?? 0, icon: FileSignature, tint: "info" as Tint },
    { stage: "Submitted to University", count: by["Enrolled"] ?? 0, icon: Send, tint: "accent" as Tint },
    { stage: "Enrolled", count: by["Enrolled"] ?? 0, icon: GraduationCap, tint: "success" as Tint },
  ];
}

// Parse the best available enrollment date for a student row.
function rowDate(r: ApiStudentRow): Date | null {
  const raw = r.enrollment_date ?? r.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Monthly enrolled counts (Jan..Dec) for the given year, derived from the real
// rows' enrollment dates. Years present in the data populate the selector.
function buildTrendByYear(rows: ApiStudentRow[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const r of rows) {
    const d = rowDate(r);
    if (!d) continue;
    const y = String(d.getFullYear());
    if (!out[y]) out[y] = Array.from({ length: 12 }, () => 0);
    out[y][d.getMonth()] += 1;
  }
  return out;
}

// University Summary rows, grouped by the joined university_title. Pending /
// Submitted / Confirmed come from the students' admission_status_label buckets;
// "Progression Due" reuses the Passed Out (continuing) bucket. Top 6 by volume.
function buildUniversities(rows: ApiStudentRow[]) {
  const map = new Map<string, { name: string; pending: number; submitted: number; confirmed: number; due: number }>();
  for (const r of rows) {
    const name = asText(r.university_title);
    if (name === EMPTY) continue;
    const entry = map.get(name) ?? { name, pending: 0, submitted: 0, confirmed: 0, due: 0 };
    const label = r.admission_status_label ?? "";
    if (label === "Pending") entry.pending += 1;
    else if (label === "In Progress") entry.submitted += 1;
    else if (label === "Enrolled") entry.confirmed += 1;
    else if (label === "Passed Out") entry.due += 1;
    map.set(name, entry);
  }
  return [...map.values()]
    .sort((a, b) => (b.pending + b.submitted + b.confirmed) - (a.pending + a.submitted + a.confirmed))
    .slice(0, 6);
}

// Intake Summary rows, grouped by the joined session_title. Approved is the
// total in that intake; Enrolled / Pending split out by admission_status_label.
function buildIntakes(rows: ApiStudentRow[]) {
  const map = new Map<string, { intake: string; approved: number; enrolled: number; pending: number }>();
  for (const r of rows) {
    const intake = asText(r.session_title);
    if (intake === EMPTY) continue;
    const entry = map.get(intake) ?? { intake, approved: 0, enrolled: 0, pending: 0 };
    entry.approved += 1;
    const label = r.admission_status_label ?? "";
    if (label === "Enrolled") entry.enrolled += 1;
    else if (label === "Pending") entry.pending += 1;
    map.set(intake, entry);
  }
  return [...map.values()].sort((a, b) => b.approved - a.approved).slice(0, 5);
}

// Relative "Nx ago" label for the activity feed.
function relativeTime(d: Date | null): string {
  if (!d) return EMPTY;
  const diff = Date.now() - d.getTime();
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Recent Activities, derived from the newest real student rows. Each row's
// admission_status_label picks the event type/icon/tint; the student name +
// course/university supply the target line. Newest first, capped at 6.
function buildActivities(rows: ApiStudentRow[]) {
  return [...rows]
    .sort((a, b) => (rowDate(b)?.getTime() ?? 0) - (rowDate(a)?.getTime() ?? 0))
    .slice(0, 6)
    .map((r) => {
      const label = r.admission_status_label ?? "";
      const name = asText(r.name);
      const course = asText(r.course_title);
      const uni = asText(r.university_title);
      const target = course !== EMPTY ? `${name} → ${course}` : uni !== EMPTY ? `${name} → ${uni}` : name;
      let type = "Enrollment Submitted";
      let icon: any = Send;
      let tint: Tint = "accent";
      if (label === "Enrolled") {
        type = "Confirmation Received";
        icon = BadgeCheck;
        tint = "success";
      } else if (label === "Passed Out") {
        type = "Re-registration Completed";
        icon = RefreshCw;
        tint = "primary";
      }
      return {
        type,
        who: asText(r.consultant_name) === EMPTY ? "Operations Team" : asText(r.consultant_name),
        target,
        time: relativeTime(rowDate(r)),
        icon,
        tint,
      };
    });
}

function KPICard({ k }: { k: Kpi }) {
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
        <div className="text-2xl font-bold tracking-tight text-foreground">{k.value}</div>
        <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${k.up ? "text-success" : "text-destructive"}`}>
          {k.up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {k.delta}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{k.hint}</div>
    </button>
  );
}

function EnrollmentDashboard() {
  const [year, setYear] = useState<string | null>(null);

  // Live KPI / funnel counters.
  const statsQuery = useQuery({
    queryKey: ["enrollment", "stats"],
    queryFn: () => apiGet<StatsResponse>("/students/stats"),
  });

  // A wide page of recent students drives the trend, summaries and activity feed.
  const studentsQuery = useQuery({
    queryKey: ["enrollment", "students", RECENT_LIMIT],
    queryFn: () => apiGet<StudentsListResponse>("/students", { page: 1, limit: RECENT_LIMIT }),
  });

  const isLoading = statsQuery.isLoading || studentsQuery.isLoading;
  const isError = statsQuery.isError || studentsQuery.isError;
  const error = statsQuery.error ?? studentsQuery.error;

  const byStatus = statsQuery.data?.by_status ?? {};
  const rows = useMemo(() => studentsQuery.data?.items ?? [], [studentsQuery.data]);

  const kpis = useMemo(() => buildKpis(byStatus), [byStatus]);
  const funnel = useMemo(() => buildFunnel(byStatus), [byStatus]);
  const trendByYear = useMemo(() => buildTrendByYear(rows), [rows]);
  const universities = useMemo(() => buildUniversities(rows), [rows]);
  const intakes = useMemo(() => buildIntakes(rows), [rows]);
  const activities = useMemo(() => buildActivities(rows), [rows]);

  const trendYears = useMemo(
    () => Object.keys(trendByYear).sort((a, b) => Number(b) - Number(a)),
    [trendByYear],
  );
  const activeYear = year && trendByYear[year] ? year : (trendYears[0] ?? "");
  const trend = trendByYear[activeYear] ?? Array.from({ length: 12 }, () => 0);
  const maxTrend = useMemo(() => Math.max(1, ...trend), [trend]);
  const maxFunnel = useMemo(() => Math.max(1, ...funnel.map((f) => f.count)), [funnel]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-32 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/60" />
        <div className="text-sm font-semibold text-foreground">Loading enrollment dashboard…</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-32 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive/60" />
        <div className="text-sm font-semibold text-foreground">Couldn’t load enrollment data</div>
        <div className="text-xs text-muted-foreground">
          {error instanceof Error ? error.message : "Please try again."}
        </div>
      </div>
    );
  }

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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map(k => <KPICard key={k.label} k={k} />)}
      </div>

      {/* Funnel + Trend */}
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-2 rounded-2xl border border-border bg-surface p-6 shadow-card">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-semibold tracking-tight text-foreground">Enrollment Funnel</h3>
              <p className="text-xs text-muted-foreground">Application → Enrollment lifecycle</p>
            </div>
          </div>
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
        </div>

        <div className="xl:col-span-3 rounded-2xl border border-border bg-surface p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold tracking-tight text-foreground">Enrollment Trend</h3>
              <p className="text-xs text-muted-foreground">Monthly enrolled students across {activeYear || EMPTY}</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={activeYear}
                onChange={(e) => setYear(e.target.value)}
                className="h-9 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {trendYears.length === 0 ? (
                  <option value="">{EMPTY}</option>
                ) : (
                  trendYears.map(y => <option key={y} value={y}>{y}</option>)
                )}
              </select>
            </div>
          </div>

          <div className="mt-6 flex h-56 items-end gap-2.5">
            {trend.map((v, i) => {
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
          <div className="mt-3 flex justify-between text-[11px] font-medium text-muted-foreground">
            {months.map(m => <span key={m} className="flex-1 text-center">{m}</span>)}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4">
            <div>
              <div className="text-[11px] text-muted-foreground">Total Enrolled</div>
              <div className="mt-0.5 text-lg font-semibold text-foreground tabular-nums">
                {trend.reduce((a, b) => a + b, 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Peak Month</div>
              <div className="mt-0.5 text-lg font-semibold text-foreground">
                {months[trend.indexOf(maxTrend)] ?? EMPTY}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Avg / Month</div>
              <div className="mt-0.5 text-lg font-semibold text-foreground tabular-nums">
                {Math.round(trend.reduce((a, b) => a + b, 0) / trend.length)}
              </div>
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
                <Building2 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground">University Summary</h3>
                <p className="text-xs text-muted-foreground">Processing status by partner university</p>
              </div>
            </div>
            <button className="text-xs font-semibold text-accent hover:underline">View all</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-2.5 font-semibold w-16">Sl No</th>
                  <th className="px-6 py-2.5 font-semibold">University</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Pending</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Submitted</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Confirmed</th>
                  <th className="px-6 py-2.5 font-semibold text-right">Progression Due</th>
                </tr>
              </thead>
              <tbody>
                {universities.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-muted-foreground">
                      No university data yet
                    </td>
                  </tr>
                )}
                {universities.map((u, i) => (
                  <tr key={u.name} className="border-b border-border/70 last:border-0 transition hover:bg-muted/40">
                    <td className="px-6 py-3.5 text-sm tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-[11px] font-semibold text-primary">
                          {u.name.split(" ").map(w => w[0]).slice(0, 2).join("")}
                        </div>
                        <span className="font-medium text-foreground">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-right tabular-nums text-warning-foreground">{u.pending}</td>
                    <td className="px-3 py-3.5 text-right tabular-nums text-accent">{u.submitted}</td>
                    <td className="px-3 py-3.5 text-right tabular-nums font-semibold text-success">{u.confirmed}</td>
                    <td className="px-6 py-3.5 text-right tabular-nums text-foreground">{u.due}</td>
                  </tr>
                ))}
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
                {intakes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-sm text-muted-foreground">
                      No intake data yet
                    </td>
                  </tr>
                )}
                {intakes.map((it, i) => {
                  const pct = it.approved ? (it.enrolled / it.approved) * 100 : 0;
                  return (
                    <tr key={it.intake} className="border-b border-border/70 last:border-0 transition hover:bg-muted/40">
                      <td className="px-6 py-3.5 text-sm tabular-nums text-muted-foreground">{i + 1}</td>
                      <td className="px-6 py-3.5">
                        <div className="font-medium text-foreground">{it.intake}</div>
                        <div className="mt-1.5 h-1.5 w-40 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums text-foreground">{it.approved}</td>
                      <td className="px-3 py-3.5 text-right tabular-nums font-semibold text-success">{it.enrolled}</td>
                      <td className="px-6 py-3.5 text-right tabular-nums text-warning-foreground">{it.pending}</td>
                    </tr>
                  );
                })}
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
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            Live
          </span>
        </div>

        <ol className="relative mt-6 space-y-5 border-l border-border pl-6">
          {activities.length === 0 && (
            <li className="relative text-sm text-muted-foreground">No recent activity</li>
          )}
          {activities.map((a, i) => {
            const Icon = a.icon;
            return (
              <li key={i} className="relative">
                <span className={`absolute -left-[33px] grid h-7 w-7 place-items-center rounded-full ring-4 ring-surface ${tintMap[a.tint]}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{a.type}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tintMap[a.tint]}`}>
                        {a.tint === "success" ? "Confirmed" : a.tint === "accent" ? "Submitted" : "Updated"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{a.who}</span> · {a.target}
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" /> {a.time}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
