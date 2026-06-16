import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import {
  Download,
  Search,
  Filter,
  RefreshCcw,
  Wallet,
  Receipt,
  CircleDollarSign,
  TimerReset,
  FileText,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/fees")({
  head: () => ({ meta: [{ title: "Fee Management — upCarrera" }] }),
  component: FeesPage,
});

// --- Live API wiring (GET /api/invoices) ---------------------------------
// The invoices list endpoint is paginated and enriches each row with
// payment_count + total_paid. It returns raw invoice rows (ids + raw amount
// columns) and does NOT join the users/courses tables, so student and course
// *names* are not available here — we render the ids the endpoint gives us and
// derive an outstanding balance from payable_amount - total_paid.
// payment_status is a string code; we drive the server-side filter from it and
// map it to a friendly label + styling.
const PAGE_SIZE = 12;

interface ApiInvoiceRow {
  id: number | string;
  student_id: number | string | null;
  university_id: number | string | null;
  course_id: number | string | null;
  payment_status: string | number | null;
  total_amount: number | string | null;
  discount_amount: number | string | null;
  payable_amount: number | string | null;
  date: string | null;
  due_date: string | null;
  remarks: string | null;
  payment_count: number | string | null;
  total_paid: number | string | null;
}

// payment_status values are legacy string/number codes. Map the ones we know to
// a friendly label + badge styling; anything else renders as-is under a neutral
// style so unexpected codes still surface rather than disappearing.
type StatusKey = "paid" | "partial" | "pending" | "overdue";
const STATUS_LABEL: Record<StatusKey, string> = {
  paid: "Paid",
  partial: "Partially Paid",
  pending: "Pending",
  overdue: "Overdue",
};
const STATUS_STYLES: Record<StatusKey, string> = {
  paid: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  partial: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  pending: "bg-blue-500/10 text-blue-600 ring-blue-500/20",
  overdue: "bg-red-500/10 text-red-600 ring-red-500/20",
};
const STATUS_DOT: Record<StatusKey, string> = {
  paid: "bg-emerald-500",
  partial: "bg-amber-500",
  pending: "bg-blue-500",
  overdue: "bg-red-500",
};

// Friendly filter options -> the raw query value sent to the API.
const STATUS_FILTERS: Array<{ value: StatusKey; query: string }> = [
  { value: "paid", query: "paid" },
  { value: "partial", query: "partial" },
  { value: "pending", query: "pending" },
  { value: "overdue", query: "overdue" },
];

function normalizeStatus(raw: string | number | null): StatusKey | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === "paid" || s === "1") return "paid";
  if (s === "partial" || s === "partially paid" || s === "2") return "partial";
  if (s === "overdue") return "overdue";
  if (s === "pending" || s === "unpaid" || s === "0") return "pending";
  return null;
}

function toAmount(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: number): string {
  return `₹${value.toLocaleString("en-IN")}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

interface FeeRow {
  id: string;
  student: string;
  course: string;
  status: StatusKey | null;
  rawStatus: string;
  payable: number;
  paid: number;
  outstanding: number;
  date: string;
  dueDate: string;
  payments: number;
}

function mapApiRow(r: ApiInvoiceRow): FeeRow {
  const payable = toAmount(r.payable_amount ?? r.total_amount);
  const paid = toAmount(r.total_paid);
  const status = normalizeStatus(r.payment_status);
  return {
    id: String(r.id),
    student: r.student_id != null ? `Student #${r.student_id}` : "—",
    course: r.course_id != null ? `Course #${r.course_id}` : "—",
    status,
    rawStatus:
      r.payment_status != null && String(r.payment_status).trim() !== ""
        ? String(r.payment_status)
        : "—",
    payable,
    paid,
    outstanding: Math.max(0, payable - paid),
    date: formatDate(r.date),
    dueDate: formatDate(r.due_date),
    payments: Number(toAmount(r.payment_count)),
  };
}

