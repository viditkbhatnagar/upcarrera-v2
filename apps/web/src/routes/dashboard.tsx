import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  ClipboardList,
  Wallet,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  CheckCircle2,
  Clock,
  AlertCircle,
  GraduationCap,
  Plus,
  Phone,
  Mail,
  FileCheck2,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/session";

// Shape of GET /api/dashboard (role-aware headline metrics).
interface DashboardResponse {
  role_id: number;
  scope: string;
  leads: { total: number; open: number; converted: number; follow_up: number };
  students: { total: number; active: number; discontinued: number };
  courses: { total: number };
  income: { paid_today: number; paid_total: number; payable_total: number; pending: number };
  recent: {
    leads: Array<{
      id: number;
      title: string;
      phone: string;
      email: string;
      lead_status_id: number;
      is_converted: number;
      created_at: string;
    }>;
    students: Array<{
      id: number;
      name: string;
      phone: string;
      email: string;
      status: string | number | null;
      created_at: string;
    }>;
  };
  // Action items assigned to the current user (follow-ups, document checks, etc.).
  tasks: Array<{
    title: string;
    due: string | null;
    priority?: string | null;
    type?: string | null;
  }>;
  // Cross-team activity feed (newest first).
  activity: Array<{
    type: string;
    title: string;
    when?: string | null;
    created_at?: string | null;
  }>;
  // Daily fee collection totals for the last 14 days.
  fee_trend: Array<{ date: string; amount: number }>;
}

