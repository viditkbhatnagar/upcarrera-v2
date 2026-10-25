import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Download,
  Eye,
  FileClock,
  Search,
  Timer,
  UserCheck,
  UserX,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import { listApplications } from "@/lib/api/applications";
import { downloadCsv, toCsv, type CsvColumn } from "@/components/applications/export-csv";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAvatarUrl } from "@/hooks/use-avatar-url";
import { dayRange, type DateRange } from "@/lib/date-range";
import { KpiCard } from "@/components/counsellor/dashboard/kpi-card";
import { DateRangePicker } from "@/components/counsellor/shared/date-range-picker";
import { Paginated } from "@/components/counsellor/shared/paginated";
import { SortHead, useSort } from "@/components/counsellor/shared/sortable-head";

// GET /students is scoped server-side to the signed-in counsellor's own admissions.
interface ApiStudentRow {
  id: number | string;
  student_id: number | string | null;
  enrollment_id: string | null;
  application_id: string | null;
  admission_status_label: string | null;
  enrollment_date: string | null;
  created_at: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  profile_picture: string | null;
  course_title: string | null;
  university_title: string | null;
  specialisation_title: string | null;
  session_title: string | null;
}

interface StudentsResponse {
  items: ApiStudentRow[];
  total: number;
}

interface EnrollmentRow {
  id: string;
  displayId: string;
  name: string;
  email: string;
  phone: string;
  picture: string | null;
  university: string;
  course: string;
  specialisation: string;
  intake: string;
  /** ISO date of the originating application (joined from /applications), or "". */
  applied: string;
  /** ISO date. */
  enrolled: string;
  status: string;
}

type KpiTone = "primary" | "success" | "warning" | "info" | "destructive";

const FETCH_LIMIT = 2000;
const PAGE_SIZE = 8;
const EMPTY = "—";

// Real admission_status labels (StudentsService ADMISSION_STATUS_LABELS).
const STATUS_CARDS: readonly {
  status: string;
  label: string;
  sub: string;
  icon: typeof Users;
  tone: KpiTone;
}[] = [
  { status: "Pending", label: "Pending", sub: "Awaiting admission", icon: FileClock, tone: "warning" },
  { status: "In Progress", label: "In Progress", sub: "Admission in progress", icon: Timer, tone: "info" },
  { status: "Enrolled", label: "Enrolled Students", sub: "Currently enrolled", icon: UserCheck, tone: "primary" },
  { status: "Passed Out", label: "Passed Out", sub: "Graduated", icon: CheckCircle2, tone: "success" },
  { status: "Dropout", label: "Dropout Students", sub: "Discontinued", icon: UserX, tone: "destructive" },
  { status: "Cancelled", label: "Cancelled", sub: "Admission cancelled", icon: XCircle, tone: "warning" },
];

const text = (v: string | null | undefined) => (v != null && v.trim() !== "" ? v.trim() : EMPTY);
const isoDay = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : "");
const fmtDate = (iso: string) =>
  iso
    ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : EMPTY;
const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?";

function inRangeIso(iso: string, r: { from: Date; to: Date } | null): boolean {
  if (!r) return true;
  if (!iso) return false;
  const d = new Date(`${iso}T12:00:00`);
  return d >= r.from && d <= r.to;
}

const CSV_COLUMNS: CsvColumn<EnrollmentRow>[] = [
  { header: "Student ID", value: (r) => r.displayId },
  { header: "Student Name", value: (r) => r.name },
  { header: "Email", value: (r) => r.email },
  { header: "Phone", value: (r) => r.phone },
  { header: "University", value: (r) => r.university },
  { header: "Course", value: (r) => r.course },
  { header: "Specialisation", value: (r) => r.specialisation },
  { header: "Intake", value: (r) => r.intake },
  { header: "Application Date", value: (r) => r.applied },
  { header: "Enrolled On", value: (r) => r.enrolled },
  { header: "Status", value: (r) => r.status },
];