function FeesPage() {
  const [statusFilter, setStatusFilter] = useState<StatusKey | "All">("All");
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [page, setPage] = useState(1);

  // Live invoices list. The API supports server-side page/limit + payment_status
  // (+ student_id/course_id/date filters); we drive page + payment_status here.
  // Free-text refinement runs client-side over the fetched page since the list
  // endpoint does not join the student/course label columns.
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["invoices", { page, limit: PAGE_SIZE, statusFilter }],
    queryFn: () =>
      apiGet<{ items: ApiInvoiceRow[]; total: number; page: number; limit: number }>("/invoices", {
        page,
        limit: PAGE_SIZE,
        payment_status:
          statusFilter === "All"
            ? undefined
            : STATUS_FILTERS.find((f) => f.value === statusFilter)?.query,
      }),
  });

  const apiTotal = data?.total ?? 0;
  const allRows = useMemo(() => (data?.items ?? []).map(mapApiRow), [data]);

  const pageRows = useMemo(() => {
    return allRows.filter((r) => {
      if (search && !r.id.toLowerCase().includes(search.toLowerCase())) return false;
      if (studentId && !r.student.toLowerCase().includes(studentId.toLowerCase())) return false;
      return true;
    });
  }, [allRows, search, studentId]);

  // KPI totals are derived from the current page (no aggregate endpoint for the
  // invoices headline metrics is exposed in the catalog).
  const totals = useMemo(() => {
    const billed = allRows.reduce((s, r) => s + r.payable, 0);
    const collected = allRows.reduce((s, r) => s + r.paid, 0);
    const outstanding = allRows.reduce((s, r) => s + r.outstanding, 0);
    const overdue = allRows.filter((r) => r.status === "overdue").length;
    return { billed, collected, outstanding, overdue };
  }, [allRows]);

  const totalPages = Math.max(1, Math.ceil(apiTotal / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const resetFilters = () => {
    setStatusFilter("All");
    setSearch("");
    setStudentId("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Finance
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Fee Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track invoices, collections, installment status, and overdue follow-ups.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={Receipt}
          label="Total Billed"
          value={formatMoney(totals.billed)}
          hint={`${apiTotal.toLocaleString()} invoices`}
          accent="bg-primary/10 text-primary"
        />
        <KpiCard
          icon={CircleDollarSign}
          label="Collected"
          value={formatMoney(totals.collected)}
          hint="This page"
          accent="bg-emerald-500/10 text-emerald-600"
        />
        <KpiCard
          icon={Wallet}
          label="Outstanding"
          value={formatMoney(totals.outstanding)}
          hint="This page"
          accent="bg-amber-500/10 text-amber-600"
        />
        <KpiCard
          icon={TimerReset}
          label="Overdue"
          value={totals.overdue.toLocaleString()}
          hint="On this page"
          accent="bg-red-500/10 text-red-600"
        />
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Filter className="h-4 w-4 text-muted-foreground" />
          Filters
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <FilterInput icon={Search} placeholder="Invoice ID" value={search} onChange={setSearch} />
          <FilterInput
            icon={FileText}
            placeholder="Student"
            value={studentId}
            onChange={setStudentId}
          />
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as StatusKey | "All");
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Payment status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All statuses</SelectItem>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {STATUS_LABEL[f.value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={resetFilters}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Reset filters
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-semibold text-foreground">
            {isLoading ? "Loading…" : `${apiTotal.toLocaleString()} invoices`}
            {statusFilter !== "All" && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                {STATUS_LABEL[statusFilter]}
                <button
                  onClick={() => {
                    setStatusFilter("All");
                    setPage(1);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Sorted by <span className="font-medium text-foreground">Invoice Date</span> · Newest
            first
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <RefreshCcw className="h-8 w-8 animate-spin text-muted-foreground/50" />
              <div className="text-sm font-semibold text-foreground">Loading invoices…</div>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <AlertTriangle className="h-10 w-10 text-red-500/60" />
              <div className="text-sm font-semibold text-foreground">Couldn’t load invoices</div>
              <div className="text-xs text-muted-foreground">
                {error instanceof Error ? error.message : "Please try again."}
              </div>
            </div>
          ) : pageRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Wallet className="h-10 w-10 text-muted-foreground/50" />
              <div className="text-sm font-semibold text-foreground">No invoices found</div>
              <div className="text-xs text-muted-foreground">
                Try adjusting your filters or clearing them.
              </div>
            </div>
          ) : (
            <table className="w-full min-w-[1000px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">Invoice</th>
                  <th className="px-4 py-2.5 font-semibold">Student</th>
                  <th className="px-4 py-2.5 font-semibold">Course</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Payable</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Paid</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Outstanding</th>
                  <th className="px-4 py-2.5 font-semibold">Due</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr
                    key={r.id}
                    className="group border-b border-border last:border-0 transition hover:bg-muted/40"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-primary">
                        INV-{r.id}
                      </span>
                      <div className="text-[11px] text-muted-foreground">
                        {r.payments} payment{r.payments === 1 ? "" : "s"} · {r.date}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{r.student}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{r.course}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-foreground">
                      {formatMoney(r.payable)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-emerald-600">
                      {formatMoney(r.paid)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right text-sm font-semibold",
                        r.outstanding > 0 ? "text-red-600" : "text-muted-foreground",
                      )}
                    >
                      {formatMoney(r.outstanding)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{r.dueDate}</td>
                    <td className="px-4 py-3">
                      {r.status ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
                            STATUS_STYLES[r.status],
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[r.status])} />
                          {STATUS_LABEL[r.status]}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground ring-1 ring-inset ring-border">
                          {r.rawStatus}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <div>
            Showing{" "}
            <span className="font-semibold text-foreground">
              {apiTotal === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}
            </span>{" "}
            –{" "}
            <span className="font-semibold text-foreground">
              {Math.min(currentPage * PAGE_SIZE, apiTotal)}
            </span>{" "}
            of <span className="font-semibold text-foreground">{apiTotal}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 font-medium text-foreground hover:bg-muted disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <span className="px-2 font-medium text-foreground">
              Page {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 font-medium text-foreground hover:bg-muted disabled:opacity-40"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Helpers ---------------- */

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 text-left shadow-card">
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            accent ?? "bg-muted text-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-xl font-bold tracking-tight text-foreground">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function FilterInput({
  icon: Icon,
  placeholder,
  value,
  onChange,
}: {
  icon: typeof Search;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="h-9 pl-9 text-sm"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
