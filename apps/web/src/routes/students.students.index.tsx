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
  PhoneCall,
  Loader2,
  MessageCircle,
  X,
  CalendarDays,
  Users,
  ChevronLeft,
  ChevronRight,
  Hash,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStartCall, type CallHealth } from "@/components/calls/calls-ui";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  STATUS_DOT,
  STATUS_ICONS,
  STATUS_ORDER,
  STATUS_STYLES,
  type StudentStatus,
} from "@/lib/students-data";

export const Route = createFileRoute("/students/students/")({
  head: () => ({ meta: [{ title: "Students — upCarrera" }] }),
  component: StudentsPage,
});

// --- Live API wiring (GET /api/students) ---------------------------------
// Each list item is the raw `students` row decorated by the API with its joined
// display fields: name/email/phone/profile_picture (from users), consultant_name
// (from users), course_title + university_title (course -> university) and a
// human admission_status_label. We render those real values directly — no #id
// fallbacks. The list response also carries `counts.by_status`, which drives the
// KPI cards (live, no mock seed).
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
  created_at: string | null;
  // Decorated display fields (joined server-side).
  name: string | null;
  email: string | null;
  phone: string | null;
  profile_picture: string | null;
  consultant_name: string | null;
  course_title: string | null;
  university_title: string | null;
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

// A decorated row, normalised for rendering (real values, blank-safe).
interface StudentRow {
  rowId: string;
  displayId: string;
  name: string;
  email: string;
  phone: string;
  profilePicture: string | null;
  university: string;
  course: string;
  enrollmentDate: string;
  coordinator: string;
  status: StudentStatus;
}

const EMPTY = "—";

