import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet, ApiError } from "@/lib/api";
import {
  ArrowLeft,
  Pencil,
  ArrowRightLeft,
  Mail,
  Phone,
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
  Award,
  RefreshCcw,
  Inbox,
  Globe,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/counsellors/profile/$empId")({
  head: ({ params }) => ({
    meta: [{ title: `${params.empId} — Counsellor Profile` }],
  }),
  component: CounsellorProfilePage,
});

/* ------------------------------------------------------------------ *
 * API shape — GET /api/consultants/:id (apiGet unwraps the envelope).
 *
 * The endpoint keys on the numeric `users` PK (role_id = 6) and returns the
 * sanitized consultant row (password stripped) plus a resolved `country`
 * string, the consultant's enrolled `students` (each students profile
 * decorated with its backing `user`), and `total_students`. The list screen
 * links this route with the real numeric user id, so we resolve the numeric
 * portion of the route param to the PK the API expects. Every visible value
 * below comes from this response — fields the users table has no column for
 * (designation/team/team-leader/group/manager, plus performance/targets/
 * applications/timeline) fall back to "—" / 0 / an empty state, never faked.
 * ------------------------------------------------------------------ */
interface ApiConsultantStudentUser {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  university_id: number | null;
}

interface ApiConsultantStudent {
  id: number;
  student_id: number;
  enrollment_id: string | null;
  application_id: string | null;
  enrollment_date: string | null;
  admission_status: number | null;
  course_id: number | null;
  specialisation_id: number | null;
  session_id: number | null;
  source: string | null;
  consultant_id: number;
  user: ApiConsultantStudentUser | null;
}

interface ApiConsultantDetail {
  id: number;
  name: string | null;
  code: number | string | null;
  phone: string | null;
  email: string | null;
  gender: string | null;
  region: string | null;
  dob: string | null;
  doj: string | null;
  highest_qualification: string | null;
  languages_spoken: string | null;
  country_id: number | null;
  status: number | string | null;
  created_at: string | null;
  // findOne extras
  country: string | null;
  students: ApiConsultantStudent[];
  total_students: number;
}

/* ---------------- status mapping (mirrors the list screen) ---------------- */

type CounsellorStatus = "Active" | "Inactive" | "On Leave";

// users.status is an Int (default 1). 1 = Active, 2 = On Leave, everything else
// (0 / null) = Inactive — keeping the three UI states intact.
function toCounsellorStatus(status: number | string | null | undefined): CounsellorStatus {
  const n = status == null ? null : Number(status);
  if (n === 1) return "Active";
  if (n === 2) return "On Leave";
  return "Inactive";
}

const STATUS_STYLES: Record<CounsellorStatus, string> = {
  Active: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  Inactive: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
  "On Leave": "bg-amber-500/10 text-amber-700 ring-amber-500/20",
};

const STATUS_DOT: Record<CounsellorStatus, string> = {
  Active: "bg-emerald-500",
  Inactive: "bg-rose-500",
  "On Leave": "bg-amber-500",
};

/* ---------------- formatting helpers ---------------- */

const EMPTY = "—";

