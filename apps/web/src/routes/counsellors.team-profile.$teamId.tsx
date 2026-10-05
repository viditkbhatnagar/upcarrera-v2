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
  Eye,
  Award,
  ShieldCheck,
  Trophy,
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

const EMPTY = "—";

type TeamStatus = "Active" | "Inactive";

/**
 * A resolved team member. Deliberately narrow: these are exactly the fields
 * GET /sales-teams/:id returns per member (`members_details`). This page used
 * to type members as the mock `Counsellor`, which carries designation / group /
 * manager / target / achieved — none of which has a source for a team member,
 * so every one of them had to be faked to satisfy the type.
 */
interface TeamMember {
  id: number;
  empId: string;
  name: string;
  email: string;
  phone: string;
}

interface TeamRecord {
  id: string;
  name: string;
  shortName: string;
  leader: string;
  group: string;
  status: TeamStatus;
  createdDate: string;
  members: TeamMember[];
  memberCount: number;
}

// --- Live API wiring (GET /sales-teams/:id) ------------------------------
// The profile is opened from /counsellors/teams with a `TM-####` route param
// whose trailing digits are the real sales_team.id. We fetch the raw
// sales_team row (SalesService.findOneTeam, members already parsed) and map it
// into the TeamRecord shape the design renders. The source schema only carries
// id/name/leader/status/created_at and a JSON `members` array of user IDs — it
// has NO enriched member objects, group, target, applications, students or
// activity history. Those sections therefore render honestly empty (member
// count comes from members.length; leader/group fall back to "—") rather than
// fabricating data.
//
// The members ARE resolvable, though: SalesService.decorateTeams joins the
// member ids (and the leader id) against `users` in ONE query and returns
// `members_details` — one entry per member id, with null name/email/phone when
// the user is missing or soft-deleted. That is the roster source below, so the
// page no longer has to pull the whole consultants list to resolve names.
interface ApiMemberDetail {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
}

interface ApiTeam {
  id: number | string;
  name: string | null;
  leader: string | null;
  members: unknown[] | null;
  /** Added by SalesService.decorateTeams; absent on older API builds. */
  members_details?: ApiMemberDetail[] | null;
  leader_name?: string | null;
  university_id: string | null;
  course_id: string | null;
  status: number | string | null;
  created_at: string | null;
}

// sales_team.status is an Int? code; non-zero / truthy => Active (legacy parity).
function mapTeamStatus(status: number | string | null): TeamStatus {
  const code = typeof status === "string" ? Number(status) : status;
  return code && code !== 0 ? "Active" : "Inactive";
}

// Extract the numeric sales_team id from the `TM-####` route param.
function parseTeamId(teamId: string): number | null {
  const digits = teamId.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isNaN(n) ? null : n;
}

function asText(value: string | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : EMPTY;
}

/** sales_team.members holds users.id values — tolerate number OR string JSON. */
function parseMemberIds(members: unknown[] | null): number[] {
  if (!Array.isArray(members)) return [];
  return members.map((m) => Number(m)).filter((n) => Number.isFinite(n));
}

/**
 * Build the roster.
 *
 * Prefer `members_details` (resolved server-side). Fall back to the raw id
 * array so an older API build still renders one row per member rather than an
 * empty table under a non-zero count.
 *
 * Either way there is exactly one row per member id, so the header count and
 * the table can never disagree — which is what produced the old
 * "1 counsellors" / "Member details are not available" contradiction. An id
 * whose user no longer exists resolves to a row with blank details, not a
 * missing row.
 */
function buildMembers(t: ApiTeam): TeamMember[] {
  const details = Array.isArray(t.members_details)
    ? t.members_details
    : parseMemberIds(t.members).map((id) => ({
        id,
        name: null,
        email: null,
        phone: null,
      }));

  return details.map((m) => ({
    id: m.id,
    // users.id is the only unique key on the row (users.code is the phone dial
    // code) — matches counsellors.counsellors.tsx.
    empId: `UC-${m.id}`,
    name: m.name && m.name.trim() !== "" ? m.name : EMPTY,
    email: asText(m.email),
    phone: asText(m.phone),
  }));
}

