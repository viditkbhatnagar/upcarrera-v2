import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import {
  Download,
  Search,
  Filter,
  RotateCcw,
  Eye,
  Building2,
  ArrowUpDown,
  Calendar as CalendarIcon,
  Loader2,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/enrollment/university-wise")({
  head: () => ({
    meta: [
      { title: "University-wise Enrollment — upCarrera" },
      { name: "description", content: "Track and manage enrollment activities by university." },
    ],
  }),
  component: UniversityWiseEnrollment,
});

const COURSES = ["All Courses", "MBA", "B.Tech CSE", "BBA", "BCA", "M.Sc Data Science", "B.Com"];
const INTAKES = ["All Intakes", "Jan 2026 — Spring", "Jul 2026 — Monsoon", "Sep 2026 — Fall", "Jul 2025 — Monsoon"];

// The six real admission_status_label values the API emits, in the order the old
// CRM university_wise report displayed its count columns.
const STATUS_COLUMNS = [
  "Pending",
  "In Progress",
  "Enrolled",
  "Passed Out",
  "Dropout",
  "Cancelled",
] as const;
type StatusColumn = (typeof STATUS_COLUMNS)[number];

type StatusCounts = Record<StatusColumn, number>;

type Row = {
  name: string;
  short: string;
  counts: StatusCounts;
  total: number;
};

// ---- Live API wiring ----
// The old-CRM "university_wise" report is one row per university with a count of
// students in each admission status, plus a row total. We reproduce it from the
// single real students endpoint:
//   GET /students { page: 1, limit: 1000 } -> decorated rows carrying
//   university_title + a human admission_status_label.
// We group the rows by university_title and tally each group's
// admission_status_label into the six status columns. Groups with no university
// (null/empty title) are skipped — the old report never showed an "Unassigned"
// university bucket.

interface ApiStudentRow {
  university_title: string | null;
  admission_status_label: string | null;
}

const STUDENTS_LIMIT = 1000;

function emptyCounts(): StatusCounts {
  return {
    Pending: 0,
    "In Progress": 0,
    Enrolled: 0,
    "Passed Out": 0,
    Dropout: 0,
    Cancelled: 0,
  };
}

function deriveShort(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w && !/^(University|College|Institute|of|the|and|&)$/i.test(w));
  const initials = words
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 3);
  return initials || name.slice(0, 3).toUpperCase() || "UNI";
}

/** Group the live students payload by university and tally status counts. */
function buildRows(students: ApiStudentRow[]): Row[] {
  type Bucket = Omit<Row, "total">;
  const groups = new Map<string, Bucket>();

  for (const student of students) {
    const name = student.university_title?.trim();
    // Skip students with no university — they don't belong to any report row.
    if (!name) continue;

    let bucket = groups.get(name);
    if (!bucket) {
      bucket = { name, short: deriveShort(name), counts: emptyCounts() };
      groups.set(name, bucket);
    }

    const label = student.admission_status_label?.trim();
    if (label && label in bucket.counts) {
      bucket.counts[label as StatusColumn] += 1;
    }
  }

  return Array.from(groups.values()).map((bucket) => ({
    ...bucket,
    total: STATUS_COLUMNS.reduce((sum, key) => sum + bucket.counts[key], 0),
  }));
}

type SortKey = StatusColumn | "total";

