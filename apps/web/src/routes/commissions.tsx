import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import {
  TrendingUp,
  Users,
  Building2,
  CircleDollarSign,
  Wallet,
  HandCoins,
  RefreshCcw,
  AlertTriangle,
  Search,
  CheckCircle2,
  Clock,
  CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/commissions")({
  head: () => ({ meta: [{ title: "Commission Management — upCarrera" }] }),
  component: CommissionsPage,
});

/* -------------------------------------------------------------------------- *
 * Live API wiring
 *   GET /finance/student-commission     -> per-student receivables
 *   GET /finance/university-commission  -> per-university rollup + grand totals
 *   GET /commission-plans               -> planned commission rows (count only)
 * The api client unwraps the { status, message, data } envelope, so each query
 * receives the inner payload directly.
 * -------------------------------------------------------------------------- */

interface StudentCommissionRow {
  user_id: number | string;
  student_name: string | null;
  university_id?: number | string | null;
  student_id?: number | string | null;
  course_id?: number | string | null;
  upcarrera_commission: number | string | null;
  commission_received: number | string | null;
  balance_commission: number | string | null;
}

interface StudentCommissionResponse {
  items: StudentCommissionRow[];
  total: number;
  added_count: number;
  not_added_count: number;
}

interface UniversityCommissionRow {
  university_id: number | string;
  university_title: string | null;
  total_students?: number | string | null;
  commission_added_students?: number | string | null;
  commission_pending_students?: number | string | null;
  total_commission_amount: number | string | null;
  total_commission_received: number | string | null;
  total_balance_commission: number | string | null;
}

interface UniversityCommissionResponse {
  items: UniversityCommissionRow[];
  total: number;
  total_students: number;
  total_commission_added: number;
  total_commission_pending: number;
  grand_total_commission: number;
  grand_total_received: number;
  grand_total_balance: number;
}

interface CommissionPlansResponse {
  items: unknown[];
  total: number;
  page: number;
  limit: number;
}

type TabKey = "student" | "university";