// Compact INR formatter (Cr / L / k) so big rupee figures stay readable in the cards.
function formatInr(amount: number): string {
  const n = Number(amount) || 0;
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}k`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function initialsOf(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function formatDate(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Friendly "Today, 4:30 PM" / "12 Jun" style string for a task due date.
function formatDue(value: string | null | undefined): string {
  if (!value) return "No due date";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  if (sameDay(d, now)) return `Today, ${time}`;
  if (sameDay(d, tomorrow)) return `Tomorrow, ${time}`;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

// Relative "12m ago" / "3h ago" / date for an activity timestamp.
function formatRelative(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

// Short day label ("12 Jun") for the fee-trend x-axis.
function formatTrendDay(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

// Map a task type/priority to an icon + badge tone.
function taskVisual(t: { priority?: string | null; type?: string | null }): { Icon: typeof Users; label: string; tone: string } {
  const priority = (t.priority ?? "").toLowerCase();
  const type = (t.type ?? "").toLowerCase();
  const Icon =
    type.includes("call") || type.includes("phone") ? Phone :
    type.includes("mail") || type.includes("email") || type.includes("receipt") ? Mail :
    type.includes("document") || type.includes("verify") ? FileCheck2 :
    type.includes("counsel") || type.includes("admission") ? GraduationCap :
    ClipboardList;
  const label = t.priority ? t.priority.charAt(0).toUpperCase() + t.priority.slice(1).toLowerCase() : "Task";
  const tone =
    priority === "high" ? "bg-accent/10 text-accent" :
    priority === "medium" ? "bg-warning/15 text-warning-foreground" :
    "bg-muted text-muted-foreground";
  return { Icon, label, tone };
}

// Map an activity type to an icon + tone.
function activityVisual(type: string): { Icon: typeof Users; tone: string } {
  const t = (type ?? "").toLowerCase();
  if (t.includes("payment") || t.includes("fee") || t.includes("admission") || t.includes("convert") || t.includes("success")) {
    return { Icon: CheckCircle2, tone: "text-success bg-success/10" };
  }
  if (t.includes("escalat") || t.includes("ticket") || t.includes("alert") || t.includes("warn") || t.includes("overdue")) {
    return { Icon: AlertCircle, tone: "text-accent bg-accent/10" };
  }
  return { Icon: Clock, tone: "text-primary bg-primary/10" };
}

// Map a student admission_status (numeric/string) to a label + tone for the badge.
const STUDENT_STATUS: Record<string, { label: string; tone: "success" | "warn" | "info" }> = {
  "1": { label: "Pending", tone: "info" },
  "2": { label: "In Progress", tone: "warn" },
  "3": { label: "Enrolled", tone: "success" },
  "4": { label: "Dropout", tone: "warn" },
  "5": { label: "Pass Out", tone: "success" },
  "6": { label: "Cancelled", tone: "warn" },
};

function formatStudentStatus(status: string | number | null): { label: string; tone: "success" | "warn" | "info" } {
  if (status === null || status === undefined || status === "") return { label: "—", tone: "info" };
  const key = String(status);
  return STUDENT_STATUS[key] ?? { label: key, tone: "info" };
}

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — upCarrera Education" },
      { name: "description", content: "Operational dashboard for admissions, enrollments, fees and student success." },
    ],
  }),
  component: Dashboard,
});

type Stat = {
  label: string;
  value: string;
  delta: string;
  up: boolean;
  icon: typeof Users;
  tint: string;
};

// Build the four headline cards from the live dashboard payload.
// NOTE: deltas / "vs last month" are not provided by the API, so they are omitted.
function buildStats(d: DashboardResponse): Stat[] {
  return [
    { label: "Active Students", value: d.students.active.toLocaleString("en-IN"), delta: "", up: true, icon: Users, tint: "primary" },
    { label: "Converted Leads", value: d.leads.converted.toLocaleString("en-IN"), delta: "", up: true, icon: ClipboardList, tint: "accent" },
    { label: "Fees Collected", value: formatInr(d.income.paid_total), delta: "", up: true, icon: Wallet, tint: "primary" },
    { label: "Pending Fees", value: formatInr(d.income.pending), delta: "", up: false, icon: TrendingUp, tint: "accent" },
  ];
}

const statsFallback: Stat[] = [
  { label: "Active Students", value: "—", delta: "", up: true, icon: Users, tint: "primary" },
  { label: "Converted Leads", value: "—", delta: "", up: true, icon: ClipboardList, tint: "accent" },
  { label: "Fees Collected", value: "—", delta: "", up: true, icon: Wallet, tint: "primary" },
  { label: "Pending Fees", value: "—", delta: "", up: false, icon: TrendingUp, tint: "accent" },
];

type PipelineStage = { stage: string; count: number; pct: number; color: string };

// Derive the funnel from the lead/student aggregates the API returns.
function buildPipeline(d: DashboardResponse): PipelineStage[] {
  const stages = [
    { stage: "Total Leads", count: d.leads.total, color: "bg-primary" },
    { stage: "Open Leads", count: d.leads.open, color: "bg-primary/80" },
    { stage: "Follow-up", count: d.leads.follow_up, color: "bg-accent" },
    { stage: "Converted", count: d.leads.converted, color: "bg-accent/80" },
    { stage: "Active Students", count: d.students.active, color: "bg-success" },
  ];
  const max = Math.max(1, ...stages.map((s) => s.count));
  return stages.map((s) => ({ ...s, pct: Math.round((s.count / max) * 100) }));
}

function StatCard({ s }: { s: Stat }) {
  const Icon = s.icon;
  const tint = s.tint === "accent" ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary";
  return (
    <div className="group rounded-2xl border border-border bg-surface p-5 shadow-card transition hover:shadow-card-hover hover:-translate-y-0.5">
      <div className="flex items-start justify-between">
        <div className={`grid h-11 w-11 place-items-center rounded-xl ${tint}`}>
          <Icon className="h-5 w-5" />
        </div>
        <button className="text-muted-foreground hover:text-foreground">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-5 text-[13px] font-medium text-muted-foreground">{s.label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-2xl font-bold tracking-tight text-foreground">{s.value}</div>
        {s.delta ? (
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${s.up ? "text-success" : "text-destructive"}`}>
            {s.up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {s.delta}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">current period</div>
    </div>
  );
}

