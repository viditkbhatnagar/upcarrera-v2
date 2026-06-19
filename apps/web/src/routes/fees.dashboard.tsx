import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Wallet,
  TrendingUp,
  IndianRupee,
  Percent,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  GraduationCap,
  CheckCircle2,
  ShieldCheck,
  MoreHorizontal,
  Eye,
  FileText,
  Download,
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/fees/dashboard")({
  head: () => ({
    meta: [
      { title: "Fee Dashboard — upCarrera" },
      { name: "description", content: "Financial command center for fee collections, dues, and outstanding analysis." },
    ],
  }),
  component: FeeDashboard,
});

// ---------------- Mock data ----------------
const kpis = [
  { label: "Total Receivable", value: "₹18.42 Cr", delta: "+6.4%", up: true, icon: IndianRupee, tint: "primary" },
  { label: "Total Collected", value: "₹14.06 Cr", delta: "+12.1%", up: true, icon: Wallet, tint: "primary" },
  { label: "Outstanding Amount", value: "₹4.36 Cr", delta: "-3.8%", up: false, icon: AlertTriangle, tint: "accent" },
  { label: "Collection %", value: "76.3%", delta: "+2.4%", up: true, icon: Percent, tint: "accent" },
];

const monthlyTrend = [
  { label: "Jan", collected: 62, target: 80 },
  { label: "Feb", collected: 74, target: 85 },
  { label: "Mar", collected: 88, target: 90 },
  { label: "Apr", collected: 70, target: 85 },
  { label: "May", collected: 96, target: 95 },
  { label: "Jun", collected: 84, target: 90 },
  { label: "Jul", collected: 92, target: 95 },
  { label: "Aug", collected: 78, target: 88 },
  { label: "Sep", collected: 88, target: 92 },
  { label: "Oct", collected: 95, target: 95 },
  { label: "Nov", collected: 82, target: 90 },
  { label: "Dec", collected: 90, target: 95 },
];

const quarterlyTrend = [
  { label: "Q1", collected: 75, target: 85 },
  { label: "Q2", collected: 84, target: 90 },
  { label: "Q3", collected: 86, target: 92 },
  { label: "Q4", collected: 89, target: 93 },
];

const yearlyTrend = [
  { label: "2022", collected: 65, target: 80 },
  { label: "2023", collected: 78, target: 85 },
  { label: "2024", collected: 84, target: 90 },
  { label: "2025", collected: 88, target: 92 },
  { label: "2026", collected: 76, target: 95 },
];

const universityOutstanding = [
  { name: "Symbiosis", value: "₹1.24 Cr", pct: 92 },
  { name: "Manipal University", value: "₹98.5 L", pct: 74 },
  { name: "Amity University", value: "₹76.2 L", pct: 56 },
  { name: "Christ University", value: "₹58.4 L", pct: 43 },
  { name: "Lovely Professional", value: "₹42.1 L", pct: 31 },
];

const intakeOutstanding = [
  { name: "Jan 2026", value: "₹1.85 Cr", pct: 95 },
  { name: "Aug 2025", value: "₹1.12 Cr", pct: 64 },
  { name: "Jan 2025", value: "₹68.4 L", pct: 38 },
  { name: "Aug 2024", value: "₹42.2 L", pct: 24 },
  { name: "Jan 2024", value: "₹28.6 L", pct: 16 },
];

const dueCards = [
  { key: "today", label: "Due Today", value: "₹12.4 L", count: "28 students", icon: CalendarDays, tone: "primary", filter: "today" },
  { key: "week", label: "Due This Week", value: "₹68.2 L", count: "142 students", icon: CalendarRange, tone: "primary", filter: "week" },
  { key: "month", label: "Due This Month", value: "₹2.84 Cr", count: "564 students", icon: CalendarClock, tone: "accent", filter: "month" },
  { key: "overdue", label: "Overdue Amount", value: "₹1.42 Cr", count: "218 students", icon: AlertTriangle, tone: "destructive", filter: "overdue" },
];

