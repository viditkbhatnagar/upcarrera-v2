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
  MoreHorizontal,
  Eye,
  FileText,
  Download,
  Loader2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

export const Route = createFileRoute("/fees/dashboard")({
  head: () => ({
    meta: [
      { title: "Fee Dashboard — upCarrera" },
      { name: "description", content: "Financial command center for fee collections, dues, and outstanding analysis." },
    ],
  }),
  component: FeeDashboard,
});

// ---------------- Live API wiring -------------------------------------------
// KPIs (Total Receivable / Collected / Outstanding / Collection %) come from two
// live sources:
//   GET /students/finance-summary -> { count, totals:{tuitionFees,examFees,
//     miscFees,grandTotal}, byPaymentStatus } (apps/api/src/students/students.service.ts)
//   GET /invoices -> { items:[invoice + joined display fields], total, page,
//     limit } (apps/api/src/finance/finance.service.ts). Each invoice row carries
//     real payable_amount + total_paid + balance, plus joined student_name /
//     course_title / semester_title / status_label, so "collected" =
//     SUM(total_paid) and "billed" = SUM(payable_amount) over the fetched page.
// Recent activity is the live payments feed: GET /payments -> payment rows
// decorated with student_name + mode_label (plus paid_amount, payment_date,
// reference_no, invoice_id).
// The Collection Trend chart is driven by GET /finance/collection-trend?months=12
// (12 chronological monthly buckets; Quarterly/Yearly aggregate the same real
// series client-side). University-wise Outstanding is driven by
// GET /finance/outstanding-by-university (items sorted by outstanding desc).
//
// Fields the API does NOT expose on these endpoints are rendered as "—"/0 and
// never fabricated: the intake-wise outstanding rollup and the dated due-buckets.

interface FinanceSummary {
  count: number;
  totals: {
    tuitionFees: number;
    examFees: number;
    miscFees: number;
    grandTotal: number;
  };
  byPaymentStatus: Record<string, number>;
}

interface InvoiceRow {
  id: number;
  university_id: number | null;
  student_id: number | null;
  course_id: number | null;
  payment_status: string | null;
  total_amount: number | null;
  discount_amount: number | null;
  payable_amount: number | null;
  date: string | null;
  due_date: string | null;
  total_paid: number;
  payment_count: number;
  // Decorated display fields (joined server-side).
  student_name: string | null;
  course_title: string | null;
  semester_title: string | null;
  balance: number | null;
  status_label: string | null;
}

interface PaymentRow {
  id: number;
  user_id: number | null;
  invoice_id: number | null;
  payment_type: string | null;
  paid_amount: number | null;
  payment_date: string | null;
  reference_no: string | null;
  remark: string | null;
  created_on: string | null;
  // Decorated display fields (joined server-side).
  student_name: string | null;
  mode_label: string | null;
}

interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// GET /finance/collection-trend?months=12 — 12 months oldest→newest, each with a
// human label ("Jul 2025") and the ₹ collected that month (0 if none).
interface CollectionTrendPoint {
  ym: string;
  label: string;
  total: number;
}

interface CollectionTrendResponse {
  months: number;
  series: CollectionTrendPoint[];
  total: number;
}

// GET /finance/outstanding-by-university — items sorted by outstanding desc.
interface OutstandingByUniversityItem {
  university_id: number | null;
  university_title: string;
  billed: number;
  paid: number;
  outstanding: number;
  invoice_count: number;
}

interface OutstandingByUniversityResponse {
  items: OutstandingByUniversityItem[];
  total_outstanding: number;
}

const EMPTY = "—";

