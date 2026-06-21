import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, ApiError } from "@/lib/api";
import {
  ArrowLeft,
  Pencil,
  ArrowRightLeft,
  Mail,
  Phone,
  CalendarDays,
  Users,
  UserCheck,
  Building2,
  Briefcase,
  Target,
  TrendingUp,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Activity,
  FileText,
  GraduationCap,
  Wallet,
  Eye,
  UserPlus,
  Award,
  Loader2,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  STATUS_DOT,
  STATUS_STYLES,
  type CounsellorStatus,
} from "@/lib/counsellors-data";

export const Route = createFileRoute("/counsellors/profile/$empId")({
  head: ({ params }) => ({
    meta: [{ title: `${params.empId} — Counsellor Profile` }],
  }),
  component: CounsellorProfilePage,
});

/* ----------------------------------------------------------------------------
 * Live API wiring (replaces the previous deterministic mock-seed data).
 *
 * The route param `empId` is the list page's display id: `UC-{code}` or
 * `UC-{id}`. The numeric portion is the consultant's users.id used by
 * GET /consultants/:id (ParseIntPipe). Tabs hydrate from the real list
 * endpoints filtered to this consultant:
 *   - Applications -> GET /applications (filter items by consultant_id)
 *   - Students     -> GET /students     (filter items by consultant_id)
 *   - Targets      -> GET /consultant-targets (filter by consultant_id)
 * Fields with no API source (team / team leader / manager / designation /
 * monthly trend) render "—" or honest-empty — never fabricated.
 * -------------------------------------------------------------------------- */

const EMPTY = "—";
const STUDENT_PAGE_LIMIT = 100;

function asText(value: string | number | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : EMPTY;
}

/** Strip the `UC-` display prefix to recover the numeric consultant users.id. */
function empIdToConsultantId(empId: string): number | null {
  const digits = String(empId).replace(/[^0-9]/g, "");
  if (digits === "") return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function toCounsellorStatus(status: number | string | null | undefined): CounsellorStatus {
  return Number(status) === 1 ? "Active" : "Inactive";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return EMPTY;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return EMPTY;
  return (
    d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })
  );
}

/* ---------------- API shapes ---------------- */

interface ConsultantStudentRow {
  id: number | string;
  student_id: number | string | null;
  enrollment_id: string | null;
  course_id: number | string | null;
  enrollment_date: string | null;
  admission_status: number | string | null;
  user?: { name?: string | null } | null;
}

interface ConsultantDetail {
  id: number | string;
  name: string | null;
  code: number | string | null;
  email: string | null;
  phone: string | null;
  gender: string | null;
  region: string | null;
  doj: string | null;
  dob: string | null;
  status: number | string | null;
  country: string | null;
  students: ConsultantStudentRow[];
  total_students: number;
}

interface ApiApplicationRow {
  application_id: number | string;
  custom_application_id: string | null;
  applicant_name: string | null;
  consultant_id: number | string | null;
  consultant_name: string | null;
  course_title: string | null;
  university_title: string | null;
  status_label: string | null;
  enrollment_date: string | null;
}

interface ApplicationsListResponse {
  items: ApiApplicationRow[];
  total: number;
  page: number;
  limit: number;
}

interface ApiStudentListRow {
  id: number | string;
  student_id: number | string | null;
  enrollment_id: string | null;
  consultant_id: number | string | null;
  course_title: string | null;
  university_title: string | null;
  session_title: string | null;
  enrollment_date: string | null;
  admission_status_label: string | null;
  name: string | null;
}

interface StudentsListResponse {
  items: ApiStudentListRow[];
  total: number;
  page: number;
  limit: number;
}

interface ApiTargetRow {
  consultant_target_id: number | string;
  consultant_id: number | string | null;
  consultant_name: string | null;
  type: number | string | null;
  value: number | string | null;
  achieved: number | string | null;
  performance: string | null;
  from_date: string | null;
  to_date: string | null;
}

interface TargetsListResponse {
  items: ApiTargetRow[];
  total: number;
  page: number;
  limit: number;
}

/* ---------------- Page ---------------- */

