import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet, ApiError } from "@/lib/api";
import {
  ArrowLeft,
  Pencil,
  ArrowRightLeft,
  Users,
  UsersRound,
  UserCheck,
  Building2,
  CalendarDays,
  Target,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Activity,
  FileText,
  GraduationCap,
  Wallet,
  ShieldCheck,
  RefreshCcw,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/counsellors/team-profile/$teamId")({
  head: ({ params }) => ({
    meta: [{ title: `${params.teamId} — Team Profile` }],
  }),
  component: TeamProfilePage,
});

/* ------------------------------------------------------------------ *
 * API shape — GET /api/sales-teams/:id (apiGet unwraps the envelope).
 *
 * The endpoint keys on the numeric `sales_team` PK (ParseIntPipe) and returns
 * the raw row with `members` already parsed by the API into an array of member
 * user-ids. The legacy `sales_team` table is intentionally thin: it has NO
 * group, NO monthly-target column, NO per-member name/designation/target join,
 * and `leader` is a bare user-id string (no name join). So the header + team
 * info + member count come straight from this response, while sections that the
 * schema can't source (member detail rows, performance figures, applications,
 * students, activity, charts) fall back to graceful empty states rather than
 * fabricating data.
 *
 * The route param is the real team id, so we resolve the numeric portion to the
 * PK the API expects (mirrors students.students.$id.tsx).
 * ------------------------------------------------------------------ */
interface ApiTeam {
  id: number;
  name: string | null;
  leader: string | null;
  members: unknown[] | null;
  university_id: string | null;
  course_id: string | null;
  status: number | null;
  created_at: string | null;
  updated_at: string | null;
}

type TeamStatus = "Active" | "Inactive";

/* ---------------- formatting helpers ---------------- */

const EMPTY = "—";