const uniSummary = [
  { code: "UNI-001", name: "Symbiosis International", students: 482, total: "₹4.82 Cr", collected: "₹3.58 Cr", outstanding: "₹1.24 Cr", pct: 74 },
  { code: "UNI-002", name: "Manipal University", students: 386, total: "₹3.45 Cr", collected: "₹2.46 Cr", outstanding: "₹98.5 L", pct: 71 },
  { code: "UNI-003", name: "Amity University", students: 294, total: "₹2.68 Cr", collected: "₹1.92 Cr", outstanding: "₹76.2 L", pct: 71 },
  { code: "UNI-004", name: "Christ University", students: 218, total: "₹1.98 Cr", collected: "₹1.40 Cr", outstanding: "₹58.4 L", pct: 70 },
  { code: "UNI-005", name: "Lovely Professional Univ.", students: 176, total: "₹1.42 Cr", collected: "₹1.00 Cr", outstanding: "₹42.1 L", pct: 70 },
];

const activities = [
  { type: "payment", who: "Ananya Sharma", what: "paid ₹85,000 via UPI for", target: "MBA — Symbiosis", time: "5m ago" },
  { type: "verified", who: "Finance Team", what: "verified payment of ₹1,20,000 from", target: "Karan Verma", time: "22m ago" },
  { type: "payment", who: "Aarav Singh", what: "paid ₹64,500 via NEFT for", target: "M.Sc Data Sc. — Christ", time: "1h ago" },
  { type: "verified", who: "Finance Team", what: "verified payment of ₹48,000 from", target: "Megha Nair", time: "2h ago" },
  { type: "payment", who: "Sneha Pillai", what: "paid ₹38,000 via Card for", target: "BCA — Lovely Pro.", time: "3h ago" },
  { type: "verified", who: "Finance Team", what: "verified payment of ₹95,000 from", target: "Rohit Mehra", time: "4h ago" },
];

