import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
  Eye,
  UserPlus,
  Award,
  Loader2,
  MinusCircle,
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
import { formatPhone } from "@/components/counsellors/phone";
import {
  EditCounsellorDialog,
  TransferTeamDialog,
  type ConsultantRaw,
} from "@/components/counsellors/counsellor-dialogs";

export const Route = createFileRoute("/counsellors/profile/$empId")({
  head: ({ params }) => ({
    meta: [{ title: `${params.empId} — Counsellor Profile` }],
  }),
  component: CounsellorProfilePage,
});

/* ----------------------------------------------------------------------------
 * Live API wiring.
 *
 * The route param is the counsellor's users.id. Everything on the page comes
 * from ONE request, GET /consultants/:id/performance, which computes every
 * count over the counsellor's COMPLETE set server-side (QA C07). The page used
 * to download the 100 newest applications/students/targets SYSTEM-WIDE and
 * count the ones belonging to this counsellor in the browser, so with 844
 * applications and 1,500+ students every KPI was wrong.
 *
 * Target semantics (consultant_target.type): 2 = admission COUNT, 1 = POINTS
 * (SUM of specialisations.point). There is no revenue target type, so nothing
 * here is labelled or formatted as rupees.
 * -------------------------------------------------------------------------- */

const EMPTY = "—";
const NO_TARGET = "No target";

function asText(value: string | number | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : EMPTY;
}

/**
 * Recover the numeric consultant users.id from the route param.
 *
 * The list now passes a bare `users.id`. The `UC-<id>` form is still accepted so
 * URLs bookmarked before that change keep working.
 *
 * Do NOT start routing on a hand-entered employee_code ("UC-1024"): its digits
 * are not a users.id, so this would silently open a different person — the exact
 * bug that made every counsellor resolve to UC-91.
 */
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

interface PerfStudentRow {
  id: number;
  student_id: number | null;
  enrollment_id: string | null;
  enrollment_date: string | null;
  admission_status_label: string | null;
  course_title: string | null;
  university_title: string | null;
  user?: { name?: string | null } | null;
}

interface PerfApplicationRow {
  application_id: number;
  custom_application_id: string | null;
  applicant_name: string | null;
  course_title: string | null;
  university_title: string | null;
  status_label: string | null;
  enrollment_date: string | null;
  created_at: string | null;
}

interface PerfTargetRow {
  consultant_target_id: number;
  type: number | null;
  value: number | null;
  achieved: number | null;
  from_date: string | null;
  to_date: string | null;
  /** The target window contains today (computed server-side). */
  is_active: boolean;
  /** When the target row was created — i.e. when it was assigned. */
  created_at?: string | null;
}

/** GET /consultants/:id/performance — the raw users row plus server-side aggregates. */
interface ConsultantPerformance extends ConsultantRaw {
  region: string | null;
  team_leader_name: string | null;
  group_name: string | null;
  manager_name: string | null;
  reports_to_name: string | null;
  students: PerfStudentRow[];
  total_students: number;
  total_fee_revenue: number;
  student_counts: Record<string, number>;
  total_applications: number;
  application_counts: { total: number; open: number; converted: number; closed: number };
  applications: PerfApplicationRow[];
  applications_truncated: boolean;
  targets: PerfTargetRow[];
}

/* ---------------- Page ---------------- */

