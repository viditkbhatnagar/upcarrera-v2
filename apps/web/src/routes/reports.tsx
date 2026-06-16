import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Users,
  GraduationCap,
  Wallet,
  FileText,
  UserCheck,
  ClipboardList,
  CalendarDays,
  RefreshCcw,
  AlertTriangle,
  TrendingUp,
  Hash,
  type LucideIcon,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — upCarrera" }] }),
  component: ReportsPage,
});

/* -------------------------------------------------------------------------- */
/* API response shapes (mirrors apps/api/src/reports/reports.service.ts)        */
/* -------------------------------------------------------------------------- */

interface LeadsReport {
  total: number;
  by_status: Array<{ lead_status_id: number | null; count: number }>;
  by_source: Array<{ lead_source_id: string | null; count: number }>;
}

interface StudentsReport {
  total: number;
  by_admission_status: Array<{ admission_status: number | null; count: number }>;
  by_course: Array<{ course_id: number | null; count: number }>;
}

interface IncomeReport {
  grand_total: number;
  by_month: Array<{ month: string; total: number }>;
}

interface InvoicesReport {
  rows: Array<{
    id: number;
    student_id: number | null;
    student_name: string | null;
    course_id: number | null;
    course_name: string | null;
    date: string | null;
    due_date: string | null;
    total_amount: number;
    discount_amount: number;
    payable_amount: number;
    total_paid: number;
    payment_count: number;
  }>;
  totals: {
    total_amount: number;
    discount_amount: number;
    payable_amount: number;
    total_paid: number;
    count: number;
  };
}

interface ConsultantPerformanceReport {
  rows: Array<{
    consultant_id: number;
    name: string | null;
    email: string | null;
    phone: string | null;
    status: number | null;
    total_students: number;
    total_revenue: number;
  }>;
  totals: { total_students: number; total_revenue: number; consultants: number };
}

interface EnrollmentsReport {
  total: number;
  by_status: Array<{ admission_status: number; label: string; count: number }>;
}

/* -------------------------------------------------------------------------- */
/* Formatting helpers                                                          */
/* -------------------------------------------------------------------------- */

const EMPTY = "—";