function dash(value: string | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : EMPTY;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// sales_team.status (Int code) -> UI status label. Legacy convention: 1 = Active.
function toTeamStatus(status: number | null | undefined): TeamStatus {
  return status === 1 ? "Active" : "Inactive";
}

function memberCount(members: unknown[] | null | undefined): number {
  return Array.isArray(members) ? members.length : 0;
}

// The route param is the real team id; resolve the numeric portion for the PK.
function numericIdFromParam(param: string): number | null {
  const digits = param.match(/\d+/g);
  if (!digits || digits.length === 0) return null;
  const n = Number(digits[digits.length - 1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const TEAM_STATUS_STYLES: Record<TeamStatus, string> = {
  Active: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  Inactive: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
};
const TEAM_STATUS_DOT: Record<TeamStatus, string> = {
  Active: "bg-emerald-500",
  Inactive: "bg-rose-500",
};

/* ---------------- Page ---------------- */

function TeamProfilePage() {
  const { teamId: rawParam } = Route.useParams();
  const numericId = numericIdFromParam(rawParam);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["sales-team-detail", numericId],
    queryFn: () => apiGet<ApiTeam>(`/sales-teams/${numericId}`),
    enabled: numericId != null,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/counsellors/teams"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Teams
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
        <TeamProfileContent team={data} />
      )}
    </div>
  );
}

function TeamProfileContent({ team }: { team: ApiTeam }) {
  const status = toTeamStatus(team.status);
  const teamName = dash(team.name);
  const teamCode = `TM-${team.id}`;
  const leader = dash(team.leader);
  const totalCounsellors = memberCount(team.members);
  const createdDate = formatDate(team.created_at);

  return (
    <>
      {/* Header */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start gap-5">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary ring-4 ring-primary/5">
            <UsersRound className="h-9 w-9" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {teamName}
              </h1>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
                  TEAM_STATUS_STYLES[status],
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", TEAM_STATUS_DOT[status])} />
                {status}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono font-semibold text-primary">{teamCode}</span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" /> Created {createdDate}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <HeaderStat icon={UserCheck} label="Team Leader" value={leader} />
              <HeaderStat icon={Building2} label="Parent Group" value={EMPTY} />
              <HeaderStat icon={Users} label="Total Counsellors" value={String(totalCounsellors)} />
              <HeaderStat icon={Target} label="Monthly Target" value={EMPTY} />
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted">
              <Pencil className="h-4 w-4" /> Edit Team
            </button>
            <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted">
              <UsersRound className="h-4 w-4" /> Manage Members
            </button>
            <button className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
              <ArrowRightLeft className="h-4 w-4" /> Transfer Team
            </button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-5">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-muted/60 p-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="targets">Targets</TabsTrigger>
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="activity">Activity Timeline</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiTile icon={Users} label="Total Counsellors" value={totalCounsellors} accent="bg-primary/10 text-primary" />
            <KpiTile icon={FileText} label="Total Applications" value={EMPTY} accent="bg-indigo-500/10 text-indigo-600" />
            <KpiTile icon={GraduationCap} label="Enrollments Pending" value={EMPTY} accent="bg-amber-500/10 text-amber-600" />
            <KpiTile icon={TrendingUp} label="Conversion Rate" value={EMPTY} accent="bg-emerald-500/10 text-emerald-600" />
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SectionCard title="Team Information" icon={ShieldCheck}>
              <InfoRow label="Team Name" value={teamName} />
              <InfoRow label="Team Code" value={teamCode} mono />
              <InfoRow label="Team Leader" value={leader} />
              <InfoRow label="Parent Group" value={EMPTY} />
              <InfoRow
                label="University ID"
                value={team.university_id != null && String(team.university_id).trim() !== "" ? `#${team.university_id}` : EMPTY}
              />
              <InfoRow
                label="Course ID"
                value={team.course_id != null && String(team.course_id).trim() !== "" ? `#${team.course_id}` : EMPTY}
              />
              <InfoRow label="Created Date" value={createdDate} />
              <InfoRow
                label="Status"
                value={
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                      TEAM_STATUS_STYLES[status],
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", TEAM_STATUS_DOT[status])} />
                    {status}
                  </span>
                }
              />
            </SectionCard>
            <SectionCard title="Performance Snapshot" icon={TrendingUp}>
              <InfoRow label="Monthly Target" value={EMPTY} />
              <InfoRow label="Admissions Achieved" value={EMPTY} />
              <InfoRow label="Pending Reg. Fee" value={EMPTY} />
              <InfoRow label="Enrollments Completed" value={EMPTY} />
              <InfoRow label="Revenue" value={EMPTY} />
            </SectionCard>
          </div>
        </TabsContent>

        {/* MEMBERS */}
        <TabsContent value="members">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
              {totalCounsellors} {totalCounsellors === 1 ? "counsellor" : "counsellors"}
            </div>
            {totalCounsellors === 0 ? (
              <EmptyBlock
                icon={Users}
                title="No members assigned"
                description="This team has no counsellors assigned yet."
              />
            ) : (
              <EmptyBlock
                icon={Users}
                title="Member details unavailable"
                description={`This team has ${totalCounsellors} ${
                  totalCounsellors === 1 ? "member" : "members"
                }, but per-counsellor details (name, designation, target) are not exposed by this endpoint yet.`}
              />
            )}
          </div>
        </TabsContent>

        {/* PERFORMANCE */}
        <TabsContent value="performance" className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <KpiTile icon={FileText} label="Applications Created" value={EMPTY} accent="bg-primary/10 text-primary" />
            <KpiTile icon={Wallet} label="Pending Registration Fee" value={EMPTY} accent="bg-amber-500/10 text-amber-600" />
            <KpiTile icon={GraduationCap} label="Enrollments Completed" value={EMPTY} accent="bg-emerald-500/10 text-emerald-600" />
          </div>
          <EmptyBlock
            icon={TrendingUp}
            title="No performance data"
            description="Admissions, revenue trends, and counsellor comparison are not exposed by this endpoint yet."
          />
        </TabsContent>

        {/* TARGETS */}
        <TabsContent value="targets" className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiTile icon={Target} label="Total Target" value={EMPTY} accent="bg-primary/10 text-primary" />
            <KpiTile icon={CheckCircle2} label="Achieved" value={EMPTY} accent="bg-emerald-500/10 text-emerald-600" />
            <KpiTile icon={AlertTriangle} label="Pending" value={EMPTY} accent="bg-amber-500/10 text-amber-600" />
            <KpiTile icon={Target} label="Achievement %" value={EMPTY} accent="bg-indigo-500/10 text-indigo-600" />
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">Per-counsellor targets</div>
            <EmptyBlock
              icon={Target}
              title="No target data"
              description="Per-counsellor targets are not exposed by this endpoint yet."
            />
          </div>
        </TabsContent>

        {/* APPLICATIONS */}
        <TabsContent value="applications">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">0 applications</div>
            <EmptyBlock
              icon={FileText}
              title="No applications"
              description="Team applications are not exposed by this endpoint yet."
            />
          </div>
        </TabsContent>

        {/* STUDENTS */}
        <TabsContent value="students">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">0 students</div>
            <EmptyBlock
              icon={GraduationCap}
              title="No students"
              description="Team students are not exposed by this endpoint yet."
            />
          </div>
        </TabsContent>

        {/* ACTIVITY */}
        <TabsContent value="activity">
          <SectionCard title="Activity Timeline" icon={Activity}>
            <EmptyBlock
              icon={Activity}
              title="No timeline activity"
              description="Team activity events are not exposed by this endpoint yet."
            />
          </SectionCard>
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ---------------- state views ---------------- */

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start gap-5">
          <Skeleton className="h-20 w-20 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-64" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <Skeleton className="mb-4 h-5 w-40" />
            <div className="space-y-3">
              {[0, 1, 2, 3].map((j) => (
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
    error instanceof Error ? error.message : "Something went wrong while loading this team.";
  return (
    <div className="rounded-2xl border border-border bg-surface p-10 text-center shadow-card">
      <AlertTriangle className="mx-auto h-10 w-10 text-rose-500/60" />
      <h2 className="mt-3 text-lg font-semibold text-foreground">
        {notFound ? "Team not found" : "Couldn’t load team"}
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
          to="/counsellors/teams"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Teams
        </Link>
      </div>
    </div>
  );
}

function NotFoundState({ param }: { param: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-10 text-center shadow-card">
      <Inbox className="mx-auto h-10 w-10 text-muted-foreground/50" />
      <h2 className="mt-3 text-lg font-semibold text-foreground">Team not found</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        No numeric team id could be resolved from{" "}
        <span className="font-mono text-foreground">{param}</span>.
      </p>
      <Link
        to="/counsellors/teams"
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Teams
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

function SectionCard({ title, icon: Icon, children }: { title: string; icon: typeof Users; children: React.ReactNode }) {
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

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-1.5 last:border-0">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cn("text-sm text-foreground", mono && "font-mono font-semibold text-primary")}>{value}</div>
    </div>
  );
}

function KpiTile({ icon: Icon, label, value, accent }: { icon: typeof Users; label: string; value: number | string; accent: string }) {
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

function EmptyBlock({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Users;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