// Indian-style compact currency (Cr / L) so the cards keep their original look.
function inrCompact(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "₹0";
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  if (abs >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function inrFull(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return EMPTY;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function asText(value: string | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : EMPTY;
}

function timeAgo(value: string | null): string {
  if (!value) return EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return EMPTY;
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

// ---------------- Components ----------------
interface Kpi {
  label: string;
  value: string;
  delta: string | null;
  up: boolean;
  icon: typeof IndianRupee;
  tint: "primary" | "accent";
}

function KpiCard({ k, loading }: { k: Kpi; loading?: boolean }) {
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
        {loading ? (
          <div className="h-7 w-24 animate-pulse rounded bg-muted" />
        ) : (
          <div className="text-2xl font-bold tracking-tight text-foreground">{k.value}</div>
        )}
        {k.delta ? (
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${k.up ? "text-success" : "text-destructive"}`}>
            {k.up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {k.delta}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">across all invoices</div>
    </div>
  );
}

function FeeDashboard() {
  const navigate = useNavigate();
  const [range, setRange] = useState<"Monthly" | "Quarterly" | "Yearly">("Monthly");

  // Aggregate billed total across all student finance rows.
  const summaryQuery = useQuery({
    queryKey: ["fees", "finance-summary"],
    queryFn: () => apiGet<FinanceSummary>("/students/finance-summary"),
  });

  // Invoice page — real payable_amount + total_paid drive collected/outstanding
  // and the financial summary table.
  const invoicesQuery = useQuery({
    queryKey: ["fees", "invoices", { page: 1, limit: 50 }],
    queryFn: () => apiGet<ListResponse<InvoiceRow>>("/invoices", { page: 1, limit: 50 }),
  });

  // Live payments feed for the Recent Financial Activities timeline.
  const paymentsQuery = useQuery({
    queryKey: ["fees", "payments", { page: 1, limit: 6 }],
    queryFn: () => apiGet<ListResponse<PaymentRow>>("/payments", { page: 1, limit: 6 }),
  });

  // 12-month collection history for the Collection Trend chart (oldest→newest).
  const trendQuery = useQuery({
    queryKey: ["fees", "collection-trend", { months: 12 }],
    queryFn: () => apiGet<CollectionTrendResponse>("/finance/collection-trend", { months: 12 }),
  });

  // University-wise outstanding rollup (items sorted by outstanding desc).
  const universityQuery = useQuery({
    queryKey: ["fees", "outstanding-by-university"],
    queryFn: () => apiGet<OutstandingByUniversityResponse>("/finance/outstanding-by-university"),
  });

  const invoices = useMemo(() => invoicesQuery.data?.items ?? [], [invoicesQuery.data]);

  // Collected / billed derived from the real invoice rows on the page.
  const { billed, collected } = useMemo(() => {
    return invoices.reduce(
      (acc, inv) => {
        acc.billed += inv.payable_amount ?? 0;
        acc.collected += inv.total_paid ?? 0;
        return acc;
      },
      { billed: 0, collected: 0 },
    );
  }, [invoices]);

  // Total Receivable: prefer the aggregate finance grandTotal (all students);
  // fall back to invoice billed if the summary is unavailable.
  const grandTotal = summaryQuery.data?.totals.grandTotal ?? billed;
  const outstanding = Math.max(0, billed - collected);
  const collectionPct = billed > 0 ? (collected / billed) * 100 : 0;

  const kpisLoading = summaryQuery.isLoading || invoicesQuery.isLoading;
  const kpis: Kpi[] = [
    { label: "Total Receivable", value: inrCompact(grandTotal), delta: null, up: true, icon: IndianRupee, tint: "primary" },
    { label: "Total Collected", value: inrCompact(collected), delta: null, up: true, icon: Wallet, tint: "primary" },
    { label: "Outstanding Amount", value: inrCompact(outstanding), delta: null, up: false, icon: AlertTriangle, tint: "accent" },
    { label: "Collection %", value: `${collectionPct.toFixed(1)}%`, delta: null, up: true, icon: Percent, tint: "accent" },
  ];

  // Collection Trend: the API returns 12 chronological monthly buckets. "Monthly"
  // plots them as-is; "Quarterly"/"Yearly" aggregate the SAME real series client-
  // side (summing into quarters / a single yearly bar) so no data is fabricated.
  const trendSeries = useMemo(() => trendQuery.data?.series ?? [], [trendQuery.data]);
  const trend = useMemo(() => {
    if (trendSeries.length === 0) return [] as { label: string; total: number; pct: number }[];

    let buckets: { label: string; total: number }[];
    if (range === "Yearly") {
      buckets = [{ label: "This year", total: trendSeries.reduce((s, p) => s + (p.total ?? 0), 0) }];
    } else if (range === "Quarterly") {
      // Group consecutive months into quarters of 3, oldest→newest.
      const groups: { label: string; total: number }[] = [];
      for (let i = 0; i < trendSeries.length; i += 3) {
        const slice = trendSeries.slice(i, i + 3);
        const total = slice.reduce((s, p) => s + (p.total ?? 0), 0);
        const first = slice[0]?.label ?? "";
        const last = slice[slice.length - 1]?.label ?? "";
        groups.push({ label: first === last ? first : `${first} – ${last}`, total });
      }
      buckets = groups;
    } else {
      buckets = trendSeries.map((p) => ({ label: p.label, total: p.total ?? 0 }));
    }

    const max = Math.max(...buckets.map((b) => b.total), 1);
    return buckets.map((b) => ({ label: b.label, total: b.total, pct: Math.round((b.total / max) * 100) }));
  }, [trendSeries, range]);

  // University-wise outstanding: render the top 8 by pending dues as horizontal
  // bars; bar width is relative to the largest outstanding in the list.
  const universityItems = useMemo(() => universityQuery.data?.items ?? [], [universityQuery.data]);
  const universityOutstanding = useMemo(() => {
    const top = universityItems.slice(0, 8);
    const max = Math.max(...top.map((u) => u.outstanding ?? 0), 1);
    return top.map((u) => ({
      name: asText(u.university_title),
      value: inrFull(u.outstanding),
      pct: Math.round(((u.outstanding ?? 0) / max) * 100),
    }));
  }, [universityItems]);
  const universityTotalOutstanding = universityQuery.data?.total_outstanding ?? 0;

  // No intake-wise outstanding endpoint — keep this panel as a graceful empty state.
  const intakeOutstanding: { name: string; value: string; pct: number }[] = [];

  // No dated due-bucket endpoint — surface the counts we do have (0 otherwise).
  const dueCards = [
    { key: "today", label: "Due Today", value: EMPTY, count: EMPTY, icon: CalendarDays, tone: "primary", filter: "today" },
    { key: "week", label: "Due This Week", value: EMPTY, count: EMPTY, icon: CalendarRange, tone: "primary", filter: "week" },
    { key: "month", label: "Due This Month", value: EMPTY, count: EMPTY, icon: CalendarClock, tone: "accent", filter: "month" },
    {
      key: "overdue",
      label: "Pending Invoices",
      value: EMPTY,
      count: invoicesQuery.data
        ? `${summaryQuery.data?.byPaymentStatus?.["pending"] ?? invoices.filter((i) => i.payment_status === "pending").length} pending`
        : EMPTY,
      icon: AlertTriangle,
      tone: "destructive",
      filter: "overdue",
    },
  ];

  // Recent invoices: invoices now carry joined display fields, so we render the
  // real student name + course alongside the billed/paid/pending amounts. Pending
  // uses the server-computed `balance`; falls back to billed-paid if absent.
  const invoiceRows = useMemo(
    () =>
      invoices.map((inv) => {
        const billedAmt = inv.payable_amount ?? inv.total_amount ?? 0;
        const paidAmt = inv.total_paid ?? 0;
        const pendingAmt = inv.balance ?? Math.max(0, billedAmt - paidAmt);
        const pct = billedAmt > 0 ? Math.round((paidAmt / billedAmt) * 100) : 0;
        return {
          id: inv.id,
          code: `INV-${inv.id}`,
          student: asText(inv.student_name),
          course: asText(inv.course_title),
          billed: inrFull(inv.payable_amount),
          collected: inrFull(paidAmt),
          outstanding: inrFull(pendingAmt),
          pct,
          status: asText(inv.status_label ?? inv.payment_status),
        };
      }),
    [invoices],
  );

  const payments = useMemo(() => paymentsQuery.data?.items ?? [], [paymentsQuery.data]);

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
        {kpis.map((k) => <KpiCard key={k.label} k={k} loading={kpisLoading} />)}
      </div>

      {/* Collection Trend */}
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-foreground">Collection Trend</h3>
            <p className="text-xs text-muted-foreground">
              Collected over the last 12 months
              {trendQuery.data ? ` • ${inrCompact(trendQuery.data.total)} total` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-3 text-xs sm:flex">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" />Collected</span>
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
        {trendQuery.isLoading ? (
          <div className="mt-6 flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-border text-center">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground/50" />
            <div className="text-sm font-semibold text-foreground">Loading trend…</div>
          </div>
        ) : trendQuery.isError ? (
          <div className="mt-6 flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-border text-center">
            <AlertTriangle className="h-8 w-8 text-red-500/60" />
            <div className="text-sm font-semibold text-foreground">Couldn’t load trend</div>
            <div className="text-xs text-muted-foreground">
              {trendQuery.error instanceof Error ? trendQuery.error.message : "Please try again."}
            </div>
          </div>
        ) : trend.length === 0 ? (
          <div className="mt-6 flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center">
            <TrendingUp className="h-8 w-8 text-muted-foreground/40" />
            <div className="text-sm font-semibold text-foreground">No trend data</div>
            <div className="text-xs text-muted-foreground">No collections were recorded in this period.</div>
          </div>
        ) : (
          <>
            <div className="mt-6 flex h-48 items-end gap-2">
              {trend.map((d) => (
                <div key={d.label} className="group relative flex flex-1 flex-col items-center justify-end">
                  <div className="pointer-events-none absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[10px] font-semibold text-background opacity-0 shadow-card transition group-hover:opacity-100">
                    {inrFull(d.total)}
                  </div>
                  <div
                    className="w-full rounded-md bg-primary transition-all group-hover:bg-primary-hover"
                    style={{ height: `${Math.max(d.pct, 2)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-between gap-1 text-[10px] text-muted-foreground">
              {trend.map((d) => (
                <span key={d.label} className="flex-1 truncate text-center" title={d.label}>
                  {d.label}
                </span>
              ))}
            </div>
          </>
        )}
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
                <p className="text-xs text-muted-foreground">
                  Top universities by pending dues
                  {universityQuery.data ? ` • ${inrCompact(universityTotalOutstanding)} total` : ""}
                </p>
              </div>
            </div>
            <Link to="/universities/universities" className="text-xs font-semibold text-accent hover:underline">View all</Link>
          </div>
          {universityQuery.isLoading ? (
            <div className="mt-5 flex flex-col items-center justify-center gap-2 py-8 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground/50" />
              <div className="text-sm font-semibold text-foreground">Loading breakdown…</div>
            </div>
          ) : universityQuery.isError ? (
            <div className="mt-5 flex flex-col items-center justify-center gap-2 py-8 text-center">
              <AlertTriangle className="h-8 w-8 text-red-500/60" />
              <div className="text-sm font-semibold text-foreground">Couldn’t load breakdown</div>
              <div className="text-xs text-muted-foreground">
                {universityQuery.error instanceof Error ? universityQuery.error.message : "Please try again."}
              </div>
            </div>
          ) : universityOutstanding.length === 0 ? (
            <div className="mt-5 flex flex-col items-center justify-center gap-1 py-8 text-center">
              <Building2 className="h-8 w-8 text-muted-foreground/40" />
              <div className="text-sm font-semibold text-foreground">Nothing outstanding</div>
              <div className="text-xs text-muted-foreground">No universities have pending dues right now.</div>
            </div>
          ) : (
            <div className="mt-5 space-y-3.5">
              {universityOutstanding.map((u, idx) => (
                <div key={`${u.name}-${idx}`}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate pr-3 font-medium text-foreground">{u.name}</span>
                    <span className="shrink-0 font-semibold text-foreground">{u.value}</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(u.pct, 2)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
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
          {intakeOutstanding.length === 0 ? (
            <div className="mt-5 flex flex-col items-center justify-center gap-1 py-8 text-center">
              <GraduationCap className="h-8 w-8 text-muted-foreground/40" />
              <div className="text-sm font-semibold text-foreground">No breakdown available</div>
              <div className="text-xs text-muted-foreground">Intake-wise rollup isn’t provided by the API.</div>
            </div>
          ) : (
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
          )}
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

      {/* Recent Invoices */}
      <div className="rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between p-6 pb-4">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-foreground">Recent Invoices</h3>
            <p className="text-xs text-muted-foreground">Latest invoices with student, course and payable / paid / pending amounts</p>
          </div>
          <Link to="/fees/collection" className="text-xs font-semibold text-accent hover:underline">View all</Link>
        </div>
        <div className="overflow-x-auto">
          {invoicesQuery.isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
              <div className="text-sm font-semibold text-foreground">Loading invoices…</div>
            </div>
          ) : invoicesQuery.isError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <AlertTriangle className="h-10 w-10 text-red-500/60" />
              <div className="text-sm font-semibold text-foreground">Couldn’t load invoices</div>
              <div className="text-xs text-muted-foreground">
                {invoicesQuery.error instanceof Error ? invoicesQuery.error.message : "Please try again."}
              </div>
            </div>
          ) : invoiceRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/50" />
              <div className="text-sm font-semibold text-foreground">No invoices found</div>
              <div className="text-xs text-muted-foreground">Invoices will appear here once recorded.</div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-2.5 font-semibold">Student</th>
                  <th className="px-3 py-2.5 font-semibold">Course</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Payable</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Paid</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Pending</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Status</th>
                  <th className="px-6 py-2.5 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {invoiceRows.map((u) => (
                  <tr key={u.code} className="border-b border-border/70 last:border-0 transition hover:bg-muted/40">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                          <Building2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">{u.student}</div>
                          <div className="text-[11px] text-muted-foreground">{u.code} • {u.pct}% collected</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-foreground">{u.course}</td>
                    <td className="px-3 py-3.5 text-right font-semibold text-foreground">{u.billed}</td>
                    <td className="px-3 py-3.5 text-right text-success font-semibold">{u.collected}</td>
                    <td className="px-3 py-3.5 text-right text-destructive font-semibold">{u.outstanding}</td>
                    <td className="px-3 py-3.5 text-right text-foreground capitalize">{u.status}</td>
                    <td className="px-6 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link
                          to="/fees/collection"
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                          title="View Invoice"
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
          )}
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
        {paymentsQuery.isLoading ? (
          <div className="mt-5 flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground/50" />
            <div className="text-sm font-semibold text-foreground">Loading activity…</div>
          </div>
        ) : paymentsQuery.isError ? (
          <div className="mt-5 flex flex-col items-center justify-center gap-2 py-10 text-center">
            <AlertTriangle className="h-9 w-9 text-red-500/60" />
            <div className="text-sm font-semibold text-foreground">Couldn’t load activity</div>
            <div className="text-xs text-muted-foreground">
              {paymentsQuery.error instanceof Error ? paymentsQuery.error.message : "Please try again."}
            </div>
          </div>
        ) : payments.length === 0 ? (
          <div className="mt-5 flex flex-col items-center justify-center gap-2 py-10 text-center">
            <CheckCircle2 className="h-9 w-9 text-muted-foreground/40" />
            <div className="text-sm font-semibold text-foreground">No recent payments</div>
            <div className="text-xs text-muted-foreground">Recorded payments will show up here.</div>
          </div>
        ) : (
          <ol className="mt-5 relative border-l border-border pl-5 space-y-5">
            {payments.map((p) => {
              const Icon = CheckCircle2;
              const tone = "bg-success/10 text-success";
              const method = asText(p.mode_label ?? p.payment_type);
              const who = asText(p.student_name);
              const target = p.invoice_id != null ? `Invoice #${p.invoice_id}` : EMPTY;
              return (
                <li key={p.id} className="relative">
                  <span className={`absolute -left-[34px] grid h-7 w-7 place-items-center rounded-full ring-4 ring-surface ${tone}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-foreground">
                        <span className="font-semibold">{who}</span> paid {inrFull(p.paid_amount)} via {method} for{" "}
                        <span className="font-semibold text-primary">{target}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="rounded-full bg-success/10 px-2 py-0.5 font-semibold text-success">
                          Payment Recorded
                        </span>
                        <span>{timeAgo(p.created_on ?? p.payment_date)}</span>
                      </div>
                    </div>
                    <Link
                      to="/fees/collection"
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
        )}
        <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            {payments.length > 0 ? `Showing latest ${payments.length} activities` : "No activity to show"}
          </div>
          <Link to="/fees/payment-verification" className="text-xs font-semibold text-accent hover:underline">View all activity</Link>
        </div>
      </div>
    </div>
  );
}