// Compact INR formatter (Cr / L / k) so big rupee figures stay readable.
function formatInr(amount: number): string {
  const n = Number(amount) || 0;
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}k`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function formatInrFull(amount: number): string {
  return `₹${(Number(amount) || 0).toLocaleString("en-IN")}`;
}

function formatNum(n: number): string {
  return (Number(n) || 0).toLocaleString("en-IN");
}

function formatDate(value: string | null): string {
  if (!value) return EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// "2026-06" -> "Jun 2026"
function formatMonth(value: string): string {
  if (!value) return EMPTY;
  const [y, m] = value.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function asText(value: string | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : EMPTY;
}

// Lead status codes -> human label (legacy lead_status_id mapping).
const LEAD_STATUS_LABELS: Record<string, string> = {
  "1": "New",
  "2": "Contacted",
  "3": "Follow-up",
  "4": "Qualified",
  "5": "Converted",
  "6": "Lost",
};

// Students admission_status codes (matches reports.service ADMISSION_STATUS).
const ADMISSION_STATUS_LABELS: Record<string, string> = {
  "0": "Pending",
  "1": "In Progress",
  "2": "Enrolled",
  "3": "Passout",
  "4": "Dropout",
  "5": "Cancelled",
};

// Consultant users.status (1 active in the legacy schema).
function consultantStatusLabel(status: number | null): { label: string; tone: string } {
  if (status === 1) return { label: "Active", tone: "bg-success/10 text-success" };
  if (status === 0) return { label: "Inactive", tone: "bg-muted text-muted-foreground" };
  return { label: status == null ? EMPTY : String(status), tone: "bg-muted text-muted-foreground" };
}

/* -------------------------------------------------------------------------- */
/* Tabs                                                                        */
/* -------------------------------------------------------------------------- */

type TabId =
  | "leads"
  | "students"
  | "income"
  | "invoices"
  | "consultants"
  | "enrollments";

const TABS: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
  { id: "leads", label: "Leads", icon: ClipboardList },
  { id: "students", label: "Students", icon: GraduationCap },
  { id: "income", label: "Income", icon: TrendingUp },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "consultants", label: "Consultant Performance", icon: UserCheck },
  { id: "enrollments", label: "Enrollments", icon: Users },
];

// Which tabs actually consume the date-range filter (the API endpoints that
// accept from/to or from_date/to_date). Consultant performance has no date
// filter, so the control is hidden for it to avoid implying a no-op.
const DATE_AWARE_TABS: ReadonlySet<TabId> = new Set([
  "leads",
  "students",
  "income",
  "invoices",
  "enrollments",
]);

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

function ReportsPage() {
  const [tab, setTab] = useState<TabId>("leads");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Applied range — only updated on "Apply" so we don't refetch on every
  // keystroke. Empty strings mean "no bound" (the API omits the filter).
  const [applied, setApplied] = useState<{ from: string; to: string }>({ from: "", to: "" });

  const showDateFilter = DATE_AWARE_TABS.has(tab);

  const apply = () => setApplied({ from, to });
  const reset = () => {
    setFrom("");
    setTo("");
    setApplied({ from: "", to: "" });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Analytics
          </div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            <BarChart3 className="h-7 w-7 text-primary" />
            Reports
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Operational, financial and admission analytics across the institute.
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-surface p-1.5 shadow-card">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition",
                active
                  ? "bg-primary text-primary-foreground shadow-card"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Date range filter */}
      {showDateFilter && (
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              Date range
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                From
              </label>
              <Input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 w-40 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                To
              </label>
              <Input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 w-40 text-sm"
              />
            </div>
            <button
              onClick={apply}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-semibold text-accent-foreground shadow-card transition hover:bg-accent-hover"
            >
              Apply
            </button>
            <button
              onClick={reset}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground transition hover:bg-muted"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Reset
            </button>
            {(applied.from || applied.to) && (
              <span className="text-xs text-muted-foreground">
                Showing {applied.from ? formatDate(applied.from) : "start"} →{" "}
                {applied.to ? formatDate(applied.to) : "now"}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Active report section */}
      {tab === "leads" && <LeadsSection from={applied.from} to={applied.to} />}
      {tab === "students" && <StudentsSection from={applied.from} to={applied.to} />}
      {tab === "income" && <IncomeSection from={applied.from} to={applied.to} />}
      {tab === "invoices" && <InvoicesSection from={applied.from} to={applied.to} />}
      {tab === "consultants" && <ConsultantsSection />}
      {tab === "enrollments" && <EnrollmentsSection from={applied.from} to={applied.to} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared building blocks                                                      */
/* -------------------------------------------------------------------------- */

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  loading,
  accent = "bg-primary/10 text-primary",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card transition hover:shadow-card-hover">
      <div className={cn("grid h-11 w-11 place-items-center rounded-xl", accent)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-4 text-[13px] font-medium text-muted-foreground">{label}</div>
      {loading ? (
        <div className="mt-1 h-7 w-24 animate-pulse rounded bg-muted" />
      ) : (
        <div className="mt-1 text-2xl font-bold tracking-tight text-foreground">{value}</div>
      )}
      {sub && !loading ? <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

// A reusable status / load / empty / error wrapper for a report panel body.
function PanelState({
  isLoading,
  isError,
  error,
  isEmpty,
  emptyLabel,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <RefreshCcw className="h-8 w-8 animate-spin text-muted-foreground/50" />
        <div className="text-sm font-semibold text-foreground">Loading report…</div>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive/60" />
        <div className="text-sm font-semibold text-foreground">Couldn’t load this report</div>
        <div className="text-xs text-muted-foreground">
          {error instanceof Error ? error.message : "Please try again."}
        </div>
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <BarChart3 className="h-10 w-10 text-muted-foreground/50" />
        <div className="text-sm font-semibold text-foreground">{emptyLabel}</div>
        <div className="text-xs text-muted-foreground">
          No data for the selected range. Try widening the date filter.
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function Panel({
  title,
  subtitle,
  children,
  right,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

// A simple horizontal bar-row used by the count breakdowns (leads/students/etc).
function BreakdownRow({
  label,
  count,
  max,
  tone = "bg-primary",
}: {
  label: string;
  count: number;
  max: number;
  tone?: string;
}) {
  const pct = Math.max(count > 0 ? 4 : 0, Math.round((count / Math.max(1, max)) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">{formatNum(count)}</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={cn(
        "px-5 py-2.5 font-semibold text-[11px] uppercase tracking-wider",
        right ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

/* -------------------------------------------------------------------------- */
/* Leads section                                                               */
/* -------------------------------------------------------------------------- */

function LeadsSection({ from, to }: { from: string; to: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["reports", "leads", { from, to }],
    queryFn: () =>
      apiGet<LeadsReport>("/reports/leads", {
        from: from || undefined,
        to: to || undefined,
      }),
  });

  const byStatus = data?.by_status ?? [];
  const bySource = data?.by_source ?? [];
  const statusMax = Math.max(1, ...byStatus.map((r) => r.count));
  const sourceMax = Math.max(1, ...bySource.map((r) => r.count));
  const isEmpty = !data || ((data.total ?? 0) === 0 && byStatus.length === 0 && bySource.length === 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          icon={ClipboardList}
          label="Total Leads"
          value={data ? formatNum(data.total) : EMPTY}
          loading={isLoading}
        />
        <KpiCard
          icon={Hash}
          label="Lead Statuses"
          value={data ? formatNum(byStatus.length) : EMPTY}
          sub="distinct stages"
          loading={isLoading}
          accent="bg-accent/10 text-accent"
        />
        <KpiCard
          icon={TrendingUp}
          label="Lead Sources"
          value={data ? formatNum(bySource.length) : EMPTY}
          sub="distinct channels"
          loading={isLoading}
          accent="bg-success/10 text-success"
        />
      </div>

      <PanelState
        isLoading={isLoading}
        isError={isError}
        error={error}
        isEmpty={isEmpty}
        emptyLabel="No leads in range"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="By Status" subtitle="Leads grouped by pipeline stage">
            <div className="space-y-3.5 p-5">
              {byStatus.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No status data.</p>
              ) : (
                byStatus.map((r) => (
                  <BreakdownRow
                    key={String(r.lead_status_id)}
                    label={
                      r.lead_status_id == null
                        ? "Unassigned"
                        : LEAD_STATUS_LABELS[String(r.lead_status_id)] ??
                          `Status ${r.lead_status_id}`
                    }
                    count={r.count}
                    max={statusMax}
                  />
                ))
              )}
            </div>
          </Panel>

          <Panel title="By Source" subtitle="Leads grouped by acquisition channel">
            <div className="space-y-3.5 p-5">
              {bySource.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No source data.</p>
              ) : (
                bySource.map((r) => (
                  <BreakdownRow
                    key={String(r.lead_source_id)}
                    label={r.lead_source_id == null || r.lead_source_id === "" ? "Unknown" : r.lead_source_id}
                    count={r.count}
                    max={sourceMax}
                    tone="bg-accent"
                  />
                ))
              )}
            </div>
          </Panel>
        </div>
      </PanelState>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Students section                                                            */
/* -------------------------------------------------------------------------- */

function StudentsSection({ from, to }: { from: string; to: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["reports", "students", { from, to }],
    queryFn: () =>
      apiGet<StudentsReport>("/reports/students", {
        from: from || undefined,
        to: to || undefined,
      }),
  });

  const byStatus = data?.by_admission_status ?? [];
  const byCourse = data?.by_course ?? [];
  const statusMax = Math.max(1, ...byStatus.map((r) => r.count));
  const courseMax = Math.max(1, ...byCourse.map((r) => r.count));
  const isEmpty = !data || ((data.total ?? 0) === 0 && byStatus.length === 0 && byCourse.length === 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          icon={GraduationCap}
          label="Total Students"
          value={data ? formatNum(data.total) : EMPTY}
          loading={isLoading}
        />
        <KpiCard
          icon={Hash}
          label="Admission Statuses"
          value={data ? formatNum(byStatus.length) : EMPTY}
          sub="distinct stages"
          loading={isLoading}
          accent="bg-accent/10 text-accent"
        />
        <KpiCard
          icon={ClipboardList}
          label="Courses Represented"
          value={data ? formatNum(byCourse.length) : EMPTY}
          sub="distinct courses"
          loading={isLoading}
          accent="bg-success/10 text-success"
        />
      </div>

      <PanelState
        isLoading={isLoading}
        isError={isError}
        error={error}
        isEmpty={isEmpty}
        emptyLabel="No students in range"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="By Admission Status" subtitle="Students grouped by admission stage">
            <div className="space-y-3.5 p-5">
              {byStatus.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No status data.</p>
              ) : (
                byStatus.map((r) => (
                  <BreakdownRow
                    key={String(r.admission_status)}
                    label={
                      r.admission_status == null
                        ? "Unassigned"
                        : ADMISSION_STATUS_LABELS[String(r.admission_status)] ??
                          `Status ${r.admission_status}`
                    }
                    count={r.count}
                    max={statusMax}
                  />
                ))
              )}
            </div>
          </Panel>

          <Panel title="By Course" subtitle="Students grouped by enrolled course">
            <div className="max-h-[420px] space-y-3.5 overflow-y-auto p-5 scrollbar-thin">
              {byCourse.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No course data.</p>
              ) : (
                byCourse.map((r) => (
                  <BreakdownRow
                    key={String(r.course_id)}
                    label={r.course_id == null ? "Unassigned" : `Course #${r.course_id}`}
                    count={r.count}
                    max={courseMax}
                    tone="bg-accent"
                  />
                ))
              )}
            </div>
          </Panel>
        </div>
      </PanelState>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Income section                                                              */
