import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
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
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — upCarrera Education" },
      { name: "description", content: "Operational dashboard for admissions, enrollments, fees and student success." },
    ],
  }),
  component: Dashboard,
});

// ---------------- Live API wiring -------------------------------------------
// Every data variable below (stats / pipeline / tasks / activity, plus the
// Recent-Admissions table rows and Fee-Collection-Trend bars) is derived from a
// SINGLE call: GET /dashboard -> getOverview() in
// apps/api/src/dashboard/dashboard.service.ts. The returned JSX shape of each
// variable is byte-identical to the old mock literal; only the SOURCE changed.
//
// Payload (DashboardService.getOverview):
//   leads:    { total, open, converted, follow_up }
//   students: { total, active, discontinued }
//   courses:  { total }
//   income:   { paid_today, paid_total, payable_total, pending }
//   recent:   { leads:[...], students:[{ id,name,phone,email,status,created_at }] }
//   tasks:    [{ id,type,lead_title,lead_phone,status_title,remarks,due_date,... }]
//   activity: [{ type:'lead'|'student'|'payment', id, title, amount, at }]
//   fee_trend:[{ date:'YYYY-MM-DD', amount }]  (always 14, oldest -> newest)
//
// Fields the API does NOT expose (deltas, per-stage doc/fee-payment counts,
// student program/university/fee, ticket ids) are rendered as "—"/0 / omitted,
// never fabricated.

interface DashboardOverview {
  role_id: number | null;
  scope: string;
  leads: { total: number; open: number; converted: number; follow_up: number };
  students: { total: number; active: number; discontinued: number };
  courses: { total: number };
  income: {
    paid_today: number;
    paid_total: number;
    payable_total: number;
    pending: number;
  };
  recent: {
    leads: { id: number; title: string | null; phone: string | null; email: string | null; lead_status_id: number | null; is_converted: number | null; created_at: string | null }[];
    students: { id: number; name: string | null; phone: string | null; email: string | null; status: number | null; created_at: string | null }[];
  };
  tasks: {
    id: number;
    type: string;
    lead_id: number | null;
    lead_title: string | null;
    lead_phone: string | null;
    status_id: number | null;
    status_title: string | null;
    remarks: string | null;
    due_date: string | null;
    assigned_to: number | null;
  }[];
  activity: {
    type: "lead" | "student" | "payment";
    id: number;
    title: string;
    amount: number | null;
    at: string | null;
  }[];
  fee_trend: { date: string; amount: number }[];
}

// ₹ formatter that mirrors the mock's compact Cr/L notation.
function inrCompact(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "₹0";
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

// "12m ago" style relative time from an ISO timestamp; "—" when absent.
function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Math.max(0, Date.now() - then);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// "Today, 4:30 PM" / "Tomorrow" style due label from an ISO date; "—" when absent.
function dueLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOf(d) - startOf(today)) / 86_400_000);
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const hasTime = !(d.getHours() === 0 && d.getMinutes() === 0);
  if (dayDiff === 0) return hasTime ? `Today, ${time}` : "Today";
  if (dayDiff === 1) return hasTime ? `Tomorrow, ${time}` : "Tomorrow";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const EMPTY_OVERVIEW: DashboardOverview = {
  role_id: null,
  scope: "",
  leads: { total: 0, open: 0, converted: 0, follow_up: 0 },
  students: { total: 0, active: 0, discontinued: 0 },
  courses: { total: 0 },
  income: { paid_today: 0, paid_total: 0, payable_total: 0, pending: 0 },
  recent: { leads: [], students: [] },
  tasks: [],
  activity: [],
  fee_trend: [],
};

function initials(name: string | null): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

