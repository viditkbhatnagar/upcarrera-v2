import { createFileRoute } from "@tanstack/react-router";
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

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — upCarrera Education" },
      { name: "description", content: "Operational dashboard for admissions, enrollments, fees and student success." },
    ],
  }),
  component: Dashboard,
});

const stats = [
  { label: "Active Students", value: "2,847", delta: "+12.4%", up: true, icon: Users, tint: "primary" },
  { label: "New Enrollments", value: "184", delta: "+8.1%", up: true, icon: ClipboardList, tint: "accent" },
  { label: "Fees Collected (MTD)", value: "₹1.42Cr", delta: "+18.6%", up: true, icon: Wallet, tint: "primary" },
  { label: "Pending Commissions", value: "₹38.2L", delta: "-3.2%", up: false, icon: TrendingUp, tint: "accent" },
];

const pipeline = [
  { stage: "New Leads", count: 412, pct: 100, color: "bg-primary" },
  { stage: "Counselling", count: 268, pct: 65, color: "bg-primary/80" },
  { stage: "Documentation", count: 154, pct: 37, color: "bg-accent" },
  { stage: "Fee Payment", count: 96, pct: 23, color: "bg-accent/80" },
  { stage: "Enrolled", count: 78, pct: 19, color: "bg-success" },
];

const tasks = [
  { title: "Verify documents — Ananya Sharma", due: "Today, 4:30 PM", priority: "High", icon: FileCheck2 },
  { title: "Follow up call — Rohit Mehra (MBA)", due: "Today, 5:00 PM", priority: "Medium", icon: Phone },
  { title: "Send fee receipt — Batch 2026-A", due: "Tomorrow", priority: "Low", icon: Mail },
  { title: "Counselling slot — Priya Iyer", due: "Tomorrow, 11:00 AM", priority: "Medium", icon: GraduationCap },
];

const activity = [
  { who: "Karan Verma", what: "completed admission to", target: "MBA — Symbiosis", time: "12m ago", status: "success" },
  { who: "Sneha Pillai", what: "uploaded documents for", target: "B.Tech CSE — Manipal", time: "38m ago", status: "info" },
  { who: "Finance Team", what: "received payment of ₹85,000 from", target: "Aarav Singh", time: "1h ago", status: "success" },
  { who: "Support Desk", what: "escalated ticket", target: "#TKT-2841", time: "2h ago", status: "warn" },
  { who: "Rahul Bansal", what: "scheduled counselling with", target: "Megha N.", time: "3h ago", status: "info" },
];

function StatCard({ s }: { s: (typeof stats)[number] }) {
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
              {[42, 58, 50, 70, 64, 80, 55, 72, 88, 60, 76, 92, 70, 84].map((v, i) => (
                <div key={i} className="group relative flex flex-1 flex-col items-center gap-1">
                  <div className="w-full rounded-md bg-accent/30" style={{ height: `${v + 10}%` }} />
                  <div className="absolute bottom-0 w-full rounded-md bg-primary transition-all group-hover:bg-primary-hover" style={{ height: `${v}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-between text-[10px] text-muted-foreground">
              {["1","2","3","4","5","6","7","8","9","10","11","12","13","14"].map(d => <span key={d}>{d}</span>)}
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
                {[
                  { name: "Ananya Sharma", initial: "AS", program: "MBA", uni: "Symbiosis", stage: "Enrolled", tone: "success", fee: "₹2,40,000" },
                  { name: "Karan Verma", initial: "KV", program: "B.Tech CSE", uni: "Manipal", stage: "Fee Payment", tone: "warn", fee: "₹1,85,000" },
                  { name: "Megha Nair", initial: "MN", program: "BBA", uni: "Amity", stage: "Counselling", tone: "info", fee: "₹98,000" },
                  { name: "Aarav Singh", initial: "AS", program: "M.Sc Data Sc.", uni: "Christ", stage: "Documentation", tone: "warn", fee: "₹2,10,000" },
                  { name: "Sneha Pillai", initial: "SP", program: "BCA", uni: "Lovely Pro.", stage: "Enrolled", tone: "success", fee: "₹1,20,000" },
                ].map((r) => {
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
                            <div className="text-[11px] text-muted-foreground">student@upcarrera.in</div>
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