// ---------------- Components ----------------
function KpiCard({ k }: { k: (typeof kpis)[number] }) {
  const Icon = k.icon;
  const tint = k.tint === "accent" ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary";
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
      <div className="mt-5 text-[13px] font-medium text-muted-foreground">{k.label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-2xl font-bold tracking-tight text-foreground">{k.value}</div>
        <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${k.up ? "text-success" : "text-destructive"}`}>
          {k.up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {k.delta}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">vs. last period</div>
    </div>
  );
}

function FeeDashboard() {
  const navigate = useNavigate();
  const [range, setRange] = useState<"Monthly" | "Quarterly" | "Yearly">("Monthly");
  const trend = range === "Monthly" ? monthlyTrend : range === "Quarterly" ? quarterlyTrend : yearlyTrend;

  const goCollection = (filter: string) =>
    navigate({ to: "/fees/collection", search: { due: filter } as never });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fee Management</div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">Fee Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Monitor Student Fee Payments.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-muted">
            <Download className="h-4 w-4" />
            Export
          </button>
          <Link
            to="/fees/collection"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground shadow-card hover:bg-accent-hover"
          >
            <Wallet className="h-4 w-4" />
            Record Payment
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => <KpiCard key={k.label} k={k} />)}
      </div>

      {/* Collection Trend */}
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-foreground">Collection Trend</h3>
            <p className="text-xs text-muted-foreground">Collected vs. target over time</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-3 text-xs sm:flex">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" />Collected</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent/40" />Target</span>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 text-xs">
              {(["Monthly", "Quarterly", "Yearly"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setRange(p)}
                  className={`rounded-md px-2.5 py-1 font-medium ${range === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-6 flex h-48 items-end gap-2">
          {trend.map((d) => (
            <div key={d.label} className="group relative flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-md bg-accent/30" style={{ height: `${d.target}%` }} />
              <div className="absolute bottom-0 w-full rounded-md bg-primary transition-all group-hover:bg-primary-hover" style={{ height: `${d.collected}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between text-[10px] text-muted-foreground">
          {trend.map((d) => <span key={d.label}>{d.label}</span>)}
        </div>
      </div>

      {/* Outstanding Analysis */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <Building2 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground">University-wise Outstanding</h3>
                <p className="text-xs text-muted-foreground">Top universities by pending dues</p>
              </div>
            </div>
            <Link to="/universities/universities" className="text-xs font-semibold text-accent hover:underline">View all</Link>
          </div>
          <div className="mt-5 space-y-3.5">
            {universityOutstanding.map((u) => (
              <div key={u.name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{u.name}</span>
                  <span className="text-muted-foreground">{u.value}</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${u.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/10 text-accent">
                <GraduationCap className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground">Intake-wise Outstanding</h3>
                <p className="text-xs text-muted-foreground">Pending dues grouped by intake</p>
              </div>
            </div>
            <Link to="/universities/intakes" className="text-xs font-semibold text-accent hover:underline">View all</Link>
          </div>
          <div className="mt-5 space-y-3.5">
            {intakeOutstanding.map((i) => (
              <div key={i.name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{i.name}</span>
                  <span className="text-muted-foreground">{i.value}</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${i.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Due Summary */}
      <div>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-foreground">Due Summary</h3>
            <p className="text-xs text-muted-foreground">Click a card to open Fee Collection with the filter applied</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {dueCards.map((d) => {
            const Icon = d.icon;
            const tint =
              d.tone === "destructive" ? "bg-destructive/10 text-destructive" :
              d.tone === "accent" ? "bg-accent/10 text-accent" :
              "bg-primary/10 text-primary";
            return (
              <button
                key={d.key}
                onClick={() => goCollection(d.filter)}
                className="group text-left rounded-2xl border border-border bg-surface p-5 shadow-card transition hover:shadow-card-hover hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between">
                  <div className={`grid h-11 w-11 place-items-center rounded-xl ${tint}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
                </div>
                <div className="mt-5 text-[13px] font-medium text-muted-foreground">{d.label}</div>
                <div className="mt-1 text-2xl font-bold tracking-tight text-foreground">{d.value}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{d.count}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* University Financial Summary */}
      <div className="rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between p-6 pb-4">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-foreground">University Financial Summary</h3>
            <p className="text-xs text-muted-foreground">Collection performance across universities</p>
          </div>
          <Link to="/universities/universities" className="text-xs font-semibold text-accent hover:underline">View all</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-2.5 font-semibold">University</th>
                <th className="px-3 py-2.5 font-semibold text-right">Students</th>
                <th className="px-3 py-2.5 font-semibold text-right">Total Fee</th>
                <th className="px-3 py-2.5 font-semibold text-right">Collected</th>
                <th className="px-3 py-2.5 font-semibold text-right">Outstanding</th>
                <th className="px-6 py-2.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {uniSummary.map((u) => (
                <tr key={u.code} className="border-b border-border/70 last:border-0 transition hover:bg-muted/40">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{u.name}</div>
                        <div className="text-[11px] text-muted-foreground">{u.code} • {u.pct}% collected</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-right text-foreground">{u.students}</td>
                  <td className="px-3 py-3.5 text-right font-semibold text-foreground">{u.total}</td>
                  <td className="px-3 py-3.5 text-right text-success font-semibold">{u.collected}</td>
                  <td className="px-3 py-3.5 text-right text-destructive font-semibold">{u.outstanding}</td>
                  <td className="px-6 py-3.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Link
                        to="/universities/universities/$code"
                        params={{ code: u.code }}
                        className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                        title="View Profile"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </Link>
                      <Link
                        to="/fees/summary"
                        className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                        title="Open Report"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Report
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Financial Activities */}
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-foreground">Recent Financial Activities</h3>
            <p className="text-xs text-muted-foreground">Latest payments and verifications</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            Live
          </span>
        </div>
        <ol className="mt-5 relative border-l border-border pl-5 space-y-5">
          {activities.map((a, i) => {
            const isVerified = a.type === "verified";
            const Icon = isVerified ? ShieldCheck : CheckCircle2;
            const tone = isVerified ? "bg-primary/10 text-primary" : "bg-success/10 text-success";
            const link = isVerified ? "/fees/payment-verification" : "/fees/collection";
            return (
              <li key={i} className="relative">
                <span className={`absolute -left-[34px] grid h-7 w-7 place-items-center rounded-full ring-4 ring-surface ${tone}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-foreground">
                      <span className="font-semibold">{a.who}</span> {a.what}{" "}
                      <span className="font-semibold text-primary">{a.target}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${isVerified ? "bg-primary/10 text-primary" : "bg-success/10 text-success"}`}>
                        {isVerified ? "Payment Verified" : "Payment Recorded"}
                      </span>
                      <span>{a.time}</span>
                    </div>
                  </div>
                  <Link
                    to={link}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Open
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            Showing latest 6 activities
          </div>
          <Link to="/fees/payment-verification" className="text-xs font-semibold text-accent hover:underline">View all activity</Link>
        </div>
      </div>
    </div>
  );
}
