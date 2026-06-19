import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Download,
  Search,
  Filter,
  RotateCcw,
  Eye,
  CalendarRange,
  ArrowUpDown,
  Calendar as CalendarIcon,
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

type Status = "Open" | "Closing Soon" | "Closed" | "Completed";

type Row = {
  name: string;
  session: string;
  startDate: string;
  approved: number;
  enrolled: number;
  pending: number;
  status: Status;
};

const rows: Row[] = [
  { name: "Jan 2026 — Spring", session: "Spring 2026", startDate: "2026-01-15", approved: 412, enrolled: 298, pending: 114, status: "Open" },
  { name: "Jul 2026 — Monsoon", session: "Monsoon 2026", startDate: "2026-07-10", approved: 356, enrolled: 198, pending: 158, status: "Open" },
  { name: "Sep 2026 — Fall", session: "Fall 2026", startDate: "2026-09-05", approved: 278, enrolled: 124, pending: 154, status: "Closing Soon" },
  { name: "Jan 2025 — Spring", session: "Spring 2025", startDate: "2025-01-15", approved: 386, enrolled: 362, pending: 24, status: "Completed" },
  { name: "Jul 2025 — Monsoon", session: "Monsoon 2025", startDate: "2025-07-10", approved: 342, enrolled: 318, pending: 24, status: "Completed" },
  { name: "Sep 2025 — Fall", session: "Fall 2025", startDate: "2025-09-05", approved: 298, enrolled: 276, pending: 22, status: "Closed" },
  { name: "Jan 2024 — Spring", session: "Spring 2024", startDate: "2024-01-15", approved: 320, enrolled: 304, pending: 16, status: "Completed" },
  { name: "Jul 2024 — Monsoon", session: "Monsoon 2024", startDate: "2024-07-10", approved: 296, enrolled: 288, pending: 8, status: "Completed" },
];

type SortKey = keyof Pick<Row, "approved" | "enrolled" | "pending">;

const statusStyle: Record<Status, string> = {
  Open: "bg-success/10 text-success",
  "Closing Soon": "bg-warning/10 text-warning",
  Closed: "bg-destructive/10 text-destructive",
  Completed: "bg-accent/10 text-accent",
};

function IntakeWiseEnrollment() {
  const [university, setUniversity] = useState(UNIVERSITIES[0]);
  const [course, setCourse] = useState(COURSES[0]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("approved");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = rows.filter(x =>
      !q || x.name.toLowerCase().includes(q) || x.session.toLowerCase().includes(q),
    );
    r = [...r].sort((a, b) => (sortDir === "desc" ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]));
    return r;
  }, [search, sortKey, sortDir]);

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

  const reset = () => {
    setUniversity(UNIVERSITIES[0]);
    setCourse(COURSES[0]);
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
                <TH k="approved" label="Approved Applications" />
                <TH k="enrolled" label="Enrolled Students" />
                <TH k="pending" label="Pending Enrollment" />
                <th className="px-6 py-2.5 font-semibold text-center">Status</th>
                <th className="px-6 py-2.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.name} className="border-b border-border/70 last:border-0 transition hover:bg-muted/40">
                  <td className="px-6 py-3.5 text-sm tabular-nums text-muted-foreground">{i + 1}</td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-[11px] font-semibold text-primary">
                        <CalendarRange className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{r.name}</div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          Starts {r.startDate}
                        </div>
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
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusStyle[r.status]}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
                      <Eye className="h-3.5 w-3.5" /> View Details
                    </button>
                  </td>
                </tr>
              ))}
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
    </div>
  );
}
