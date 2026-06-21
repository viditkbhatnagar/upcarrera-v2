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
  Clock,
  FileCheck2,
  Send,
  ShieldCheck,
  GraduationCap,
  XCircle,
  Loader2,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/enrollment/students")({
  head: () => ({
    meta: [
      { title: "Student Enrollments — upCarrera" },
      { name: "description", content: "Manage student enrollment processing." },
    ],
  }),
  component: StudentEnrollments,
});

const UNIVERSITIES = [
  "All Universities",
  "Symbiosis International University",
  "Manipal University",
  "Amity University",
  "Christ University",
  "Lovely Professional University",
  "Chandigarh University",
  "SRM Institute of Science & Tech.",
  "VIT University",
];
const COURSES = ["All Courses", "MBA", "B.Tech CSE", "BBA", "BCA", "M.Sc Data Science", "B.Com"];
const INTAKES = ["All Intakes", "Jan 2026 — Spring", "Jul 2026 — Monsoon", "Sep 2026 — Fall", "Jul 2025 — Monsoon"];
const STATUSES = [
  "All Statuses",
  "Enrollment Pending",
  "Ready for Submission",
  "Submitted",
  "Confirmation Pending",
  "Enrolled",
  "Rejected",
] as const;

type Status = Exclude<(typeof STATUSES)[number], "All Statuses">;

type Row = {
  studentId: string;
  enrollmentId: string;
  studentName: string;
  university: string;
  uniShort: string;
  course: string;
  specialisation: string;
  intake: string;
  status: Status;
};

// --- Live API wiring (GET /api/students { page, limit }) -------------------
// Each list item is the raw `students` row decorated server-side with its joined
// display fields: name (users), university_title (course -> university),
// course_title (course), consultant_name (users), session_title (sessions),
// enrollment_date, and a human admission_status_label. We map those real values
// into the design's Row shape so the existing JSX renders unchanged. The endpoint
// has no specialisation field, so that column renders "—" (never fabricated).
interface ApiStudentRow {
  id: number | string;
  student_id: number | string | null;
  enrollment_id: string | null;
  name: string | null;
  university_title: string | null;
  course_title: string | null;
  consultant_name: string | null;
  session_title: string | null;
  enrollment_date: string | null;
  admission_status_label: string | null;
}

interface StudentsListResponse {
  items: ApiStudentRow[];
  total: number;
  page: number;
  limit: number;
}

const EMPTY = "—";

function asText(value: string | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : EMPTY;
}

// Derive a short university tag (e.g. "Symbiosis International University" -> "SIU")
// from the real university_title; falls back to a 2-3 char slice for single words.
function uniInitials(title: string | null): string {
  const t = (title ?? "").trim();
  if (!t || t === EMPTY) return "—";
  const words = t.split(/\s+/).filter((w) => /[A-Za-z]/.test(w[0] ?? ""));
  if (words.length >= 2) {
    return words
      .map((w) => w[0])
      .join("")
      .slice(0, 3)
      .toUpperCase();
  }
  return t.slice(0, 3).toUpperCase();
}

// admission_status_label (real API label) -> the design's Status set, keeping the
// existing badge palette / KPI cards intact. Source of truth is the API's
// ADMISSION_STATUS_LABELS (apps/api/src/students/students.service.ts):
// Pending / In Progress / Enrolled / Passed Out / Dropout / Cancelled.
const STATUS_FROM_LABEL: Record<string, Status> = {
  Pending: "Enrollment Pending",
  "In Progress": "Ready for Submission",
  Enrolled: "Enrolled",
  "Passed Out": "Confirmation Pending",
  Dropout: "Rejected",
  Cancelled: "Rejected",
};

function toStatus(label: string | null | undefined): Status {
  return (label && STATUS_FROM_LABEL[label]) || "Enrollment Pending";
}

function mapApiRow(r: ApiStudentRow): Row {
  return {
    studentId: `UPC00${r.id}`,
    enrollmentId: asText(r.enrollment_id),
    studentName: asText(r.name),
    university: asText(r.university_title),
    uniShort: uniInitials(r.university_title),
    course: asText(r.course_title),
    specialisation: EMPTY,
    intake: asText(r.session_title),
    status: toStatus(r.admission_status_label),
  };
}

