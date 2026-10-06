import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet } from "@/lib/api";
import { useCourseOptions, useUniversityOptions } from "@/components/applications/catalogs";
import { downloadCsv, toCsv, type CsvColumn } from "@/components/applications/export-csv";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Download,
  Search,
  Filter,
  RotateCcw,
  Eye,
  CalendarRange,
  ArrowUpDown,
  Calendar as CalendarIcon,
  RefreshCcw,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/enrollment/intake-wise")({
  head: () => ({
    meta: [
      { title: "Intake-wise Enrollment — upCarrera" },
      { name: "description", content: "Monitor enrollment progress across all intakes." },
    ],
  }),
  component: IntakeWiseEnrollment,
});

// --- Live API wiring (GET /api/intakes/sessions) ---------------------------
// The intake master: the `sessions` table that students.session_id and
// applications.session_id point at — the same list the Intakes screen shows.
// The server rolls students up per intake (no 1000-row cap, no client-side
// grouping) and scopes the counts by university / course / enrolment date.
//
// `sessions` has NO date columns, so an intake has no stored start date. What
// the row shows is the first PLAUSIBLE enrolment date of its students; legacy
// typos such as 0025-08-30 are returned separately and shown as invalid, never
// passed off as the intake's start.
const EMPTY = "—";
const CATALOG_ALL = "";

type Status = "Open" | "Completed" | "No students";

interface StatusCount {
  label: string;
  count: number;
}

interface ApiRollup {
  students_count: number;
  enrolled_count: number;
  pending_count: number;
  applications_count: number;
  by_status: StatusCount[];
  first_enrollment_date: string | null;
  last_enrollment_date: string | null;
  invalid_enrollment_dates: { count: number; samples: string[] };
}

interface ApiIntakeSession extends ApiRollup {
  session_id: number;
  session_title: string | null;
}

interface IntakeMasterResponse {
  items: ApiIntakeSession[];
  total: number;
  unassigned: ApiRollup;
  date_window: { min: string; max: string };
}

type Row = {
  /** sessions.session_id, or null for the "no intake recorded" bucket. */
  id: number | null;
  name: string;
  /** True when the title is blank and `name` is a placeholder. */
  untitled: boolean;
  firstDate: string | null;
  lastDate: string | null;
  invalidDates: { count: number; samples: string[] };
  approved: number;
  enrolled: number;
  pending: number;
  applications: number;
  byStatus: StatusCount[];
  /** Null for the "no intake recorded" bucket, which is not an intake. */
  status: Status | null;
};

type SortKey = keyof Pick<Row, "approved" | "enrolled" | "pending">;

/** A DATE value as "15 Jul 2025". Only ever called on plausible dates. */
function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return `Invalid date — ${iso}`;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Invalid date — 0025-08-30" (+ how many more), stated as stored. */
function describeInvalid(invalid: { count: number; samples: string[] }): string | null {
  if (invalid.count === 0) return null;
  const first = invalid.samples[0] ?? "unreadable value";
  const more = invalid.count - 1;
  return `Invalid date — ${first}${more > 0 ? ` (+${more} more)` : ""}`;
}

function deriveStatus(r: ApiRollup): Status {
  if (r.students_count === 0) return "No students";
  return r.pending_count > 0 ? "Open" : "Completed";
}

function toRow(id: number | null, name: string, untitled: boolean, r: ApiRollup): Row {
  const isBucket = id === null;
  return {
    id,
    name,
    untitled,
    firstDate: r.first_enrollment_date,
    lastDate: r.last_enrollment_date,
    invalidDates: r.invalid_enrollment_dates,
    approved: r.students_count,
    enrolled: r.enrolled_count,
    pending: r.pending_count,
    applications: r.applications_count,
    byStatus: r.by_status,
    status: isBucket ? null : deriveStatus(r),
  };
}

function toRows(data: IntakeMasterResponse | undefined): Row[] {
  if (!data) return [];
  const rows = data.items.map((i) => {
    const title = i.session_title?.trim() ?? "";
    return toRow(i.session_id, title || `Untitled intake #${i.session_id}`, !title, i);
  });
  // Students with no intake (or an intake id that no longer exists) are real
  // rows the old screen showed as "—"; keep them visible so totals reconcile.
  if (data.unassigned.students_count > 0) {
    rows.push(toRow(null, "No intake recorded", true, data.unassigned));
  }
  return rows;
}

const statusStyle: Record<Status, string> = {
  Open: "bg-success/10 text-success",
  Completed: "bg-accent/10 text-accent",
  "No students": "bg-muted text-muted-foreground",
};

const CSV_COLUMNS: CsvColumn<Row>[] = [
  { header: "Intake ID", value: (r) => r.id ?? "" },
  { header: "Intake", value: (r) => r.name },
  { header: "First enrolment", value: (r) => r.firstDate ?? "" },
  { header: "Last enrolment", value: (r) => r.lastDate ?? "" },
  { header: "Invalid enrolment dates", value: (r) => r.invalidDates.count },
  { header: "Invalid date examples", value: (r) => r.invalidDates.samples.join(" ") },
  { header: "Students", value: (r) => r.approved },
  { header: "Enrolled", value: (r) => r.enrolled },
  { header: "Pending enrolment", value: (r) => r.pending },
  { header: "Status", value: (r) => r.status ?? "" },
];

