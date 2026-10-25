import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarDays, Clock, Download, IndianRupee, Search, SlidersHorizontal, Wallet, X, AlertTriangle } from "lucide-react";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { type DateRange } from "@/lib/date-range";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv, toCsv, type CsvColumn } from "@/components/applications/export-csv";
import { KpiCard } from "@/components/counsellor/dashboard/kpi-card";
import { DateRangePicker } from "@/components/counsellor/shared/date-range-picker";
import { Paginated } from "@/components/counsellor/shared/paginated";
import { SortHead, useSort } from "@/components/counsellor/shared/sortable-head";
import {
  EMPTY,
  PAYMENT_STATUSES,
  formatINR,
  fmtDay,
  initialsOf,
  paidPercent,
  paymentStatusStyles,
  type PaymentRow,
  type PaymentsResponse,
} from "./payments-model";

const PAGE_SIZE = 8;
const ALL = "All";

type AmountRange = { min: string; max: string };
const amountFields = [
  { key: "total", label: "Total Fee" },
  { key: "paid", label: "Fee Paid" },
  { key: "dueAmount", label: "Fee Due" },
  { key: "pending", label: "Fee Pending" },
] as const;
type AmountKey = (typeof amountFields)[number]["key"];

const dueRanges = [
  { value: "Any", label: "Any Due Period" },
  { value: "overdue", label: "Overdue" },
  { value: "next7", label: "Next 7 days" },
  { value: "next30", label: "Next 30 days" },
] as const;

interface Filters {
  search: string;
  university: string;
  course: string;
  intake: string;
  status: string;
  mode: string;
  due: string;
  dueDates: DateRange;
  paymentDates: DateRange;
  total: AmountRange;
  paid: AmountRange;
  dueAmount: AmountRange;
  pending: AmountRange;
}

const emptyFilters = (): Filters => ({
  search: "",
  university: ALL,
  course: ALL,
  intake: ALL,
  status: ALL,
  mode: ALL,
  due: "Any",
  dueDates: {},
  paymentDates: {},
  total: { min: "", max: "" },
  paid: { min: "", max: "" },
  dueAmount: { min: "", max: "" },
  pending: { min: "", max: "" },
});

const hasAmount = (r: AmountRange) => r.min !== "" || r.max !== "";
const anyAmount = (f: Filters) => amountFields.some(({ key }) => hasAmount(f[key]));
const hasFilters = (f: Filters) =>
  Boolean(f.search.trim()) ||
  [f.university, f.course, f.intake, f.status, f.mode].some((v) => v !== ALL) ||
  f.due !== "Any" ||
  Boolean(f.dueDates.from || f.paymentDates.from) ||
  anyAmount(f);

const day = (d: Date | undefined) => (d ? format(d, "yyyy-MM-dd") : undefined);
const num = (v: string) => (v === "" || Number.isNaN(Number(v)) ? undefined : Number(v));
const pick = (v: string) => (v === ALL ? undefined : v);

/** The GET /payments query for the current filters. */
function toQuery(f: Filters) {
  const to = (r: DateRange) => day(r.to ?? r.from);
  return {
    search: f.search.trim() || undefined,
    university: pick(f.university),
    course: pick(f.course),
    intake: pick(f.intake),
    status: pick(f.status),
    mode: pick(f.mode),
    due: f.due === "Any" ? undefined : f.due,
    due_from: day(f.dueDates.from),
    due_to: to(f.dueDates),
    paid_from: day(f.paymentDates.from),
    paid_to: to(f.paymentDates),
    total_min: num(f.total.min),
    total_max: num(f.total.max),
    paid_min: num(f.paid.min),
    paid_max: num(f.paid.max),
    due_min: num(f.dueAmount.min),
    due_max: num(f.dueAmount.max),
    pending_min: num(f.pending.min),
    pending_max: num(f.pending.max),
  };
}

const CSV_COLUMNS: CsvColumn<PaymentRow>[] = [
  { header: "Student Name", value: (p) => p.name },
  { header: "Student ID", value: (p) => p.student_ref },
  { header: "University", value: (p) => p.university },
  { header: "Course", value: (p) => p.course },
  { header: "Intake", value: (p) => p.intake },
  { header: "Total Fee (INR)", value: (p) => p.total },
  { header: "Fee Paid (INR)", value: (p) => p.paid },
  { header: "Fee Due (INR)", value: (p) => p.due },
  { header: "Fee Pending (INR)", value: (p) => p.pending },
  { header: "Next Due", value: (p) => p.nextDueDate },
  { header: "Last Payment", value: (p) => p.lastPaymentOn },
  { header: "Status", value: (p) => p.status },
];

/**
 * Payment Tracking (Naji's design). Wired to GET /payments, which is scoped
 * server-side to the signed-in counsellor's own students and applies every
 * filter. Sorting and paging run client-side over the filtered result.
 */
