import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  Calendar,
  CheckCircle2,
  Flame,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { PIPELINE_STAGES, STAGE_META } from "@/components/applications/stage-model";
import type { Stage } from "@/lib/api/applications";
import { KpiCard } from "@/components/counsellor/dashboard/kpi-card";
import { CoursePerformance } from "@/components/counsellor/dashboard/course-performance";
import {
  useApplicationsSummary,
  useStudentsSummary,
} from "@/components/counsellor/dashboard/use-dashboard-data";
import { useConsultantMetrics } from "@/components/counsellor/use-consultant-metrics";
import { SortHead, useSort } from "@/components/counsellor/shared/sortable-head";

const nf = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-IN");
const inr = (n: number) =>
  n >= 10000000
    ? `₹${(n / 10000000).toFixed(2)}Cr`
    : n >= 100000
      ? `₹${(n / 100000).toFixed(1)}L`
      : `₹${(n / 1000).toFixed(0)}K`;

const tooltipStyle = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
  boxShadow: "var(--shadow-card)",
};

const FUNNEL_COLOR: Record<Stage, string> = {
  lead_added: "var(--info)",
  form_pending: "var(--chart-5)",
  counsellor_review: "var(--warning)",
  fee_pending: "var(--warning)",
  fee_verification: "var(--info)",
  sa_verification: "var(--chart-3)",
  converted: "var(--success)",
  rejected: "var(--destructive)",
};

type Series = "points" | "enrollments" | "revenue";

interface MonthRow {
  index: number;
  month: string;
  target: number;
  achieved: number;
  admissions: number;
  revenue: number;
  /** Achievement % of the month's points target, or null when no target was set. */
  ach: number | null;
}

/**
 * My Performance (Naji's design), read-only for counsellors, wired to:
 *   GET /dashboard/consultant -> target / achieved points, enrollments, revenue and the
 *                                12-month trends (YTD chart, timeline and history table)
 *   GET /applications         -> per-stage counts (application pipeline)
 *   GET /students             -> course mix
 * Leaderboard, badges and week/year splits have no backing endpoint and are omitted.
 */