/* -------------------------------------------------------------------------- */

function IncomeSection({ from, to }: { from: string; to: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["reports", "income", { from, to }],
    queryFn: () =>
      apiGet<IncomeReport>("/reports/income", {
        from: from || undefined,
        to: to || undefined,
      }),
  });

  const byMonth = data?.by_month ?? [];
  const max = Math.max(1, ...byMonth.map((m) => Number(m.total) || 0));
  const isEmpty = !data || byMonth.length === 0;
  const peak = useMemo(
    () => byMonth.reduce<{ month: string; total: number } | null>((best, m) => (best && best.total >= m.total ? best : m), null),
    [byMonth],
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          icon={Wallet}
          label="Grand Total Collected"
          value={data ? formatInrFull(data.grand_total) : EMPTY}
          loading={isLoading}
          accent="bg-success/10 text-success"
        />
        <KpiCard
          icon={CalendarDays}
          label="Months With Income"
          value={data ? formatNum(byMonth.length) : EMPTY}
          loading={isLoading}
        />
        <KpiCard
          icon={TrendingUp}
          label="Best Month"
          value={peak ? formatInr(peak.total) : EMPTY}
          sub={peak ? formatMonth(peak.month) : undefined}
          loading={isLoading}
          accent="bg-accent/10 text-accent"
        />
      </div>

      <PanelState
        isLoading={isLoading}
        isError={isError}
        error={error}
        isEmpty={isEmpty}
        emptyLabel="No income in range"
      >
        <Panel
          title="Monthly Collections"
          subtitle="Sum of payments per calendar month"
          right={
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Collected
            </span>
          }
        >
          {/* Chart */}
          <div className="px-5 pt-6">
            <div className="flex h-48 items-end gap-2">
              {byMonth.map((m) => {
                const amount = Number(m.total) || 0;
                const pct = Math.max(amount > 0 ? 4 : 0, Math.round((amount / max) * 100));
                return (
                  <div key={m.month} className="group relative flex flex-1 flex-col items-stretch justify-end">
                    <div
                      className="w-full rounded-md bg-primary transition-all group-hover:bg-primary-hover"
                      style={{ height: `${pct}%` }}
                    />
                    <div className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[10px] font-medium text-background opacity-0 shadow transition group-hover:opacity-100">
                      {formatInr(amount)} · {formatMonth(m.month)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex justify-between gap-1 text-[10px] text-muted-foreground">
              {byMonth.map((m) => (
                <span key={m.month} className="flex-1 truncate text-center">
                  {formatMonth(m.month)}
                </span>
              ))}
            </div>
          </div>

          {/* Detail table */}
          <div className="mt-4 overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="border-y border-border bg-muted/40 text-muted-foreground">
                <tr>
                  <Th>Month</Th>
                  <Th right>Collected</Th>
                </tr>
              </thead>
              <tbody>
                {byMonth.map((m) => (
                  <tr key={m.month} className="border-b border-border/70 last:border-0 transition hover:bg-muted/40">
                    <td className="px-5 py-3 font-medium text-foreground">{formatMonth(m.month)}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums text-foreground">
                      {formatInrFull(m.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/30">
                  <td className="px-5 py-3 text-sm font-semibold text-foreground">Grand total</td>
                  <td className="px-5 py-3 text-right text-sm font-bold tabular-nums text-foreground">
                    {formatInrFull(data?.grand_total ?? 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>
      </PanelState>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Invoices section                                                            */
/* -------------------------------------------------------------------------- */

function InvoicesSection({ from, to }: { from: string; to: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["reports", "invoices", { from, to }],
    queryFn: () =>
      apiGet<InvoicesReport>("/reports/invoices", {
        from_date: from || undefined,
        to_date: to || undefined,
      }),
  });

  const rows = data?.rows ?? [];
  const totals = data?.totals;
  const isEmpty = rows.length === 0;
  const outstanding = totals ? Math.max(0, totals.payable_amount - totals.total_paid) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={FileText}
          label="Invoices"
          value={totals ? formatNum(totals.count) : EMPTY}
          loading={isLoading}
        />
        <KpiCard
          icon={Wallet}
          label="Payable"
          value={totals ? formatInrFull(totals.payable_amount) : EMPTY}
          loading={isLoading}
          accent="bg-accent/10 text-accent"
        />
        <KpiCard
          icon={TrendingUp}
          label="Collected"
          value={totals ? formatInrFull(totals.total_paid) : EMPTY}
          loading={isLoading}
          accent="bg-success/10 text-success"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Outstanding"
          value={totals ? formatInrFull(outstanding) : EMPTY}
          loading={isLoading}
          accent="bg-destructive/10 text-destructive"
        />
      </div>

      <Panel
        title="Invoice Report"
        subtitle="Invoices in range with paid totals"
        right={
          totals ? (
            <span className="text-xs text-muted-foreground">
              {formatNum(totals.count)} invoice{totals.count === 1 ? "" : "s"}
            </span>
          ) : null
        }
      >
        <PanelState
          isLoading={isLoading}
          isError={isError}
          error={error}
          isEmpty={isEmpty}
          emptyLabel="No invoices in range"
        >
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                <tr>
                  <Th>Invoice</Th>
                  <Th>Student</Th>
                  <Th>Course</Th>
                  <Th>Date</Th>
                  <Th right>Payable</Th>
                  <Th right>Paid</Th>
                  <Th right>Payments</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const paidPct = r.payable_amount > 0 ? r.total_paid / r.payable_amount : r.total_paid > 0 ? 1 : 0;
                  const fullyPaid = paidPct >= 1;
                  return (
                    <tr key={r.id} className="border-b border-border/70 last:border-0 transition hover:bg-muted/40">
                      <td className="px-5 py-3 font-mono text-xs font-semibold text-primary">#{r.id}</td>
                      <td className="px-5 py-3">
                        <div className="font-medium text-foreground">{asText(r.student_name)}</div>
                      </td>
                      <td className="px-5 py-3 text-foreground">{asText(r.course_name)}</td>
                      <td className="px-5 py-3 text-muted-foreground">{formatDate(r.date)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-foreground">
                        {formatInrFull(r.payable_amount)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums",
                            fullyPaid ? "bg-success/10 text-success" : "bg-warning/15 text-warning-foreground",
                          )}
                        >
                          {formatInrFull(r.total_paid)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                        {formatNum(r.payment_count)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {totals ? (
                <tfoot>
                  <tr className="border-t border-border bg-muted/30 text-sm font-semibold text-foreground">
                    <td className="px-5 py-3" colSpan={4}>
                      Totals · {formatNum(totals.count)} invoices
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatInrFull(totals.payable_amount)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatInrFull(totals.total_paid)}</td>
                    <td className="px-5 py-3" />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </PanelState>
      </Panel>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Consultant performance section                                              */
/* -------------------------------------------------------------------------- */

function ConsultantsSection() {
  const [searchKey, setSearchKey] = useState("");
  const [applied, setApplied] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["reports", "consultant-performance", { applied }],
    queryFn: () =>
      apiGet<ConsultantPerformanceReport>("/reports/consultant-performance", {
        search_key: applied || undefined,
      }),
  });

  const rows = data?.rows ?? [];
  const totals = data?.totals;
  const isEmpty = rows.length === 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          icon={UserCheck}
          label="Consultants"
          value={totals ? formatNum(totals.consultants) : EMPTY}
          loading={isLoading}
        />
        <KpiCard
          icon={GraduationCap}
          label="Students Handled"
          value={totals ? formatNum(totals.total_students) : EMPTY}
          loading={isLoading}
          accent="bg-accent/10 text-accent"
        />
        <KpiCard
          icon={Wallet}
          label="Total Revenue"
          value={totals ? formatInrFull(totals.total_revenue) : EMPTY}
          loading={isLoading}
          accent="bg-success/10 text-success"
        />
      </div>

      <Panel
        title="Consultant Performance"
        subtitle="Student count and attributed revenue per consultant"
        right={
          <div className="flex items-center gap-2">
            <Input
              className="h-9 w-48 text-sm"
              placeholder="Search name / email / phone"
              value={searchKey}
              onChange={(e) => setSearchKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setApplied(searchKey.trim());
              }}
            />
            <button
              onClick={() => setApplied(searchKey.trim())}
              className="inline-flex h-9 items-center rounded-lg bg-accent px-3.5 text-sm font-semibold text-accent-foreground transition hover:bg-accent-hover"
            >
              Search
            </button>
          </div>
        }
      >
        <PanelState
          isLoading={isLoading}
          isError={isError}
          error={error}
          isEmpty={isEmpty}
          emptyLabel="No consultants found"
        >
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                <tr>
                  <Th>Consultant</Th>
                  <Th>Contact</Th>
                  <Th>Status</Th>
                  <Th right>Students</Th>
                  <Th right>Revenue</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const status = consultantStatusLabel(r.status);
                  return (
                    <tr
                      key={r.consultant_id}
                      className="border-b border-border/70 last:border-0 transition hover:bg-muted/40"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {initialsOf(r.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">{asText(r.name)}</div>
                            <div className="truncate text-[11px] text-muted-foreground">
                              #{r.consultant_id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="text-foreground">{asText(r.email)}</div>
                        <div className="text-[11px] text-muted-foreground">{asText(r.phone)}</div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold", status.tone)}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold text-foreground">
                        {formatNum(r.total_students)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold text-foreground">
                        {formatInrFull(r.total_revenue)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {totals ? (
                <tfoot>
                  <tr className="border-t border-border bg-muted/30 text-sm font-semibold text-foreground">
                    <td className="px-5 py-3" colSpan={3}>
                      Totals · {formatNum(totals.consultants)} consultants
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatNum(totals.total_students)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatInrFull(totals.total_revenue)}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </PanelState>
      </Panel>
    </div>
  );
}

function initialsOf(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/* -------------------------------------------------------------------------- */
/* Enrollments section                                                         */
/* -------------------------------------------------------------------------- */

// Tone per admission-status code for the enrollment breakdown bars.
const ENROLLMENT_TONE: Record<number, string> = {
  0: "bg-muted-foreground/50",
  1: "bg-warning",
  2: "bg-success",
  3: "bg-primary",
  4: "bg-accent",
  5: "bg-destructive",
};

function EnrollmentsSection({ from, to }: { from: string; to: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["reports", "enrollments", { from, to }],
    queryFn: () =>
      apiGet<EnrollmentsReport>("/reports/enrollments", {
        from: from || undefined,
        to: to || undefined,
      }),
  });

  const byStatus = data?.by_status ?? [];
  const total = data?.total ?? 0;
  const max = Math.max(1, ...byStatus.map((s) => s.count));
  // The enrollment endpoint always returns all 6 status rows (zero-filled), so
  // "empty" means there are genuinely no enrolled students in the window.
  const isEmpty = !data || total === 0;

  const enrolled = byStatus.find((s) => s.admission_status === 2)?.count ?? 0;
  const inProgress = byStatus.find((s) => s.admission_status === 1)?.count ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          icon={Users}
          label="Total Enrollments"
          value={data ? formatNum(total) : EMPTY}
          loading={isLoading}
        />
        <KpiCard
          icon={GraduationCap}
          label="Enrolled"
          value={data ? formatNum(enrolled) : EMPTY}
          loading={isLoading}
          accent="bg-success/10 text-success"
        />
        <KpiCard
          icon={ClipboardList}
          label="In Progress"
          value={data ? formatNum(inProgress) : EMPTY}
          loading={isLoading}
          accent="bg-warning/15 text-warning-foreground"
        />
      </div>

      <PanelState
        isLoading={isLoading}
        isError={isError}
        error={error}
        isEmpty={isEmpty}
        emptyLabel="No enrollments in range"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="By Admission Status" subtitle="Enrollment distribution across stages">
            <div className="space-y-3.5 p-5">
              {byStatus.map((s) => (
                <BreakdownRow
                  key={s.admission_status}
                  label={s.label}
                  count={s.count}
                  max={max}
                  tone={ENROLLMENT_TONE[s.admission_status] ?? "bg-primary"}
                />
              ))}
            </div>
          </Panel>

          <Panel title="Status Breakdown" subtitle="Counts and share of total enrollments">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                  <tr>
                    <Th>Status</Th>
                    <Th right>Count</Th>
                    <Th right>Share</Th>
                  </tr>
                </thead>
                <tbody>
                  {byStatus.map((s) => {
                    const share = total > 0 ? Math.round((s.count / total) * 100) : 0;
                    return (
                      <tr
                        key={s.admission_status}
                        className="border-b border-border/70 last:border-0 transition hover:bg-muted/40"
                      >
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-2 font-medium text-foreground">
                            <span
                              className={cn(
                                "h-2 w-2 rounded-full",
                                ENROLLMENT_TONE[s.admission_status] ?? "bg-primary",
                              )}
                            />
                            {s.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-foreground">{formatNum(s.count)}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{share}%</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/30 text-sm font-semibold text-foreground">
                    <td className="px-5 py-3">Total</td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatNum(total)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>
        </div>
      </PanelState>
    </div>
  );
}