type Stat = { label: string; value: string; delta: string; up: boolean; icon: typeof Users; tint: string };

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
        <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${s.up ? "text-success" : "text-destructive"}`}>
          {s.up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {s.delta}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">vs. last month</div>
    </div>
  );
}

function Dashboard() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => apiGet<DashboardOverview>("/dashboard"),
  });

  const d = data ?? EMPTY_OVERVIEW;

  // --- stats (same shape: label/value/delta/up/icon/tint) -------------------
  // delta/up have no API source -> shown as "—" / up:true (never fabricated).
  const stats: Stat[] = [
    { label: "Active Students", value: d.students.active.toLocaleString("en-IN"), delta: "—", up: true, icon: Users, tint: "primary" },
    { label: "New Enrollments", value: d.leads.converted.toLocaleString("en-IN"), delta: "—", up: true, icon: ClipboardList, tint: "accent" },
    { label: "Fees Collected (MTD)", value: inrCompact(d.income.paid_total), delta: "—", up: true, icon: Wallet, tint: "primary" },
    { label: "Pending Commissions", value: inrCompact(d.income.pending), delta: "—", up: false, icon: TrendingUp, tint: "accent" },
  ];

  // --- pipeline (same shape: stage/count/pct/color) -------------------------
  // Documentation / Fee Payment have no API counter -> 0. pct is relative to the
  // largest stage so the bars stay proportional.
  const pipelineRaw = [
    { stage: "New Leads", count: d.leads.total, color: "bg-primary" },
    { stage: "Counselling", count: d.leads.follow_up, color: "bg-primary/80" },
    { stage: "Documentation", count: 0, color: "bg-accent" },
    { stage: "Fee Payment", count: 0, color: "bg-accent/80" },
    { stage: "Enrolled", count: d.students.active, color: "bg-success" },
  ];
  const pipelineMax = Math.max(1, ...pipelineRaw.map((p) => p.count));
  const pipeline = pipelineRaw.map((p) => ({ ...p, pct: Math.round((p.count / pipelineMax) * 100) }));

  // --- tasks (same shape: title/due/priority/icon) --------------------------
  // No priority field on follow-ups -> default "Medium"; icon is the follow-up
  // Phone glyph.
  const tasks = d.tasks.map((t) => ({
    title: `Follow up — ${t.lead_title ?? "Lead"}${t.status_title ? ` (${t.status_title})` : ""}`,
    due: dueLabel(t.due_date),
    priority: "Medium",
    icon: Phone,
  }));

  // --- activity (same shape: who/what/target/time/status) -------------------
  const activity = d.activity.map((a) => {
    if (a.type === "payment") {
      return { who: "Finance Team", what: "received payment of", target: `${inrCompact(a.amount ?? 0)} — ${a.title}`, time: timeAgo(a.at), status: "success" };
    }
    if (a.type === "student") {
      return { who: a.title, what: "was added as a", target: "new student", time: timeAgo(a.at), status: "success" };
    }
    return { who: a.title, what: "was added as a", target: "new lead", time: timeAgo(a.at), status: "info" };
  });

  // --- Recent Admissions table rows (same shape the inline mock had) --------
  // program/uni/fee are not on the recent-students payload -> "—"; stage maps
  // from the user.status flag.
  const recentRows = d.recent.students.map((s) => ({
    name: s.name ?? "—",
    initial: initials(s.name),
    program: "—",
    uni: "—",
    stage: s.status === 1 ? "Enrolled" : "Documentation",
    tone: s.status === 1 ? "success" : "warn",
    fee: "—",
    email: s.email ?? "—",
  }));

  // --- Fee Collection Trend bars (14 daily values, oldest -> newest) --------
  // Mock fed raw 0-100 heights; here we normalise the real daily amounts to a
  // 0-100 scale against the window's peak so the bars stay proportional.
  const trendMax = Math.max(1, ...d.fee_trend.map((f) => f.amount));
  const feeBars = d.fee_trend.map((f) => Math.round((f.amount / trendMax) * 90));
  const feeDays = d.fee_trend.map((_, i) => String(i + 1));

  if (isLoading) {
    return (
      <div className="grid h-[60vh] place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="grid h-[60vh] place-items-center">
        <div className="flex flex-col items-center gap-2 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm font-medium text-foreground">Couldn't load the dashboard</p>
          <p className="text-xs text-muted-foreground">{error instanceof Error ? error.message : "Please try again."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overview</div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Welcome back, Priya 👋
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
              {pipeline.map((p) => (
                <div key={p.stage}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{p.stage}</span>
                    <span className="text-muted-foreground">{p.count}</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${p.color} transition-all`} style={{ width: `${p.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Revenue chart */}
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground">Fee Collection Trend</h3>
                <p className="text-xs text-muted-foreground">Daily collections — last 14 days</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" />Collected</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" />Target</span>
              </div>
            </div>
            <div className="mt-6 flex h-44 items-end gap-2">
              {feeBars.map((v, i) => (
                <div key={i} className="group relative flex flex-1 flex-col items-center gap-1">
                  <div className="w-full rounded-md bg-accent/30" style={{ height: `${v + 10}%` }} />
                  <div className="absolute bottom-0 w-full rounded-md bg-primary transition-all group-hover:bg-primary-hover" style={{ height: `${v}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-between text-[10px] text-muted-foreground">
              {feeDays.map(d => <span key={d}>{d}</span>)}
            </div>
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
          <ul className="mt-5 space-y-3">
            {tasks.map((t) => {
              const Icon = t.icon;
              const tone =
                t.priority === "High" ? "bg-accent/10 text-accent" :
                t.priority === "Medium" ? "bg-warning/15 text-warning-foreground" :
                "bg-muted text-muted-foreground";
              return (
                <li key={t.title} className="flex items-start gap-3 rounded-xl border border-border/70 p-3 transition hover:bg-muted/50">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{t.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {t.due}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{t.priority}</span>
                </li>
              );
            })}
          </ul>
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
                  <th className="px-3 py-2.5 font-semibold">Program</th>
                  <th className="px-3 py-2.5 font-semibold">University</th>
                  <th className="px-3 py-2.5 font-semibold">Stage</th>
                  <th className="px-6 py-2.5 font-semibold text-right">Fee</th>
                </tr>
              </thead>
              <tbody>
                {recentRows.map((r) => {
                  const stageTone =
                    r.tone === "success" ? "bg-success/10 text-success" :
                    r.tone === "warn" ? "bg-accent/10 text-accent" :
                    "bg-primary/10 text-primary";
                  return (
                    <tr key={r.name} className="border-b border-border/70 last:border-0 transition hover:bg-muted/40">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {r.initial}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">{r.name}</div>
                            <div className="text-[11px] text-muted-foreground">{r.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-foreground">{r.program}</td>
                      <td className="px-3 py-3.5 text-muted-foreground">{r.uni}</td>
                      <td className="px-3 py-3.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${stageTone}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {r.stage}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right font-semibold text-foreground">{r.fee}</td>
                    </tr>
                  );
                })}
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
          <ul className="mt-5 space-y-4">
            {activity.map((a, i) => {
              const Icon = a.status === "success" ? CheckCircle2 : a.status === "warn" ? AlertCircle : Clock;
              const tone = a.status === "success" ? "text-success bg-success/10" : a.status === "warn" ? "text-accent bg-accent/10" : "text-primary bg-primary/10";
              return (
                <li key={i} className="flex gap-3">
                  <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${tone}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-foreground">
                      <span className="font-semibold">{a.who}</span> {a.what}{" "}
                      <span className="font-semibold text-primary">{a.target}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{a.time}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