function Dashboard() {
  const firstName = getUser()?.name?.split(" ")[0] ?? "there";
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiGet<DashboardResponse>("/dashboard"),
  });

  const stats = data ? buildStats(data) : statsFallback;
  const pipeline = data ? buildPipeline(data) : [];
  const recentStudents = data?.recent?.students ?? [];
  const tasks = data?.tasks ?? [];
  const activity = data?.activity ?? [];
  const feeTrend = data?.fee_trend ?? [];
  const feeTrendMax = Math.max(1, ...feeTrend.map((p) => Number(p.amount) || 0));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overview</div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Welcome back, {firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here's a snapshot of admissions, fees and student success today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-muted">
            <Clock className="h-4 w-4" />
            Last 30 days
          </button>
          <button className="inline-flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground shadow-card hover:bg-accent-hover">
            <Plus className="h-4 w-4" />
            New Admission
          </button>
        </div>
      </div>

      {/* Error banner */}
      {isError ? (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error instanceof Error ? error.message : "Could not load dashboard data."}
        </div>
      ) : null}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => <StatCard key={s.label} s={s} />)}
      </div>

      {/* Two col */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* Pipeline + Chart */}
        <div className="xl:col-span-2 space-y-6">
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground">Admission Pipeline</h3>
                <p className="text-xs text-muted-foreground">Conversion across all active counsellors this month</p>
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 text-xs">
                {["Week", "Month", "Quarter"].map((p, i) => (
                  <button key={p} className={`rounded-md px-2.5 py-1 font-medium ${i === 1 ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5 space-y-3.5">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="h-3.5 w-24 animate-pulse rounded bg-muted" />
                      <span className="h-3.5 w-8 animate-pulse rounded bg-muted" />
                    </div>
                    <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
                  </div>
                ))
              ) : pipeline.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No pipeline data.</p>
              ) : (
                pipeline.map((p) => (
                  <div key={p.stage}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{p.stage}</span>
                      <span className="text-muted-foreground">{p.count}</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${p.color} transition-all`} style={{ width: `${p.pct}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Revenue chart */}
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground">Fee Collection Trend</h3>
                <p className="text-xs text-muted-foreground">Daily collections — last 14 days</p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-primary" />Collected
              </span>
            </div>
            {isLoading ? (
              <div className="mt-6 flex h-44 items-end gap-2">
                {Array.from({ length: 14 }).map((_, i) => (
                  <div key={i} className="flex-1 animate-pulse rounded-md bg-muted" style={{ height: `${30 + ((i * 37) % 60)}%` }} />
                ))}
              </div>
            ) : feeTrend.length === 0 ? (
              <div className="mt-6 flex h-44 flex-col items-center justify-center gap-2 text-center">
                <Wallet className="h-7 w-7 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">No fee collections in the last 14 days.</p>
              </div>
            ) : (
              <>
                <div className="mt-6 flex h-44 items-end gap-2">
                  {feeTrend.map((p) => {
                    const amount = Number(p.amount) || 0;
                    const pct = Math.max(amount > 0 ? 4 : 0, Math.round((amount / feeTrendMax) * 100));
                    return (
                      <div key={p.date} className="group relative flex flex-1 flex-col items-stretch justify-end">
                        <div
                          className="w-full rounded-md bg-primary transition-all group-hover:bg-primary-hover"
                          style={{ height: `${pct}%` }}
                        />
                        <div className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[10px] font-medium text-background opacity-0 shadow transition group-hover:opacity-100">
                          {formatInr(amount)} · {formatTrendDay(p.date)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex justify-between text-[10px] text-muted-foreground">
                  {feeTrend.map((p) => (
                    <span key={p.date}>{new Date(p.date).getDate() || ""}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tasks */}
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold tracking-tight text-foreground">My Tasks</h3>
              <p className="text-xs text-muted-foreground">Action items for today</p>
            </div>
            <button className="text-xs font-semibold text-accent hover:underline">View all</button>
          </div>
          {isLoading ? (
            <ul className="mt-5 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="flex items-start gap-3 rounded-xl border border-border/70 p-3">
                  <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-muted" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-24 animate-pulse rounded bg-muted" />
                  </div>
                  <div className="h-4 w-12 shrink-0 animate-pulse rounded-full bg-muted" />
                </li>
              ))}
            </ul>
          ) : tasks.length === 0 ? (
            <div className="mt-5 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
              <CheckCircle2 className="h-7 w-7 text-success/70" />
              <p className="text-sm font-medium text-foreground">You're all caught up</p>
              <p className="text-xs text-muted-foreground">No pending action items right now.</p>
            </div>
          ) : (
            <ul className="mt-5 space-y-3">
              {tasks.map((t, i) => {
                const { Icon, label, tone } = taskVisual(t);
                return (
                  <li key={`${t.title}-${i}`} className="flex items-start gap-3 rounded-xl border border-border/70 p-3 transition hover:bg-muted/50">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{t.title || "Untitled task"}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDue(t.due)}
                      </div>
                    </div>
                    {t.priority ? (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{label}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <button className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">
            <Plus className="h-4 w-4" /> Add task
          </button>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* Recent students table */}
        <div className="xl:col-span-2 rounded-2xl border border-border bg-surface shadow-card">
          <div className="flex items-center justify-between p-6 pb-4">
            <div>
              <h3 className="text-base font-semibold tracking-tight text-foreground">Recent Admissions</h3>
              <p className="text-xs text-muted-foreground">Latest students added to the pipeline</p>
            </div>
            <button className="text-xs font-semibold text-accent hover:underline">View all</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-2.5 font-semibold">Student</th>
                  <th className="px-3 py-2.5 font-semibold">Added</th>
                  <th className="px-3 py-2.5 font-semibold">Phone</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-6 py-2.5 font-semibold text-right">Fee</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/70 last:border-0">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
                          <div className="space-y-1.5">
                            <div className="h-3.5 w-28 animate-pulse rounded bg-muted" />
                            <div className="h-2.5 w-36 animate-pulse rounded bg-muted" />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5"><div className="h-3.5 w-16 animate-pulse rounded bg-muted" /></td>
                      <td className="px-3 py-3.5"><div className="h-3.5 w-20 animate-pulse rounded bg-muted" /></td>
                      <td className="px-3 py-3.5"><div className="h-5 w-20 animate-pulse rounded-full bg-muted" /></td>
                      <td className="px-6 py-3.5"><div className="ml-auto h-3.5 w-16 animate-pulse rounded bg-muted" /></td>
                    </tr>
                  ))
                ) : recentStudents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-sm text-muted-foreground">
                      No recent admissions yet.
                    </td>
                  </tr>
                ) : (
                  recentStudents.map((r) => {
                    const stage = formatStudentStatus(r.status);
                    const stageTone =
                      stage.tone === "success" ? "bg-success/10 text-success" :
                      stage.tone === "warn" ? "bg-accent/10 text-accent" :
                      "bg-primary/10 text-primary";
                    return (
                      <tr key={r.id} className="border-b border-border/70 last:border-0 transition hover:bg-muted/40">
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {initialsOf(r.name)}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-medium text-foreground">{r.name || "Unnamed"}</div>
                              <div className="truncate text-[11px] text-muted-foreground">{r.email || r.phone || "—"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-muted-foreground">{formatDate(r.created_at)}</td>
                        <td className="px-3 py-3.5 text-muted-foreground">{r.phone || "—"}</td>
                        <td className="px-3 py-3.5">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${stageTone}`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {stage.label}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right font-semibold text-muted-foreground">—</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Activity */}
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold tracking-tight text-foreground">Activity Feed</h3>
              <p className="text-xs text-muted-foreground">Live updates across teams</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
              Live
            </span>
          </div>
          {isLoading ? (
            <ul className="mt-5 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="flex gap-3">
                  <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="h-3.5 w-full animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-16 animate-pulse rounded bg-muted" />
                  </div>
                </li>
              ))}
            </ul>
          ) : activity.length === 0 ? (
            <div className="mt-5 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
              <Clock className="h-7 w-7 text-muted-foreground/60" />
              <p className="text-sm font-medium text-foreground">No recent activity</p>
              <p className="text-xs text-muted-foreground">Updates across teams will appear here.</p>
            </div>
          ) : (
            <ul className="mt-5 space-y-4">
              {activity.map((a, i) => {
                const { Icon, tone } = activityVisual(a.type);
                return (
                  <li key={i} className="flex gap-3">
                    <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${tone}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-foreground">{a.title}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{formatRelative(a.when ?? a.created_at)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