function IntakeWiseEnrollment() {
  const [university, setUniversity] = useState(CATALOG_ALL);
  const [course, setCourse] = useState(CATALOG_ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("approved");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [detail, setDetail] = useState<Row | null>(null);

  const universities = useUniversityOptions();
  const courses = useCourseOptions(university || null);

  const rangeError = from && to && from > to ? "“From” is after “To”." : null;
  const params = {
    page: 1,
    limit: 500,
    ...(university ? { university_id: university } : {}),
    ...(course ? { course_id: course } : {}),
    ...(from && !rangeError ? { from } : {}),
    ...(to && !rangeError ? { to } : {}),
  };
  const filtersActive = Boolean(university || course || from || to);

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["intake-master", "intake-wise", params],
    queryFn: () => apiGet<IntakeMasterResponse>("/intakes/sessions", params),
  });

  const rows = useMemo(() => toRows(data), [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // With a university/course/date filter on, an intake with none of the
    // matching students is noise; unfiltered, every intake is listed (an
    // empty one shows "No students") so this matches the Intakes master.
    const r = rows.filter(
      (x) =>
        (!q || x.name.toLowerCase().includes(q)) && (!filtersActive || x.approved > 0),
    );
    return [...r].sort((a, b) =>
      sortDir === "desc" ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey],
    );
  }, [rows, search, sortKey, sortDir, filtersActive]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => ({
          approved: acc.approved + r.approved,
          enrolled: acc.enrolled + r.enrolled,
          pending: acc.pending + r.pending,
        }),
        { approved: 0, enrolled: 0, pending: 0 },
      ),
    [filtered],
  );

  const invalidTotal = useMemo(
    () => rows.reduce((sum, r) => sum + r.invalidDates.count, 0),
    [rows],
  );

  const reset = () => {
    setUniversity(CATALOG_ALL);
    setCourse(CATALOG_ALL);
    setFrom("");
    setTo("");
    setSearch("");
  };

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.error("Nothing to export — no intakes match the filters.");
      return;
    }
    downloadCsv(
      `intake-wise-enrollment-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(filtered, CSV_COLUMNS),
    );
  };

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const TH = ({ k, label, align = "right" }: { k: SortKey; label: string; align?: "left" | "right" }) => (
    <th className={`px-3 py-2.5 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${sortKey === k ? "text-foreground" : ""}`}
      >
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </button>
    </th>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Enrollment Management</div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Intake-wise Enrollment
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor enrollment progress across all intakes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={isLoading || isError}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground shadow-card hover:bg-accent-hover disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="flex items-center gap-2 pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Filters
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Search Intake</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Intake name"
                className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">University</label>
            <select
              value={university}
              onChange={(e) => {
                setUniversity(e.target.value);
                setCourse(CATALOG_ALL);
              }}
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value={CATALOG_ALL}>All Universities</option>
              {universities.options.map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Course</label>
            <select
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value={CATALOG_ALL}>All Courses</option>
              {courses.options.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Enrolled from</label>
            <div className="relative">
              <CalendarIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Enrolled to</label>
            <div className="relative">
              <CalendarIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        </div>
        {(rangeError || (university && !courses.scoped && courses.options.length > 0)) && (
          <div className="mt-2 space-y-1 text-xs">
            {rangeError && <p className="text-destructive">{rangeError} The date filter is ignored until it is fixed.</p>}
            {university && !courses.scoped && courses.options.length > 0 && (
              <p className="text-muted-foreground">No courses are tagged to this university yet, so every course is listed.</p>
            )}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <div className="text-xs text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {rows.length} intakes
            {filtersActive && " with matching students"}
            {isFetching && !isLoading && (
              <RefreshCcw className="ml-2 inline h-3 w-3 animate-spin text-muted-foreground/60 align-text-bottom" />
            )}
            {invalidTotal > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-warning">
                <AlertTriangle className="h-3 w-3" />
                {invalidTotal} student{invalidTotal === 1 ? " has" : "s have"} an invalid enrolment date
              </span>
            )}
          </div>
          <button onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-2.5 font-semibold w-16">Sl No</th>
                <th className="px-6 py-2.5 font-semibold">Intake Name</th>
                <TH k="approved" label="Students" />
                <TH k="enrolled" label="Enrolled Students" />
                <TH k="pending" label="Pending Enrollment" />
                <th className="px-6 py-2.5 font-semibold text-center">Status</th>
                <th className="px-6 py-2.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16">
                    <div className="flex flex-col items-center justify-center gap-2 text-center">
                      <RefreshCcw className="h-8 w-8 animate-spin text-muted-foreground/50" />
                      <div className="text-sm font-semibold text-foreground">Loading intakes…</div>
                    </div>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16">
                    <div className="flex flex-col items-center justify-center gap-2 text-center">
                      <AlertTriangle className="h-10 w-10 text-destructive/60" />
                      <div className="text-sm font-semibold text-foreground">Couldn’t load intakes</div>
                      <div className="text-xs text-muted-foreground">
                        {error instanceof Error ? error.message : "Please try again."}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16">
                    <div className="flex flex-col items-center justify-center gap-2 text-center">
                      <CalendarRange className="h-10 w-10 text-muted-foreground/50" />
                      <div className="text-sm font-semibold text-foreground">No intakes found</div>
                      <div className="text-xs text-muted-foreground">
                        {rows.length === 0
                          ? "No intakes have been created yet. Add one on the Intakes screen."
                          : "Try adjusting your filters or clearing them."}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((r, i) => {
                  const invalid = describeInvalid(r.invalidDates);
                  return (
                    <tr key={r.id ?? "unassigned"} className="border-b border-border/70 last:border-0 transition hover:bg-muted/40">
                      <td className="px-6 py-3.5 text-sm tabular-nums text-muted-foreground">{i + 1}</td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-[11px] font-semibold text-primary">
                            <CalendarRange className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className={`truncate font-medium ${r.untitled ? "italic text-muted-foreground" : "text-foreground"}`}>
                              {r.name}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {r.firstDate
                                ? `First enrolment ${formatDay(r.firstDate)}`
                                : r.approved > 0
                                  ? "No valid enrolment date"
                                  : EMPTY}
                            </div>
                            {invalid && (
                              <div className="flex items-center gap-1 text-[11px] font-medium text-warning">
                                <AlertTriangle className="h-3 w-3" /> {invalid}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums font-semibold text-foreground">{r.approved}</td>
                      <td className="px-3 py-3.5 text-right">
                        <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-success">{r.enrolled}</span>
                      </td>
                      <td className="px-3 py-3.5 text-right">
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary">{r.pending}</span>
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        {r.status ? (
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusStyle[r.status]}`}>
                            {r.status}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{EMPTY}</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <button
                          onClick={() => setDetail(r)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                        >
                          <Eye className="h-3.5 w-3.5" /> View Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30 text-sm font-semibold text-foreground">
                <td className="px-6 py-3" />
                <td className="px-6 py-3">Totals</td>
                <td className="px-3 py-3 text-right tabular-nums">{totals.approved}</td>
                <td className="px-3 py-3 text-right tabular-nums text-success">{totals.enrolled}</td>
                <td className="px-3 py-3 text-right tabular-nums text-primary">{totals.pending}</td>
                <td className="px-6 py-3" />
                <td className="px-6 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <IntakeDetailDialog
        row={detail}
        dateWindow={data?.date_window}
        dateFiltered={"from" in params || "to" in params}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}