function RowAvatar({ row }: { row: EnrollmentRow }) {
  const url = useAvatarUrl(row.picture);
  return (
    <Avatar className="h-7 w-7">
      {url && <AvatarImage src={url} alt={row.name} className="object-cover" />}
      <AvatarFallback className="bg-primary-soft text-primary-soft-foreground text-[10px] font-semibold">
        {initialsOf(row.name)}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * My Enrollments (Naji's design). Wired to the real, counsellor-scoped data:
 *   GET /students                       -> rows + admission status (KPI filter cards)
 *   GET /applications?stage=converted   -> application date (joined by application id)
 * Filtering, sorting and paging are client-side over the scoped result, as in the design.
 */
export function CounsellorEnrollments() {
  const [search, setSearch] = useState("");
  const [university, setUniversity] = useState("all");
  const [course, setCourse] = useState("all");
  const [intake, setIntake] = useState("all");
  const [appDates, setAppDates] = useState<DateRange>({});
  const [enrolledDates, setEnrolledDates] = useState<DateRange>({});
  const [status, setStatus] = useState("all");

  const students = useQuery({
    queryKey: ["counsellor", "enrollments", "students"],
    queryFn: () => apiGet<StudentsResponse>("/students", { page: 1, limit: FETCH_LIMIT }),
    staleTime: 60_000,
  });
  const converted = useQuery({
    queryKey: ["counsellor", "enrollments", "converted-apps"],
    queryFn: () => listApplications({ page: 1, limit: FETCH_LIMIT, stage: "converted" }),
    staleTime: 60_000,
  });

  const rows = useMemo<EnrollmentRow[]>(() => {
    const appDate = new Map<string, string>();
    for (const a of converted.data?.items ?? []) {
      if (a.custom_application_id) appDate.set(a.custom_application_id, isoDay(a.created_at));
    }
    return (students.data?.items ?? []).map((s) => ({
      id: String(s.id),
      displayId: s.enrollment_id?.trim() || `STU-${s.student_id ?? s.id}`,
      name: text(s.name),
      email: text(s.email),
      phone: s.phone ?? "",
      picture: s.profile_picture?.trim() ? s.profile_picture : null,
      university: text(s.university_title),
      course: text(s.course_title),
      specialisation: text(s.specialisation_title),
      intake: text(s.session_title),
      applied: (s.application_id && appDate.get(s.application_id)) || "",
      enrolled: isoDay(s.enrollment_date ?? s.created_at),
      status: s.admission_status_label?.trim() || "Unknown",
    }));
  }, [students.data, converted.data]);

  const options = useMemo(() => {
    const uniq = (pick: (r: EnrollmentRow) => string) =>
      [...new Set(rows.map(pick).filter((v) => v !== EMPTY))].sort();
    return {
      universities: uniq((r) => r.university),
      courses: uniq((r) => r.course),
      intakes: uniq((r) => r.intake),
    };
  }, [rows]);

  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    const app = dayRange(appDates);
    const enr = dayRange(enrolledDates);
    return rows.filter((s) => {
      if (q && !`${s.name} ${s.displayId} ${s.email} ${s.phone}`.toLowerCase().includes(q)) return false;
      if (university !== "all" && s.university !== university) return false;
      if (course !== "all" && s.course !== course) return false;
      if (intake !== "all" && s.intake !== intake) return false;
      return inRangeIso(s.applied, app) && inRangeIso(s.enrolled, enr);
    });
  }, [rows, search, university, course, intake, appDates, enrolledDates]);

  const filtered = useMemo(
    () => (status === "all" ? base : base.filter((s) => s.status === status)),
    [base, status],
  );

  const hasFilters =
    Boolean(search.trim()) ||
    university !== "all" ||
    course !== "all" ||
    intake !== "all" ||
    Boolean(appDates.from || enrolledDates.from) ||
    status !== "all";

  const { sorted, sort } = useSort(filtered, {
    student: (s) => s.name,
    contact: (s) => s.email,
    university: (s) => s.university,
    course: (s) => s.course,
    intake: (s) => s.intake,
    applied: (s) => s.applied,
    enrolled: (s) => s.enrolled,
  });

  const total = base.length;
  const countBy = (st: string) => base.filter((s) => s.status === st).length;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  const pickStatus = (st: string) => setStatus((cur) => (cur === st ? "all" : st));
  const loading = students.isLoading;

  const clearAll = () => {
    setSearch("");
    setUniversity("all");
    setCourse("all");
    setIntake("all");
    setAppDates({});
    setEnrolledDates({});
    setStatus("all");
  };

  const exportCsv = () =>
    downloadCsv(`my-enrollments-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(sorted, CSV_COLUMNS));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Enrollments</h1>
          <p className="text-sm text-muted-foreground mt-1">Students successfully converted and onboarded by you</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={sorted.length === 0} onClick={exportCsv}>
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <KpiCard
          label="Total Enrollments"
          value={String(total)}
          icon={Users}
          tone="primary"
          progress={total ? 100 : 0}
          sub="All-time converted"
          loading={loading}
          onClick={() => setStatus("all")}
          active={status === "all"}
        />
        {STATUS_CARDS.map((c) => (
          <KpiCard
            key={c.status}
            label={c.label}
            value={String(countBy(c.status))}
            icon={c.icon}
            tone={c.tone}
            progress={pct(countBy(c.status))}
            sub={c.sub}
            loading={loading}
            onClick={() => pickStatus(c.status)}
            active={status === c.status}
          />
        ))}
      </div>

      <Card className="p-4 shadow-[var(--shadow-soft)] border-border/70">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[170px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, ID or email"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <FilterSelect value={university} onChange={setUniversity} all="All Universities" label="University" options={options.universities} width="md:w-[170px]" />
          <FilterSelect value={course} onChange={setCourse} all="All Courses" label="Course" options={options.courses} width="md:w-[170px]" />
          <FilterSelect value={intake} onChange={setIntake} all="All Intakes" label="Intake" options={options.intakes} width="md:w-[150px]" />
          <DateRangePicker label="Application Date" value={appDates} onChange={setAppDates} className="md:min-w-[190px]" />
          <DateRangePicker label="Enrolled" value={enrolledDates} onChange={setEnrolledDates} />
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={clearAll}
          >
            <X className="mr-1 h-3.5 w-3.5" /> Clear all filters
          </Button>
        )}
        {status !== "all" && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3 text-xs">
            <span className="text-muted-foreground">Showing</span>
            <Badge variant="outline" className="py-0">{status}</Badge>
            <button type="button" onClick={() => setStatus("all")} className="font-medium text-primary hover:underline">
              Clear filter
            </button>
          </div>
        )}
      </Card>

      <Card className="shadow-[var(--shadow-soft)] border-border/70 overflow-hidden">
        <div className="overflow-x-auto">
          <Paginated items={sorted} pageSize={PAGE_SIZE}>
            {(pageRows, offset) => (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-7 px-1">#</TableHead>
                    <SortHead k="student" s={sort} className="px-2">Student &amp; ID</SortHead>
                    <SortHead k="contact" s={sort} className="px-2">Email &amp; Phone</SortHead>
                    <SortHead k="university" s={sort} className="px-2">University</SortHead>
                    <SortHead k="course" s={sort} className="px-2">Course &amp; Specialisation</SortHead>
                    <SortHead k="intake" s={sort} className="px-2">Intake</SortHead>
                    <SortHead k="applied" s={sort} className="px-2">Application Date</SortHead>
                    <SortHead k="enrolled" s={sort} className="px-2">Enrolled</SortHead>
                    <TableHead className="text-right px-2">View</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.isError && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12 text-destructive">
                        Couldn't load your enrollments. Please refresh.
                      </TableCell>
                    </TableRow>
                  )}
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">Loading…</TableCell>
                    </TableRow>
                  )}
                  {!loading && !students.isError && filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                        No students match your filters.
                      </TableCell>
                    </TableRow>
                  )}
                  {pageRows.map((s, index) => (
                    <TableRow key={s.id} className="hover:bg-muted/30">
                      <TableCell className="px-1 text-sm text-muted-foreground">{offset + index + 1}</TableCell>
                      <TableCell className="px-2">
                        <Link to="/students/students/$id" params={{ id: s.id }} className="flex items-center gap-1.5">
                          <RowAvatar row={s} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-tight whitespace-nowrap">{s.name}</p>
                            <p className="text-[11px] font-mono text-muted-foreground">{s.displayId}</p>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="px-2">
                        <p className="text-sm leading-tight whitespace-nowrap">{s.email}</p>
                        <p className="text-[11px] text-muted-foreground whitespace-nowrap">{s.phone || EMPTY}</p>
                      </TableCell>
                      <TableCell className="px-2 text-sm text-muted-foreground">{s.university}</TableCell>
                      <TableCell className="px-2">
                        <p className="text-sm font-medium leading-tight whitespace-nowrap">{s.course}</p>
                        <p className="text-[11px] text-muted-foreground">{s.specialisation}</p>
                      </TableCell>
                      <TableCell className="px-2 text-xs text-muted-foreground whitespace-nowrap">{s.intake}</TableCell>
                      <TableCell className="px-2 text-[11px] text-muted-foreground whitespace-nowrap">{fmtDate(s.applied)}</TableCell>
                      <TableCell className="px-2 text-[11px] text-muted-foreground whitespace-nowrap">{fmtDate(s.enrolled)}</TableCell>
                      <TableCell className="text-right px-1">
                        <Button size="icon" variant="ghost" className={cn("h-7 w-7")} asChild>
                          <Link to="/students/students/$id" params={{ id: s.id }} aria-label={`View ${s.name}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paginated>
        </div>
      </Card>
    </>
  );
}

function FilterSelect({
  value,
  onChange,
  all,
  label,
  options,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  all: string;
  label: string;
  options: string[];
  width: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={cn("w-full shrink-0", width)}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{all}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>{o}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
