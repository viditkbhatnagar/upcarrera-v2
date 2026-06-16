import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import {
  Download,
  Search,
  Filter,
  RefreshCcw,
  Bookmark,
  Eye,
  Pencil,
  Phone,
  MessageCircle,
  X,
  CalendarDays,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  ChevronLeft,
  ChevronRight,
  Hash,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ALL_STUDENTS,
  BATCHES,
  COORDINATORS,
  COURSES,
  STATUS_DOT,
  STATUS_ICONS,
  STATUS_ORDER,
  STATUS_STYLES,
  UNIVERSITIES,
  type Student,
  type StudentStatus,
} from "@/lib/students-data";

export const Route = createFileRoute("/students/students/")({
  head: () => ({ meta: [{ title: "Students — upCarrera" }] }),
  component: StudentsPage,
});

// --- Live API wiring (GET /api/students) ---------------------------------
// The list endpoint returns raw students rows (ids + raw fields). It does NOT
// join the users table, so display name/email/phone and university/course/
// coordinator *titles* are not available from this endpoint. We render what the
// endpoint gives us and derive sensible display fallbacks for the rest.
// admission_status is a numeric code; map it to the UI's StudentStatus label.
interface ApiStudentRow {
  id: number | string;
  student_id: number | string | null;
  enrollment_id: string | null;
  application_id: number | string | null;
  admission_status: number | string | null;
  course_id: number | string | null;
  consultant_id: number | string | null;
  enrollment_date: string | null;
  created_at: string | null;
}

const ADMISSION_STATUS_LABEL: Record<string, StudentStatus> = {
  "1": "Pending",
  "2": "In Progress",
  "3": "Enrolled",
  "4": "Dropout",
  "5": "Passed Out",
  "6": "Cancelled",
};

function mapAdmissionStatus(code: number | string | null): StudentStatus {
  if (code === null || code === undefined) return "Pending";
  return ADMISSION_STATUS_LABEL[String(code)] ?? "Pending";
}