function CounsellorProfilePage() {
  const { empId } = Route.useParams();
  const consultantId = empIdToConsultantId(empId);
  const [editOpen, setEditOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const {
    data: consultant,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["consultant", "performance", consultantId],
    queryFn: () => apiGet<ConsultantPerformance>(`/consultants/${consultantId}/performance`),
    enabled: consultantId != null,
  });

  const d = useMemo(() => (consultant ? deriveProfile(consultant) : null), [consultant]);

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

  if (isError || !consultant || !d) {
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
  // Same rule as the list: the hand-entered employee code, else UC-<users.id>.
  // Never the route param, which is a bare users.id.
  const displayId = consultant.employee_code?.trim() || `UC-${consultant.id}`;
  const phone = formatPhone(consultant.phone, consultant.code, EMPTY);
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
              <span className="font-mono font-semibold text-primary">{displayId}</span>
              <span className="inline-flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" /> {d.designation}
              </span>
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" /> {asText(consultant.email)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" /> {phone}
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
            <button
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
            >
              <Pencil className="h-4 w-4" /> Edit Profile
            </button>
            <button
              onClick={() => setTransferOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
            >
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
              <InfoRow label="Employee ID" value={displayId} mono />
              <InfoRow label="Full Name" value={name} />
              <InfoRow label="Designation" value={d.designation} />
              <InfoRow label="Email" value={asText(consultant.email)} />
              <InfoRow label="Phone" value={phone} />
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
              <InfoRow label="Reports To" value={d.reportsTo} />
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
            <KpiTile icon={AlertTriangle} label="Open Applications" value={d.openApplications} accent="bg-amber-500/10 text-amber-600" />
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

        {/* TARGETS — only targets whose window contains today are "active". */}
        <TabsContent value="targets" className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile icon={Target} label="Admission Target" value={d.admission.targetLabel} hint={d.admission.period} accent="bg-primary/10 text-primary" />
            <KpiTile icon={CheckCircle2} label="Admissions Achieved" value={d.admission.achievedLabel} accent="bg-emerald-500/10 text-emerald-600" />
            <KpiTile icon={Award} label="Points Target" value={d.points.targetLabel} hint={d.points.period} accent="bg-indigo-500/10 text-indigo-600" />
            <KpiTile icon={TrendingUp} label="Points Achieved" value={d.points.achievedLabel} accent="bg-emerald-500/10 text-emerald-600" />
            <KpiTile icon={Award} label="Achievement %" value={d.headline.pctLabel} accent="bg-amber-500/10 text-amber-600" />
            <KpiTile icon={AlertTriangle} label="Pending Target" value={d.headline.pendingLabel} accent="bg-rose-500/10 text-rose-600" />
            <div className="rounded-xl border border-border bg-surface p-4 shadow-card sm:col-span-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Target Status</div>
              <div className="mt-2">
                <TargetStatusBadge status={d.targetStatus} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SectionCard title="Admission Target" icon={Target}>
              {d.admission.target > 0 ? (
                <ProgressRow
                  label={`${d.admission.achieved} / ${d.admission.target} admissions`}
                  pct={d.admission.pct ?? 0}
                />
              ) : (
                <ChartEmpty label="No active admission target." />
              )}
            </SectionCard>
            <SectionCard title="Points Target" icon={Award}>
              {d.points.target > 0 ? (
                <ProgressRow
                  label={`${d.points.achieved} / ${d.points.target} points`}
                  pct={d.points.pct ?? 0}
                />
              ) : (
                <ChartEmpty label="No active points target." />
              )}
            </SectionCard>
          </div>
        </TabsContent>

        {/* APPLICATIONS */}
        <TabsContent value="applications">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
              {pluralize(d.totalApplications, "application")} handled
              {d.applicationsTruncated ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  · showing the latest {d.applications.length}
                </span>
              ) : null}
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
                      <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.applications.map((a) => (
                      <tr key={a.applicationId} className="border-b border-border last:border-0 hover:bg-muted/40">
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
                        <td className="px-4 py-3 text-right">
                          {/* Routed by the numeric application_id, the same param
                              the Applications list links with — never by the
                              display id ("APP-12" / a custom id). */}
                          <Link
                            to="/students/applications/$appId"
                            params={{ appId: String(a.applicationId) }}
                            title="View Application"
                            aria-label={`View application ${a.id}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
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
              {pluralize(d.totalStudents, "converted student")}
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

      <EditCounsellorDialog open={editOpen} onOpenChange={setEditOpen} consultant={consultant} />
      <TransferTeamDialog open={transferOpen} onOpenChange={setTransferOpen} consultant={consultant} />
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

type TargetStatus = "Achieved" | "On Track" | "Needs Attention" | "Critical" | "No Target Set";

function pluralize(count: number, singular: string): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : `${singular}s`}`;
}

function formatPeriod(from: string | null, to: string | null): string | undefined {
  if (!from && !to) return undefined;
  return `${formatDate(from)} – ${formatDate(to)}`;
}

/** One active target of a type, reduced to what the tiles render. */
function summariseTarget(target: PerfTargetRow | undefined) {
  const value = target ? Number(target.value ?? 0) : 0;
  const achieved = target ? Number(target.achieved ?? 0) : 0;
  const hasTarget = value > 0;
  const pct = hasTarget ? Math.round((achieved / value) * 100) : null;
  return {
    target: value,
    achieved,
    pct,
    pending: hasTarget ? Math.max(0, value - achieved) : null,
    targetLabel: hasTarget ? value.toLocaleString() : NO_TARGET,
    achievedLabel: target ? achieved.toLocaleString() : EMPTY,
    period: target ? formatPeriod(target.from_date, target.to_date) : undefined,
  };
}

function statusFor(pct: number | null): TargetStatus {
  if (pct == null) return "No Target Set";
  if (pct >= 100) return "Achieved";
  if (pct >= 75) return "On Track";
  if (pct >= 50) return "Needs Attention";
  return "Critical";
}

function deriveProfile(c: ConsultantPerformance) {
  const counts = c.student_counts ?? {};
  const count = (label: string) => counts[label] ?? 0;

  // No Reg. Fee column: nothing on the application row records a registration
  // fee, so it rendered "—" for every row. Restore it when a source exists.
  const applicationsView = (c.applications ?? []).map((a) => ({
    applicationId: a.application_id,
    id: asText(a.custom_application_id ?? `APP-${a.application_id}`),
    studentName: asText(a.applicant_name),
    university: asText(a.university_title),
    course: asText(a.course_title),
    intake: formatDate(a.enrollment_date),
    status: asText(a.status_label),
  }));

  const studentsView = (c.students ?? []).map((s) => ({
    id:
      s.enrollment_id != null && String(s.enrollment_id).trim() !== ""
        ? String(s.enrollment_id)
        : `STU-${s.student_id ?? s.id}`,
    name: asText(s.user?.name),
    university: asText(s.university_title),
    course: asText(s.course_title),
    intake: formatDate(s.enrollment_date),
    enrollment: asText(s.admission_status_label),
  }));

  // Only a target whose window contains today counts. An expired or future
  // target is not a verdict on current performance.
  const activeOf = (type: number) =>
    (c.targets ?? []).find((t) => Number(t.type) === type && t.is_active);
  const admissionTarget = activeOf(2);
  const pointsTarget = activeOf(1);
  const admission = summariseTarget(admissionTarget);
  const points = summariseTarget(pointsTarget);

  // The headline follows the admission target, else the points target. With
  // neither, the page says so instead of a 0% / "Needs Attention" verdict.
  const lead = admission.pct != null ? admission : points;
  const headline = {
    pctLabel: lead.pct != null ? `${lead.pct}%` : NO_TARGET,
    pendingLabel: lead.pending != null ? lead.pending.toLocaleString() : EMPTY,
  };

  const timeline: TimelineEntry[] = [];
  if (c.doj) {
    timeline.push({
      icon: UserPlus,
      title: "Counsellor Joined",
      date: formatDateTime(c.doj),
      desc: `${asText(c.name)} onboarded${c.region ? ` in ${c.region}` : ""}.`,
      tone: "bg-primary/10 text-primary",
    });
  }
  // Dated by created_at (when it was assigned). Legacy rows without one fall
  // back to the window start, titled as such rather than as an assignment.
  if (admissionTarget?.created_at || admissionTarget?.from_date) {
    timeline.push({
      icon: Target,
      title: admissionTarget.created_at ? "Target Assigned" : "Target Period Started",
      date: formatDateTime(admissionTarget.created_at ?? admissionTarget.from_date),
      desc: `Admission target set to ${admission.target}.`,
      tone: "bg-amber-500/10 text-amber-600",
    });
  }
  const latestApp = c.applications?.[0];
  if (latestApp) {
    timeline.push({
      icon: FileText,
      title: "Latest Application",
      date: formatDateTime(latestApp.created_at ?? latestApp.enrollment_date),
      desc: `${asText(latestApp.custom_application_id ?? `APP-${latestApp.application_id}`)} — ${asText(latestApp.applicant_name)} for ${asText(latestApp.course_title)}.`,
      tone: "bg-sky-500/10 text-sky-600",
    });
  }
  const latestStudent = c.students?.[0];
  if (latestStudent) {
    timeline.push({
      icon: GraduationCap,
      title: "Latest Enrollment",
      date: formatDateTime(latestStudent.enrollment_date),
      desc: `${asText(latestStudent.user?.name)} enrolled in ${asText(latestStudent.course_title)}.`,
      tone: "bg-violet-500/10 text-violet-600",
    });
  }

  return {
    // Group -> Team -> Counsellor, resolved server-side (migration 001).
    team: asText(c.team_name),
    teamLeader: asText(c.team_leader_name),
    reportsTo: asText(c.reports_to_name),
    manager: asText(c.manager_name),
    group: asText(c.group_name),
    designation: EMPTY,
    branch: asText(c.region),
    // Targets.
    admission,
    points,
    headline,
    targetStatus: statusFor(lead.pct),
    // Performance KPIs — complete counts from the server.
    totalApplications: c.total_applications ?? 0,
    openApplications: c.application_counts?.open ?? 0,
    totalStudents: c.total_students ?? 0,
    enrollmentPending: count("Pending") + count("In Progress"),
    courseCompleted: count("Passed Out"),
    dropout: count("Dropout"),
    cancelled: count("Cancelled"),
    // No per-month series in the API -> honest empty.
    trend: [] as { month: string; admissions: number; target: number }[],
    // Tables.
    applications: applicationsView,
    applicationsTruncated: c.applications_truncated ?? false,
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
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
  accent: string;
  /** Small secondary line, e.g. the target window. */
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", accent)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tracking-tight text-foreground">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
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

function TargetStatusBadge({ status }: { status: TargetStatus }) {
  const map: Record<TargetStatus, string> = {
    // Neutral on purpose: no target is the absence of a measure, not a verdict.
    "No Target Set": "bg-muted text-muted-foreground ring-border",
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
      {status === "No Target Set" && <MinusCircle className="h-3.5 w-3.5" />}
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

function enrollmentStyle(s: string) {
  const v = s.toLowerCase();
  if (v.includes("enrol")) return "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20";
  if (v.includes("pending") || v.includes("progress")) return "bg-amber-500/10 text-amber-700 ring-amber-500/20";
  if (v.includes("drop") || v.includes("cancel")) return "bg-rose-500/10 text-rose-700 ring-rose-500/20";
  return "bg-muted text-foreground ring-border";
}
