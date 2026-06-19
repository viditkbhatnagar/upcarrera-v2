import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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

const kpis: {
  label: string;
  value: string;
  delta: string;
  up: boolean;
  icon: any;
  tint: Tint;
  hint: string;
}[] = [
  { label: "Approved Applications", value: "1,284", delta: "+9.2%", up: true, icon: FileCheck2, tint: "primary", hint: "Cleared by admissions" },
  { label: "Enrollment Pending", value: "342", delta: "+4.1%", up: true, icon: Clock, tint: "warning", hint: "Awaiting processing" },
  { label: "Ready for Submission", value: "186", delta: "+12.6%", up: true, icon: FileSignature, tint: "info", hint: "Docs verified" },
  { label: "Submitted to University", value: "742", delta: "+6.8%", up: true, icon: Send, tint: "accent", hint: "In confirmation" },
  { label: "Successfully Enrolled", value: "968", delta: "+15.3%", up: true, icon: GraduationCap, tint: "success", hint: "Confirmed by university" },
  { label: "Re-registration Pending", value: "214", delta: "-2.4%", up: false, icon: RefreshCw, tint: "primary", hint: "Continuing students" },
];

const tintMap: Record<Tint, string> = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/10 text-accent",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning-foreground",
  info: "bg-primary/10 text-primary",
};

const funnel = [
  { stage: "Approved Applications", count: 1284, icon: FileCheck2, tint: "primary" as Tint },
  { stage: "Enrollment Pending", count: 342, icon: Clock, tint: "warning" as Tint },
  { stage: "Ready for Submission", count: 186, icon: FileSignature, tint: "info" as Tint },
  { stage: "Submitted to University", count: 742, icon: Send, tint: "accent" as Tint },
  { stage: "Enrolled", count: 968, icon: GraduationCap, tint: "success" as Tint },
];

const trendByYear: Record<string, number[]> = {
  "2026": [62, 74, 88, 96, 110, 124, 138, 152, 168, 180, 198, 212],
  "2025": [48, 56, 70, 82, 90, 104, 118, 130, 142, 158, 174, 188],
  "2024": [32, 40, 52, 64, 72, 84, 92, 104, 116, 128, 138, 150],
};

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const universities = [
  { name: "Symbiosis International", pending: 48, submitted: 126, confirmed: 184, due: 32 },
  { name: "Manipal University", pending: 36, submitted: 98, confirmed: 142, due: 28 },
  { name: "Amity University", pending: 54, submitted: 108, confirmed: 156, due: 41 },
  { name: "Christ University", pending: 22, submitted: 74, confirmed: 96, due: 18 },
  { name: "Lovely Professional", pending: 41, submitted: 88, confirmed: 124, due: 36 },
  { name: "Chandigarh University", pending: 29, submitted: 62, confirmed: 88, due: 24 },
];

const intakes = [
  { intake: "Jan 2026 — Spring", approved: 412, enrolled: 348, pending: 64 },
  { intake: "Jul 2026 — Monsoon", approved: 538, enrolled: 0, pending: 142 },
  { intake: "Sep 2026 — Fall", approved: 286, enrolled: 0, pending: 96 },
  { intake: "Jul 2025 — Monsoon", approved: 612, enrolled: 568, pending: 12 },
  { intake: "Jan 2025 — Spring", approved: 484, enrolled: 470, pending: 8 },
];

const activities = [
  { type: "Enrollment Submitted", who: "Operations Team", target: "Ananya Sharma → Symbiosis (MBA)", time: "8m ago", icon: Send, tint: "accent" as Tint },
  { type: "Confirmation Received", who: "Manipal University", target: "Karan Verma — B.Tech CSE", time: "24m ago", icon: BadgeCheck, tint: "success" as Tint },
  { type: "Re-registration Completed", who: "Priya Iyer", target: "Year 2 — BBA (Amity)", time: "1h ago", icon: RefreshCw, tint: "primary" as Tint },
  { type: "Enrollment Submitted", who: "Operations Team", target: "Aarav Singh → Christ (M.Sc DS)", time: "2h ago", icon: Send, tint: "accent" as Tint },
  { type: "Confirmation Received", who: "Amity University", target: "Megha Nair — BBA", time: "3h ago", icon: BadgeCheck, tint: "success" as Tint },
  { type: "Re-registration Completed", who: "Rohit Mehra", target: "Year 3 — B.Tech (Manipal)", time: "5h ago", icon: RefreshCw, tint: "primary" as Tint },
];

function KPICard({ k }: { k: (typeof kpis)[number] }) {
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
  const [year, setYear] = useState("2026");
  const trend = trendByYear[year];
  const maxTrend = useMemo(() => Math.max(...trend), [trend]);
  const maxFunnel = useMemo(() => Math.max(...funnel.map(f => f.count)), []);

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
              <p className="text-xs text-muted-foreground">Monthly enrolled students across {year}</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="h-9 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {Object.keys(trendByYear).map(y => <option key={y} value={y}>{y}</option>)}
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
                {months[trend.indexOf(maxTrend)]}
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