export function CounsellorPayments() {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [showMore, setShowMore] = useState(false);
  const update = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const settled = useDebouncedValue(filters);
  const query = useMemo(() => toQuery(settled), [settled]);
  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["counsellor", "payments", query],
    queryFn: () => apiGet<PaymentsResponse>("/payments", query),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const facets = data?.facets;
  const summary = data?.summary;
  const active = hasFilters(filters);
  const extraCount =
    Number(filters.mode !== ALL) + Number(Boolean(filters.paymentDates.from)) + amountFields.filter(({ key }) => hasAmount(filters[key])).length;

  const { sorted, sort } = useSort(items, {
    student: (p) => p.name,
    university: (p) => p.university,
    course: (p) => p.course,
    intake: (p) => p.intake,
    total: (p) => p.total,
    paid: (p) => p.paid,
    due: (p) => p.due,
    pending: (p) => p.pending,
    status: (p) => p.status,
  });

  const exportCsv = () =>
    downloadCsv(`payments-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(sorted, CSV_COLUMNS));

  const kpiLoading = isLoading;
  const money = (n: number | undefined) => (n == null ? EMPTY : formatINR(n));
  const share = (n: number | undefined) => (summary && summary.total_fee > 0 && n != null ? (n / summary.total_fee) * 100 : 0);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Payment Tracking</h1>
        <p className="text-sm text-muted-foreground">Monitor collections, pending fees and overdue installments.</p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Fee" value={money(summary?.total_fee)} icon={Wallet} tone="primary" progress={summary?.total_fee ? 100 : 0} sub={`${summary?.students ?? 0} students`} loading={kpiLoading} />
        <KpiCard label="Collected" value={money(summary?.collected)} icon={IndianRupee} tone="success" progress={share(summary?.collected)} sub="Fee paid so far" loading={kpiLoading} />
        <KpiCard label="Fee Due" value={money(summary?.due)} icon={AlertTriangle} tone="destructive" progress={share(summary?.due)} sub="Past due date" loading={kpiLoading} onClick={() => update("due", filters.due === "overdue" ? "Any" : "overdue")} active={filters.due === "overdue"} />
        <KpiCard label="Fee Pending" value={money(summary?.pending)} icon={Clock} tone="warning" progress={share(summary?.pending)} sub="Not yet due" loading={kpiLoading} />
      </div>

      <Card className="p-4 lg:p-5 shadow-[var(--shadow-soft)] border-border/70">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, ID, email or phone..."
              className="pl-9"
              aria-label="Search payments"
              value={filters.search}
              onChange={(e) => update("search", e.target.value)}
            />
          </div>
          <OptionSelect label="University" all="All Universities" value={filters.university} options={facets?.universities} onChange={(v) => update("university", v)} />
          <Select value={filters.status} onValueChange={(v) => update("status", v)}>
            <SelectTrigger className="w-full" aria-label="Status"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Statuses</SelectItem>
              {PAYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <OptionSelect label="Course" all="All Courses" value={filters.course} options={facets?.courses} onChange={(v) => update("course", v)} />
          <OptionSelect label="Intake" all="All Intakes" value={filters.intake} options={facets?.intakes} onChange={(v) => update("intake", v)} />
          <Select value={filters.due} onValueChange={(v) => update("due", v)}>
            <SelectTrigger className="w-full" aria-label="Due period">
              <CalendarDays className="h-4 w-4 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Due date" />
            </SelectTrigger>
            <SelectContent>
              {dueRanges.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <DateRangePicker label="Due Date" value={filters.dueDates} onChange={(v) => update("dueDates", v)} className="md:w-full md:min-w-0" />
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Button variant="outline" size="sm" aria-expanded={showMore} aria-controls="payment-additional-filters" onClick={() => setShowMore((v) => !v)}>
            <SlidersHorizontal className="h-4 w-4 mr-1.5" />
            {showMore ? "Fewer filters" : "More filters"}
            {extraCount > 0 && ` (${extraCount})`}
          </Button>
          {active && (
            <Button variant="ghost" size="sm" onClick={() => setFilters(emptyFilters())}>
              <X className="h-4 w-4 mr-1.5" />Clear all filters
            </Button>
          )}
        </div>

        {showMore && (
          <div id="payment-additional-filters" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 border-t border-border mt-4 pt-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Mode of Payment</p>
              <OptionSelect label="Mode of Payment" all="All Payment Modes" value={filters.mode} options={facets?.modes} onChange={(v) => update("mode", v)} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Last Payment Date</p>
              <DateRangePicker label="Last Payment" value={filters.paymentDates} onChange={(v) => update("paymentDates", v)} className="md:w-full md:min-w-0" />
            </div>
            {amountFields.map(({ key, label }) => (
              <AmountFilter key={key} label={label} value={filters[key]} onChange={(v) => update(key as AmountKey, v)} />
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden shadow-[var(--shadow-soft)] border-border/70">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <p className="font-semibold text-sm">All Payments</p>
            <p className="text-xs text-muted-foreground">{data?.total ?? 0} records{isFetching && !isLoading ? " · updating…" : ""}</p>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={sorted.length === 0}>
            <Download className="h-4 w-4 mr-1.5" />Export
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Paginated items={sorted} pageSize={PAGE_SIZE}>
            {(rows, offset) => (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-10">#</TableHead>
                    <SortHead k="student" s={sort}>Student</SortHead>
                    <SortHead k="university" s={sort}>University</SortHead>
                    <SortHead k="course" s={sort}>Course</SortHead>
                    <SortHead k="intake" s={sort}>Intake</SortHead>
                    <SortHead k="total" s={sort} className="text-right">Total Fee</SortHead>
                    <SortHead k="paid" s={sort} className="text-right">Fee Paid</SortHead>
                    <SortHead k="due" s={sort} className="text-right">Fee Due</SortHead>
                    <SortHead k="pending" s={sort} className="text-right">Fee Pending</SortHead>
                    <SortHead k="status" s={sort}>Status</SortHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isError && (
                    <TableRow><TableCell colSpan={10} className="text-center py-10 text-sm text-destructive">Couldn't load payments. Please refresh.</TableCell></TableRow>
                  )}
                  {isLoading && (
                    <TableRow><TableCell colSpan={10} className="text-center py-10 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
                  )}
                  {!isLoading && !isError && items.length === 0 && (
                    <TableRow><TableCell colSpan={10} className="text-center py-10 text-sm text-muted-foreground">{active ? "No payments match the filters." : "No student payments yet."}</TableCell></TableRow>
                  )}
                  {rows.map((p, i) => (
                    <PaymentTableRow key={p.id} p={p} index={offset + i + 1} />
                  ))}
                </TableBody>
              </Table>
            )}
          </Paginated>
        </div>
      </Card>
    </>
  );
}

function PaymentTableRow({ p, index }: { p: PaymentRow; index: number }) {
  const pct = paidPercent(p.paid, p.total);
  return (
    <TableRow className="group">
      <TableCell className="text-xs text-muted-foreground tabular-nums">{index}</TableCell>
      <TableCell>
        <Link to="/payments/$id" params={{ id: String(p.id) }} className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary-soft text-accent-foreground text-xs font-semibold">{initialsOf(p.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight group-hover:text-accent-foreground">{p.name ?? EMPTY}</p>
            <p className="text-xs text-muted-foreground">{p.student_ref}</p>
          </div>
        </Link>
      </TableCell>
      <TableCell className="text-sm">{p.university ?? EMPTY}</TableCell>
      <TableCell className="text-sm">{p.course ?? EMPTY}</TableCell>
      <TableCell className="text-sm">{p.intake ?? EMPTY}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">{p.total > 0 ? formatINR(p.total) : EMPTY}</TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col items-end gap-1">
          <span className="text-sm font-medium text-success tabular-nums">{formatINR(p.paid)}</span>
          <div className="h-1 w-20 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-success" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </TableCell>
      <TableCell className={cn("text-right font-medium tabular-nums", p.due > 0 ? "text-destructive" : "text-muted-foreground")}>{formatINR(p.due)}</TableCell>
      <TableCell className={cn("text-right font-medium tabular-nums", p.pending > 0 ? "text-warning-foreground" : "text-muted-foreground")}>{formatINR(p.pending)}</TableCell>
      <TableCell>
        <Badge variant="outline" className={cn("rounded-full", paymentStatusStyles[p.status])}>{p.status}</Badge>
      </TableCell>
    </TableRow>
  );
}

function OptionSelect({
  label,
  all,
  value,
  options,
  onChange,
}: {
  label: string;
  all: string;
  value: string;
  options: string[] | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full min-w-0" aria-label={label}><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{all}</SelectItem>
        {(options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function AmountFilter({ label, value, onChange }: { label: string; value: AmountRange; onChange: (v: AmountRange) => void }) {
  const invalid = value.min !== "" && value.max !== "" && Number(value.min) > Number(value.max);
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-xs font-medium text-muted-foreground">{label} (INR)</legend>
      <div className="grid grid-cols-2 gap-2">
        {(["min", "max"] as const).map((bound) => (
          <Input
            key={bound}
            type="number"
            min="0"
            inputMode="decimal"
            aria-label={`${label} ${bound === "min" ? "minimum" : "maximum"}`}
            placeholder={bound === "min" ? "Min amount" : "Max amount"}
            value={value[bound]}
            onChange={(e) => onChange({ ...value, [bound]: e.target.value })}
          />
        ))}
      </div>
      {invalid && <p className="text-xs text-destructive">Maximum must be at least the minimum.</p>}
    </fieldset>
  );
}
