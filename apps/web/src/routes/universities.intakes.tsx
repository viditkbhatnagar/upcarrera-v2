import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api";
import {
  Download,
  Plus,
  Search,
  Pencil,
  Eye,
  Trash2,
  Loader2,
  AlertTriangle,
  CalendarRange,
  CalendarCheck2,
  CalendarX2,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/universities/intakes")({
  head: () => ({ meta: [{ title: "Intakes — upCarrera" }] }),
  component: IntakesPage,
});

/**
 * Lifecycle status as shown in the UI. "Upcoming" / "Open" / "Closed" are
 * DERIVED from today's date against the intake window — they are never stored,
 * so they cannot drift. "Inactive" is the one status an operator sets by hand
 * (an intake withdrawn before its window elapses) and is the only value, other
 * than the "active" marker, ever written back to intake.status.
 *
 * "Unknown" is not a state an intake can be put into — it is what the screen
 * says when a row has no window to derive from and no stored status to fall
 * back on. Guessing "Open" there would both mislead the operator and inflate
 * the "Open Intakes" KPI with rows nobody has ever opened.
 */
type IntakeStatus = "Upcoming" | "Open" | "Closed" | "Inactive" | "Unknown";

/**
 * The status values this screen recognises in intake.status. "Closed" is a real
 * stored value, not just a derived one: an operator can close an intake by hand
 * and that decision must survive an unrelated edit.
 */
type StoredStatus = "Open" | "Closed" | "Inactive";

const STORED_STATUSES: StoredStatus[] = ["Open", "Closed", "Inactive"];

/**
 * Select values standing in for "the column is NULL" (Radix forbids "").
 * These are UI-only sentinels: they are never written back, and a field still
 * holding its sentinel is omitted from the PATCH entirely.
 */
const UNSET_STATUS = "__unset__";
const UNSET_MONTH = "__unset_month__";
const UNSET_YEAR = "__unset_year__";

/** A blank/whitespace status column is as good as unset for the Select. */
function selectableStatus(raw: string | null): string | null {
  return raw && raw.trim() ? raw : null;
}

/** A blank/whitespace month column is as good as unset for the Select. */
function selectableMonth(raw: string | null): string | null {
  return raw && raw.trim() ? raw : null;
}

type Intake = {
  id: number;
  code: string;
  name: string;
  month: string;
  year: number;
  startDate: string; // YYYY-MM-DD
  closingDate: string; // YYYY-MM-DD
  mappedUniversities: number;
  mappedCourses: number;
  /** Derived for display. */
  status: IntakeStatus;
  /**
   * Raw server values, carried untouched alongside the display values above.
   * Edit seeds from these; the coerced fields are for rendering and filtering
   * only, so a display default can never be written back over the real row.
   */
  rawName: string | null;
  rawStatus: string | null;
  /** Raw intake.month — null when the column is NULL or blank. */
  rawMonth: string | null;
  /** Raw intake.year — null when the column is NULL. */
  rawYear: number | null;
  /** rawStatus when it is one we recognise, otherwise null. */
  storedStatus: StoredStatus | null;
};

const INTAKE_STATUSES: IntakeStatus[] = [
  "Upcoming",
  "Open",
  "Closed",
  "Inactive",
  "Unknown",
];

/** Phase 1 spec: intake years are 4-digit and bounded. */
const MIN_INTAKE_YEAR = 2020;
const MAX_INTAKE_YEAR = 2035;
const MIN_INTAKE_DATE = `${MIN_INTAKE_YEAR}-01-01`;
const MAX_INTAKE_DATE = `${MAX_INTAKE_YEAR}-12-31`;

/** Raw intake row as returned by GET /api/intakes (snake_case, nullable). */
type ApiIntake = {
  id: number;
  name: string | null;
  month: string | null;
  year: number | null;
  start_date: string | null;
  closing_date: string | null;
  status: string | null;
  mapped_universities: number;
  mapped_courses: number;
};

/** Body accepted by POST /api/intakes. */
type IntakeWriteBody = {
  name: string;
  month: string;
  year: number;
  start_date: string;
  closing_date: string;
  status?: string;
};