// admission_status query value the API expects for a given UI status label.
const STATUS_TO_CODE: Record<StudentStatus, string> = {
  Pending: "1",
  "In Progress": "2",
  Enrolled: "3",
  Dropout: "4",
  "Passed Out": "5",
  Cancelled: "6",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function mapApiRow(r: ApiStudentRow): Student {
  const displayId =
    r.enrollment_id != null && String(r.enrollment_id).trim() !== ""
      ? String(r.enrollment_id)
      : `STU-${r.student_id ?? r.id}`;
  return {
    id: displayId,
    name: r.student_id != null ? `Student #${r.student_id}` : `Record #${r.id}`,
    email: "—",
    phone: "",
    university: "—",
    course: r.course_id != null ? `Course #${r.course_id}` : "—",
    batch: "—",
    enrollmentDate: formatDate(r.enrollment_date ?? r.created_at),
    coordinator: r.consultant_id != null ? `Consultant #${r.consultant_id}` : "—",
    coordinatorInitials: "C",
    status: mapAdmissionStatus(r.admission_status),
    totalFee: 0,
    paid: 0,
    overdue: 0,
  };
}

function StudentsPage() {
  const [statusFilter, setStatusFilter] = useState<StudentStatus | "All">("All");
  const [search, setSearch] = useState("");
  const [stuId, setStuId] = useState("");
  const [phone, setPhone] = useState("");
  const [university, setUniversity] = useState("All");
  const [course, setCourse] = useState("All");
  const [batch, setBatch] = useState("All");
  const [coordinator, setCoordinator] = useState("All");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  // Live students list. The API supports server-side page/limit + admission_status
  // (+ course_id/referred_by) filters; we drive those from state. The remaining
  // text/university/batch/coordinator filters are applied client-side over the
  // fetched page (the endpoint does not join those label columns — see mapApiRow).
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["students", { page, limit: PAGE_SIZE, statusFilter }],
    queryFn: () =>
      apiGet<{ items: ApiStudentRow[]; total: number; page: number; limit: number }>("/students", {
        page,
        limit: PAGE_SIZE,
        admission_status: statusFilter === "All" ? undefined : STATUS_TO_CODE[statusFilter],
      }),
  });

  const apiTotal = data?.total ?? 0;
  const allRows = useMemo(() => (data?.items ?? []).map(mapApiRow), [data]);

  // Client-side refinement of the current page (best-effort: most label columns
  // are not returned by the list endpoint, so these mostly act on derived values).
  const pageRows = useMemo(() => {
    return allRows.filter((s) => {
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (stuId && !s.id.toLowerCase().includes(stuId.toLowerCase())) return false;
      if (phone && !s.phone.includes(phone)) return false;
      if (university !== "All" && s.university !== university) return false;
      if (course !== "All" && s.course !== course) return false;
      if (batch !== "All" && s.batch !== batch) return false;
      if (coordinator !== "All" && s.coordinator !== coordinator) return false;
      return true;
    });
  }, [allRows, search, stuId, phone, university, course, batch, coordinator]);

  const totalPages = Math.max(1, Math.ceil(apiTotal / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  // KPI status counts are not available as aggregates from /students, so the
  // cards stay on the seeded mock counts for now.
  const counts = useMemo(() => {
    const m: Record<StudentStatus, number> = {
      Pending: 0,
      "In Progress": 0,
      Enrolled: 0,
      "Passed Out": 0,
      Dropout: 0,
      Cancelled: 0,
    };
    ALL_STUDENTS.forEach((s) => (m[s.status] += 1));
    return m;
  }, []);

  const resetFilters = () => {
    setStatusFilter("All");
    setSearch("");
    setStuId("");
    setPhone("");
    setUniversity("All");
    setCourse("All");
    setBatch("All");
    setCoordinator("All");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Student Management
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Students
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage enrolled students, fee collections, support activities.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <KpiCard
          icon={Users}
          label="Total Students"
          value={ALL_STUDENTS.length}
          trend={+8.2}
          active={statusFilter === "All"}
          onClick={() => {
            setStatusFilter("All");
            setPage(1);
          }}
          accent="bg-primary/10 text-primary"
        />
        {STATUS_ORDER.map((s) => {
          const Icon = STATUS_ICONS[s];
          return (
            <KpiCard
              key={s}
              icon={Icon}
              label={s}
              value={counts[s]}
              trend={(((counts[s] / ALL_STUDENTS.length) * 100) % 20) - 5}
              active={statusFilter === s}
              onClick={() => {
                setStatusFilter(statusFilter === s ? "All" : s);
                setPage(1);
              }}
              accent={cn(STATUS_DOT[s].replace("bg-", "bg-") + "/15", "text-foreground")}
              dot={STATUS_DOT[s]}
            />
          );
        })}
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Filter className="h-4 w-4 text-muted-foreground" />
          Filters
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <FilterInput icon={Search} placeholder="Student name" value={search} onChange={setSearch} />
          <FilterInput icon={Hash} placeholder="Student ID" value={stuId} onChange={setStuId} />
          <FilterInput icon={Phone} placeholder="Mobile number" value={phone} onChange={setPhone} />
          <FilterSelect value={university} onChange={setUniversity} options={["All", ...UNIVERSITIES]} placeholder="University" />
          <FilterSelect value={course} onChange={setCourse} options={["All", ...COURSES]} placeholder="Course" />
          <FilterSelect value={batch} onChange={setBatch} options={["All", ...BATCHES]} placeholder="Intake" />
          <FilterSelect
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StudentStatus | "All")}
            options={["All", ...STATUS_ORDER]}
            placeholder="Status"
          />
          <FilterSelect
            value={coordinator}
            onChange={setCoordinator}
            options={["All", ...COORDINATORS.map((c) => c.name)]}
            placeholder="Student Coordinator"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            Date range: <span className="font-medium text-foreground">Last 90 days</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Reset filters
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
              <Bookmark className="h-3.5 w-3.5" />
              Save view
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover">
              Apply filters
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-semibold text-foreground">
            {isLoading ? "Loading…" : `${apiTotal.toLocaleString()} students`}
            {statusFilter !== "All" && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                {statusFilter}
                <button onClick={() => setStatusFilter("All")}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Sorted by <span className="font-medium text-foreground">Enrollment Date</span> · Newest first
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <RefreshCcw className="h-8 w-8 animate-spin text-muted-foreground/50" />
              <div className="text-sm font-semibold text-foreground">Loading students…</div>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <AlertTriangle className="h-10 w-10 text-red-500/60" />
              <div className="text-sm font-semibold text-foreground">Couldn’t load students</div>
              <div className="text-xs text-muted-foreground">
                {error instanceof Error ? error.message : "Please try again."}
              </div>
            </div>
          ) : pageRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Users className="h-10 w-10 text-muted-foreground/50" />
              <div className="text-sm font-semibold text-foreground">No students found</div>
              <div className="text-xs text-muted-foreground">
                Try adjusting your filters or clearing them.
              </div>
            </div>
          ) : (
            <table className="w-full min-w-[1100px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">Student ID</th>
                  <th className="px-4 py-2.5 font-semibold">Student</th>
                  <th className="px-4 py-2.5 font-semibold">University</th>
                  <th className="px-4 py-2.5 font-semibold">Course</th>
                  <th className="px-4 py-2.5 font-semibold">Batch</th>
                  <th className="px-4 py-2.5 font-semibold">Enrolled</th>
                  <th className="px-4 py-2.5 font-semibold">Support</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s) => (
                  <tr
                    key={s.id}
                    className="group border-b border-border last:border-0 transition hover:bg-muted/40"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to="/students/students/$id"
                        params={{ id: s.id }}
                        className="font-mono text-xs font-semibold text-primary hover:underline"
                      >
                        {s.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {s.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-foreground">{s.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{s.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{s.university}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{s.course}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{s.batch}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{s.enrollmentDate}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground">
                          {s.coordinatorInitials}
                        </div>
                        <span className="text-xs text-foreground">{s.coordinator}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
                          STATUS_STYLES[s.status],
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[s.status])} />
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          to="/students/students/$id"
                          params={{ id: s.id }}
                          title="View"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-background hover:text-foreground"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <IconBtn icon={Pencil} label="Edit" />
                        <IconBtn icon={Phone} label="Call" />
                        <IconBtn icon={MessageCircle} label="WhatsApp" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <div>
            Showing{" "}
            <span className="font-semibold text-foreground">
              {apiTotal === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}
            </span>{" "}
            – {" "}
            <span className="font-semibold text-foreground">
              {Math.min(currentPage * PAGE_SIZE, apiTotal)}
            </span>{" "}
            of <span className="font-semibold text-foreground">{apiTotal}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 font-medium text-foreground hover:bg-muted disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <span className="px-2 font-medium text-foreground">
              Page {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 font-medium text-foreground hover:bg-muted disabled:opacity-40"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Helpers ---------------- */

function KpiCard({
  icon: Icon,
  label,
  value,
  trend,
  active,
  onClick,
  accent,
  dot,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  trend: number;
  active?: boolean;
  onClick?: () => void;
  accent?: string;
  dot?: string;
}) {
  const up = trend >= 0;
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex flex-col gap-2 rounded-xl border bg-surface p-3 text-left shadow-card transition hover:border-primary/40",
        active ? "border-primary ring-2 ring-primary/20" : "border-border",
      )}
    >
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            accent ?? "bg-muted text-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        {dot && <span className={cn("h-2 w-2 rounded-full", dot)} />}
      </div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="flex items-end justify-between">
        <div className="text-xl font-bold tracking-tight text-foreground">
          {value.toLocaleString()}
        </div>
        <div
          className={cn(
            "inline-flex items-center gap-0.5 text-[11px] font-semibold",
            up ? "text-emerald-600" : "text-red-600",
          )}
        >
          {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(trend).toFixed(1)}%
        </div>
      </div>
    </button>
  );
}

function FilterInput({
  icon: Icon,
  placeholder,
  value,
  onChange,
}: {
  icon: typeof Search;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="h-9 pl-9 text-sm"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o === "All" ? `All ${placeholder.toLowerCase()}` : o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function IconBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Eye;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-background hover:text-foreground"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