function dash(value: string | number | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : EMPTY;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return EMPTY;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function initials(name: string | null | undefined): string {
  const source = name && name.trim() !== "" ? name : "";
  return (
    source
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

// The route param is the real numeric user id (the list links by users.id). Be
// defensive: extract the numeric portion in case a display id ever reaches here.
function numericIdFromParam(param: string): number | null {
  const digits = param.match(/\d+/g);
  if (!digits || digits.length === 0) return null;
  const n = Number(digits[digits.length - 1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/* ---------------- Page ---------------- */

function CounsellorProfilePage() {
  const { empId: rawParam } = Route.useParams();
  const numericId = numericIdFromParam(rawParam);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["consultant-detail", numericId],
    queryFn: () => apiGet<ApiConsultantDetail>(`/consultants/${numericId}`),
    enabled: numericId != null,
  });

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/counsellors/counsellors"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Counsellors
        </Link>
        {!isLoading && !isError && data && (
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
          >
            <RefreshCcw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Refresh
          </button>
        )}
      </div>

      {numericId == null ? (
        <NotFoundState param={rawParam} />
      ) : isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data ? (
        <NotFoundState param={rawParam} />
      ) : (
        <CounsellorProfileContent consultant={data} />
      )}
    </div>
  );
}

function CounsellorProfileContent({ consultant }: { consultant: ApiConsultantDetail }) {
  const status = toCounsellorStatus(consultant.status);
  const name = dash(consultant.name);

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start gap-5">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-primary/10 text-2xl font-bold text-primary ring-4 ring-primary/5">
            {initials(consultant.name)}
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
              <span className="font-mono font-semibold text-primary">#{consultant.id}</span>
              {/* Designation is role-derived and not exposed by this endpoint. */}
              <span className="inline-flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" /> Counsellor
              </span>
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" /> {dash(consultant.email)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" /> {dash(consultant.phone)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {/* Team / Team Leader / Group / Manager have no users-table source.
                  Region is the closest grouping the row carries; the rest are "—". */}
              <HeaderStat icon={Users} label="Team" value={EMPTY} />
              <HeaderStat icon={UserCheck} label="Team Leader" value={EMPTY} />
              <HeaderStat icon={Building2} label="Region" value={dash(consultant.region)} />
              <HeaderStat icon={Globe} label="Country" value={dash(consultant.country)} />
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
              <InfoRow label="Employee ID" value={`#${consultant.id}`} mono />
              <InfoRow label="Full Name" value={dash(consultant.name)} />
              <InfoRow label="Designation" value={EMPTY} />
              <InfoRow label="Email" value={dash(consultant.email)} />
              <InfoRow label="Phone" value={dash(consultant.phone)} />
              <InfoRow label="Joining Date" value={formatDate(consultant.doj ?? consultant.created_at)} />
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
              {/* Team / TL / Group / Manager are not modelled on the users row. */}
              <InfoRow label="Assigned Team" value={EMPTY} />
              <InfoRow label="Team Leader" value={EMPTY} />
              <InfoRow label="Group" value={EMPTY} />
              <InfoRow label="Group Manager" value={EMPTY} />
              <InfoRow label="Region" value={dash(consultant.region)} />
              <InfoRow label="Country" value={dash(consultant.country)} />
            </SectionCard>
          </div>
        </TabsContent>

        {/* PERFORMANCE — no performance metrics on this endpoint; show real
            student count and a "no data" state for the rest. */}
        <TabsContent value="performance" className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            <KpiTile icon={FileText} label="Total Applications" value={EMPTY} accent="bg-primary/10 text-primary" />
            <KpiTile icon={AlertTriangle} label="Pending Applications" value={EMPTY} accent="bg-amber-500/10 text-amber-600" />
            <KpiTile icon={Users} label="Total Students" value={consultant.total_students} accent="bg-indigo-500/10 text-indigo-600" />
            <KpiTile icon={GraduationCap} label="Enrollment Pending" value={EMPTY} accent="bg-sky-500/10 text-sky-600" />
            <KpiTile icon={CheckCircle2} label="Course Completed" value={EMPTY} accent="bg-emerald-500/10 text-emerald-600" />
            <KpiTile icon={XCircle} label="Dropout" value={EMPTY} accent="bg-rose-500/10 text-rose-600" />
            <KpiTile icon={XCircle} label="Cancelled" value={EMPTY} accent="bg-muted text-foreground" />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SectionCard title="Monthly Admission Trend" icon={TrendingUp}>
              <ChartEmptyState />
            </SectionCard>

            <SectionCard title="Monthly Target Point Trend" icon={Target}>
              <ChartEmptyState />
            </SectionCard>
          </div>
        </TabsContent>

        {/* TARGETS — not exposed by this endpoint; keep the layout, show "—". */}
        <TabsContent value="targets" className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile icon={Target} label="Monthly Admission Target" value={EMPTY} accent="bg-primary/10 text-primary" />
            <KpiTile icon={Wallet} label="Monthly Revenue Target" value={EMPTY} accent="bg-indigo-500/10 text-indigo-600" />
            <KpiTile icon={CheckCircle2} label="Admissions Achieved" value={EMPTY} accent="bg-emerald-500/10 text-emerald-600" />
            <KpiTile icon={TrendingUp} label="Revenue Achieved" value={EMPTY} accent="bg-emerald-500/10 text-emerald-600" />
            <KpiTile icon={Award} label="Achievement %" value={EMPTY} accent="bg-amber-500/10 text-amber-600" />
            <KpiTile icon={AlertTriangle} label="Pending Target" value={EMPTY} accent="bg-rose-500/10 text-rose-600" />
            <div className="rounded-xl border border-border bg-surface p-4 shadow-card sm:col-span-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Target Status</div>
              <div className="mt-2 text-sm text-muted-foreground">No data available</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SectionCard title="Admission Target" icon={Target}>
              <ProgressRow label="No target set" pct={0} />
            </SectionCard>
            <SectionCard title="Revenue Target" icon={Wallet}>
              <ProgressRow label="No target set" pct={0} />
            </SectionCard>
          </div>
        </TabsContent>

        {/* APPLICATIONS — not exposed by this endpoint. */}
        <TabsContent value="applications">
          <EmptyTab
            icon={FileText}
            title="No applications available"
            description="Applications handled by this counsellor are not exposed by this endpoint yet."
          />
        </TabsContent>

        {/* STUDENTS — the real enrolled students for this consultant. */}
        <TabsContent value="students">
          {consultant.students.length === 0 ? (
            <EmptyTab
              icon={Users}
              title="No students enrolled"
              description="This counsellor has no enrolled students on file yet."
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
              <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
                {consultant.total_students} enrolled student
                {consultant.total_students === 1 ? "" : "s"}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead className="bg-muted/60">
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 font-semibold">Student ID</th>
                      <th className="px-4 py-2.5 font-semibold">Name</th>
                      <th className="px-4 py-2.5 font-semibold">Email</th>
                      <th className="px-4 py-2.5 font-semibold">Phone</th>
                      <th className="px-4 py-2.5 font-semibold">Enrolled</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consultant.students.map((s) => {
                      const displayId = dash(s.enrollment_id ?? `STU-${s.student_id}`);
                      return (
                        <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">
                            {displayId}
                          </td>
                          <td className="px-4 py-3 text-foreground">{dash(s.user?.name)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{dash(s.user?.email)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{dash(s.user?.phone)}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDate(s.enrollment_date)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              to="/students/students/$id"
                              params={{ id: String(s.id) }}
                              title="View Student"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ACTIVITY — not exposed by this endpoint. */}
        <TabsContent value="activity">
          <SectionCard title="Activity Timeline" icon={Activity}>
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Activity className="h-6 w-6" />
              </div>
              <div className="text-sm font-semibold text-foreground">No timeline activity</div>
              <p className="max-w-sm text-xs text-muted-foreground">
                Activity events are not exposed by this endpoint yet.
              </p>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- state views ---------------- */

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <div className="flex items-start gap-5">
          <Skeleton className="h-20 w-20 rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-72" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <Skeleton className="mb-4 h-5 w-40" />
            <div className="space-y-3">
              {[0, 1, 2, 3, 4].map((j) => (
                <Skeleton key={j} className="h-4 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const notFound = error instanceof ApiError && error.status === 404;
  const message =
    error instanceof Error ? error.message : "Something went wrong while loading this counsellor.";
  return (
    <div className="rounded-2xl border border-border bg-surface p-10 text-center shadow-card">
      <AlertTriangle className="mx-auto h-10 w-10 text-red-500/60" />
      <h2 className="mt-3 text-lg font-semibold text-foreground">
        {notFound ? "Counsellor not found" : "Couldn’t load counsellor"}
      </h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      <div className="mt-4 flex items-center justify-center gap-2">
        {!notFound && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Retry
          </button>
        )}
        <Link
          to="/counsellors/counsellors"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Counsellors
        </Link>
      </div>
    </div>
  );
}

function NotFoundState({ param }: { param: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-10 text-center shadow-card">
      <Inbox className="mx-auto h-10 w-10 text-muted-foreground/50" />
      <h2 className="mt-3 text-lg font-semibold text-foreground">Counsellor not found</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        No counsellor id could be resolved from{" "}
        <span className="font-mono text-foreground">{param}</span>.
      </p>
      <Link
        to="/counsellors/counsellors"
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Counsellors
      </Link>
    </div>
  );
}

/* ---------------- Helpers ---------------- */

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

// Placeholder for the recharts panels — the endpoint exposes no trend series.
function ChartEmptyState() {
  return (
    <div className="flex h-64 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background text-center">
      <MapPin className="h-6 w-6 text-muted-foreground/40" />
      <div className="text-sm font-semibold text-foreground">No trend data available</div>
      <p className="max-w-xs text-xs text-muted-foreground">
        Monthly trends are not exposed by this endpoint yet.
      </p>
    </div>
  );
}

function EmptyTab({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof FileText;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