const statusStyle: Record<Status, string> = {
  "Enrollment Pending": "bg-warning/10 text-warning",
  "Ready for Submission": "bg-primary/10 text-primary",
  "Submitted": "bg-accent/10 text-accent",
  "Confirmation Pending": "bg-amber-500/10 text-amber-600",
  "Enrolled": "bg-success/10 text-success",
  "Rejected": "bg-destructive/10 text-destructive",
};

const kpis: { label: Status; icon: React.ComponentType<{ className?: string }>; tone: string }[] = [
  { label: "Enrollment Pending", icon: Clock, tone: "bg-warning/10 text-warning" },
  { label: "Ready for Submission", icon: FileCheck2, tone: "bg-primary/10 text-primary" },
  { label: "Submitted", icon: Send, tone: "bg-accent/10 text-accent" },
  { label: "Confirmation Pending", icon: ShieldCheck, tone: "bg-amber-500/10 text-amber-600" },
  { label: "Enrolled", icon: GraduationCap, tone: "bg-success/10 text-success" },
  { label: "Rejected", icon: XCircle, tone: "bg-destructive/10 text-destructive" },
];

function StudentEnrollments() {
  const [name, setName] = useState("");
  const [enrollId, setEnrollId] = useState("");
  const [university, setUniversity] = useState(UNIVERSITIES[0]);
  const [course, setCourse] = useState(COURSES[0]);
  const [intake, setIntake] = useState(INTAKES[0]);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("All Statuses");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Live enrollment list. The static option lists above stay as filter chrome; the
  // text/select filters below refine the fetched page client-side over real values.
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["enrollment", "students", { page: 1, limit: 50 }],
    queryFn: () => apiGet<StudentsListResponse>("/students", { page: 1, limit: 50 }),
  });

  const rows = useMemo<Row[]>(() => (data?.items ?? []).map(mapApiRow), [data]);

  const filtered = useMemo(() => {
    const n = name.trim().toLowerCase();
    const e = enrollId.trim().toLowerCase();
    return rows.filter(r => {
      if (n && !r.studentName.toLowerCase().includes(n) && !r.studentId.toLowerCase().includes(n)) return false;
      if (e && !r.enrollmentId.toLowerCase().includes(e)) return false;
      if (university !== UNIVERSITIES[0] && r.university !== university) return false;
      if (course !== COURSES[0] && r.course !== course) return false;
      if (intake !== INTAKES[0] && r.intake !== intake) return false;
      if (status !== "All Statuses" && r.status !== status) return false;
      return true;
    });
  }, [rows, name, enrollId, university, course, intake, status]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = {
      "Enrollment Pending": 0,
      "Ready for Submission": 0,
      "Submitted": 0,
      "Confirmation Pending": 0,
      "Enrolled": 0,
      "Rejected": 0,
    };
    rows.forEach(r => { c[r.status]++; });
    return c;
  }, [rows]);

  const reset = () => {
    setName(""); setEnrollId(""); setUniversity(UNIVERSITIES[0]);
    setCourse(COURSES[0]); setIntake(INTAKES[0]); setStatus("All Statuses");
    setFrom(""); setTo("");
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
        {kpis.map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
              <div className="flex items-center justify-between">
                <span className={`grid h-9 w-9 place-items-center rounded-lg ${k.tone}`}>
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3 text-2xl font-semibold tabular-nums text-foreground">{counts[k.label]}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{k.label}</div>
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
              placeholder="ENR-2026-…"
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
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Enrollment Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {STATUSES.map(s => <option key={s}>{s}</option>)}
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
            Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {rows.length} enrollments
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
                <th className="px-3 py-2.5 font-semibold">Specialisation</th>
                <th className="px-3 py-2.5 font-semibold">Intake</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-6 py-2.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <span className="text-sm">Loading enrollments…</span>
                    </div>
                  </td>
                </tr>
              )}
              {isError && !isLoading && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <AlertTriangle className="h-6 w-6 text-destructive" />
                      <span className="text-sm font-semibold text-foreground">Couldn’t load enrollments</span>
                      <span className="text-xs">{error instanceof Error ? error.message : "Please try again."}</span>
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && !isError && filtered.map((r, i) => (
                <tr key={r.enrollmentId} className="border-b border-border/70 last:border-0 transition hover:bg-muted/40">
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
                  <td className="px-3 py-3.5 text-xs text-muted-foreground">{r.specialisation}</td>
                  <td className="px-3 py-3.5 text-xs text-foreground">{r.intake}</td>
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
              ))}
              {!isLoading && !isError && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-sm text-muted-foreground">
                    No enrollments match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
