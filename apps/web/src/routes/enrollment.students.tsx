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
  Calendar as CalendarIcon,
  RefreshCcw,
  AlertTriangle,
  GraduationCap,
} from "lucide-react";
import {
  STATUS_ORDER,
  STATUS_ICONS,
  STATUS_DOT,
  type StudentStatus,
} from "@/lib/students-data";

export const Route = createFileRoute("/enrollment/students")({
  head: () => ({
    meta: [
      { title: "Student Enrollments — upCarrera" },
      { name: "description", content: "Manage student enrollment processing." },
    ],
  }),
  component: StudentEnrollments,
});

// --- Live API wiring (GET /api/students) ---------------------------------
// Each list item is the raw `students` row decorated by the API with its joined
// display fields: name (from users), course_title + university_title
// (course -> university), consultant_name (counsellor, from users), session_title
// (intake), enrollment_date and a human admission_status_label. The list response
// also carries `counts.by_status`, which drives the KPI cards (live, no mock seed).
// The admission_status pipeline is the source of truth for the status taxonomy:
// Pending / In Progress / Enrolled / Passed Out / Dropout / Cancelled.
// Column set mirrors the old CRM enrollment list (all_enrollments.php):
// Student ID ("UPC00"+id) · Student · University · Course · Counsellor ·
// Intake · Enrollment Date · Status.
interface ApiStudentRow {
  id: number | string;
  student_id: number | string | null;
  enrollment_id: string | null;
  application_id: number | string | null;
  admission_status: number | string | null;
  admission_status_label: string | null;
  course_id: number | string | null;
  consultant_id: number | string | null;
  enrollment_date: string | null;
  // Decorated display fields (joined server-side).
  name: string | null;
  email: string | null;
  phone: string | null;
  course_title: string | null;
  university_title: string | null;
  consultant_name: string | null;
  session_title: string | null;
  register_number: string | null;
  code: string | null;
}

interface StatusCounts {
  total: number;
  by_status: Record<string, number>;
}

interface StudentsListResponse {
  items: ApiStudentRow[];
  total: number;
  page: number;
  limit: number;
  counts: StatusCounts;
}

// students.admission_status (Int code) -> UI status label. Source of truth is the
// API's ADMISSION_STATUS_LABELS (apps/api/src/students/students.service.ts):
// 0:Pending 1:In Progress 2:Enrolled 3:Passed Out 4:Dropout 5:Cancelled.
const STATUS_TO_CODE: Record<StudentStatus, string> = {
  Pending: "0",
  "In Progress": "1",
  Enrolled: "2",
  "Passed Out": "3",
  Dropout: "4",
  Cancelled: "5",
};

const STATUS_OPTIONS = ["All Statuses", ...STATUS_ORDER] as const;

const EMPTY = "—";

function asText(value: string | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : EMPTY;
}

// admission_status_label is already a human label; coerce to a known UI status so
// the badge styling/order resolves. Falls back to "Pending" for unmapped codes.
function toStudentStatus(label: string | null | undefined): StudentStatus {
  const match = STATUS_ORDER.find((s) => s === label);
  return match ?? "Pending";
}

const statusStyle: Record<StudentStatus, string> = {
  Pending: "bg-warning/10 text-warning",
  "In Progress": "bg-accent/10 text-accent",
  Enrolled: "bg-success/10 text-success",
  "Passed Out": "bg-primary/10 text-primary",
  Dropout: "bg-amber-500/10 text-amber-600",
  Cancelled: "bg-destructive/10 text-destructive",
};

