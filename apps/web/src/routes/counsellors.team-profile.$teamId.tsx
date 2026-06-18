import { createFileRoute, Link, notFound } from "@tanstack/react-router";
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
  XCircle,
  AlertTriangle,
  Activity,
  FileText,
  GraduationCap,
  Wallet,
  Eye,
  UserPlus,
  UserMinus,
  Award,
  ShieldCheck,
  Trophy,
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
import {
  ALL_COUNSELLORS,
  TEAMS,
  GROUPS,
  TEAM_LEADERS,
  STATUS_DOT,
  STATUS_STYLES,
  type Counsellor,
} from "@/lib/counsellors-data";

type TeamStatus = "Active" | "Inactive";

interface TeamRecord {
  id: string;
  name: string;
  shortName: string;
  leader: string;
  group: string;
  status: TeamStatus;
  createdDate: string;
  members: Counsellor[];
}

function buildTeam(teamId: string): TeamRecord | undefined {
  const idx = TEAMS.findIndex(
    (_, i) => `TM-${String(2001 + i).padStart(4, "0")}` === teamId.toUpperCase(),
  );
  if (idx === -1) return undefined;
  const t = TEAMS[idx];
  const members = ALL_COUNSELLORS.filter((c) => c.team === t);
  return {
    id: `TM-${String(2001 + idx).padStart(4, "0")}`,
    name: `Team ${t}`,
    shortName: t,
    leader: TEAM_LEADERS[idx % TEAM_LEADERS.length],
    group: GROUPS[idx % GROUPS.length],
    status: idx === 4 ? "Inactive" : "Active",
    createdDate: `2023-0${(idx % 9) + 1}-15`,
    members,
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
  loader: ({ params }) => {
    const team = buildTeam(params.teamId);
    if (!team) throw notFound();
    return { team };
  },
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

function seed(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function buildTeamData(team: TeamRecord) {
  const s = seed(team.id);
  const r = (n: number, mod: number) => (s >>> n) % mod;

  const totalTarget = team.members.reduce((sum, m) => sum + m.activeTarget, 0);
  const totalAchieved = team.members.reduce((sum, m) => sum + m.achieved, 0);
  const totalApplications = totalTarget + 35 + r(2, 20);
  const enrollmentsPending = 6 + r(3, 12);
  const enrollmentsCompleted = totalAchieved;
  const pendingRegFee = 4 + r(4, 10);
  const conversionRate = totalApplications
    ? Math.round((totalAchieved / totalApplications) * 100)
    : 0;
  const revenuePerAdmission = 35000 + r(5, 5) * 5000;
  const totalRevenue = totalAchieved * revenuePerAdmission;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const trend = months.map((m, i) => {
    const admissions = 20 + ((s >>> (i % 30)) % 30);
    const revenue = admissions * revenuePerAdmission;
    return { month: m, admissions, revenue: Math.round(revenue / 100000) };
  });

  // Counsellor comparison
  const comparison = team.members.map((m) => ({
    name: m.name.split(" ")[0],
    target: m.activeTarget,
    achieved: m.achieved,
  }));

  const sortedPerf = [...team.members].sort((a, b) => b.achieved - a.achieved);
  const topPerformers = sortedPerf.slice(0, 3);
  const lowPerformers = sortedPerf.slice(-3).reverse();

  // Applications by team members
  const universities = [
    { name: "Amity University", course: "MBA" },
    { name: "Lovely Professional University", course: "B.Tech CSE" },
    { name: "Manipal University", course: "BCA" },
    { name: "Chandigarh University", course: "MCA" },
    { name: "Symbiosis", course: "BBA" },
    { name: "NMIMS", course: "MBA Finance" },
  ];
  const intakes = ["Jan 2026", "Apr 2026", "Jul 2026", "Sep 2026"];
  const appStatuses = ["Submitted", "Under Review", "Offer Issued", "Confirmed", "Rejected"];
  const feeStatuses = ["Paid", "Pending", "Partial"];
  const enrollStatuses = ["Enrolled", "Pending", "Dropped"];
  const studentFirst = ["Aarav", "Riya", "Kabir", "Ananya", "Ishaan", "Diya", "Vivaan", "Saanvi", "Rohan", "Myra", "Arjun", "Pari"];
  const studentLast = ["Sharma", "Verma", "Patel", "Reddy", "Iyer", "Nair", "Singh", "Khan"];

  const applications = Array.from({ length: 18 }).map((_, i) => {
    const u = universities[r(10 + i, universities.length)];
    const counsellor = team.members[i % Math.max(1, team.members.length)];
    return {
      id: `APP-${(20000 + (s % 999) * 7 + i).toString().slice(-6)}`,
      studentName: `${studentFirst[(i + r(11, 12)) % studentFirst.length]} ${studentLast[(i + r(12, 8)) % studentLast.length]}`,
      counsellor: counsellor?.name ?? "—",
      university: u.name,
      course: u.course,
      intake: intakes[(i + r(13, 4)) % intakes.length],
      status: appStatuses[(i + r(14, 5)) % appStatuses.length],
      feeStatus: feeStatuses[(i + r(15, 3)) % feeStatuses.length],
      enrollment: enrollStatuses[(i + r(16, 3)) % enrollStatuses.length],
    };
  });

  const students = applications.slice(0, 14).map((a, i) => ({
    id: `STD-${(30000 + (s % 999) + i).toString().slice(-6)}`,
    name: a.studentName,
    counsellor: a.counsellor,
    university: a.university,
    course: a.course,
    intake: a.intake,
    enrollment: a.enrollment,
  }));

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const base = new Date(team.createdDate);

  const timeline = [
    { icon: UsersRound, title: "Team Created", date: fmt(base), desc: `${team.name} created under ${team.group}.`, tone: "bg-primary/10 text-primary" },
    { icon: UserCheck, title: "Team Leader Assigned", date: fmt(new Date(base.getTime() + 86400000)), desc: `${team.leader} assigned as Team Leader.`, tone: "bg-indigo-500/10 text-indigo-600" },
    { icon: UserPlus, title: "Counsellor Added", date: fmt(new Date(base.getTime() + 7 * 86400000)), desc: `${team.members[0]?.name ?? "Counsellor"} added to the team.`, tone: "bg-emerald-500/10 text-emerald-600" },
    { icon: Target, title: "Target Updated", date: fmt(new Date(Date.now() - 30 * 86400000)), desc: `Monthly target revised to ${totalTarget} admissions.`, tone: "bg-amber-500/10 text-amber-600" },
    { icon: UserMinus, title: "Counsellor Removed", date: fmt(new Date(Date.now() - 20 * 86400000)), desc: `A counsellor was transferred out of the team.`, tone: "bg-rose-500/10 text-rose-600" },
    { icon: Award, title: "Performance Review Added", date: fmt(new Date(Date.now() - 10 * 86400000)), desc: `Quarterly performance review completed.`, tone: "bg-violet-500/10 text-violet-600" },
    { icon: Activity, title: "Team Status Changed", date: fmt(new Date(Date.now() - 2 * 86400000)), desc: `Status updated to ${team.status}.`, tone: "bg-sky-500/10 text-sky-600" },
  ];

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
  const { team } = Route.useLoaderData() as { team: TeamRecord };
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
              <HeaderStat icon={Users} label="Total Counsellors" value={String(team.members.length)} />
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
            <KpiTile icon={Users} label="Total Counsellors" value={team.members.length} accent="bg-primary/10 text-primary" />
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
              {team.members.length} counsellors
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse text-sm">
                <thead className="bg-muted/60">
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold">Emp ID</th>
                    <th className="px-4 py-2.5 font-semibold">Counsellor</th>
                    <th className="px-4 py-2.5 font-semibold">Designation</th>
                    <th className="px-4 py-2.5 font-semibold">Group</th>
                    <th className="px-4 py-2.5 font-semibold">Manager</th>
                    <th className="px-4 py-2.5 font-semibold">Target</th>
                    <th className="px-4 py-2.5 font-semibold">Achieved</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {team.members.map((c) => (
                    <tr key={c.empId} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{c.empId}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-foreground">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.email}</div>
                      </td>
                      <td className="px-4 py-3 text-foreground">{c.designation}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.group}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.manager}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{c.activeTarget}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{c.achieved}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
                            STATUS_STYLES[c.status],
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[c.status])} />
                          {c.status}
                        </span>
                      </td>
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
                  {team.members.map((m) => {
                    const pct = m.activeTarget ? Math.round((m.achieved / m.activeTarget) * 100) : 0;
                    return (
                      <tr key={m.empId} className="border-b border-border last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-3 text-foreground">{m.name}</td>
                        <td className="px-4 py-3 font-semibold text-foreground">{m.activeTarget}</td>
                        <td className="px-4 py-3 font-semibold text-foreground">{m.achieved}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  pct >= 100 ? "bg-emerald-500" : pct >= 75 ? "bg-sky-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500",
                                )}
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-foreground">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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

function PerformerList({ items, tone }: { items: Counsellor[]; tone: "emerald" | "rose" }) {
  return (
    <ul className="space-y-2">
      {items.map((m) => {
        const pct = m.activeTarget ? Math.round((m.achieved / m.activeTarget) * 100) : 0;
        return (
          <li key={m.empId} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{m.name}</div>
              <div className="text-[11px] text-muted-foreground">{m.empId} · {m.designation}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{m.achieved}/{m.activeTarget}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                  tone === "emerald"
                    ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20"
                    : "bg-rose-500/10 text-rose-700 ring-rose-500/20",
                )}
              >
                {pct}%
              </span>
            </div>
          </li>
        );
      })}
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