/**
 * Body accepted by PATCH /api/intakes/:id. Every key is optional and the API
 * only writes the keys it is given (`dto.x !== undefined`), so omitting an
 * untouched field is what guarantees it cannot be overwritten.
 */
type IntakePatchBody = Partial<IntakeWriteBody>;

/** Today as YYYY-MM-DD in the viewer's timezone (string-comparable with inputs). */
function todayIso(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Recognise a stored status, or return null. Deliberately NOT a coercion: an
 * absent or unfamiliar value stays unknown instead of becoming "Open", because
 * "Open" is the one value that would silently reopen a closed intake.
 */
function toStoredStatus(value: string | null): StoredStatus | null {
  return STORED_STATUSES.includes(value as StoredStatus)
    ? (value as StoredStatus)
    : null;
}

/**
 * Status is a function of the dates, not a literal: before the window opens the
 * intake is Upcoming, after the admission closing date it is Closed. A manually
 * deactivated intake stays Inactive regardless of its dates.
 */
function deriveIntakeStatus(
  startDate: string,
  closingDate: string,
  storedStatus: StoredStatus | null,
  today: string = todayIso(),
): IntakeStatus {
  if (storedStatus === "Inactive") return "Inactive";
  if (closingDate && today > closingDate) return "Closed";
  if (startDate && today < startDate) return "Upcoming";
  // start_date and closing_date are both nullable. With no window to compare
  // against there is nothing to derive, so show what the row actually stores
  // — and when it stores nothing we recognise, say so instead of guessing.
  // "Open" was the old fallback and it fed the "Open Intakes" KPI rows that
  // had never been opened by anyone.
  if (!startDate && !closingDate) {
    if (storedStatus === "Closed") return "Closed";
    if (storedStatus === "Open") return "Open";
    return "Unknown";
  }
  return "Open";
}

/** Prisma serialises dates as full ISO timestamps; the UI expects YYYY-MM-DD. */
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function mapApiIntake(r: ApiIntake): Intake {
  const month = r.month ?? "";
  const year = r.year ?? new Date().getFullYear();
  const startDate = toDateInput(r.start_date);
  const closingDate = toDateInput(r.closing_date);
  const storedStatus = toStoredStatus(r.status);
  return {
    id: r.id,
    code: intakeCodeFrom(month, year),
    name: r.name ?? `${month} ${year} Intake`,
    month,
    year,
    startDate,
    closingDate,
    mappedUniversities: r.mapped_universities ?? 0,
    mappedCourses: r.mapped_courses ?? 0,
    status: deriveIntakeStatus(startDate, closingDate, storedStatus),
    rawName: r.name ?? null,
    rawStatus: r.status ?? null,
    rawMonth: selectableMonth(r.month),
    rawYear: r.year ?? null,
    storedStatus,
  };
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_CODE: Record<string, string> = {
  January: "JAN",
  February: "FEB",
  March: "MAR",
  April: "APR",
  May: "MAY",
  June: "JUN",
  July: "JUL",
  August: "AUG",
  September: "SEP",
  October: "OCT",
  November: "NOV",
  December: "DEC",
};

const YEARS = Array.from(
  { length: MAX_INTAKE_YEAR - MIN_INTAKE_YEAR + 1 },
  (_, i) => MIN_INTAKE_YEAR + i,
);

/** True for a month/year pair that both really exist (no NULL, no sentinel). */
function hasMonthAndYear(month: string, year: string): boolean {
  const m = month.trim();
  if (!m || m === UNSET_MONTH) return false;
  // UNSET_YEAR fails this too, so one test covers both sentinels.
  return /^\d{4}$/.test(year);
}

/**
 * The auto-generated intake name, or null when it cannot honestly be built.
 *
 * A DERIVED FIELD IS STILL A WRITE: this string goes into intake.name, so it
 * may only ever be composed from values that are really in the row. A NULL
 * month renders as "" and a NULL year renders as the current year, and
 * interpolating either of those laundered placeholders into the name column
 * is how "August 2026 Intake" and " 2028 Intake" got written over real data.
 * Callers MUST omit `name` from the PATCH when this returns null.
 */
function deriveIntakeName(month: string, year: string): string | null {
  if (!hasMonthAndYear(month, year)) return null;
  return `${month.trim()} ${year} Intake`;
}

/**
 * The single source of truth for an intake code.
 *
 * The month is ALWAYS trimmed before the lookup. mapApiIntake used to look it up
 * untrimmed while this function trimmed, so a stored month of " July " produced
 * `INT-2026-XXX` on the row and `INT-2026-JUL` in the dialog. The duplicate-code
 * gate compares the two, so it saw a change to an already-taken code and disabled
 * Save permanently — the row could never be edited again.
 */
function intakeCodeFrom(month: string, year: string | number): string {
  return `INT-${year}-${MONTH_CODE[String(month).trim()] ?? "XXX"}`;
}

/** The auto-generated intake code, or null when month/year are not both set. */
function deriveIntakeCode(month: string, year: string): string | null {
  if (!hasMonthAndYear(month, year)) return null;
  return intakeCodeFrom(month, year);
}

/** True when `iso` is a YYYY-MM-DD whose year sits inside the allowed window. */
function isYearInRange(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const year = Number(iso.slice(0, 4));
  return year >= MIN_INTAKE_YEAR && year <= MAX_INTAKE_YEAR;
}

/** Validates a year the operator has actually chosen. Null when valid. */
function validateIntakeYear(year: string): string | null {
  const parsedYear = Number(year);
  if (
    !/^\d{4}$/.test(year) ||
    parsedYear < MIN_INTAKE_YEAR ||
    parsedYear > MAX_INTAKE_YEAR
  ) {
    return `Year must be a 4-digit year between ${MIN_INTAKE_YEAR} and ${MAX_INTAKE_YEAR}.`;
  }
  return null;
}

/** Validates the intake window. Null when valid. */
function validateIntakeDates(
  startDate: string,
  closingDate: string,
): string | null {
  if (!startDate || !closingDate) return "Please fill start and closing dates.";
  if (!isYearInRange(startDate)) {
    return `Start date must fall between ${MIN_INTAKE_YEAR} and ${MAX_INTAKE_YEAR}.`;
  }
  if (!isYearInRange(closingDate)) {
    return `Admission closing date must fall between ${MIN_INTAKE_YEAR} and ${MAX_INTAKE_YEAR}.`;
  }
  if (closingDate < startDate) {
    return "Admission closing date must be on or after the start date.";
  }
  return null;
}

/**
 * Create-dialog validation: a brand new intake must supply everything, so all
 * of it is checked. Edit deliberately does NOT call this — it validates only
 * the fields the operator touched, because a stored year outside the allowed
 * window (or a NULL one) must not make an otherwise fine row uneditable.
 */
function validateIntakeForm(
  year: string,
  startDate: string,
  closingDate: string,
): string | null {
  return validateIntakeYear(year) ?? validateIntakeDates(startDate, closingDate);
}

function formatDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: IntakeStatus }) {
  const map: Record<IntakeStatus, { cls: string; dot: string; label: string }> = {
    Upcoming: {
      cls: "bg-sky-100 text-sky-700 hover:bg-sky-100",
      dot: "bg-sky-500",
      label: "Upcoming",
    },
    Open: {
      cls: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
      dot: "bg-emerald-500",
      label: "Open",
    },
    Closed: {
      cls: "bg-amber-100 text-amber-700 hover:bg-amber-100",
      dot: "bg-amber-500",
      label: "Closed",
    },
    Inactive: {
      cls: "bg-zinc-100 text-zinc-600 hover:bg-zinc-100",
      dot: "bg-zinc-400",
      label: "Inactive",
    },
    Unknown: {
      cls: "bg-slate-100 text-slate-600 hover:bg-slate-100",
      dot: "bg-slate-300",
      label: "Unknown",
    },
  };
  const s = map[status];
  return (
    <Badge className={s.cls}>
      <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </Badge>
  );
}