function asText(value: string | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : EMPTY;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// admission_status_label is already a human label; coerce to a known UI status so
// the badge styling/order resolves. Falls back to "Pending" for unmapped codes.
function toStudentStatus(label: string | null | undefined): StudentStatus {
  const match = STATUS_ORDER.find((s) => s === label);
  return match ?? "Pending";
}

function formatDate(value: string | null): string {
  if (!value) return EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function mapApiRow(r: ApiStudentRow): StudentRow {
  const displayId =
    r.enrollment_id != null && String(r.enrollment_id).trim() !== ""
      ? String(r.enrollment_id)
      : `STU-${r.student_id ?? r.id}`;
  return {
    rowId: String(r.id),
    displayId,
    name: asText(r.name),
    email: asText(r.email),
    phone: r.phone != null ? String(r.phone) : "",
    profilePicture: r.profile_picture && String(r.profile_picture).trim() !== "" ? String(r.profile_picture) : null,
    university: asText(r.university_title),
    course: asText(r.course_title),
    enrollmentDate: formatDate(r.enrollment_date ?? r.created_at),
    coordinator: asText(r.consultant_name),
    status: toStudentStatus(r.admission_status_label),
  };
}

function StudentsPage() {
  const [statusFilter, setStatusFilter] = useState<StudentStatus | "All">("All");
  const [search, setSearch] = useState("");
  const [stuId, setStuId] = useState("");
  const [phone, setPhone] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  // Live students list. The API supports server-side page/limit + admission_status.
  // The remaining text filters (name / id / phone) refine the fetched page
  // client-side over the real decorated values.
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["students", "list", { page, limit: PAGE_SIZE, statusFilter }],
    queryFn: () =>
      apiGet<StudentsListResponse>("/students", {
        page,
        limit: PAGE_SIZE,
        admission_status: statusFilter === "All" ? undefined : STATUS_TO_CODE[statusFilter],
      }),
  });

  const apiTotal = data?.total ?? 0;
  const allRows = useMemo(() => (data?.items ?? []).map(mapApiRow), [data]);

  // Click-to-call: only surfaced when the calling integration is configured.
  const { data: callHealth } = useQuery({
    queryKey: ["calls", "health"],
    queryFn: () => apiGet<CallHealth>("/calls/health"),
    staleTime: 5 * 60 * 1000,
  });
  const callsOn = callHealth?.configured ?? false;
  const { callingPhone, start } = useStartCall();

  // Client-side text refinement of the current page over the real joined values.
  const pageRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const idQ = stuId.trim().toLowerCase();
    const phoneQ = phone.trim();
    return allRows.filter((s) => {
      if (q && !`${s.name} ${s.email}`.toLowerCase().includes(q)) return false;
      if (idQ && !s.displayId.toLowerCase().includes(idQ)) return false;
      if (phoneQ && !s.phone.includes(phoneQ)) return false;
      return true;
    });
  }, [allRows, search, stuId, phone]);

  const totalPages = Math.max(1, Math.ceil(apiTotal / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  // Live KPI-card counts come straight from the list response's counts.by_status,
  // computed server-side over the same filtered set (no mock seed).
  const byStatus = data?.counts?.by_status;
  const countsTotal = data?.counts?.total ?? apiTotal;
  const counts = useMemo(() => {
    const m: Record<StudentStatus, number> = {
      Pending: 0,
      "In Progress": 0,
      Enrolled: 0,
      "Passed Out": 0,
      Dropout: 0,
      Cancelled: 0,
    };
    if (byStatus) {
      for (const s of STATUS_ORDER) m[s] = byStatus[s] ?? 0;
    }
    return m;
  }, [byStatus]);

  const resetFilters = () => {
    setStatusFilter("All");
    setSearch("");
    setStuId("");
    setPhone("");
    setPage(1);
  };

  const countsLoading = isLoading;

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
          value={countsTotal}
          loading={countsLoading}
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
              loading={countsLoading}
              active={statusFilter === s}
              onClick={() => {
                setStatusFilter(statusFilter === s ? "All" : s);
                setPage(1);
              }}
              accent={cn(STATUS_DOT[s] + "/15", "text-foreground")}
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
          <FilterInput icon={Search} placeholder="Name or email" value={search} onChange={setSearch} />
          <FilterInput icon={Hash} placeholder="Student ID" value={stuId} onChange={setStuId} />
          <FilterInput icon={Phone} placeholder="Mobile number" value={phone} onChange={setPhone} />
          <FilterSelect
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v as StudentStatus | "All");
              setPage(1);
            }}
            options={["All", ...STATUS_ORDER]}
            placeholder="Status"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            Status filter runs server-side · name / ID / phone refine the page
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
                <button
                  onClick={() => {
                    setStatusFilter("All");
                    setPage(1);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {isFetching && !isLoading && (
              <RefreshCcw className="ml-2 inline h-3.5 w-3.5 animate-spin text-muted-foreground/60 align-text-bottom" />
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Sorted by <span className="font-medium text-foreground">Newest</span> first
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
            <table className="w-full min-w-[1000px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">Student ID</th>
                  <th className="px-4 py-2.5 font-semibold">Student</th>
                  <th className="px-4 py-2.5 font-semibold">University</th>
                  <th className="px-4 py-2.5 font-semibold">Course</th>
                  <th className="px-4 py-2.5 font-semibold">Enrolled</th>
                  <th className="px-4 py-2.5 font-semibold">Consultant</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s) => (
                  <tr
                    key={s.rowId}
                    className="group border-b border-border last:border-0 transition hover:bg-muted/40"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to="/students/students/$id"
                        params={{ id: s.rowId }}
                        className="font-mono text-xs font-semibold text-primary hover:underline"
                      >
                        {s.displayId}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={s.name} src={s.profilePicture} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-foreground">{s.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{s.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{s.university}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{s.course}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{s.enrollmentDate}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground">
                          {s.coordinator === EMPTY ? "—" : initials(s.coordinator)}
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
                        {callsOn && s.phone ? (
                          <button
                            onClick={() => start(s.phone || null)}
                            disabled={callingPhone === s.phone}
                            title={`Call ${s.phone}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-background hover:text-emerald-600 disabled:opacity-60"
                          >
                            {callingPhone === s.phone ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <PhoneCall className="h-4 w-4" />
                            )}
                          </button>
                        ) : null}
                        <Link
                          to="/students/students/$id"
                          params={{ id: s.rowId }}
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

function Avatar({ name, src }: { name: string; src: string | null }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setBroken(true)}
        className="h-9 w-9 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
      {initials(name)}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  loading,
  active,
  onClick,
  accent,
  dot,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  loading?: boolean;
  active?: boolean;
  onClick?: () => void;
  accent?: string;
  dot?: string;
}) {
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
        {loading ? (
          <div className="h-6 w-10 animate-pulse rounded bg-muted" />
        ) : (
          <div className="text-xl font-bold tracking-tight text-foreground">
            {value.toLocaleString()}
          </div>
        )}
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