function formatDate(value: string | null): string {
  if (!value) return EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// A decorated row, normalised for rendering (real values, blank-safe).
interface Row {
  rowId: string;
  studentId: string;
  enrollmentId: string;
  studentName: string;
  university: string;
  uniShort: string;
  course: string;
  counsellor: string;
  intake: string;
  enrollmentDate: string;
  status: StudentStatus;
}

function mapApiRow(r: ApiStudentRow): Row {
  // Old-CRM Student ID display = "UPC00" + students.id (the row's id).
  const studentId = `UPC00${r.id}`;
  // Old CRM shows the register number / code as the enrollment reference;
  // fall back to the raw enrollment_id, then a dash.
  const enrollmentId = asText(r.register_number ?? r.code ?? r.enrollment_id);
  return {
    rowId: String(r.id),
    studentId,
    enrollmentId,
    studentName: asText(r.name),
    university: asText(r.university_title),
    // No short-code field on the API — derive initials from the university name.
    uniShort: uniInitials(r.university_title),
    course: asText(r.course_title),
    counsellor: asText(r.consultant_name),
    intake: asText(r.session_title),
    enrollmentDate: formatDate(r.enrollment_date),
    status: toStudentStatus(r.admission_status_label),
  };
}

function uniInitials(name: string | null | undefined): string {
  if (name == null || String(name).trim() === "") return EMPTY;
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return parts
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function StudentEnrollments() {
  const [name, setName] = useState("");
  const [enrollId, setEnrollId] = useState("");
  const [university, setUniversity] = useState("All Universities");
  const [course, setCourse] = useState("All Courses");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("All Statuses");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  // Live enrollments list. The API supports server-side page/limit + admission_status.
  // The remaining text/select filters refine the fetched page client-side over the
  // real decorated values.
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["enrollment", "students", { page, limit: PAGE_SIZE, status }],
    queryFn: () =>
      apiGet<StudentsListResponse>("/students", {
        page,
        limit: PAGE_SIZE,
        admission_status: status === "All Statuses" ? undefined : STATUS_TO_CODE[status],
      }),
  });

  const apiTotal = data?.total ?? 0;
  const allRows = useMemo(() => (data?.items ?? []).map(mapApiRow), [data]);

  // University / course options are derived from the real fetched page so the
  // selects only ever offer values that exist in the data (no mock seed).
  const universityOptions = useMemo(() => {
    const set = new Set(
      allRows.map((r) => r.university).filter((u) => u !== EMPTY),
    );
    return ["All Universities", ...Array.from(set).sort()];
  }, [allRows]);
  const courseOptions = useMemo(() => {
    const set = new Set(allRows.map((r) => r.course).filter((c) => c !== EMPTY));
    return ["All Courses", ...Array.from(set).sort()];
  }, [allRows]);

  // Client-side refinement of the current page over the real joined values.
  const filtered = useMemo(() => {
    const n = name.trim().toLowerCase();
    const e = enrollId.trim().toLowerCase();
    return allRows.filter((r) => {
      if (n && !r.studentName.toLowerCase().includes(n) && !r.studentId.toLowerCase().includes(n)) return false;
      if (e && !r.enrollmentId.toLowerCase().includes(e)) return false;
      if (university !== "All Universities" && r.university !== university) return false;
      if (course !== "All Courses" && r.course !== course) return false;
      return true;
    });
  }, [allRows, name, enrollId, university, course]);

  // Live KPI-card counts come straight from the list response's counts.by_status,
  // computed server-side over the same filtered set (no mock seed).
  const byStatus = data?.counts?.by_status;
  const counts = useMemo(() => {
    const c: Record<StudentStatus, number> = {
      Pending: 0,
      "In Progress": 0,
      Enrolled: 0,
      "Passed Out": 0,
      Dropout: 0,
      Cancelled: 0,
    };
    if (byStatus) {
      for (const s of STATUS_ORDER) c[s] = byStatus[s] ?? 0;
    }
    return c;
  }, [byStatus]);

  const reset = () => {
    setName(""); setEnrollId(""); setUniversity("All Universities");
    setCourse("All Courses"); setStatus("All Statuses");
    setFrom(""); setTo(""); setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Enrollment Management</div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Student Enrollments
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage student enrollment processing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground shadow-card hover:bg-accent-hover">
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {STATUS_ORDER.map((label) => {
          const Icon = STATUS_ICONS[label];
          return (
            <div key={label} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
              <div className="flex items-center justify-between">
                <span className={`grid h-9 w-9 place-items-center rounded-lg ${statusStyle[label]}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className={`h-2 w-2 rounded-full ${STATUS_DOT[label]}`} />
              </div>
              <div className="mt-3 text-2xl font-semibold tabular-nums text-foreground">
                {isLoading ? <span className="inline-block h-6 w-10 animate-pulse rounded bg-muted align-middle" /> : counts[label]}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="flex items-center gap-2 pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Filters
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Student Name / ID</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Search by name or ID"
                className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Enrollment ID</label>
            <input
              value={enrollId}
              onChange={(e) => setEnrollId(e.target.value)}
              placeholder="Search by enrollment ID"
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">University</label>
            <select
              value={university}
              onChange={(e) => setUniversity(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {universityOptions.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Course</label>
            <select
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {courseOptions.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Enrollment Status</label>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value as (typeof STATUS_OPTIONS)[number]); setPage(1); }}
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
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
            {isLoading ? (
              "Loading…"
            ) : (
              <>
                Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {apiTotal.toLocaleString()} enrollments
                {isFetching && (
                  <RefreshCcw className="ml-2 inline h-3.5 w-3.5 animate-spin text-muted-foreground/60 align-text-bottom" />
                )}
              </>
            )}
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
                <th className="px-6 py-2.5 font-semibold">Student / Enrollment ID</th>
                <th className="px-3 py-2.5 font-semibold">Student Name</th>
                <th className="px-3 py-2.5 font-semibold">University</th>
                <th className="px-3 py-2.5 font-semibold">Course</th>
                <th className="px-3 py-2.5 font-semibold">Counsellor</th>
                <th className="px-3 py-2.5 font-semibold">Intake</th>
                <th className="px-3 py-2.5 font-semibold">Enrollment Date</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-6 py-2.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12">
                    <div className="flex flex-col items-center justify-center gap-2 text-center">
                      <RefreshCcw className="h-7 w-7 animate-spin text-muted-foreground/50" />
                      <div className="text-sm font-semibold text-foreground">Loading enrollments…</div>
                    </div>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12">
                    <div className="flex flex-col items-center justify-center gap-2 text-center">
                      <AlertTriangle className="h-9 w-9 text-destructive/60" />
                      <div className="text-sm font-semibold text-foreground">Couldn’t load enrollments</div>
                      <div className="text-xs text-muted-foreground">
                        {error instanceof Error ? error.message : "Please try again."}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12">
                    <div className="flex flex-col items-center justify-center gap-2 text-center">
                      <GraduationCap className="h-9 w-9 text-muted-foreground/50" />
                      <div className="text-sm font-semibold text-foreground">No enrollments found</div>
                      <div className="text-xs text-muted-foreground">
                        Try adjusting your filters or clearing them.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((r, i) => (
                  <tr key={r.rowId} className="border-b border-border/70 last:border-0 transition hover:bg-muted/40">
                    <td className="px-6 py-3.5 text-sm tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-6 py-3.5">
                      <div className="font-mono text-xs font-semibold text-foreground">{r.studentId}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{r.enrollmentId}</div>
                    </td>
                    <td className="px-3 py-3.5 font-medium text-foreground">{r.studentName}</td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/10 text-[10px] font-semibold text-primary">{r.uniShort}</span>
                        <span className="text-xs text-foreground">{r.university}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-xs text-foreground">{r.course}</td>
                    <td className="px-3 py-3.5 text-xs text-foreground">{r.counsellor}</td>
                    <td className="px-3 py-3.5 text-xs text-foreground">{r.intake}</td>
                    <td className="px-3 py-3.5 text-xs text-muted-foreground">{r.enrollmentDate}</td>
                    <td className="px-3 py-3.5">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusStyle[r.status]}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
                        <Eye className="h-3.5 w-3.5" /> View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