function toAmount(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n =
    typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function CommissionsPage() {
  const [tab, setTab] = useState<TabKey>("student");
  const [studentSearch, setStudentSearch] = useState("");
  const [universitySearch, setUniversitySearch] = useState("");

  const studentQuery = useQuery({
    queryKey: ["finance", "student-commission"],
    queryFn: () =>
      apiGet<StudentCommissionResponse>("/finance/student-commission"),
  });

  const universityQuery = useQuery({
    queryKey: ["finance", "university-commission"],
    queryFn: () =>
      apiGet<UniversityCommissionResponse>("/finance/university-commission"),
  });

  // Count of planned commission rows. Sized to a single page since we only show
  // the headline total in a KPI card, not the individual plan rows.
  const plansQuery = useQuery({
    queryKey: ["commission-plans", { page: 1, limit: 1 }],
    queryFn: () =>
      apiGet<CommissionPlansResponse>("/commission-plans", { page: 1, limit: 1 }),
  });

  const studentRows = studentQuery.data?.items ?? [];
  const universityRows = universityQuery.data?.items ?? [];

  // Headline KPIs come from the grand totals on the university rollup (the
  // authoritative aggregate). Receivables count + plans count enrich them.
  const grandCommission = toAmount(universityQuery.data?.grand_total_commission);
  const grandReceived = toAmount(universityQuery.data?.grand_total_received);
  const grandBalance = toAmount(universityQuery.data?.grand_total_balance);
  const collectionRate =
    grandCommission > 0 ? Math.round((grandReceived / grandCommission) * 100) : 0;

  const filteredStudentRows = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return studentRows;
    return studentRows.filter(
      (r) =>
        (r.student_name ?? "").toLowerCase().includes(q) ||
        String(r.user_id).includes(q),
    );
  }, [studentRows, studentSearch]);

  const filteredUniversityRows = useMemo(() => {
    const q = universitySearch.trim().toLowerCase();
    if (!q) return universityRows;
    return universityRows.filter(
      (r) =>
        (r.university_title ?? "").toLowerCase().includes(q) ||
        String(r.university_id).includes(q),
    );
  }, [universityRows, universitySearch]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Finance
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Commission Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track receivables, university payouts, settlements, and commission
            analytics across the partner network.
          </p>
        </div>
      </div>

      {/* KPI Cards — from university-commission grand totals + plan count */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={CircleDollarSign}
          label="Total Commission"
          value={formatMoney(grandCommission)}
          hint={`${(universityQuery.data?.total_students ?? 0).toLocaleString()} students`}
          accent="bg-primary/10 text-primary"
          loading={universityQuery.isLoading}
        />
        <KpiCard
          icon={HandCoins}
          label="Received"
          value={formatMoney(grandReceived)}
          hint={`${collectionRate}% collected`}
          accent="bg-emerald-500/10 text-emerald-600"
          loading={universityQuery.isLoading}
        />
        <KpiCard
          icon={Wallet}
          label="Balance Receivable"
          value={formatMoney(grandBalance)}
          hint={`${(universityQuery.data?.total ?? 0).toLocaleString()} universities`}
          accent="bg-amber-500/10 text-amber-600"
          loading={universityQuery.isLoading}
        />
        <KpiCard
          icon={CalendarClock}
          label="Commission Plans"
          value={(plansQuery.data?.total ?? 0).toLocaleString()}
          hint={`${(studentQuery.data?.added_count ?? 0).toLocaleString()} students set up`}
          accent="bg-violet-500/10 text-violet-600"
          loading={plansQuery.isLoading}
        />
      </div>

      {/* Tabs */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="inline-flex items-center gap-1 rounded-xl bg-muted p-1">
            <TabButton
              active={tab === "student"}
              onClick={() => setTab("student")}
              icon={Users}
              label="Student"
              count={studentQuery.data?.total}
            />
            <TabButton
              active={tab === "university"}
              onClick={() => setTab("university")}
              icon={Building2}
              label="University"
              count={universityQuery.data?.total}
            />
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 w-full pl-9 text-sm sm:w-64"
              placeholder={tab === "student" ? "Search student…" : "Search university…"}
              value={tab === "student" ? studentSearch : universitySearch}
              onChange={(e) =>
                tab === "student"
                  ? setStudentSearch(e.target.value)
                  : setUniversitySearch(e.target.value)
              }
            />
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          {tab === "student" ? (
            <StudentTable
              rows={filteredStudentRows}
              isLoading={studentQuery.isLoading}
              isError={studentQuery.isError}
              error={studentQuery.error}
            />
          ) : (
            <UniversityTable
              rows={filteredUniversityRows}
              isLoading={universityQuery.isLoading}
              isError={universityQuery.isError}
              error={universityQuery.error}
            />
          )}
        </div>

        {/* Footer count */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {tab === "student" ? (
            <>
              <div>
                <span className="font-semibold text-foreground">
                  {filteredStudentRows.length.toLocaleString()}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-foreground">
                  {(studentQuery.data?.total ?? 0).toLocaleString()}
                </span>{" "}
                students
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  {(studentQuery.data?.added_count ?? 0).toLocaleString()} set
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                  {(studentQuery.data?.not_added_count ?? 0).toLocaleString()} pending
                </span>
              </div>
            </>
          ) : (
            <>
              <div>
                <span className="font-semibold text-foreground">
                  {filteredUniversityRows.length.toLocaleString()}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-foreground">
                  {(universityQuery.data?.total ?? 0).toLocaleString()}
                </span>{" "}
                universities
              </div>
              <div>
                Grand balance receivable:{" "}
                <span className="font-semibold text-foreground">
                  {formatMoney(grandBalance)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Student table ---------------- */

function StudentTable({
  rows,
  isLoading,
  isError,
  error,
}: {
  rows: StudentCommissionRow[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}) {
  if (isLoading) return <LoadingState label="Loading student commissions…" />;
  if (isError) return <ErrorState label="Couldn’t load student commissions" error={error} />;
  if (rows.length === 0)
    return (
      <EmptyState
        icon={Users}
        title="No students found"
        hint="No students match the current search."
      />
    );

  return (
    <table className="w-full min-w-[760px] border-collapse text-sm">
      <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
          <th className="px-4 py-2.5 font-semibold">Student</th>
          <th className="px-4 py-2.5 text-right font-semibold">Commission</th>
          <th className="px-4 py-2.5 text-right font-semibold">Received</th>
          <th className="px-4 py-2.5 text-right font-semibold">Balance</th>
          <th className="px-4 py-2.5 font-semibold">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const commission = toAmount(r.upcarrera_commission);
          const received = toAmount(r.commission_received);
          const balance = toAmount(r.balance_commission);
          const isSet = r.upcarrera_commission !== null && r.upcarrera_commission !== undefined;
          return (
            <tr
              key={String(r.user_id)}
              className="group border-b border-border last:border-0 transition hover:bg-muted/40"
            >
              <td className="px-4 py-3">
                <div className="font-medium text-foreground">
                  {r.student_name ?? `Student #${r.user_id}`}
                </div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  UID-{r.user_id}
                </div>
              </td>
              <td className="px-4 py-3 text-right text-sm font-medium text-foreground">
                {isSet ? formatMoney(commission) : "—"}
              </td>
              <td className="px-4 py-3 text-right text-sm text-emerald-600">
                {formatMoney(received)}
              </td>
              <td
                className={cn(
                  "px-4 py-3 text-right text-sm font-semibold",
                  balance > 0 ? "text-amber-600" : "text-muted-foreground",
                )}
              >
                {formatMoney(balance)}
              </td>
              <td className="px-4 py-3">
                {isSet ? (
                  <Pill tone="emerald" icon={CheckCircle2} label="Set" />
                ) : (
                  <Pill tone="amber" icon={Clock} label="Pending" />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ---------------- University table ---------------- */

function UniversityTable({
  rows,
  isLoading,
  isError,
  error,
}: {
  rows: UniversityCommissionRow[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}) {
  if (isLoading) return <LoadingState label="Loading university commissions…" />;
  if (isError) return <ErrorState label="Couldn’t load university commissions" error={error} />;
  if (rows.length === 0)
    return (
      <EmptyState
        icon={Building2}
        title="No universities found"
        hint="No universities match the current search."
      />
    );

  return (
    <table className="w-full min-w-[860px] border-collapse text-sm">
      <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
          <th className="px-4 py-2.5 font-semibold">University</th>
          <th className="px-4 py-2.5 text-right font-semibold">Students</th>
          <th className="px-4 py-2.5 text-right font-semibold">Commission</th>
          <th className="px-4 py-2.5 text-right font-semibold">Received</th>
          <th className="px-4 py-2.5 text-right font-semibold">Balance</th>
          <th className="px-4 py-2.5 font-semibold">Collection</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const commission = toAmount(r.total_commission_amount);
          const received = toAmount(r.total_commission_received);
          const balance = toAmount(r.total_balance_commission);
          const rate = commission > 0 ? Math.round((received / commission) * 100) : 0;
          const added = toAmount(r.commission_added_students);
          const pending = toAmount(r.commission_pending_students);
          return (
            <tr
              key={String(r.university_id)}
              className="group border-b border-border last:border-0 transition hover:bg-muted/40"
            >
              <td className="px-4 py-3">
                <div className="font-medium text-foreground">
                  {r.university_title ?? `University #${r.university_id}`}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {added.toLocaleString()} set · {pending.toLocaleString()} pending
                </div>
              </td>
              <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                {toAmount(r.total_students).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right text-sm font-medium text-foreground">
                {formatMoney(commission)}
              </td>
              <td className="px-4 py-3 text-right text-sm text-emerald-600">
                {formatMoney(received)}
              </td>
              <td
                className={cn(
                  "px-4 py-3 text-right text-sm font-semibold",
                  balance > 0 ? "text-amber-600" : "text-muted-foreground",
                )}
              >
                {formatMoney(balance)}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${Math.min(100, rate)}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">
                    {rate}%
                  </span>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ---------------- Shared UI ---------------- */

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
  loading,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  hint?: string;
  accent?: string;
  loading?: boolean;
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
      {loading ? (
        <div className="h-6 w-20 animate-pulse rounded bg-muted" />
      ) : (
        <div className="text-xl font-bold tracking-tight text-foreground">{value}</div>
      )}
      {hint && !loading && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Users;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition",
        active
          ? "bg-surface text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
            active ? "bg-primary/10 text-primary" : "bg-muted-foreground/10 text-muted-foreground",
          )}
        >
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}

function Pill({
  tone,
  icon: Icon,
  label,
}: {
  tone: "emerald" | "amber";
  icon: typeof CheckCircle2;
  label: string;
}) {
  const styles =
    tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20"
      : "bg-amber-500/10 text-amber-600 ring-amber-500/20";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
        styles,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <RefreshCcw className="h-8 w-8 animate-spin text-muted-foreground/50" />
      <div className="text-sm font-semibold text-foreground">{label}</div>
    </div>
  );
}

function ErrorState({ label, error }: { label: string; error: unknown }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <AlertTriangle className="h-10 w-10 text-red-500/60" />
      <div className="text-sm font-semibold text-foreground">{label}</div>
      <div className="text-xs text-muted-foreground">
        {error instanceof Error ? error.message : "Please try again."}
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof Users;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/50" />
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
