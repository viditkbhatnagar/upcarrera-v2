import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiPut, apiDelete, ApiError } from "@/lib/api";
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
  Users,
  Layers,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useUniversityOptions } from "@/components/applications/catalogs";
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
import { downloadCsv, toCsv, type CsvColumn } from "@/components/applications/export-csv";

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
  /** IN04: real offering counts from university_course_intake. */
  mappedUniversities: number;
  mappedCourses: number;
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
  /** IN04: real offering counts from university_course_intake (bulk, no N+1). */
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
  // A corrupt stored date (0025-08-30) says nothing about the window, so the
  // status is derived as if it were missing rather than from a year-25 date.
  const statusStart = isYearInRange(startDate) ? startDate : "";
  const statusClosing = isYearInRange(closingDate) ? closingDate : "";
  return {
    id: r.id,
    code: intakeCodeFrom(month, year),
    name: r.name ?? `${month} ${year} Intake`,
    month,
    year,
    startDate,
    closingDate,
    status: deriveIntakeStatus(statusStart, statusClosing, storedStatus),
    rawName: r.name ?? null,
    rawStatus: r.status ?? null,
    rawMonth: selectableMonth(r.month),
    rawYear: r.year ?? null,
    storedStatus,
    mappedUniversities: Number(r.mapped_universities ?? 0),
    mappedCourses: Number(r.mapped_courses ?? 0),
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
 * Edit-dialog date validation: only a date the operator CHANGED is checked
 * (required, 4-digit year inside the window), and the ordering rule applies
 * only when both dates are valid. A stored corrupt date (0025-08-30) that is
 * left alone therefore never blocks saving an unrelated change — the API
 * applies the same rule.
 */
function validateChangedDates(
  startDate: string,
  closingDate: string,
  startChanged: boolean,
  closingChanged: boolean,
): string | null {
  if (startChanged) {
    if (!startDate) return "Please fill the start date.";
    if (!isYearInRange(startDate)) {
      return `Start date must fall between ${MIN_INTAKE_YEAR} and ${MAX_INTAKE_YEAR}.`;
    }
  }
  if (closingChanged) {
    if (!closingDate) return "Please fill the admission closing date.";
    if (!isYearInRange(closingDate)) {
      return `Admission closing date must fall between ${MIN_INTAKE_YEAR} and ${MAX_INTAKE_YEAR}.`;
    }
  }
  if (
    (startChanged || closingChanged) &&
    isYearInRange(startDate) &&
    isYearInRange(closingDate) &&
    closingDate < startDate
  ) {
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

/** Years no real intake or enrolment date can have — legacy typos (0025, 0226). */
const IMPLAUSIBLE_BEFORE_YEAR = 1900;
const IMPLAUSIBLE_AFTER_YEAR = 2100;

/**
 * A stored date, rendered honestly.
 *
 * A legacy typo such as 0025-08-30 is a syntactically valid DATE, and
 * `new Date()` happily formats it as "30 Aug 25" — a plausible-looking wrong
 * date. Anything outside 1900–2100 is shown as stored, labelled invalid; a real
 * date outside the 2020–2035 intake window is shown with that caveat.
 */
function formatDate(iso: string) {
  if (!iso) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return `Invalid date — ${iso}`;
  const year = Number(match[1]);
  if (year < IMPLAUSIBLE_BEFORE_YEAR || year > IMPLAUSIBLE_AFTER_YEAR) {
    return `Invalid date — ${iso}`;
  }
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return `Invalid date — ${iso}`;
  const text = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return isYearInRange(iso)
    ? text
    : `${text} (outside ${MIN_INTAKE_YEAR}–${MAX_INTAKE_YEAR})`;
}

/** True when a stored date is one formatDate flags (so the UI can colour it). */
function isFlaggedDate(iso: string): boolean {
  return iso !== "" && !isYearInRange(iso);
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

/* ------------------------------------------------------------------------ */
/* Intake master (QA IN01)                                                  */
/* ------------------------------------------------------------------------ */

/**
 * The intake MASTER is the legacy `sessions` table, served by
 * GET /api/intakes/sessions. It is the list students.session_id and
 * applications.session_id point at, the list the New Application "Intake"
 * picker offers, and the list Intake-wise Enrollment rolls up — so this screen
 * and that one now show the same intakes.
 *
 * The `intake` table this screen used to show alone holds schedules (dates and
 * a status). Nothing references it yet — no student or application carries an
 * intake.id — so its rows are shown below as "Intake schedules", labelled as
 * not yet linked, instead of being presented as the intakes themselves.
 */
type ApiIntakeSession = {
  session_id: number;
  session_title: string | null;
  created_at: string | null;
  /** Month/year read from the title by the API. Display only — never written. */
  period: { month: string | null; year: number | null };
  applications_count: number;
  students_count: number;
  enrolled_count: number;
  pending_count: number;
  first_enrollment_date: string | null;
  last_enrollment_date: string | null;
  invalid_enrollment_dates: { count: number; samples: string[] };
};

type IntakeMasterResponse = {
  items: ApiIntakeSession[];
  total: number;
  page: number;
  limit: number;
  unassigned: { students_count: number; applications_count: number };
  date_window: { min: string; max: string };
};

/** One page holds the whole master (it is a short list of intakes). */
const MASTER_LIMIT = 500;
const MASTER_QUERY = { page: 1, limit: MASTER_LIMIT } as const;

/** Same normalisation the API uses for its 409 duplicate check. */
function normaliseTitle(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** "Jul 2025", "2025", or null when the title names neither. */
function formatPeriod(p: ApiIntakeSession["period"]): string | null {
  if (!p.month && !p.year) return null;
  return [p.month?.slice(0, 3), p.year].filter(Boolean).join(" ");
}

/**
 * An enrolment date the API has already vetted as plausible (2000 to five
 * years ahead). Enrolments are not bound by the 2020–2035 intake window.
 */
function formatEnrolmentDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return `Invalid date — ${iso}`;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function describeInvalidDates(invalid: { count: number; samples: string[] }): string | null {
  if (invalid.count === 0) return null;
  const first = invalid.samples[0] ?? "unreadable value";
  const more = invalid.count - 1;
  return `Invalid date — ${first}${more > 0 ? ` (+${more} more)` : ""}`;
}

const MASTER_CSV: CsvColumn<ApiIntakeSession>[] = [
  { header: "Intake ID", value: (r) => r.session_id },
  { header: "Intake", value: (r) => r.session_title ?? "" },
  { header: "Month (from name)", value: (r) => r.period.month ?? "" },
  { header: "Year (from name)", value: (r) => r.period.year ?? "" },
  { header: "Applications", value: (r) => r.applications_count },
  { header: "Students", value: (r) => r.students_count },
  { header: "Enrolled", value: (r) => r.enrolled_count },
  { header: "First enrolment", value: (r) => r.first_enrollment_date ?? "" },
  { header: "Last enrolment", value: (r) => r.last_enrollment_date ?? "" },
  { header: "Invalid enrolment dates", value: (r) => r.invalid_enrollment_dates.count },
  {
    header: "Invalid date examples",
    value: (r) => r.invalid_enrollment_dates.samples.join(" "),
  },
];

function IntakesPage() {
  const qc = useQueryClient();

  // The intake master. Every master mutation invalidates ["intake-master"]
  // (this list and Intake-wise Enrollment) and the application form's intake
  // picker, ["catalog", "intakes"].
  const master = useQuery({
    queryKey: ["intake-master", "intakes", MASTER_QUERY],
    queryFn: () => apiGet<IntakeMasterResponse>("/intakes/sessions", MASTER_QUERY),
  });
  const masterRows = useMemo(() => master.data?.items ?? [], [master.data]);

  // IN04: the live Universities filter (server-side via ?university_id) keeps only
  // intakes that have at least one offering for the chosen university.
  const universities = useUniversityOptions();
  const [filterUniversityId, setFilterUniversityId] = useState<string>("all");

  // Intake schedules: GET /api/intakes returns { items, total, page, limit }.
  // This query is the single source of truth for the schedule table — every
  // schedule mutation invalidates it rather than patching a local copy.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["intakes", filterUniversityId],
    queryFn: () =>
      apiGet<{ items: ApiIntake[]; total: number; page: number; limit: number }>(
        "/intakes",
        {
          page: 1,
          limit: 100,
          university_id: filterUniversityId !== "all" ? filterUniversityId : undefined,
        },
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
  // IN04: the intake whose offerings editor is open.
  const [manageIntake, setManageIntake] = useState<Intake | null>(null);
  /** Add (null) or rename (a row) an intake in the master. */
  const [titleDialog, setTitleDialog] = useState<
    { mode: "add" } | { mode: "rename"; row: ApiIntakeSession } | null
  >(null);

  // Delete Intake -> DELETE /intakes/:id.
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiDelete(`/intakes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intakes"] });
      toast.success("Intake schedule deleted");
      setDeleteTarget(null);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  // Filters (schedule table)
  const [query, setQuery] = useState("");
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const currentYear = new Date().getFullYear();

  const kpis = useMemo(
    () => ({
      total: master.data?.total ?? 0,
      // Read from the title ("July 2026 Intake"); a title that names no year
      // is not counted as this year's.
      current: masterRows.filter((i) => i.period.year === currentYear).length,
      students: masterRows.reduce((sum, i) => sum + i.students_count, 0),
      schedules: intakes.length,
      openSchedules: intakes.filter((i) => i.status === "Open").length,
      closedSchedules: intakes.filter((i) => i.status === "Closed").length,
    }),
    [master.data, masterRows, intakes, currentYear],
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

  const handleExport = () => {
    if (masterRows.length === 0) {
      toast.error("Nothing to export — the intake list is empty.");
      return;
    }
    downloadCsv(
      `intakes-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(masterRows, MASTER_CSV),
    );
  };
  const handleResetFilters = () => {
    setQuery("");
    setFilterMonth("all");
    setFilterYear("all");
    setFilterStatus("all");
    setFilterUniversityId("all");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Intakes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The intakes applications and students are filed under.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleExport}
            disabled={master.isLoading || master.isError}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button
            onClick={() => setTitleDialog({ mode: "add" })}
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
          title="Students in Intakes"
          value={kpis.students}
          icon={Users}
          tone="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          title="Intake Schedules"
          value={kpis.schedules}
          icon={CalendarCheck2}
          tone="bg-amber-50 text-amber-600"
        />
      </div>

      <MasterIntakeSection
        response={master.data}
        isLoading={master.isLoading}
        isError={master.isError}
        onRename={(row) => setTitleDialog({ mode: "rename", row })}
      />

      {/* Intake schedules (the `intake` table) */}
      <div className="rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Intake Schedules</h2>
              <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
                Start and closing dates recorded for intakes. These records are stored
                separately and are not yet linked to the intakes above, so applications
                and students are not counted against them.
                {kpis.schedules > 0 &&
                  ` ${kpis.openSchedules} open, ${kpis.closedSchedules} closed.`}
              </p>
            </div>
            <Button variant="outline" className="gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Schedule
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search schedule"
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

            {/* IN04: live universities filter, applied server-side via ?university_id. */}
            <Select value={filterUniversityId} onValueChange={setFilterUniversityId}>
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder="University" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Universities</SelectItem>
                {universities.options.map((u) => (
                  <SelectItem key={u.value} value={u.value}>
                    {u.label}
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
                      Loading intake schedules…
                    </div>
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-sm text-red-500">
                      <AlertTriangle className="h-4 w-4" />
                      Failed to load intake schedules. Please try again.
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {intakes.length === 0
                      ? "No intake schedules recorded yet."
                      : "No intake schedules match the filters."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((i, idx) => (
                  <TableRow key={i.id} className="hover:bg-muted/40">
                    <TableCell className="px-4 py-3 text-sm tabular-nums text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="px-4 py-3">
                      <button
                        className="font-mono text-xs font-medium text-primary hover:underline"
                        onClick={() => setViewIntake(i)}
                      >
                        {i.code}
                      </button>
                    </TableCell>
                    <TableCell className="py-3 text-sm font-medium text-foreground">
                      {i.name}
                    </TableCell>
                    <TableCell
                      className={`py-3 text-sm ${isFlaggedDate(i.startDate) ? "font-medium text-amber-700" : ""}`}
                    >
                      {formatDate(i.startDate)}
                    </TableCell>
                    <TableCell
                      className={`py-3 text-sm ${isFlaggedDate(i.closingDate) ? "font-medium text-amber-700" : ""}`}
                    >
                      {formatDate(i.closingDate)}
                    </TableCell>
                    {/* IN04: real offering counts, each a link into the offerings editor. */}
                    <TableCell className="py-3 text-sm">
                      <button
                        type="button"
                        onClick={() => setManageIntake(i)}
                        className="font-medium text-primary hover:underline"
                        title="Manage this intake's offerings"
                      >
                        {i.mappedUniversities}
                      </button>
                    </TableCell>
                    <TableCell className="py-3 text-sm">
                      <button
                        type="button"
                        onClick={() => setManageIntake(i)}
                        className="font-medium text-primary hover:underline"
                        title="Manage this intake's offerings"
                      >
                        {i.mappedCourses}
                      </button>
                    </TableCell>
                    <TableCell className="py-3">
                      <StatusBadge status={i.status} />
                    </TableCell>
                    <TableCell className="py-3 pr-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Manage offerings" onClick={() => setManageIntake(i)}>
                          <Layers className="h-4 w-4" />
                        </Button>
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

      {titleDialog && (
        <IntakeTitleDialog
          key={titleDialog.mode === "rename" ? titleDialog.row.session_id : "add"}
          target={titleDialog.mode === "rename" ? titleDialog.row : null}
          existing={masterRows}
          onClose={() => setTitleDialog(null)}
        />
      )}

      <CreateIntakeDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        existingCodes={intakes.map((i) => i.code)}
      />

      <ViewIntakeDialog intake={viewIntake} onClose={() => setViewIntake(null)} />

      <ManageOfferingsDialog
        intake={manageIntake}
        allIntakes={intakes}
        onClose={() => setManageIntake(null)}
      />

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
            <DialogTitle>Delete intake schedule</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `This will remove the schedule ${deleteTarget.name}. This action cannot be undone.`
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

function MasterIntakeSection({
  response,
  isLoading,
  isError,
  onRename,
}: {
  response: IntakeMasterResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRename: (row: ApiIntakeSession) => void;
}) {
  const [search, setSearch] = useState("");
  const rows = useMemo(() => response?.items ?? [], [response]);
  const visible = useMemo(() => {
    const q = normaliseTitle(search);
    return q ? rows.filter((r) => normaliseTitle(r.session_title).includes(q)) : rows;
  }, [rows, search]);
  const unassigned = response?.unassigned;
  const truncated = response ? response.total > rows.length : false;

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Intake List</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            The intakes offered on new applications and used by Intake-wise Enrollment.
            Enrolment dates come from the students filed under each intake.
          </p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search intake"
            className="pl-9"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="px-4 w-16">Sl No</TableHead>
              <TableHead>Intake</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Applications</TableHead>
              <TableHead className="text-right">Students</TableHead>
              <TableHead className="text-right">Enrolled</TableHead>
              <TableHead>Enrolments</TableHead>
              <TableHead className="text-right pr-4">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center">
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading intakes…
                  </div>
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center">
                  <div className="flex items-center justify-center gap-2 text-sm text-red-500">
                    <AlertTriangle className="h-4 w-4" />
                    Failed to load intakes. Please try again.
                  </div>
                </TableCell>
              </TableRow>
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  {rows.length === 0 ? "No intakes yet. Use Add Intake to create one." : "No intakes match the search."}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((r, idx) => {
                const title = r.session_title?.trim();
                const period = formatPeriod(r.period);
                const invalid = describeInvalidDates(r.invalid_enrollment_dates);
                return (
                  <TableRow key={r.session_id} className="hover:bg-muted/40">
                    <TableCell className="px-4 py-3 text-sm tabular-nums text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="py-3">
                      <div className={`text-sm font-medium ${title ? "text-foreground" : "italic text-muted-foreground"}`}>
                        {title || "Untitled intake"}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">#{r.session_id}</div>
                    </TableCell>
                    <TableCell className="py-3 text-sm">
                      {period ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="py-3 text-right text-sm tabular-nums">{r.applications_count}</TableCell>
                    <TableCell className="py-3 text-right text-sm font-semibold tabular-nums">{r.students_count}</TableCell>
                    <TableCell className="py-3 text-right text-sm tabular-nums">{r.enrolled_count}</TableCell>
                    <TableCell className="py-3 text-sm">
                      {r.first_enrollment_date ? (
                        <span>
                          {formatEnrolmentDay(r.first_enrollment_date)}
                          {r.last_enrollment_date && r.last_enrollment_date !== r.first_enrollment_date
                            ? ` – ${formatEnrolmentDay(r.last_enrollment_date)}`
                            : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {r.students_count > 0 ? "No valid date" : "—"}
                        </span>
                      )}
                      {invalid && (
                        <div className="flex items-center gap-1 text-[11px] font-medium text-amber-700">
                          <AlertTriangle className="h-3 w-3" /> {invalid}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-3 pr-4 text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Rename" onClick={() => onRename(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {(truncated || (unassigned && (unassigned.students_count > 0 || unassigned.applications_count > 0))) && (
        <div className="space-y-1 border-t px-4 py-3 text-xs text-muted-foreground">
          {truncated && response && (
            <p>Showing the first {rows.length} of {response.total} intakes.</p>
          )}
          {unassigned && (unassigned.students_count > 0 || unassigned.applications_count > 0) && (
            <p>
              {unassigned.students_count} student{unassigned.students_count === 1 ? "" : "s"} and{" "}
              {unassigned.applications_count} application{unassigned.applications_count === 1 ? "" : "s"}{" "}
              have no intake recorded (or point at one that no longer exists).
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Add an intake to the master (POST /intakes/sessions) or rename one
 * (PATCH /intakes/sessions/:id). A rename keeps the id, so every student and
 * application filed under the intake follows it. The rename form seeds from
 * the RAW stored title — never from the "Untitled intake" placeholder — and
 * sends nothing when the title is unchanged.
 */
/* ------------------------------------------------------------------ *
 * IN04 — offerings editor (which university × course pairs are open
 * for admission in an intake). PUT /intakes/:id/offerings replaces the
 * whole set; POST /intakes/:id/offerings/copy copies from another intake.
 * ------------------------------------------------------------------ */

interface OfferingsResponse {
  intake_id: number;
  universities: Array<{
    university_id: number;
    university_title: string | null;
    courses: Array<{
      course_id: number;
      label: string | null;
      university_course_name: string | null;
    }>;
  }>;
  total_pairs: number;
}

interface TaggedCourseRow {
  course_id: number;
  title: string | null;
  university_course_name: string | null;
  status: number | null;
}

/** A university's active tagged courses, with per-course offering checkboxes. */
function UniversityCoursePicker({
  universityId,
  selected,
  onToggle,
  onToggleAll,
}: {
  universityId: number;
  selected: Set<string>;
  onToggle: (uid: number, cid: number, checked: boolean) => void;
  onToggleAll: (uid: number, courseIds: number[], checked: boolean) => void;
}) {
  const query = useQuery({
    queryKey: ["university-tagged-courses", universityId],
    queryFn: () => apiGet<TaggedCourseRow[]>(`/universities/${universityId}/courses`),
  });
  // Only active (not paused) tags can be offered; the server rejects paused ones.
  const courses = (query.data ?? []).filter((c) => c.status !== 0);
  const courseIds = courses.map((c) => c.course_id);
  const selectedCount = courses.filter((c) =>
    selected.has(`${universityId}:${c.course_id}`),
  ).length;
  const allChecked = courses.length > 0 && selectedCount === courses.length;

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading courses…
      </div>
    );
  }
  if (query.isError) {
    return (
      <p className="py-2 text-xs text-red-500">
        {query.error instanceof Error ? query.error.message : "Couldn’t load courses."}
      </p>
    );
  }
  if (courses.length === 0) {
    return (
      <p className="py-2 text-xs text-muted-foreground">
        No active tagged courses — tag courses on the university page first.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 border-b border-border pb-1.5 text-xs font-medium text-foreground">
        <Checkbox
          checked={allChecked}
          onCheckedChange={(v) => onToggleAll(universityId, courseIds, v === true)}
        />
        Select all ({courses.length})
      </label>
      {courses.map((c) => (
        <label key={c.course_id} className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={selected.has(`${universityId}:${c.course_id}`)}
            onCheckedChange={(v) => onToggle(universityId, c.course_id, v === true)}
          />
          <span className="text-foreground">
            {c.university_course_name ?? c.title ?? `Course #${c.course_id}`}
          </span>
        </label>
      ))}
    </div>
  );
}

/** One accordion row per university; its tagged courses load when it is expanded. */
function UniversityOfferingItem({
  universityId,
  title,
  selected,
  onToggle,
  onToggleAll,
}: {
  universityId: number;
  title: string;
  selected: Set<string>;
  onToggle: (uid: number, cid: number, checked: boolean) => void;
  onToggleAll: (uid: number, courseIds: number[], checked: boolean) => void;
}) {
  const selectedCount = useMemo(() => {
    const prefix = `${universityId}:`;
    let n = 0;
    for (const k of selected) if (k.startsWith(prefix)) n += 1;
    return n;
  }, [selected, universityId]);
  return (
    <AccordionItem value={String(universityId)}>
      <AccordionTrigger className="text-sm hover:no-underline">
        <span className="flex-1 text-left font-medium">{title}</span>
        {selectedCount > 0 && (
          <Badge variant="secondary" className="mr-2 text-[10px]">
            {selectedCount}
          </Badge>
        )}
      </AccordionTrigger>
      <AccordionContent>
        <UniversityCoursePicker
          universityId={universityId}
          selected={selected}
          onToggle={onToggle}
          onToggleAll={onToggleAll}
        />
      </AccordionContent>
    </AccordionItem>
  );
}

/** The offerings editor dialog for one intake. */
function ManageOfferingsDialog({
  intake,
  allIntakes,
  onClose,
}: {
  intake: Intake | null;
  allIntakes: Intake[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const universities = useUniversityOptions();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copyFrom, setCopyFrom] = useState<string>("");

  const offeringsQuery = useQuery({
    queryKey: ["intake-offerings", intake?.id ?? null],
    queryFn: () => apiGet<OfferingsResponse>(`/intakes/${intake?.id}/offerings`),
    enabled: intake != null,
  });

  // Seed the selection from the current offerings whenever they (re)load.
  useEffect(() => {
    if (!offeringsQuery.data) return;
    const next = new Set<string>();
    for (const u of offeringsQuery.data.universities) {
      for (const c of u.courses) next.add(`${u.university_id}:${c.course_id}`);
    }
    setSelected(next);
  }, [offeringsQuery.data]);

  const toggle = (uid: number, cid: number, checked: boolean) =>
    setSelected((prev) => {
      const n = new Set(prev);
      const k = `${uid}:${cid}`;
      if (checked) n.add(k);
      else n.delete(k);
      return n;
    });
  const toggleAll = (uid: number, courseIds: number[], checked: boolean) =>
    setSelected((prev) => {
      const n = new Set(prev);
      for (const cid of courseIds) {
        const k = `${uid}:${cid}`;
        if (checked) n.add(k);
        else n.delete(k);
      }
      return n;
    });

  const saveMut = useMutation({
    mutationFn: () => {
      const offerings = [...selected].map((k) => {
        const [u, c] = k.split(":");
        return { university_id: Number(u), course_id: Number(c) };
      });
      return apiPut(`/intakes/${intake?.id}/offerings`, { offerings });
    },
    onSuccess: () => {
      toast.success("Offerings updated");
      qc.invalidateQueries({ queryKey: ["intakes"] });
      void offeringsQuery.refetch();
      onClose();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Couldn’t save offerings"),
  });

  const copyMut = useMutation({
    mutationFn: () =>
      apiPost(`/intakes/${intake?.id}/offerings/copy`, {
        from_intake_id: Number(copyFrom),
      }),
    onSuccess: () => {
      toast.success("Offerings copied");
      setCopyFrom("");
      qc.invalidateQueries({ queryKey: ["intakes"] });
      void offeringsQuery.refetch();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Couldn’t copy offerings"),
  });

  const copyOptions = allIntakes.filter((x) => x.id !== intake?.id);

  return (
    <Dialog open={intake != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Manage offerings — {intake?.name}</DialogTitle>
          <DialogDescription>
            Choose which university × course pairs are open for admission in this
            intake.{" "}
            <span className="font-medium text-foreground">{selected.size} selected</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Select value={copyFrom} onValueChange={setCopyFrom}>
            <SelectTrigger className="h-9 flex-1">
              <SelectValue placeholder="Copy offerings from intake…" />
            </SelectTrigger>
            <SelectContent>
              {copyOptions.length === 0 ? (
                <SelectItem value="none" disabled>
                  No other intakes
                </SelectItem>
              ) : (
                copyOptions.map((x) => (
                  <SelectItem key={x.id} value={String(x.id)}>
                    {x.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            disabled={!copyFrom || copyMut.isPending}
            onClick={() => copyMut.mutate()}
          >
            {copyMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Copy"}
          </Button>
        </div>

        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          {offeringsQuery.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading offerings…
            </div>
          ) : universities.options.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No universities available.</p>
          ) : (
            <Accordion type="multiple" className="w-full">
              {universities.options.map((u) => (
                <UniversityOfferingItem
                  key={u.value}
                  universityId={Number(u.value)}
                  title={u.label}
                  selected={selected}
                  onToggle={toggle}
                  onToggleAll={toggleAll}
                />
              ))}
            </Accordion>
          )}
        </div>

        <DialogFooter className="border-t border-border pt-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || offeringsQuery.isLoading}
          >
            {saveMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              `Save offerings (${selected.size})`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IntakeTitleDialog({
  target,
  existing,
  onClose,
}: {
  target: ApiIntakeSession | null;
  existing: ApiIntakeSession[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [seed] = useState(() => target?.session_title ?? "");
  const [title, setTitle] = useState(seed);
  const [month, setMonth] = useState<string>(UNSET_MONTH);
  const [year, setYear] = useState<string>(UNSET_YEAR);

  const cleaned = title.trim().replace(/\s+/g, " ");
  const clash = existing.find(
    (r) =>
      r.session_id !== target?.session_id &&
      normaliseTitle(r.session_title) === normaliseTitle(cleaned),
  );
  const unchanged = target !== null && cleaned === seed.trim().replace(/\s+/g, " ");
  const error = !cleaned
    ? "Intake name is required."
    : cleaned.length > 260
      ? "Intake name must be 260 characters or fewer."
      : clash
        ? `An intake named “${clash.session_title}” already exists (#${clash.session_id}).`
        : null;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["intake-master"] });
    qc.invalidateQueries({ queryKey: ["catalog", "intakes"] });
  };

  const saveMut = useMutation({
    mutationFn: (body: { session_title: string }) =>
      target
        ? apiPatch(`/intakes/sessions/${target.session_id}`, body)
        : apiPost("/intakes/sessions", body),
    onSuccess: () => {
      invalidate();
      toast.success(target ? "Intake renamed" : "Intake created");
      onClose();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  const fillFromPeriod = (m: string, y: string) => {
    const name = deriveIntakeName(m, y);
    if (name) setTitle(name);
  };

  const handleSave = () => {
    if (error) {
      toast.error(error);
      return;
    }
    if (unchanged) {
      toast.info("No changes to save");
      onClose();
      return;
    }
    saveMut.mutate({ session_title: cleaned });
  };

  const handleClose = () => {
    if (saveMut.isPending) return;
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{target ? "Rename Intake" : "Add Intake"}</DialogTitle>
          <DialogDescription>
            {target
              ? `Intake #${target.session_id}. Its ${target.students_count} student(s) and ${target.applications_count} application(s) stay filed under it.`
              : "New intakes appear in the Intake picker on new applications straight away."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!target && (
            <>
              <div className="space-y-2">
                <Label>Month</Label>
                <Select
                  value={month}
                  onValueChange={(m) => {
                    setMonth(m);
                    fillFromPeriod(m, year);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNSET_MONTH}>—</SelectItem>
                    {MONTHS.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Select
                  value={year}
                  onValueChange={(y) => {
                    setYear(y);
                    fillFromPeriod(month, y);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNSET_YEAR}>—</SelectItem>
                    {YEARS.map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="intake-title">Intake Name</Label>
            <Input
              id="intake-title"
              value={title}
              maxLength={260}
              placeholder="e.g. July 2026 Intake"
              onChange={(e) => setTitle(e.target.value)}
            />
            {!target && (
              <p className="text-xs text-muted-foreground">
                Picking a month and year fills in a standard name; you can edit it.
              </p>
            )}
            {title !== "" && error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={saveMut.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!!error || saveMut.isPending}
            className="bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            {saveMut.isPending ? "Saving…" : target ? "Save Name" : "Create Intake"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      toast.success("Intake schedule created");
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
          <DialogTitle>Add Intake Schedule</DialogTitle>
          <DialogDescription>
            Record the dates of an admission intake. Name, code and status are auto-generated.
            To make an intake selectable on applications, use Add Intake.
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
            {createMut.isPending ? "Creating…" : "Create Schedule"}
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
          <DialogTitle>Intake Schedule Details</DialogTitle>
          <DialogDescription>Read-only view of the intake schedule.</DialogDescription>
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
              <p className={`font-medium ${isFlaggedDate(intake.startDate) ? "text-amber-700" : ""}`}>
                {formatDate(intake.startDate)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Closing Date</p>
              <p className={`font-medium ${isFlaggedDate(intake.closingDate) ? "text-amber-700" : ""}`}>
                {formatDate(intake.closingDate)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Mapped Universities</p>
              <p className="font-medium text-foreground">{intake.mappedUniversities}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Mapped Courses</p>
              <p className="font-medium text-foreground">{intake.mappedCourses}</p>
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
      toast.success("Intake schedule updated");
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
  const startChanged = startDate !== seed.startDate;
  const closingChanged = closingDate !== seed.closingDate;
  const dateError = validateChangedDates(
    startDate,
    closingDate,
    startChanged,
    closingChanged,
  );
  const validationError = yearError ?? dateError;

  // Stored dates that are corrupt (0025-08-30) are shown, flagged, and left
  // alone unless the operator replaces them; they never feed the status.
  const seedStartFlagged = isFlaggedDate(seed.startDate);
  const seedClosingFlagged = isFlaggedDate(seed.closingDate);
  const derivedStatus = dateError
    ? null
    : deriveIntakeStatus(
        isYearInRange(startDate) ? startDate : "",
        isYearInRange(closingDate) ? closingDate : "",
        toStoredStatus(statusValue),
      );

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
          <DialogTitle>Edit Intake Schedule</DialogTitle>
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
            {seedStartFlagged && !startChanged && (
              <p className="text-xs text-amber-700">
                The stored date {seed.startDate} is invalid. It is kept as is unless you pick a new date.
              </p>
            )}
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
            {seedClosingFlagged && !closingChanged && (
              <p className="text-xs text-amber-700">
                The stored date {seed.closingDate} is invalid. It is kept as is unless you pick a new date.
              </p>
            )}
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
