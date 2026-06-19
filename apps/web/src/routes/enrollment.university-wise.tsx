import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Download,
  Search,
  Filter,
  RotateCcw,
  Eye,
  Building2,
  ArrowUpDown,
  Calendar as CalendarIcon,
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

type Row = {
  name: string;
  short: string;
  location: string;
  approved: number;
  ready: number;
  submitted: number;
  confirmed: number;
  rejected: number;
};

const rows: Row[] = [
  { name: "Symbiosis International University", short: "SIU", location: "Pune", approved: 318, ready: 48, submitted: 126, confirmed: 184, rejected: 6 },
  { name: "Manipal University", short: "MU", location: "Manipal", approved: 286, ready: 36, submitted: 98, confirmed: 142, rejected: 10 },
  { name: "Amity University", short: "AU", location: "Noida", approved: 342, ready: 54, submitted: 108, confirmed: 156, rejected: 14 },
  { name: "Christ University", short: "CU", location: "Bangalore", approved: 198, ready: 22, submitted: 74, confirmed: 96, rejected: 4 },
  { name: "Lovely Professional University", short: "LPU", location: "Jalandhar", approved: 254, ready: 41, submitted: 88, confirmed: 124, rejected: 8 },
  { name: "Chandigarh University", short: "CGU", location: "Mohali", approved: 178, ready: 29, submitted: 62, confirmed: 88, rejected: 5 },
  { name: "SRM Institute of Science & Tech.", short: "SRM", location: "Chennai", approved: 212, ready: 34, submitted: 78, confirmed: 112, rejected: 7 },
  { name: "VIT University", short: "VIT", location: "Vellore", approved: 168, ready: 26, submitted: 58, confirmed: 84, rejected: 3 },
];

type SortKey = keyof Pick<Row, "approved" | "ready" | "submitted" | "confirmed" | "rejected">;

function UniversityWiseEnrollment() {
  const [course, setCourse] = useState(COURSES[0]);
  const [intake, setIntake] = useState(INTAKES[0]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("approved");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = rows.filter(x =>
      !q || x.name.toLowerCase().includes(q) || x.short.toLowerCase().includes(q) || x.location.toLowerCase().includes(q),
    );
    r = [...r].sort((a, b) => (sortDir === "desc" ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]));
    return r;
  }, [search, sortKey, sortDir]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => ({
          approved: acc.approved + r.approved,
          ready: acc.ready + r.ready,
          submitted: acc.submitted + r.submitted,
          confirmed: acc.confirmed + r.confirmed,
          rejected: acc.rejected + r.rejected,
        }),
        { approved: 0, ready: 0, submitted: 0, confirmed: 0, rejected: 0 },
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
                placeholder="Name, code, location"
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
                <TH k="approved" label="Approved" />
                <TH k="ready" label="Ready for Submission" />
                <TH k="submitted" label="Submitted" />
                <TH k="confirmed" label="Confirmed" />
                <TH k="rejected" label="Rejected" />
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
                        {r.short}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{r.name}</div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Building2 className="h-3 w-3" /> {r.location}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums font-semibold text-foreground">{r.approved}</td>
                  <td className="px-3 py-3.5 text-right">
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary">{r.ready}</span>
                  </td>
                  <td className="px-3 py-3.5 text-right">
                    <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-accent">{r.submitted}</span>
                  </td>
                  <td className="px-3 py-3.5 text-right">
                    <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-success">{r.confirmed}</span>
                  </td>
                  <td className="px-3 py-3.5 text-right">
                    <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-destructive">{r.rejected}</span>
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
                      <Eye className="h-3.5 w-3.5" /> View Students
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
                <td className="px-3 py-3 text-right tabular-nums">{totals.ready}</td>
                <td className="px-3 py-3 text-right tabular-nums">{totals.submitted}</td>
                <td className="px-3 py-3 text-right tabular-nums text-success">{totals.confirmed}</td>
                <td className="px-3 py-3 text-right tabular-nums text-destructive">{totals.rejected}</td>
                <td className="px-6 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