// Map a raw sales_team row into the TeamRecord shape the existing JSX renders.
function mapApiTeam(t: ApiTeam, routeId: string): TeamRecord {
  const members = buildMembers(t);
  return {
    id: routeId.toUpperCase(),
    name: t.name?.trim() || `Team #${t.id}`,
    shortName: t.name?.trim() || `#${t.id}`,
    leader: t.leader?.trim() || EMPTY,
    group: EMPTY,
    status: mapTeamStatus(t.status),
    createdDate: t.created_at ?? "",
    members,
    memberCount: members.length,
  };
}

const TEAM_STATUS_STYLES: Record<TeamStatus, string> = {
  Active: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  Inactive: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
};
const TEAM_STATUS_DOT: Record<TeamStatus, string> = {
  Active: "bg-emerald-500",
  Inactive: "bg-rose-500",
};

export const Route = createFileRoute("/counsellors/team-profile/$teamId")({
  head: ({ params }) => ({
    meta: [{ title: `${params.teamId} — Team Profile` }],
  }),
  notFoundComponent: () => (
    <div className="rounded-2xl border border-border bg-surface p-10 text-center">
      <h2 className="text-lg font-semibold text-foreground">Team not found</h2>
      <Link
        to="/counsellors/teams"
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Teams
      </Link>
    </div>
  ),
  errorComponent: ({ error, reset }) => (
    <div className="rounded-2xl border border-border bg-surface p-10 text-center">
      <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
      <p className="mt-1 text-sm text-muted-foreground">{(error as Error).message}</p>
      <button
        onClick={reset}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
      >
        Retry
      </button>
    </div>
  ),
  component: TeamProfilePage,
});

/* ---------------- Derived data ---------------- */

// Everything below is derived strictly from the team's real members. The
// members themselves are now resolved (id -> consultant), but `users` carries
// no target/achieved columns and GET /sales-teams/:id has no application /
// student / activity history, so those aggregates resolve to 0 and the
// unbacked collections stay empty — the design then shows honest empty states
// instead of fabricated rows.
type ApplicationRow = {
  id: string;
  studentName: string;
  counsellor: string;
  university: string;
  course: string;
  intake: string;
  status: string;
  feeStatus: string;
  enrollment: string;
};
type StudentRow = {
  id: string;
  name: string;
  counsellor: string;
  university: string;
  course: string;
  intake: string;
  enrollment: string;
};
type TimelineRow = {
  icon: typeof Users;
  title: string;
  date: string;
  desc: string;
  tone: string;
};
type TrendRow = { month: string; admissions: number; revenue: number };
type ComparisonRow = { name: string; target: number; achieved: number };

function buildTeamData(team: TeamRecord) {
  // The roster is real, but neither `users` nor sales_team carries a target or
  // an achieved figure for a team member, so these stay 0 rather than being
  // summed out of fabricated per-member values.
  const totalTarget = 0;
  const totalAchieved = 0;
  const totalApplications = 0;
  const enrollmentsPending = 0;
  const enrollmentsCompleted = totalAchieved;
  const pendingRegFee = 0;
  const conversionRate = totalApplications
    ? Math.round((totalAchieved / totalApplications) * 100)
    : 0;
  const totalRevenue = 0;

  const trend: TrendRow[] = [];

  // Per-member performance has no source (see above), so the comparison chart
  // and the leaderboards stay empty and render their honest empty states.
  // Listing the real roster here with "0 / 0 — 0%" against each name would read
  // as a factual claim that every counsellor has achieved nothing.
  const comparison: ComparisonRow[] = [];
  const topPerformers: TeamMember[] = [];
  const lowPerformers: TeamMember[] = [];

  const applications: ApplicationRow[] = [];
  const students: StudentRow[] = [];
  const timeline: TimelineRow[] = [];

  return {
    totalTarget,
    totalAchieved,
    totalApplications,
    enrollmentsPending,
    enrollmentsCompleted,
    pendingRegFee,
    conversionRate,
    totalRevenue,
    trend,
    comparison,
    topPerformers,
    lowPerformers,
    applications,
    students,
    timeline,
  };
}