function IntakeDetailDialog({
  row,
  dateWindow,
  dateFiltered,
  onClose,
}: {
  row: Row | null;
  dateWindow: { min: string; max: string } | undefined;
  /** An "Enrolled from/to" range is applied — it narrows students only. */
  dateFiltered: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={row !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{row?.name ?? "Intake"}</DialogTitle>
          <DialogDescription>
            {row?.id != null ? `Intake #${row.id}. ` : ""}
            Counts reflect the filters currently applied.
            {dateFiltered
              ? " Applications have no enrolment date, so the date range does not narrow them."
              : ""}
          </DialogDescription>
        </DialogHeader>
        {row && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-muted-foreground">First enrolment</p>
                <p className="font-medium">{row.firstDate ? formatDay(row.firstDate) : EMPTY}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Last enrolment</p>
                <p className="font-medium">{row.lastDate ? formatDay(row.lastDate) : EMPTY}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Students</p>
                <p className="font-medium tabular-nums">{row.approved}</p>
              </div>
              <div>
                <p className="text-muted-foreground">
                  Applications{dateFiltered ? " (all dates)" : ""}
                </p>
                <p className="font-medium tabular-nums">{row.applications}</p>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-muted-foreground">Admission status</p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {row.byStatus
                  .filter((s) => s.label !== "Unknown" || s.count > 0)
                  .map((s) => (
                    <li key={s.label} className="flex items-center justify-between px-3 py-1.5">
                      <span>{s.label === "Unknown" ? "Status not recorded" : s.label}</span>
                      <span className="font-semibold tabular-nums">{s.count}</span>
                    </li>
                  ))}
              </ul>
            </div>
            {row.invalidDates.count > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
                <p className="flex items-center gap-1.5 font-semibold text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {row.invalidDates.count} invalid enrolment date{row.invalidDates.count === 1 ? "" : "s"}
                </p>
                <p className="mt-1 text-muted-foreground">
                  Stored as {row.invalidDates.samples.join(", ")}
                  {row.invalidDates.count > row.invalidDates.samples.length ? ", …" : ""}
                  {dateWindow ? ` — outside ${dateWindow.min.slice(0, 4)}–${dateWindow.max.slice(0, 4)}` : ""}.
                  These are left out of the first/last enrolment dates and need correcting on
                  the student records.
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