function KpiCard({
  title,
  value,
  icon: Icon,
  tone,
}: {
  title: string;
  value: number;
  icon: typeof CalendarRange;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{title}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function IntakesPage() {
  const qc = useQueryClient();

  // Live data: GET /api/intakes returns { items, total, page, limit }. This
  // query is the single source of truth — every mutation invalidates it rather
  // than patching a local copy of the list.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["intakes"],
    queryFn: () =>
      apiGet<{ items: ApiIntake[]; total: number; page: number; limit: number }>(
        "/intakes",
        { page: 1, limit: 100 },
      ),
  });

  const intakes = useMemo<Intake[]>(
    () => (data?.items ?? []).map(mapApiIntake),
    [data],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [viewIntake, setViewIntake] = useState<Intake | null>(null);
  const [editIntake, setEditIntake] = useState<Intake | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Intake | null>(null);

  // Delete Intake -> DELETE /intakes/:id.
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiDelete(`/intakes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intakes"] });
      toast.success("Intake deleted");
      setDeleteTarget(null);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  // Filters
  const [query, setQuery] = useState("");
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const currentYear = new Date().getFullYear();

  const kpis = useMemo(
    () => ({
      total: intakes.length,
      // rawYear, not the display year: a row whose year column is NULL renders
      // as the current year and would otherwise be counted as a this-year
      // intake it never was.
      current: intakes.filter((i) => i.rawYear === currentYear).length,
      open: intakes.filter((i) => i.status === "Open").length,
      closed: intakes.filter((i) => i.status === "Closed").length,
    }),
    [intakes, currentYear],
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return intakes.filter((i) => {
      if (q && !(i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)))
        return false;
      // Filter on what is stored, so the display placeholders cannot make an
      // empty row answer to a month or year it does not actually have.
      if (filterMonth !== "all" && i.rawMonth !== filterMonth) return false;
      if (filterYear !== "all" && String(i.rawYear ?? "") !== filterYear)
        return false;
      if (filterStatus !== "all" && i.status !== filterStatus) return false;
      return true;
    });
  }, [intakes, query, filterMonth, filterYear, filterStatus]);

  const handleExport = () => toast.success("Export started");
  const handleResetFilters = () => {
    setQuery("");
    setFilterMonth("all");
    setFilterYear("all");
    setFilterStatus("all");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Intakes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and manage reusable admission intakes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button
            onClick={() => setCreateOpen(true)}
            className="gap-2 bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" />
            Add Intake
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total Intakes"
          value={kpis.total}
          icon={CalendarRange}
          tone="bg-violet-50 text-violet-600"
        />
        <KpiCard
          title={`${currentYear} Intakes`}
          value={kpis.current}
          icon={CalendarClock}
          tone="bg-sky-50 text-sky-600"
        />
        <KpiCard
          title="Open Intakes"
          value={kpis.open}
          icon={CalendarCheck2}
          tone="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          title="Closed Intakes"
          value={kpis.closed}
          icon={CalendarX2}
          tone="bg-amber-50 text-amber-600"
        />
      </div>

      {/* Filters + Table */}
      <div className="rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search intake"
                className="pl-9"
              />
            </div>

            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Months</SelectItem>
                {MONTHS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {INTAKE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" onClick={handleResetFilters}>
                Reset
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="px-4 w-16">Sl No</TableHead>
                <TableHead>Intake Code</TableHead>
                <TableHead>Intake Name</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>Closing Date</TableHead>
                <TableHead>Mapped Universities</TableHead>
                <TableHead>Mapped Courses</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right pr-4">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading intakes…
                    </div>
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-sm text-red-500">
                      <AlertTriangle className="h-4 w-4" />
                      Failed to load intakes. Please try again.
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No intakes found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((i, idx) => (
                  <TableRow key={i.id} className="hover:bg-muted/40">
                    <TableCell className="px-4 py-3 text-sm tabular-nums text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="px-4 py-3">
                      <button className="font-mono text-xs font-medium text-primary hover:underline">
                        {i.code}
                      </button>
                    </TableCell>
                    <TableCell className="py-3 text-sm font-medium text-foreground">
                      {i.name}
                    </TableCell>
                    <TableCell className="py-3 text-sm">{formatDate(i.startDate)}</TableCell>
                    <TableCell className="py-3 text-sm">{formatDate(i.closingDate)}</TableCell>
                    <TableCell className="py-3">
                      <button className="text-sm font-medium text-primary hover:underline">
                        {i.mappedUniversities} Universities
                      </button>
                    </TableCell>
                    <TableCell className="py-3">
                      <button className="text-sm font-medium text-primary hover:underline">
                        {i.mappedCourses} Courses
                      </button>
                    </TableCell>
                    <TableCell className="py-3">
                      <StatusBadge status={i.status} />
                    </TableCell>
                    <TableCell className="py-3 pr-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="View" onClick={() => setViewIntake(i)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => setEditIntake(i)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title="Delete"
                          onClick={() => setDeleteTarget(i)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <CreateIntakeDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        existingCodes={intakes.map((i) => i.code)}
      />

      <ViewIntakeDialog intake={viewIntake} onClose={() => setViewIntake(null)} />

      {editIntake && (
        <EditIntakeDialog
          // Keyed by row id so the dialog remounts — and re-snapshots its raw
          // seed — if it is ever opened for a different intake without
          // unmounting in between.
          key={editIntake.id}
          intake={editIntake}
          onClose={() => setEditIntake(null)}
          existingCodes={intakes.map((i) => i.code)}
        />
      )}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && !deleteMut.isPending && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Delete intake</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `This will remove ${deleteTarget.name}. This action cannot be undone.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={deleteMut.isPending}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            >
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateIntakeDialog({
  open,
  onClose,
  existingCodes,
}: {
  open: boolean;
  onClose: () => void;
  existingCodes: string[];
}) {
  const qc = useQueryClient();
  const [month, setMonth] = useState<string>("July");
  const [year, setYear] = useState<string>(String(new Date().getFullYear() + 1));
  const [startDate, setStartDate] = useState("");
  const [closingDate, setClosingDate] = useState("");

  const name = `${month} ${year} Intake`;
  // Same helper as the list and the Edit dialog — see intakeCodeFrom.
  const code = intakeCodeFrom(month, year);
  const codeTaken = existingCodes.includes(code);

  const validationError = validateIntakeForm(year, startDate, closingDate);
  // Only nag about rules the user can see they broke; the "fill the dates"
  // case is obvious from the empty inputs.
  const visibleError =
    startDate && closingDate ? validationError : null;
  const derivedStatus = validationError
    ? null
    : deriveIntakeStatus(startDate, closingDate, "Open");

  const reset = () => {
    setMonth("July");
    setYear(String(new Date().getFullYear() + 1));
    setStartDate("");
    setClosingDate("");
  };

  // Add Intake -> POST /intakes. The success toast fires only from onSuccess,
  // i.e. after the API has confirmed the write.
  const createMut = useMutation({
    mutationFn: (body: IntakeWriteBody) => apiPost("/intakes", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intakes"] });
      toast.success("Intake created");
      reset();
      onClose();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  const handleSubmit = () => {
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (codeTaken) {
      toast.error(`${code} already exists`);
      return;
    }
    // `status` is deliberately not sent: the Upcoming/Open/Closed lifecycle is
    // derived from the dates at render time. The API stores its "Open"
    // (= active) default, which only ever changes via Edit -> Inactive.
    createMut.mutate({
      name,
      month,
      year: Number(year),
      start_date: startDate,
      closing_date: closingDate,
    });
  };

  const handleClose = () => {
    if (createMut.isPending) return;
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add Intake</DialogTitle>
          <DialogDescription>
            Create a reusable admission intake. Name, code and status are auto-generated.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Month</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger>
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Year</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger>
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Intake Name</Label>
            <Input value={name} readOnly className="bg-muted/40" />
          </div>

          <div className="space-y-2">
            <Label>Intake Code</Label>
            <Input value={code} readOnly className="bg-muted/40 font-mono text-xs" />
            {codeTaken && (
              <p className="text-xs text-destructive">This code already exists.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Start Date</Label>
            <Input
              type="date"
              value={startDate}
              min={MIN_INTAKE_DATE}
              max={MAX_INTAKE_DATE}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Admission Closing Date</Label>
            <Input
              type="date"
              value={closingDate}
              min={startDate || MIN_INTAKE_DATE}
              max={MAX_INTAKE_DATE}
              onChange={(e) => setClosingDate(e.target.value)}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Status</Label>
            <div className="flex items-center gap-2">
              {derivedStatus ? (
                <StatusBadge status={derivedStatus} />
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
              <span className="text-xs text-muted-foreground">
                Derived from today against the intake window.
              </span>
            </div>
          </div>

          {visibleError && (
            <p className="text-xs text-destructive sm:col-span-2">{visibleError}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={createMut.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!!validationError || codeTaken || createMut.isPending}
            className="bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            {createMut.isPending ? "Creating…" : "Create Intake"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewIntakeDialog({ intake, onClose }: { intake: Intake | null; onClose: () => void }) {
  return (
    <Dialog open={!!intake} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Intake Details</DialogTitle>
          <DialogDescription>Read-only view of the intake.</DialogDescription>
        </DialogHeader>
        {intake && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
            <div>
              <p className="text-muted-foreground">Intake Code</p>
              <p className="font-mono text-xs font-medium">{intake.code}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Intake Name</p>
              <p className="font-medium">{intake.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Month</p>
              <p className="font-medium">
                {intake.rawMonth ?? (
                  <span className="text-muted-foreground">Not set</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Year</p>
              <p className="font-medium">
                {intake.rawYear ?? (
                  <span className="text-muted-foreground">Not set</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Start Date</p>
              <p className="font-medium">{formatDate(intake.startDate)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Closing Date</p>
              <p className="font-medium">{formatDate(intake.closingDate)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Mapped Universities</p>
              <p className="font-medium">{intake.mappedUniversities}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Mapped Courses</p>
              <p className="font-medium">{intake.mappedCourses}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Status</p>
              <StatusBadge status={intake.status} />
              <p className="mt-1 text-xs text-muted-foreground">
                Derived from today against the intake window.
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Stored Status</p>
              <p className="font-medium">
                {intake.rawStatus ?? <span className="text-muted-foreground">Not set</span>}
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The raw values EditIntakeDialog seeded its form with, used for diffing. */
type EditSeed = {
  /** Raw intake.month, or UNSET_MONTH when the column is NULL/blank. */
  month: string;
  /** Raw intake.year as a string, or UNSET_YEAR when the column is NULL. */
  year: string;
  startDate: string;
  closingDate: string;
  /** Raw intake.name — null when the column is NULL. */
  name: string | null;
  /** Raw intake.status, or UNSET_STATUS when the column is NULL. */
  status: string;
};

/**
 * Seed an Edit form from the RAW server row — never from the display row.
 *
 * `Intake.name` / `.month` / `.year` / `.status` are coercions built for
 * rendering ("July 2026 Intake", "", the current year, a derived badge).
 * Seeding a form from them and PATCHing it back is precisely how a display
 * default gets written over real data, so none of them are read here.
 */
function seedIntakeForm(intake: Intake): EditSeed {
  return {
    month: selectableMonth(intake.rawMonth) ?? UNSET_MONTH,
    year: intake.rawYear != null ? String(intake.rawYear) : UNSET_YEAR,
    startDate: intake.startDate,
    closingDate: intake.closingDate,
    name: intake.rawName,
    status: selectableStatus(intake.rawStatus) ?? UNSET_STATUS,
  };
}

function EditIntakeDialog({
  intake,
  onClose,
  existingCodes,
}: {
  intake: Intake;
  onClose: () => void;
  existingCodes: string[];
}) {
  const qc = useQueryClient();

  /*
   * Captured ONCE, lazily, from the raw server row — not re-derived each
   * render, and not read from the coerced display fields. The dialog is keyed
   * by row id at the call site, so opening a different intake remounts it and
   * re-snapshots. Every diff below compares against what the form was
   * actually opened with.
   */
  const [seed] = useState(() => seedIntakeForm(intake));
  const [month, setMonth] = useState(seed.month);
  const [year, setYear] = useState(seed.year);
  const [startDate, setStartDate] = useState(seed.startDate);
  const [closingDate, setClosingDate] = useState(seed.closingDate);
  /** Raw status string, or UNSET_STATUS when the column is NULL. */
  const [statusValue, setStatusValue] = useState(seed.status);

  // Edit Intake -> PATCH /intakes/:id.
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: IntakePatchBody }) =>
      apiPatch(`/intakes/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intakes"] });
      toast.success("Intake updated");
      onClose();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  const monthChanged = month !== seed.month;
  const yearChanged = year !== seed.year;
  const monthYearChanged = monthChanged || yearChanged;

  /*
   * The name is COMPOSED from month + year, which makes writing it every bit
   * as dangerous as writing a field the operator typed. Two rules apply:
   *
   *  1. Never compose from a placeholder. deriveIntakeName returns null when
   *     either component is missing, and a null here means `name` is left out
   *     of the PATCH altogether — the stored name is better than a string
   *     built around "" or an invented current year.
   *  2. Never regenerate a name this screen did not generate. A name that is
   *     not the derived form of the seeded month/year is the operator's own
   *     ("Spring Cohort A"); it is data, not a cache, and a month or year edit
   *     leaves it exactly as stored.
   */
  const seedDerivedName = deriveIntakeName(seed.month, seed.year);
  const nextDerivedName = deriveIntakeName(month, year);
  const nameIsAutoGenerated =
    seed.name === null ||
    (seedDerivedName !== null && seed.name === seedDerivedName);
  const willRenameTo =
    monthYearChanged &&
    nameIsAutoGenerated &&
    nextDerivedName !== null &&
    nextDerivedName !== seed.name
      ? nextDerivedName
      : null;

  // What the read-only Name field shows. It switches to the new name the
  // instant month/year change, so a regeneration is never invisible, and it
  // keeps showing the stored name whenever the stored name is what will be
  // kept.
  const displayedName = willRenameTo ?? seed.name ?? nextDerivedName ?? "";
  const nameNote = willRenameTo
    ? seed.name === null
      ? "Not currently set — this generated name will be saved."
      : `Will be renamed from “${seed.name}”.`
    : !monthYearChanged
      ? "Auto-generated from month and year."
      : !nameIsAutoGenerated
        ? "Custom name — left exactly as stored."
        : nextDerivedName === null
          ? "Month and year are not both set, so the stored name is left alone."
          : "Unchanged.";

  const code = deriveIntakeCode(month, year);
  const codeTaken =
    code !== null && code !== intake.code && existingCodes.includes(code);

  /*
   * A stored value outside the standard option set is offered as its own
   * option rather than being snapped to a default, so the operator sees what
   * is really in the column — and so a row with, say, year 2019 or a NULL
   * month can still be opened and edited at all.
   */
  const unknownMonth =
    seed.month !== UNSET_MONTH &&
    !MONTHS.includes(seed.month as (typeof MONTHS)[number])
      ? seed.month
      : null;
  const unknownYear =
    seed.year !== UNSET_YEAR && !YEARS.some((y) => String(y) === seed.year)
      ? seed.year
      : null;
  const rawSelectable = selectableStatus(intake.rawStatus);
  const unknownStatus =
    rawSelectable && !toStoredStatus(rawSelectable) ? rawSelectable : null;

  /*
   * Validate only what the operator touched. The old shared validator ran over
   * the whole form, so a row whose stored year sits outside 2020–2035 — or
   * whose dates are NULL — seeded an invalid form and left Save permanently
   * disabled, stranding the row instead of corrupting it. Untouched fields are
   * not being written, so they have nothing to prove.
   */
  const yearError = yearChanged ? validateIntakeYear(year) : null;
  const datesChanged =
    startDate !== seed.startDate || closingDate !== seed.closingDate;
  const dateError = datesChanged
    ? validateIntakeDates(startDate, closingDate)
    : null;
  const validationError = yearError ?? dateError;

  const derivedStatus = dateError
    ? null
    : deriveIntakeStatus(startDate, closingDate, toStoredStatus(statusValue));

  const handleSave = () => {
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (codeTaken) {
      toast.error(`${code} already exists`);
      return;
    }

    // Diff against the seed and send ONLY what the operator actually changed.
    // Untouched keys are omitted entirely (never sent as undefined), and a
    // field still holding its UNSET_* sentinel stands for "the column is
    // NULL" and is never written back.
    const body: IntakePatchBody = {};
    if (willRenameTo !== null) body.name = willRenameTo;
    if (monthChanged && month !== UNSET_MONTH) body.month = month;
    if (yearChanged && year !== UNSET_YEAR) body.year = Number(year);
    if (startDate !== seed.startDate) body.start_date = startDate;
    if (closingDate !== seed.closingDate) body.closing_date = closingDate;
    if (statusValue !== seed.status && statusValue !== UNSET_STATUS) {
      body.status = statusValue;
    }

    if (Object.keys(body).length === 0) {
      toast.info("No changes to save");
      onClose();
      return;
    }

    updateMut.mutate({ id: intake.id, body });
  };

  const handleClose = () => {
    if (updateMut.isPending) return;
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Edit Intake</DialogTitle>
          <DialogDescription>
            Update intake details. Only the fields you change are saved.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Month</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger><SelectValue placeholder="Select month" /></SelectTrigger>
              <SelectContent>
                {seed.month === UNSET_MONTH && (
                  <SelectItem value={UNSET_MONTH}>Not set</SelectItem>
                )}
                {MONTHS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
                {unknownMonth && (
                  <SelectItem value={unknownMonth}>{unknownMonth} (stored)</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Year</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
              <SelectContent>
                {seed.year === UNSET_YEAR && (
                  <SelectItem value={UNSET_YEAR}>Not set</SelectItem>
                )}
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
                {unknownYear && (
                  <SelectItem value={unknownYear}>{unknownYear} (stored)</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Intake Name</Label>
            <Input
              value={displayedName}
              placeholder="Not set"
              readOnly
              className="bg-muted/40"
            />
            <p className="text-xs text-muted-foreground">{nameNote}</p>
          </div>

          <div className="space-y-2">
            <Label>Intake Code</Label>
            <Input
              value={code ?? ""}
              placeholder="Not set"
              readOnly
              className="bg-muted/40 font-mono text-xs"
            />
            {codeTaken && <p className="text-xs text-destructive">This code already exists.</p>}
          </div>

          <div className="space-y-2">
            <Label>Start Date</Label>
            <Input
              type="date"
              value={startDate}
              min={MIN_INTAKE_DATE}
              max={MAX_INTAKE_DATE}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Admission Closing Date</Label>
            <Input
              type="date"
              value={closingDate}
              min={startDate || MIN_INTAKE_DATE}
              max={MAX_INTAKE_DATE}
              onChange={(e) => setClosingDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Stored Status</Label>
            <Select value={statusValue} onValueChange={setStatusValue}>
              <SelectTrigger><SelectValue placeholder="Stored status" /></SelectTrigger>
              <SelectContent>
                {seed.status === UNSET_STATUS && (
                  <SelectItem value={UNSET_STATUS}>Not set</SelectItem>
                )}
                <SelectItem value="Open">Active (Open)</SelectItem>
                <SelectItem value="Closed">Closed</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
                {unknownStatus && (
                  <SelectItem value={unknownStatus}>{unknownStatus} (stored)</SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Written back only if you change it.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Displayed Status</Label>
            <div className="flex h-9 items-center gap-2">
              {derivedStatus ? (
                <StatusBadge status={derivedStatus} />
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Derived from today against the intake window.
            </p>
          </div>

          {validationError && (
            <p className="text-xs text-destructive sm:col-span-2">{validationError}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={updateMut.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!!validationError || codeTaken || updateMut.isPending}
            className="bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            {updateMut.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