export function CounsellorPerformance() {
  const metrics = useConsultantMetrics();
  const apps = useApplicationsSummary();
  const students = useStudentsSummary();
  const [series, setSeries] = useState<Series>("points");

  const m = metrics.data;
  const pct = Math.round(m?.achievement_percentage ?? 0);
  const monthName = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const ytd = (m?.trends.admissions ?? []).reduce((a, b) => a + b, 0);
  const remaining = Math.max(0, (m?.target_point ?? 0) - (m?.achieved_points ?? 0));

  const rows = useMemo<MonthRow[]>(() => {
    const t = m?.trends;
    if (!t) return [];
    return t.months.map((month, i) => {
      const target = t.target_points[i] ?? 0;
      const achieved = t.achieved_points[i] ?? 0;
      return {
        index: i,
        month,
        target,
        achieved,
        admissions: t.admissions[i] ?? 0,
        revenue: t.revenue[i] ?? 0,
        ach: target > 0 ? Math.round((achieved / target) * 100) : null,
      };
    });
  }, [m]);

  const currentIdx = new Date().getMonth();
  // History = months up to now that actually have activity or a target.
  const history = useMemo(
    () => rows.filter((r) => r.index <= currentIdx && (r.admissions > 0 || r.target > 0 || r.achieved > 0)),
    [rows, currentIdx],
  );
  const trendOf = (r: MonthRow): number | null => {
    const prev = rows[r.index - 1]?.admissions;
    return prev ? ((r.admissions - prev) / prev) * 100 : null;
  };
  const { sorted: sortedHistory, sort: historySort } = useSort(history, {
    month: (r) => r.index,
    target: (r) => r.target,
    enrollments: (r) => r.admissions,
    ach: (r) => r.ach,
    trend: (r) => trendOf(r),
  });

  const thisMonth = rows[currentIdx];
  const prevMonth = currentIdx > 0 ? rows[currentIdx - 1] : undefined;
  const monthDelta =
    thisMonth && prevMonth && prevMonth.admissions > 0
      ? ((thisMonth.admissions - prevMonth.admissions) / prevMonth.admissions) * 100
      : null;
  const elapsed = rows.slice(0, currentIdx + 1);
  const avg = elapsed.length ? elapsed.reduce((a, r) => a + r.admissions, 0) / elapsed.length : 0;

  const counts = apps.data?.counts;
  const funnel = useMemo(
    () =>
      [...PIPELINE_STAGES, "rejected" as Stage].map((s) => ({
        stage: s,
        name: STAGE_META[s].label,
        value: counts?.[s] ?? 0,
      })),
    [counts],
  );
  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));
  const totalApps = apps.data?.total ?? 0;
  const converted = counts?.converted ?? 0;

  const dataKey = series === "points" ? "achieved" : series === "enrollments" ? "admissions" : "revenue";
  const seriesName = series === "points" ? "Achieved" : series === "enrollments" ? "Enrollments" : "Revenue";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Performance</h1>
          <p className="text-sm text-muted-foreground mt-1">Your targets, enrollments and pipeline, straight from live data.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {monthName}
          </Badge>
          {m && m.target_point > 0 && (
            <Badge className={cn("gap-1.5 border-0", pct >= 100 ? "bg-success-soft text-success" : "bg-warning-soft text-warning-foreground")}>
              <Flame className="h-3.5 w-3.5" />
              {pct >= 100 ? "Target met" : `${pct}% of target`}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard label="Monthly Target Points" value={nf(m?.target_point)} icon={Target} tone="primary" progress={m ? 100 : undefined} sub="Points" loading={metrics.isLoading} />
        <KpiCard
          label="Target Achieved"
          value={nf(m?.achieved_points)}
          icon={CheckCircle2}
          tone="success"
          progress={pct}
          sub={m && m.target_point > 0 ? `${nf(remaining)} to go` : "No target set"}
          loading={metrics.isLoading}
        />
        <KpiCard label="Achieved %" value={`${pct}%`} icon={TrendingUp} tone="info" progress={pct} sub="Of this month's target" loading={metrics.isLoading} />
        <KpiCard label="Current Month Enrollments" value={nf(m?.admissions_count)} icon={Trophy} tone="success" sub="Enrolled this month" loading={metrics.isLoading} />
        <KpiCard label="Enrollments - YTD" value={nf(ytd)} icon={Award} tone="primary" sub="Year to date" loading={metrics.isLoading} />
      </div>

      <Card className="p-5 shadow-[var(--shadow-soft)] border-border/70">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold">Performance Analytics</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {series === "points" ? "Target vs achieved points" : series === "enrollments" ? "Enrollments" : "Revenue"} by month{m ? ` · ${m.year}` : ""}
            </p>
          </div>
          <Tabs value={series} onValueChange={(v) => setSeries(v as Series)}>
            <TabsList>
              <TabsTrigger value="points">Points</TabsTrigger>
              <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
              <TabsTrigger value="revenue">Revenue</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="h-[300px]">
          {metrics.isLoading ? (
            <div className="h-full grid place-items-center text-sm text-muted-foreground">Loading…</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="achGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} tickFormatter={series === "revenue" ? (v: number) => inr(v) : undefined} />
                <Tooltip contentStyle={tooltipStyle} formatter={series === "revenue" ? (v: number) => inr(v) : undefined} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {series === "points" && <Bar dataKey="target" name="Target" fill="var(--muted)" radius={[6, 6, 0, 0]} barSize={20} />}
                <Area type="monotone" dataKey={dataKey} name={seriesName} stroke="var(--primary)" strokeWidth={2.5} fill="url(#achGrad)" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="p-5 shadow-[var(--shadow-soft)] border-border/70">
          <div className="mb-4">
            <h2 className="text-base font-semibold">Application Pipeline</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Where your applications are right now</p>
          </div>
          <div className="space-y-2">
            {funnel.map((f) => (
              <div key={f.stage}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium">{f.name}</span>
                  <span className="text-muted-foreground">{apps.isLoading ? "…" : nf(f.value)}</span>
                </div>
                <div className="h-7 rounded-md bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-md transition-all"
                    style={{ width: `${(f.value / funnelMax) * 100}%`, backgroundColor: FUNNEL_COLOR[f.stage] }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Overall conversion</span>
            <span className="font-semibold text-success">
              {totalApps > 0 ? `${((converted / totalApps) * 100).toFixed(1)}%` : "—"}
            </span>
          </div>
        </Card>

        <CoursePerformance students={students.data?.items} total={students.data?.total ?? 0} loading={students.isLoading} />
      </div>

      <Card className="p-5 shadow-[var(--shadow-soft)] border-border/70">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">Performance Timeline</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Monthly history &amp; comparison</p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-primary" />Enrollments</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-success" />Achievement %</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis yAxisId="left" stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" stroke="var(--muted-foreground)" fontSize={12} unit="%" />
                <Tooltip contentStyle={tooltipStyle} />
                <Line yAxisId="left" type="monotone" dataKey="admissions" name="Enrollments" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 4 }} />
                <Line yAxisId="right" type="monotone" dataKey="ach" name="Achievement %" stroke="var(--success)" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border border-border p-4 bg-muted/30">
              <p className="text-xs text-muted-foreground">This Month</p>
              <p className="text-2xl font-bold mt-1">{nf(thisMonth?.admissions)}</p>
              <p className="text-xs text-muted-foreground">enrollments · {inr(thisMonth?.revenue ?? 0)}</p>
              {monthDelta != null && <Delta value={monthDelta} suffix="vs last month" />}
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground">Previous Month</p>
              <p className="text-2xl font-bold mt-1">{prevMonth ? nf(prevMonth.admissions) : "—"}</p>
              <p className="text-xs text-muted-foreground">enrollments · {inr(prevMonth?.revenue ?? 0)}</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground">Year-to-date Avg</p>
              <p className="text-2xl font-bold mt-1">{avg.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">enrollments / month</p>
            </div>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                <SortHead plain k="month" s={historySort} className="py-2 pr-4 font-medium">Month</SortHead>
                <SortHead plain k="target" s={historySort} className="py-2 pr-4 font-medium">Target Point</SortHead>
                <SortHead plain k="enrollments" s={historySort} className="py-2 pr-4 font-medium">Enrollments</SortHead>
                <SortHead plain k="ach" s={historySort} className="py-2 pr-4 font-medium">Achievement</SortHead>
                <SortHead plain k="trend" s={historySort} className="py-2 pr-4 font-medium">Trend</SortHead>
              </tr>
            </thead>
            <tbody>
              {sortedHistory.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    {metrics.isLoading ? "Loading…" : "No activity recorded yet this year."}
                  </td>
                </tr>
              )}
              {sortedHistory.map((r) => {
                const diff = trendOf(r);
                return (
                  <tr key={r.month} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4 font-medium">{r.month}</td>
                    <td className="py-3 pr-4 tabular-nums">{r.target > 0 ? nf(r.target) : "—"}</td>
                    <td className="py-3 pr-4 tabular-nums">{nf(r.admissions)}</td>
                    <td className="py-3 pr-4">
                      {r.ach == null ? (
                        <span className="text-xs text-muted-foreground">No target</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn("h-full rounded-full", r.ach >= 100 ? "bg-success" : "bg-primary")}
                              style={{ width: `${Math.min(100, r.ach)}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums">{r.ach}%</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {diff == null ? <span className="text-xs text-muted-foreground">—</span> : <Delta value={diff} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Delta({ value, suffix }: { value: number; suffix?: string }) {
  const up = value >= 0;
  return (
    <div className={cn("mt-2 inline-flex items-center gap-1 text-xs font-medium", up ? "text-success" : "text-destructive")}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(value).toFixed(1)}%{suffix ? ` ${suffix}` : ""}
    </div>
  );
}