function UniversityWiseEnrollment() {
  // Live students (grouped by university client-side into per-status counts).
  const studentsQuery = useQuery({
    queryKey: ["students", "university-wise", { page: 1, limit: STUDENTS_LIMIT }],
    queryFn: () =>
      apiGet<{ items: ApiStudentRow[]; total: number; page: number; limit: number }>(
        "/students",
        { page: 1, limit: STUDENTS_LIMIT },
      ),
  });

  const isLoading = studentsQuery.isLoading;
  const isError = studentsQuery.isError;

  const rows = useMemo(
    () => buildRows(studentsQuery.data?.items ?? []),
    [studentsQuery.data],
  );

  const [course, setCourse] = useState(COURSES[0]);
  const [intake, setIntake] = useState(INTAKES[0]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sortValue = (r: Row, key: SortKey) =>
    key === "total" ? r.total : r.counts[key];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = rows.filter(x =>
      !q || x.name.toLowerCase().includes(q) || x.short.toLowerCase().includes(q),
    );
    r = [...r].sort((a, b) =>
      sortDir === "desc"
        ? sortValue(b, sortKey) - sortValue(a, sortKey)
        : sortValue(a, sortKey) - sortValue(b, sortKey),
    );
    return r;
  }, [rows, search, sortKey, sortDir]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => {
          for (const key of STATUS_COLUMNS) acc.counts[key] += r.counts[key];
          acc.total += r.total;
          return acc;
        },
        { counts: emptyCounts(), total: 0 },
      ),
    [filtered],
  );

  const reset = () => {
    setCourse(COURSES[0]);
    setIntake(INTAKES[0]);
    setFrom("");
    setTo("");
    setSearch("");
  };

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => (d === "desc" ? "asc" : "desc"));
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
            University-wise Enrollment
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track and manage enrollment activities by university.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground shadow-card hover:bg-accent-hover">
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
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Search University</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or code"
                className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Course</label>
            <select
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {COURSES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Intake</label>
            <select
              value={intake}
              onChange={(e) => setIntake(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {INTAKES.map(i => <option key={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">From</label>
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
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">To</label>
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
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <div className="text-xs text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {rows.length} universities
          </div>
          <div className="flex items-center gap-2">
            <button onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-2.5 font-semibold w-16">Sl No</th>
                <th className="px-6 py-2.5 font-semibold">University</th>
                <TH k="Pending" label="Pending" />
                <TH k="In Progress" label="In Progress" />
                <TH k="Enrolled" label="Enrolled" />
                <TH k="Passed Out" label="Passed Out" />
                <TH k="Dropout" label="Dropout" />
                <TH k="Cancelled" label="Cancelled" />
                <TH k="total" label="Total" />
                <th className="px-6 py-2.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading enrollment data…
                    </div>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-sm text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                      Failed to load enrollment data. Please try again.
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-sm text-muted-foreground">
                    No universities match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((r, i) => (
                <tr key={r.name} className="border-b border-border/70 last:border-0 transition hover:bg-muted/40">
                  <td className="px-6 py-3.5 text-sm tabular-nums text-muted-foreground">{i + 1}</td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-[11px] font-semibold text-primary">
                        {r.short}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{r.name}</div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Building2 className="h-3 w-3" /> University
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums font-semibold text-foreground">{r.counts["Pending"]}</td>
                  <td className="px-3 py-3.5 text-right">
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary">{r.counts["In Progress"]}</span>
                  </td>
                  <td className="px-3 py-3.5 text-right">
                    <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-success">{r.counts["Enrolled"]}</span>
                  </td>
                  <td className="px-3 py-3.5 text-right">
                    <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-accent">{r.counts["Passed Out"]}</span>
                  </td>
                  <td className="px-3 py-3.5 text-right">
                    <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-destructive">{r.counts["Dropout"]}</span>
                  </td>
                  <td className="px-3 py-3.5 text-right">
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{r.counts["Cancelled"]}</span>
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums font-semibold text-foreground">{r.total}</td>
                  <td className="px-6 py-3.5 text-right">
                    <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
                      <Eye className="h-3.5 w-3.5" /> View Students
                    </button>
                  </td>
                </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30 text-sm font-semibold text-foreground">
                <td className="px-6 py-3" />
                <td className="px-6 py-3">Totals</td>
                <td className="px-3 py-3 text-right tabular-nums">{totals.counts["Pending"]}</td>
                <td className="px-3 py-3 text-right tabular-nums">{totals.counts["In Progress"]}</td>
                <td className="px-3 py-3 text-right tabular-nums text-success">{totals.counts["Enrolled"]}</td>
                <td className="px-3 py-3 text-right tabular-nums">{totals.counts["Passed Out"]}</td>
                <td className="px-3 py-3 text-right tabular-nums text-destructive">{totals.counts["Dropout"]}</td>
                <td className="px-3 py-3 text-right tabular-nums">{totals.counts["Cancelled"]}</td>
                <td className="px-3 py-3 text-right tabular-nums">{totals.total}</td>
                <td className="px-6 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