function CounsellorProfilePage() {
  const { empId } = Route.useParams();
  const consultantId = empIdToConsultantId(empId);

  const {
    data: consultant,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["consultant", "detail", consultantId],
    queryFn: () => apiGet<ConsultantDetail>(`/consultants/${consultantId}`),
    enabled: consultantId != null,
  });

  // Applications + targets are paged lists filtered client-side to this consultant.
  const { data: applicationsData } = useQuery({
    queryKey: ["applications", "for-consultant", consultantId],
    queryFn: () => apiGet<ApplicationsListResponse>("/applications", { limit: STUDENT_PAGE_LIMIT }),
    enabled: consultantId != null,
  });

  const { data: studentsData } = useQuery({
    queryKey: ["students", "for-consultant", consultantId],
    queryFn: () => apiGet<StudentsListResponse>("/students", { limit: STUDENT_PAGE_LIMIT }),
    enabled: consultantId != null,
  });

  const { data: targetsData } = useQuery({
    queryKey: ["consultant-targets", "for-consultant", consultantId],
    queryFn: () => apiGet<TargetsListResponse>("/consultant-targets", { limit: STUDENT_PAGE_LIMIT }),
    enabled: consultantId != null,
  });

  const applications = useMemo(
    () =>
      (applicationsData?.items ?? []).filter(
        (a) => consultantId != null && Number(a.consultant_id) === consultantId,
      ),
    [applicationsData, consultantId],
  );

  const students = useMemo(
    () =>
      (studentsData?.items ?? []).filter(
        (s) => consultantId != null && Number(s.consultant_id) === consultantId,
      ),
    [studentsData, consultantId],
  );

  const targets = useMemo(
    () =>
      (targetsData?.items ?? []).filter(
        (t) => consultantId != null && Number(t.consultant_id) === consultantId,
      ),
    [targetsData, consultantId],
  );

  // Derived performance metrics from the real, joined student rows of this consultant.
  const d = useMemo(() => deriveProfile(consultant, applications, students, targets), [
    consultant,
    applications,
    students,
    targets,
  ]);

  /* ---- Loading / error states (reuse the design's surface cards) ---- */

  if (consultantId == null) {
    return (
      <NoticeCard
        title="Counsellor not found"
        message="The counsellor you are looking for does not exist."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <BackLink />
        <div className="rounded-2xl border border-border bg-surface p-10 text-center shadow-card">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground/50" />
          <div className="mt-2 text-sm font-semibold text-foreground">Loading counsellor profile…</div>
        </div>
      </div>
    );
  }

  if (isError || !consultant) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <NoticeCard
        title={notFound ? "Counsellor not found" : "Something went wrong"}
        message={
          notFound
            ? "The counsellor you are looking for does not exist."
            : error instanceof Error
              ? error.message
              : "Please try again."
        }
        onRetry={notFound ? undefined : () => void refetch()}
      />
    );
  }

  const status = toCounsellorStatus(consultant.status);
  const name = asText(consultant.name);
  const initials =
    name === EMPTY
      ? "?"
      : name
          .split(" ")
          .map((w) => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div>
        <BackLink />
      </div>

      {/* Profile Header */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start gap-5">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-primary/10 text-2xl font-bold text-primary ring-4 ring-primary/5">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {name}
              </h1>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
                  STATUS_STYLES[status],
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
                {status}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono font-semibold text-primary">{empId}</span>
              <span className="inline-flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" /> {d.designation}
              </span>
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" /> {asText(consultant.email)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" /> {asText(consultant.phone)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <HeaderStat icon={Users} label="Team" value={d.team} />
              <HeaderStat icon={UserCheck} label="Team Leader" value={d.teamLeader} />
              <HeaderStat icon={Building2} label="Group" value={d.group} />
              <HeaderStat icon={Briefcase} label="Manager" value={d.manager} />
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted">
              <Pencil className="h-4 w-4" /> Edit Profile
            </button>
            <button className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
              <ArrowRightLeft className="h-4 w-4" /> Transfer Team
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-5">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-muted/60 p-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="targets">Targets</TabsTrigger>
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="activity">Activity Timeline</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SectionCard title="Basic Information" icon={UserCheck}>
              <InfoRow label="Employee ID" value={empId} mono />
              <InfoRow label="Full Name" value={name} />
              <InfoRow label="Designation" value={d.designation} />
              <InfoRow label="Email" value={asText(consultant.email)} />
              <InfoRow label="Phone" value={asText(consultant.phone)} />
              <InfoRow label="Joining Date" value={formatDate(consultant.doj)} />
              <InfoRow
                label="Status"
                value={
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                      STATUS_STYLES[status],
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
                    {status}
                  </span>
                }
              />
            </SectionCard>

            <SectionCard title="Reporting Details" icon={Building2}>
              <InfoRow label="Assigned Team" value={d.team} />
              <InfoRow label="Team Leader" value={d.teamLeader} />
              <InfoRow label="Group" value={d.group} />
              <InfoRow label="Group Manager" value={d.manager} />
              <InfoRow label="Branch" value={d.branch} />
            </SectionCard>
          </div>
        </TabsContent>

        {/* PERFORMANCE */}
        <TabsContent value="performance" className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            <KpiTile icon={FileText} label="Total Applications" value={d.totalApplications} accent="bg-primary/10 text-primary" />
            <KpiTile icon={AlertTriangle} label="Pending Applications" value={d.pendingApplications} accent="bg-amber-500/10 text-amber-600" />
            <KpiTile icon={Users} label="Total Students" value={d.totalStudents} accent="bg-indigo-500/10 text-indigo-600" />
            <KpiTile icon={GraduationCap} label="Enrollment Pending" value={d.enrollmentPending} accent="bg-sky-500/10 text-sky-600" />
            <KpiTile icon={CheckCircle2} label="Course Completed" value={d.courseCompleted} accent="bg-emerald-500/10 text-emerald-600" />
            <KpiTile icon={XCircle} label="Dropout" value={d.dropout} accent="bg-rose-500/10 text-rose-600" />
            <KpiTile icon={XCircle} label="Cancelled" value={d.cancelled} accent="bg-muted text-foreground" />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SectionCard title="Monthly Admission Trend" icon={TrendingUp}>
              {d.trend.length === 0 ? (
                <ChartEmpty label="No admission trend data available." />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.trend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="admissions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Monthly Target Point Trend" icon={Target}>
              {d.trend.length === 0 ? (
                <ChartEmpty label="No target trend data available." />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={d.trend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Line type="monotone" dataKey="target" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="admissions" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        {/* TARGETS */}
        <TabsContent value="targets" className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile icon={Target} label="Monthly Admission Target" value={d.monthlyAdmissionTarget} accent="bg-primary/10 text-primary" />
            <KpiTile icon={Wallet} label="Monthly Revenue Target" value={d.monthlyRevenueTargetLabel} accent="bg-indigo-500/10 text-indigo-600" />
            <KpiTile icon={CheckCircle2} label="Admissions Achieved" value={d.admissionsAchieved} accent="bg-emerald-500/10 text-emerald-600" />
            <KpiTile icon={TrendingUp} label="Revenue Achieved" value={d.revenueAchievedLabel} accent="bg-emerald-500/10 text-emerald-600" />
            <KpiTile icon={Award} label="Achievement %" value={`${d.pct}%`} accent="bg-amber-500/10 text-amber-600" />
            <KpiTile icon={AlertTriangle} label="Pending Target" value={d.pendingTarget} accent="bg-rose-500/10 text-rose-600" />
            <div className="rounded-xl border border-border bg-surface p-4 shadow-card sm:col-span-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Target Status</div>
              <div className="mt-2">
                <TargetStatusBadge status={d.targetStatus} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SectionCard title="Admission Target" icon={Target}>
              {d.monthlyAdmissionTarget > 0 ? (
                <ProgressRow
                  label={`${d.admissionsAchieved} / ${d.monthlyAdmissionTarget} admissions`}
                  pct={d.pct}
                />
              ) : (
                <ChartEmpty label="No admission target assigned." />
              )}
            </SectionCard>
            <SectionCard title="Revenue Target" icon={Wallet}>
              {d.monthlyRevenueTarget > 0 ? (
                <ProgressRow
                  label={`${d.revenueAchievedLabel} / ${d.monthlyRevenueTargetLabel}`}
                  pct={Math.round((d.revenueAchieved / d.monthlyRevenueTarget) * 100)}
                />
              ) : (
                <ChartEmpty label="No revenue target assigned." />
              )}
            </SectionCard>
          </div>
        </TabsContent>

        {/* APPLICATIONS */}
        <TabsContent value="applications">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
              {d.applications.length} applications handled
            </div>
            {d.applications.length === 0 ? (
              <TableEmpty icon={FileText} label="No applications handled by this counsellor." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] border-collapse text-sm">
                  <thead className="bg-muted/60">
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 font-semibold">Application ID</th>
                      <th className="px-4 py-2.5 font-semibold">Student Name</th>
                      <th className="px-4 py-2.5 font-semibold">University</th>
                      <th className="px-4 py-2.5 font-semibold">Course</th>
                      <th className="px-4 py-2.5 font-semibold">Intake</th>
                      <th className="px-4 py-2.5 font-semibold">Status</th>
                      <th className="px-4 py-2.5 font-semibold">Reg. Fee</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.applications.map((a) => (
                      <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{a.id}</td>
                        <td className="px-4 py-3 text-foreground">{a.studentName}</td>
                        <td className="px-4 py-3 text-muted-foreground">{a.university}</td>
                        <td className="px-4 py-3 text-foreground">{a.course}</td>
                        <td className="px-4 py-3 text-muted-foreground">{a.intake}</td>
                        <td className="px-4 py-3">
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", appStatusStyle(a.status))}>
                            {a.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", feeStatusStyle(a.feeStatus))}>
                            {a.feeStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button title="View Application" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                            <Eye className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* STUDENTS */}
        <TabsContent value="students">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
              {d.students.length} converted students
            </div>
            {d.students.length === 0 ? (
              <TableEmpty icon={Users} label="No converted students for this counsellor." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead className="bg-muted/60">
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 font-semibold">Student ID</th>
                      <th className="px-4 py-2.5 font-semibold">Name</th>
                      <th className="px-4 py-2.5 font-semibold">University</th>
                      <th className="px-4 py-2.5 font-semibold">Course</th>
                      <th className="px-4 py-2.5 font-semibold">Intake</th>
                      <th className="px-4 py-2.5 font-semibold">Enrollment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.students.map((s) => (
                      <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{s.id}</td>
                        <td className="px-4 py-3 text-foreground">{s.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{s.university}</td>
                        <td className="px-4 py-3 text-foreground">{s.course}</td>
                        <td className="px-4 py-3 text-muted-foreground">{s.intake}</td>
                        <td className="px-4 py-3">
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", enrollmentStyle(s.enrollment))}>
                            {s.enrollment}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ACTIVITY */}
        <TabsContent value="activity">
          <SectionCard title="Activity Timeline" icon={Activity}>
            {d.timeline.length === 0 ? (
              <ChartEmpty label="No activity recorded for this counsellor." />
            ) : (
              <ol className="relative space-y-5 border-l-2 border-border pl-6">
                {d.timeline.map((t, i) => (
                  <li key={i} className="relative">
                    <span
                      className={cn(
                        "absolute -left-[33px] grid h-7 w-7 place-items-center rounded-full ring-4 ring-surface",
                        t.tone,
                      )}
                    >
                      <t.icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="rounded-xl border border-border bg-background px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-foreground">{t.title}</div>
                        <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <CalendarDays className="h-3 w-3" /> {t.date}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{t.desc}</div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Derivation (real data -> render shape) ---------------- */

type TimelineEntry = {
  icon: typeof Users;
  title: string;
  date: string;
  desc: string;
  tone: string;
};

function deriveProfile(
  consultant: ConsultantDetail | undefined,
  applications: ApiApplicationRow[],
  studentRows: ApiStudentListRow[],
  targets: ApiTargetRow[],
) {
  // Applications mapped to the table shape (real joined fields, blank-safe).
  const applicationsView = applications.map((a) => ({
    id: asText(a.custom_application_id ?? a.application_id),
    studentName: asText(a.applicant_name),
    university: asText(a.university_title),
    course: asText(a.course_title),
    intake: formatDate(a.enrollment_date),
    status: asText(a.status_label),
    feeStatus: EMPTY,
  }));

  // Converted students mapped to the table shape.
  const studentsView = studentRows.map((s) => ({
    id:
      s.enrollment_id != null && String(s.enrollment_id).trim() !== ""
        ? String(s.enrollment_id)
        : `STU-${s.student_id ?? s.id}`,
    name: asText(s.name),
    university: asText(s.university_title),
    course: asText(s.course_title),
    intake: formatDate(s.enrollment_date),
    enrollment: asText(s.admission_status_label),
  }));

  // Status buckets from the real admission_status_label.
  const labelOf = (s: ApiStudentListRow) => (s.admission_status_label ?? "").toLowerCase();
  const totalStudents = studentRows.length;
  const enrollmentPending = studentRows.filter((s) => {
    const l = labelOf(s);
    return l.includes("pending") || l.includes("progress");
  }).length;
  const courseCompleted = studentRows.filter((s) => {
    const l = labelOf(s);
    return l.includes("passed") || l.includes("complete");
  }).length;
  const dropout = studentRows.filter((s) => labelOf(s).includes("dropout")).length;
  const cancelled = studentRows.filter((s) => labelOf(s).includes("cancel")).length;
  const admissionsAchieved = studentRows.filter((s) => labelOf(s).includes("enrolled")).length;

  const totalApplications = applications.length;
  const pendingApplications = applications.filter((a) => {
    const l = (a.status_label ?? "").toLowerCase();
    return l.includes("pending") || l.includes("review") || l.includes("submit");
  }).length;

  // Targets: type 2 = admission count target; type 1 = points-based revenue proxy.
  const countTarget = targets.find((t) => Number(t.type) === 2) ?? null;
  const pointsTarget = targets.find((t) => Number(t.type) === 1) ?? null;

  const monthlyAdmissionTarget = countTarget != null ? Number(countTarget.value ?? 0) : 0;
  const targetAchieved = countTarget != null ? Number(countTarget.achieved ?? 0) : admissionsAchieved;
  const pct =
    monthlyAdmissionTarget > 0
      ? Math.round((targetAchieved / monthlyAdmissionTarget) * 100)
      : 0;
  const pendingTarget = Math.max(0, monthlyAdmissionTarget - targetAchieved);

  const monthlyRevenueTarget = pointsTarget != null ? Number(pointsTarget.value ?? 0) : 0;
  const revenueAchieved = pointsTarget != null ? Number(pointsTarget.achieved ?? 0) : 0;

  const targetStatus: "Achieved" | "On Track" | "Needs Attention" | "Critical" =
    monthlyAdmissionTarget === 0
      ? "Needs Attention"
      : pct >= 100
        ? "Achieved"
        : pct >= 75
          ? "On Track"
          : pct >= 50
            ? "Needs Attention"
            : "Critical";

  // Activity timeline derived from real events we actually have.
  const timeline: TimelineEntry[] = [];
  if (consultant?.doj) {
    timeline.push({
      icon: UserPlus,
      title: "Counsellor Joined",
      date: formatDateTime(consultant.doj),
      desc: `${asText(consultant.name)} onboarded${consultant.region ? ` in ${consultant.region}` : ""}.`,
      tone: "bg-primary/10 text-primary",
    });
  }
  if (countTarget?.from_date) {
    timeline.push({
      icon: Target,
      title: "Target Assigned",
      date: formatDateTime(countTarget.from_date),
      desc: `Admission target set to ${monthlyAdmissionTarget}.`,
      tone: "bg-amber-500/10 text-amber-600",
    });
  }
  const firstApp = applications[0];
  if (firstApp) {
    timeline.push({
      icon: FileText,
      title: "Application Created",
      date: formatDateTime(firstApp.enrollment_date),
      desc: `${asText(firstApp.custom_application_id ?? firstApp.application_id)} — ${asText(firstApp.applicant_name)} for ${asText(firstApp.course_title)}.`,
      tone: "bg-sky-500/10 text-sky-600",
    });
  }
  const firstStudent = studentRows[0];
  if (firstStudent) {
    timeline.push({
      icon: GraduationCap,
      title: "Enrollment Recorded",
      date: formatDateTime(firstStudent.enrollment_date),
      desc: `${asText(firstStudent.name)} enrolled in ${asText(firstStudent.course_title)}.`,
      tone: "bg-violet-500/10 text-violet-600",
    });
  }

  const fmtL = (n: number) => (n > 0 ? `₹${(n / 100000).toFixed(1)}L` : EMPTY);

  return {
    // Org fields with no API source.
    team: EMPTY,
    teamLeader: EMPTY,
    manager: EMPTY,
    designation: EMPTY,
    group: asText(consultant?.region),
    branch: asText(consultant?.region),
    // Targets.
    monthlyAdmissionTarget,
    monthlyRevenueTarget,
    monthlyRevenueTargetLabel: fmtL(monthlyRevenueTarget),
    admissionsAchieved: targetAchieved,
    revenueAchieved,
    revenueAchievedLabel: fmtL(revenueAchieved),
    pct,
    pendingTarget,
    targetStatus,
    // Performance KPIs.
    totalApplications,
    pendingApplications,
    totalStudents,
    enrollmentPending,
    courseCompleted,
    dropout,
    cancelled,
    // No per-month series in the API -> honest empty.
    trend: [] as { month: string; admissions: number; target: number }[],
    // Tables.
    applications: applicationsView,
    students: studentsView,
    timeline,
  };
}

/* ---------------- Helpers ---------------- */

function BackLink() {
  return (
    <Link
      to="/counsellors/counsellors"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Back to Counsellors
    </Link>
  );
}

function NoticeCard({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-10 text-center">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          Retry
        </button>
      ) : (
        <Link
          to="/counsellors/counsellors"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Counsellors
        </Link>
      )}
    </div>
  );
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
      <AlertTriangle className="h-6 w-6 text-muted-foreground/40" />
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function TableEmpty({ icon: Icon, label }: { icon: typeof Users; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/50" />
      <div className="text-sm font-semibold text-foreground">{label}</div>
    </div>
  );
}

function HeaderStat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Users;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-1.5 last:border-0">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cn("text-sm text-foreground", mono && "font-mono font-semibold text-primary")}>{value}</div>
    </div>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", accent)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tracking-tight text-foreground">{value}</div>
    </div>
  );
}

function ProgressRow({ label, pct }: { label: string; pct: number }) {
  const safe = Math.min(100, Math.max(0, pct));
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="font-semibold text-foreground">{safe}%</span>
      </div>
      <Progress value={safe} className="h-2.5" />
    </div>
  );
}

function TargetStatusBadge({ status }: { status: "Achieved" | "On Track" | "Needs Attention" | "Critical" }) {
  const map: Record<string, string> = {
    Achieved: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
    "On Track": "bg-sky-500/10 text-sky-700 ring-sky-500/20",
    "Needs Attention": "bg-amber-500/10 text-amber-700 ring-amber-500/20",
    Critical: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset", map[status])}>
      {status === "Achieved" && <CheckCircle2 className="h-3.5 w-3.5" />}
      {status === "On Track" && <TrendingUp className="h-3.5 w-3.5" />}
      {status === "Needs Attention" && <AlertTriangle className="h-3.5 w-3.5" />}
      {status === "Critical" && <XCircle className="h-3.5 w-3.5" />}
      {status}
    </span>
  );
}

function appStatusStyle(s: string) {
  const v = s.toLowerCase();
  if (v.includes("confirm") || v.includes("enrol")) return "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20";
  if (v.includes("offer")) return "bg-sky-500/10 text-sky-700 ring-sky-500/20";
  if (v.includes("review") || v.includes("pending") || v.includes("submit")) return "bg-amber-500/10 text-amber-700 ring-amber-500/20";
  if (v.includes("reject") || v.includes("cancel")) return "bg-rose-500/10 text-rose-700 ring-rose-500/20";
  return "bg-muted text-foreground ring-border";
}

function feeStatusStyle(s: string) {
  switch (s) {
    case "Paid":
      return "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20";
    case "Partial":
      return "bg-amber-500/10 text-amber-700 ring-amber-500/20";
    case EMPTY:
      return "bg-muted text-foreground ring-border";
    default:
      return "bg-rose-500/10 text-rose-700 ring-rose-500/20";
  }
}

function enrollmentStyle(s: string) {
  const v = s.toLowerCase();
  if (v.includes("enrol")) return "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20";
  if (v.includes("pending") || v.includes("progress")) return "bg-amber-500/10 text-amber-700 ring-amber-500/20";
  if (v.includes("drop") || v.includes("cancel")) return "bg-rose-500/10 text-rose-700 ring-rose-500/20";
  return "bg-muted text-foreground ring-border";
}
