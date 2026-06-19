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
  CalendarRange,
  ArrowUpDown,
  Calendar as CalendarIcon,
  Loader2,
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

const UNIVERSITIES = ["All Universities", "Symbiosis International", "Manipal University", "Amity University", "Christ University", "Lovely Professional University", "Chandigarh University", "SRM Institute", "VIT University"];
const COURSES = ["All Courses", "MBA", "B.Tech CSE", "BBA", "BCA", "M.Sc Data Science", "B.Com"];

// ---- Live API wiring (GET /api/students) ----
// The OLD CRM "intake_wise" report renders ONE row per intake (session). We
// reproduce it client-side: fetch the decorated students list, group rows by
// their joined `session_title`, and count each group by `admission_status_label`
// across the six admission statuses, plus a per-intake total. Each decorated row
// is a `students` row joined server-side with display fields (name, course_title,
// session_title, …) and a human admission_status_label.
const ADMISSION_STATUS_ORDER = [
  "Pending",
  "In Progress",
  "Enrolled",
  "Passed Out",
  "Dropout",
  "Cancelled",
] as const;
type AdmissionStatus = (typeof ADMISSION_STATUS_ORDER)[number];

// Intakes with no session_title are bucketed under this label (old CRM parity).
const NO_INTAKE = "No Intake";

interface ApiStudentRow {
  id: number | string;
  session_title: string | null;
  admission_status_label: string | null;
}

interface StudentsListResponse {
  items: ApiStudentRow[];
  total: number;
  page: number;
  limit: number;
}

// One table row = one intake, with a count per admission status + grand total.
type Row = {
  name: string;
  counts: Record<AdmissionStatus, number>;
  total: number;
};

// Coerce the joined human label to a known admission status; unmapped/blank
// labels fall back to "Pending" (mirrors the students list screen).
function toAdmissionStatus(label: string | null | undefined): AdmissionStatus {
  const match = ADMISSION_STATUS_ORDER.find((s) => s === label);
  return match ?? "Pending";
}

function zeroCounts(): Record<AdmissionStatus, number> {
  return {
    Pending: 0,
    "In Progress": 0,
    Enrolled: 0,
    "Passed Out": 0,
    Dropout: 0,
    Cancelled: 0,
  };
}

// Group decorated students rows by session_title into per-intake count rows.
function groupByIntake(items: ApiStudentRow[]): Row[] {
  const byIntake = new Map<string, Row>();
  for (const item of items) {
    const title = item.session_title?.trim();
    const name = title && title !== "" ? title : NO_INTAKE;
    let row = byIntake.get(name);
    if (!row) {
      row = { name, counts: zeroCounts(), total: 0 };
      byIntake.set(name, row);
    }
    const status = toAdmissionStatus(item.admission_status_label);
    row.counts[status] += 1;
    row.total += 1;
  }
  return [...byIntake.values()];
}

type SortKey = AdmissionStatus | "total";

function IntakeWiseEnrollment() {
  const [university, setUniversity] = useState(UNIVERSITIES[0]);
  const [course, setCourse] = useState(COURSES[0]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Live students list (decorated with joined names). We pull a large page and
  // group/aggregate client-side into per-intake rows, matching the old CRM.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["students", "intake-wise", { page: 1, limit: 1000 }],
    queryFn: () =>
      apiGet<StudentsListResponse>("/students", { page: 1, limit: 1000 }),
  });

  const rows = useMemo<Row[]>(
    () => groupByIntake(data?.items ?? []),
    [data],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = rows.filter((x) => !q || x.name.toLowerCase().includes(q));
    r = [...r].sort((a, b) => {
      const av = sortKey === "total" ? a.total : a.counts[sortKey];
      const bv = sortKey === "total" ? b.total : b.counts[sortKey];
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return r;
  }, [rows, search, sortKey, sortDir]);

  const totals = useMemo(() => {
    const counts = zeroCounts();
    let total = 0;
    for (const r of filtered) {
      for (const s of ADMISSION_STATUS_ORDER) counts[s] += r.counts[s];
      total += r.total;
    }
    return { counts, total };
  }, [filtered]);

  const reset = () => {
    setUniversity(UNIVERSITIES[0]);
    setCourse(COURSES[0]);
    setFrom("");
    setTo("");
    setSearch("");
  };

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const TH = ({ k, label }: { k: SortKey; label: string }) => (
    <th className="px-3 py-2.5 font-semibold text-right">
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
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Search Intake</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Intake name or session"
                className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">University</label>
            <select
              value={university}
              onChange={(e) => setUniversity(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {UNIVERSITIES.map(u => <option key={u}>{u}</option>)}
            </select>
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
            Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {rows.length} intakes
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
                <th className="px-6 py-2.5 font-semibold">Intake Name</th>
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
                      Loading intakes…
                    </div>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-sm text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                      Failed to load intake enrollment. Please try again.
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-10 text-center text-sm text-muted-foreground">
                    No intakes match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((r, i) => (
                <tr key={r.name} className="border-b border-border/70 last:border-0 transition hover:bg-muted/40">
                  <td className="px-6 py-3.5 text-sm tabular-nums text-muted-foreground">{i + 1}</td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-[11px] font-semibold text-primary">
                        <CalendarRange className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{r.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums text-muted-foreground">{r.counts["Pending"]}</td>
                  <td className="px-3 py-3.5 text-right tabular-nums text-muted-foreground">{r.counts["In Progress"]}</td>
                  <td className="px-3 py-3.5 text-right">
                    <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-success">{r.counts["Enrolled"]}</span>
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums text-muted-foreground">{r.counts["Passed Out"]}</td>
                  <td className="px-3 py-3.5 text-right tabular-nums text-muted-foreground">{r.counts["Dropout"]}</td>
                  <td className="px-3 py-3.5 text-right tabular-nums text-muted-foreground">{r.counts["Cancelled"]}</td>
                  <td className="px-3 py-3.5 text-right tabular-nums font-semibold text-foreground">{r.total}</td>
                  <td className="px-6 py-3.5 text-right">
                    <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
                      <Eye className="h-3.5 w-3.5" /> View Details
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
                <td className="px-3 py-3 text-right tabular-nums">{totals.counts["Dropout"]}</td>
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