/* ---------------- Page ---------------- */

function TeamProfilePage() {
  const { teamId } = Route.useParams();
  const numericId = parseTeamId(teamId);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["sales-teams", "detail", numericId],
    queryFn: () => apiGet<ApiTeam>(`/sales-teams/${numericId}`),
    enabled: numericId !== null,
  });

  // Loading: show the design's spinner inside the page chrome.
  if (numericId !== null && isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-16 text-center shadow-card">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Loading team profile…</p>
      </div>
    );
  }

  // Not found (bad id / 404) — reuse the design's empty card + back link.
  if (numericId === null || (isError && error instanceof ApiError && error.status === 404)) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-10 text-center">
        <h2 className="text-lg font-semibold text-foreground">Team not found</h2>
        <Link
          to="/counsellors/teams"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Teams
        </Link>
      </div>
    );
  }

  // Other errors — design's error card with a retry.
  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-10 text-center">
        <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Unable to load this team."}
        </p>
        <button
          onClick={() => refetch()}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          Retry
        </button>
      </div>
    );
  }

  const team = mapApiTeam(data, teamId);
  const d = buildTeamData(team);

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/counsellors/teams"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Teams
        </Link>
      </div>

      {/* Header */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start gap-5">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary ring-4 ring-primary/5">
            <UsersRound className="h-9 w-9" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {team.name}
              </h1>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
                  TEAM_STATUS_STYLES[team.status],
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", TEAM_STATUS_DOT[team.status])} />
                {team.status}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono font-semibold text-primary">{team.id}</span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" /> Created{" "}
                {new Date(team.createdDate).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <HeaderStat icon={UserCheck} label="Team Leader" value={team.leader} />
              <HeaderStat icon={Building2} label="Parent Group" value={team.group} />
              <HeaderStat icon={Users} label="Total Counsellors" value={String(team.memberCount)} />
              <HeaderStat icon={Target} label="Monthly Target" value={String(d.totalTarget)} />
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
            <KpiTile icon={Users} label="Total Counsellors" value={team.memberCount} accent="bg-primary/10 text-primary" />
            <KpiTile icon={FileText} label="Total Applications" value={d.totalApplications} accent="bg-indigo-500/10 text-indigo-600" />
            <KpiTile icon={GraduationCap} label="Enrollments Pending" value={d.enrollmentsPending} accent="bg-amber-500/10 text-amber-600" />
            <KpiTile icon={TrendingUp} label="Conversion Rate" value={`${d.conversionRate}%`} accent="bg-emerald-500/10 text-emerald-600" />
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SectionCard title="Team Information" icon={ShieldCheck}>
              <InfoRow label="Team Name" value={team.name} />
              <InfoRow label="Team Code" value={team.id} mono />
              <InfoRow label="Team Leader" value={team.leader} />
              <InfoRow label="Parent Group" value={team.group} />
              <InfoRow
                label="Created Date"
                value={new Date(team.createdDate).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              />
              <InfoRow
                label="Status"
                value={
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                      TEAM_STATUS_STYLES[team.status],
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", TEAM_STATUS_DOT[team.status])} />
                    {team.status}
                  </span>
                }
              />
            </SectionCard>
            <SectionCard title="Performance Snapshot" icon={TrendingUp}>
              <InfoRow label="Monthly Target" value={d.totalTarget} />
              <InfoRow label="Admissions Achieved" value={d.totalAchieved} />
              <InfoRow label="Pending Reg. Fee" value={d.pendingRegFee} />
              <InfoRow label="Enrollments Completed" value={d.enrollmentsCompleted} />
              <InfoRow label="Revenue" value={`₹${(d.totalRevenue / 100000).toFixed(1)}L`} />
            </SectionCard>
          </div>
        </TabsContent>

        {/* MEMBERS */}
        <TabsContent value="members">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
              {team.memberCount} {team.memberCount === 1 ? "counsellor" : "counsellors"}
            </div>
            <div className="overflow-x-auto">
              {/* Columns are limited to what GET /sales-teams/:id actually
                  returns per member. Designation / Group / Manager / Target /
                  Achieved / Status were dropped: `users` has no designation or
                  manager column at all, and members_details carries no region,
                  status or target — so each of those could only have been
                  rendered by inventing a value. */}
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead className="bg-muted/60">
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold">Emp ID</th>
                    <th className="px-4 py-2.5 font-semibold">Counsellor</th>
                    <th className="px-4 py-2.5 font-semibold">Phone</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {/* members.length === memberCount by construction, so a
                      non-zero count can no longer sit above an empty table. */}
                  {team.members.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        No counsellors assigned to this team.
                      </td>
                    </tr>
                  )}
                  {team.members.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{c.empId}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-foreground">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.email}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{c.phone}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to="/counsellors/profile/$empId"
                          params={{ empId: c.empId }}
                          title="View Profile"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* PERFORMANCE */}
        <TabsContent value="performance" className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <KpiTile icon={FileText} label="Applications Created" value={d.totalApplications} accent="bg-primary/10 text-primary" />
            <KpiTile icon={Wallet} label="Pending Registration Fee" value={d.pendingRegFee} accent="bg-amber-500/10 text-amber-600" />
            <KpiTile icon={GraduationCap} label="Enrollments Completed" value={d.enrollmentsCompleted} accent="bg-emerald-500/10 text-emerald-600" />
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SectionCard title="Monthly Admissions Trend" icon={TrendingUp}>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.trend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                    <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="admissions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
            <SectionCard title="Monthly Revenue Trend (₹L)" icon={Wallet}>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={d.trend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                    <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Counsellor Comparison" icon={Users}>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.comparison}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="target" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="achieved" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SectionCard title="Top Performers" icon={Trophy}>
              <PerformerList items={d.topPerformers} tone="emerald" />
            </SectionCard>
            <SectionCard title="Lowest Performers" icon={AlertTriangle}>
              <PerformerList items={d.lowPerformers} tone="rose" />
            </SectionCard>
          </div>
        </TabsContent>

        {/* TARGETS */}
        <TabsContent value="targets" className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiTile icon={Target} label="Total Target" value={d.totalTarget} accent="bg-primary/10 text-primary" />
            <KpiTile icon={CheckCircle2} label="Achieved" value={d.totalAchieved} accent="bg-emerald-500/10 text-emerald-600" />
            <KpiTile icon={AlertTriangle} label="Pending" value={Math.max(0, d.totalTarget - d.totalAchieved)} accent="bg-amber-500/10 text-amber-600" />
            <KpiTile icon={Award} label="Achievement %" value={`${d.totalTarget ? Math.round((d.totalAchieved / d.totalTarget) * 100) : 0}%`} accent="bg-indigo-500/10 text-indigo-600" />
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">Per-counsellor targets</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-sm">
                <thead className="bg-muted/60">
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold">Counsellor</th>
                    <th className="px-4 py-2.5 font-semibold">Target</th>
                    <th className="px-4 py-2.5 font-semibold">Achieved</th>
                    <th className="px-4 py-2.5 font-semibold">Achievement %</th>
                  </tr>
                </thead>
                <tbody>
                  {/* No per-member target source exists (see buildTeamData),
                      so the real roster is NOT listed here against 0 / 0 / 0%. */}
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      {team.memberCount === 0
                        ? "No counsellors assigned to this team."
                        : "Per-counsellor targets are not available for this team yet."}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* APPLICATIONS */}
        <TabsContent value="applications">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
              {d.applications.length} applications
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] border-collapse text-sm">
                <thead className="bg-muted/60">
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold">Application ID</th>
                    <th className="px-4 py-2.5 font-semibold">Student</th>
                    <th className="px-4 py-2.5 font-semibold">Counsellor</th>
                    <th className="px-4 py-2.5 font-semibold">University</th>
                    <th className="px-4 py-2.5 font-semibold">Course</th>
                    <th className="px-4 py-2.5 font-semibold">Intake</th>
                    <th className="px-4 py-2.5 font-semibold">App Status</th>
                    <th className="px-4 py-2.5 font-semibold">Reg. Fee</th>
                    <th className="px-4 py-2.5 font-semibold">Enrollment</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {d.applications.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        No applications available for this team yet.
                      </td>
                    </tr>
                  )}
                  {d.applications.map((a) => (
                    <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{a.id}</td>
                      <td className="px-4 py-3 text-foreground">{a.studentName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.counsellor}</td>
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
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", enrollmentStyle(a.enrollment))}>
                          {a.enrollment}
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
          </div>
        </TabsContent>

        {/* STUDENTS */}
        <TabsContent value="students">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
              {d.students.length} students
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] border-collapse text-sm">
                <thead className="bg-muted/60">
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold">Student ID</th>
                    <th className="px-4 py-2.5 font-semibold">Name</th>
                    <th className="px-4 py-2.5 font-semibold">Counsellor</th>
                    <th className="px-4 py-2.5 font-semibold">University</th>
                    <th className="px-4 py-2.5 font-semibold">Course</th>
                    <th className="px-4 py-2.5 font-semibold">Intake</th>
                    <th className="px-4 py-2.5 font-semibold">Enrollment</th>
                  </tr>
                </thead>
                <tbody>
                  {d.students.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        No students available for this team yet.
                      </td>
                    </tr>
                  )}
                  {d.students.map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{s.id}</td>
                      <td className="px-4 py-3 text-foreground">{s.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.counsellor}</td>
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
          </div>
        </TabsContent>

        {/* ACTIVITY */}
        <TabsContent value="activity">
          <SectionCard title="Activity Timeline" icon={Activity}>
            {d.timeline.length === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-background px-4 py-10 text-center text-sm text-muted-foreground">
                No activity history available for this team yet.
              </div>
            )}
            <ol className="relative space-y-5 border-l-2 border-border pl-6">
              {d.timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span className={cn("absolute -left-[33px] grid h-7 w-7 place-items-center rounded-full ring-4 ring-surface", t.tone)}>
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
          </SectionCard>
        </TabsContent>
      </Tabs>
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

function PerformerList({ items, tone }: { items: TeamMember[]; tone: "emerald" | "rose" }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-background px-3 py-6 text-center text-xs text-muted-foreground">
        No performance data available yet.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((m) => (
        <li key={m.id} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{m.name}</div>
            <div className="text-[11px] text-muted-foreground">{m.empId} · {m.email}</div>
          </div>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
              tone === "emerald"
                ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20"
                : "bg-rose-500/10 text-rose-700 ring-rose-500/20",
            )}
          >
            {EMPTY}
          </span>
        </li>
      ))}
    </ul>
  );
}

function appStatusStyle(s: string) {
  switch (s) {
    case "Confirmed": return "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20";
    case "Offer Issued": return "bg-sky-500/10 text-sky-700 ring-sky-500/20";
    case "Under Review": return "bg-amber-500/10 text-amber-700 ring-amber-500/20";
    case "Rejected": return "bg-rose-500/10 text-rose-700 ring-rose-500/20";
    default: return "bg-muted text-foreground ring-border";
  }
}
function feeStatusStyle(s: string) {
  switch (s) {
    case "Paid": return "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20";
    case "Partial": return "bg-amber-500/10 text-amber-700 ring-amber-500/20";
    default: return "bg-rose-500/10 text-rose-700 ring-rose-500/20";
  }
}
function enrollmentStyle(s: string) {
  switch (s) {
    case "Enrolled": return "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20";
    case "Pending": return "bg-amber-500/10 text-amber-700 ring-amber-500/20";
    default: return "bg-rose-500/10 text-rose-700 ring-rose-500/20";
  }
}
