import { createFileRoute, Link, notFound } from "@tanstack/react-router";
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
  getCounsellorByEmpId,
  STATUS_DOT,
  STATUS_STYLES,
  type Counsellor,
} from "@/lib/counsellors-data";

export const Route = createFileRoute("/counsellors/profile/$empId")({
  head: ({ params }) => ({
    meta: [{ title: `${params.empId} — Counsellor Profile` }],
  }),
  loader: ({ params }) => {
    const counsellor = getCounsellorByEmpId(params.empId);
    if (!counsellor) throw notFound();
    return { counsellor };
  },
  notFoundComponent: () => (
    <div className="rounded-2xl border border-border bg-surface p-10 text-center">
      <h2 className="text-lg font-semibold text-foreground">Counsellor not found</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The counsellor you are looking for does not exist.
      </p>
      <Link
        to="/counsellors/counsellors"
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Counsellors
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
  component: CounsellorProfilePage,
});

/* ---------------- Derived mock data (deterministic per empId) ---------------- */

function seed(empId: string) {
  let h = 0;
  for (let i = 0; i < empId.length; i++) h = (h * 31 + empId.charCodeAt(i)) >>> 0;
  return h;
}

function buildProfileData(c: Counsellor) {
  const s = seed(c.empId);
  const r = (n: number, mod: number) => ((s >> n) % mod);

  const monthlyAdmissionTarget = c.activeTarget;
  const admissionsAchieved = c.achieved;
  const revenuePerAdmission = 35000 + r(2, 5) * 5000;
  const monthlyRevenueTarget = monthlyAdmissionTarget * revenuePerAdmission;
  const revenueAchieved = admissionsAchieved * revenuePerAdmission;
  const pct = Math.round((admissionsAchieved / monthlyAdmissionTarget) * 100);

  const totalApplications = monthlyAdmissionTarget + 12 + r(3, 10);
  const pendingApplications = 3 + r(4, 8);
  const totalStudents = admissionsAchieved;
  const enrollmentPending = 2 + r(5, 5);
  const courseCompleted = Math.max(0, admissionsAchieved - 5 - r(6, 6));
  const dropout = r(7, 4);
  const cancelled = r(8, 3);

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const trend = months.map((m, i) => {
    const base = 5 + ((s >> (i % 30)) % 18);
    const target = 15 + ((s >> ((i + 7) % 30)) % 10);
    return { month: m, admissions: base, target };
  });

  const targetStatus: "Achieved" | "On Track" | "Needs Attention" | "Critical" =
    pct >= 100 ? "Achieved" : pct >= 75 ? "On Track" : pct >= 50 ? "Needs Attention" : "Critical";

  const branches = ["Mumbai HQ", "Delhi", "Bengaluru", "Pune", "Hyderabad"];
  const branch = branches[r(9, branches.length)];

  // Applications
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
  const studentFirst = ["Aarav", "Riya", "Kabir", "Ananya", "Ishaan", "Diya", "Vivaan", "Saanvi", "Rohan", "Myra", "Arjun", "Pari"];
  const studentLast = ["Sharma", "Verma", "Patel", "Reddy", "Iyer", "Nair", "Singh", "Khan"];

  const applications = Array.from({ length: 12 }).map((_, i) => {
    const u = universities[(r(10 + i, universities.length))];
    return {
      id: `APP-${(20000 + (s % 999) * 7 + i).toString().slice(-6)}`,
      studentName: `${studentFirst[(i + r(11, 12)) % studentFirst.length]} ${studentLast[(i + r(12, 8)) % studentLast.length]}`,
      university: u.name,
      course: u.course,
      intake: intakes[(i + r(13, 4)) % intakes.length],
      status: appStatuses[(i + r(14, 5)) % appStatuses.length],
      feeStatus: feeStatuses[(i + r(15, 3)) % feeStatuses.length],
    };
  });

  // Converted students = those with status Confirmed or fee Paid
  const students = applications
    .filter((a, i) => i < admissionsAchieved)
    .slice(0, 10)
    .map((a, i) => ({
      id: `STD-${(30000 + (s % 999) + i).toString().slice(-6)}`,
      name: a.studentName,
      university: a.university,
      course: a.course,
      intake: a.intake,
      enrollment:
        i % 5 === 0 ? "Pending" : i % 7 === 0 ? "Dropped" : "Enrolled",
    }));

  // Timeline
  const baseDate = new Date(c.joiningDate);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

  const timeline = [
    {
      icon: UserPlus,
      title: "Counsellor Created",
      date: fmt(baseDate),
      desc: `${c.name} onboarded as ${c.designation}.`,
      tone: "bg-primary/10 text-primary",
    },
    {
      icon: Users,
      title: "Team Assigned",
      date: fmt(new Date(baseDate.getTime() + 86400000)),
      desc: `Assigned to Team ${c.team} under TL ${c.teamLeader}.`,
      tone: "bg-indigo-500/10 text-indigo-600",
    },
    {
      icon: Target,
      title: "Target Assigned",
      date: fmt(new Date(baseDate.getTime() + 7 * 86400000)),
      desc: `Monthly target set to ${monthlyAdmissionTarget} admissions.`,
      tone: "bg-amber-500/10 text-amber-600",
    },
    {
      icon: FileText,
      title: "Application Created",
      date: fmt(new Date(Date.now() - 10 * 86400000)),
      desc: `${applications[0]?.id} — ${applications[0]?.studentName} for ${applications[0]?.course}.`,
      tone: "bg-sky-500/10 text-sky-600",
    },
    {
      icon: Wallet,
      title: "Registration Fee Collected",
      date: fmt(new Date(Date.now() - 7 * 86400000)),
      desc: `₹15,000 received for ${applications[1]?.studentName}.`,
      tone: "bg-emerald-500/10 text-emerald-600",
    },
    {
      icon: GraduationCap,
      title: "Enrollment Completed",
      date: fmt(new Date(Date.now() - 3 * 86400000)),
      desc: `${students[0]?.name ?? "Student"} enrolled in ${students[0]?.course ?? "course"}.`,
      tone: "bg-violet-500/10 text-violet-600",
    },
    {
      icon: Activity,
      title: "Status Changed",
      date: fmt(new Date(Date.now() - 86400000)),
      desc: `Status updated to ${c.status}.`,
      tone: "bg-rose-500/10 text-rose-600",
    },
  ];

  return {
    monthlyAdmissionTarget,
    monthlyRevenueTarget,
    admissionsAchieved,
    revenueAchieved,
    pct,
    pendingTarget: Math.max(0, monthlyAdmissionTarget - admissionsAchieved),
    targetStatus,
    totalApplications,
    pendingApplications,
    totalStudents,
    enrollmentPending,
    courseCompleted,
    dropout,
    cancelled,
    trend,
    branch,
    applications,
    students,
    timeline,
  };
}

/* ---------------- Page ---------------- */

function CounsellorProfilePage() {
  const { counsellor } = Route.useLoaderData() as { counsellor: Counsellor };
  const d = buildProfileData(counsellor);
  const initials = counsellor.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div>
        <Link
          to="/counsellors/counsellors"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Counsellors
        </Link>
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
                {counsellor.name}
              </h1>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
                  STATUS_STYLES[counsellor.status],
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[counsellor.status])} />
                {counsellor.status}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono font-semibold text-primary">{counsellor.empId}</span>
              <span className="inline-flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" /> {counsellor.designation}
              </span>
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" /> {counsellor.email}
              </span>
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" /> {counsellor.phone}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <HeaderStat icon={Users} label="Team" value={counsellor.team} />
              <HeaderStat icon={UserCheck} label="Team Leader" value={counsellor.teamLeader} />
              <HeaderStat icon={Building2} label="Group" value={counsellor.group} />
              <HeaderStat icon={Briefcase} label="Manager" value={counsellor.manager} />
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
              <InfoRow label="Employee ID" value={counsellor.empId} mono />
              <InfoRow label="Full Name" value={counsellor.name} />
              <InfoRow label="Designation" value={counsellor.designation} />
              <InfoRow label="Email" value={counsellor.email} />
              <InfoRow label="Phone" value={counsellor.phone} />
              <InfoRow
                label="Joining Date"
                value={new Date(counsellor.joiningDate).toLocaleDateString("en-IN", {
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
                      STATUS_STYLES[counsellor.status],
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[counsellor.status])} />
                    {counsellor.status}
                  </span>
                }
              />
            </SectionCard>

            <SectionCard title="Reporting Details" icon={Building2}>
              <InfoRow label="Assigned Team" value={counsellor.team} />
              <InfoRow label="Team Leader" value={counsellor.teamLeader} />
              <InfoRow label="Group" value={counsellor.group} />
              <InfoRow label="Group Manager" value={counsellor.manager} />
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
            </SectionCard>

            <SectionCard title="Monthly Target Point Trend" icon={Target}>
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
            </SectionCard>
          </div>
        </TabsContent>

        {/* TARGETS */}
        <TabsContent value="targets" className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile icon={Target} label="Monthly Admission Target" value={d.monthlyAdmissionTarget} accent="bg-primary/10 text-primary" />
            <KpiTile icon={Wallet} label="Monthly Revenue Target" value={`₹${(d.monthlyRevenueTarget / 100000).toFixed(1)}L`} accent="bg-indigo-500/10 text-indigo-600" />
            <KpiTile icon={CheckCircle2} label="Admissions Achieved" value={d.admissionsAchieved} accent="bg-emerald-500/10 text-emerald-600" />
            <KpiTile icon={TrendingUp} label="Revenue Achieved" value={`₹${(d.revenueAchieved / 100000).toFixed(1)}L`} accent="bg-emerald-500/10 text-emerald-600" />
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
              <ProgressRow
                label={`${d.admissionsAchieved} / ${d.monthlyAdmissionTarget} admissions`}
                pct={d.pct}
              />
            </SectionCard>
            <SectionCard title="Revenue Target" icon={Wallet}>
              <ProgressRow
                label={`₹${(d.revenueAchieved / 100000).toFixed(1)}L / ₹${(d.monthlyRevenueTarget / 100000).toFixed(1)}L`}
                pct={Math.round((d.revenueAchieved / d.monthlyRevenueTarget) * 100)}
              />
            </SectionCard>
          </div>
        </TabsContent>

        {/* APPLICATIONS */}
        <TabsContent value="applications">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
              {d.applications.length} applications handled
            </div>
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
          </div>
        </TabsContent>

        {/* STUDENTS */}
        <TabsContent value="students">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
              {d.students.length} converted students
            </div>
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
          </div>
        </TabsContent>

        {/* ACTIVITY */}
        <TabsContent value="activity">
          <SectionCard title="Activity Timeline" icon={Activity}>
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
  switch (s) {
    case "Confirmed":
      return "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20";
    case "Offer Issued":
      return "bg-sky-500/10 text-sky-700 ring-sky-500/20";
    case "Under Review":
      return "bg-amber-500/10 text-amber-700 ring-amber-500/20";
    case "Rejected":
      return "bg-rose-500/10 text-rose-700 ring-rose-500/20";
    default:
      return "bg-muted text-foreground ring-border";
  }
}

function feeStatusStyle(s: string) {
  switch (s) {
    case "Paid":
      return "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20";
    case "Partial":
      return "bg-amber-500/10 text-amber-700 ring-amber-500/20";
    default:
      return "bg-rose-500/10 text-rose-700 ring-rose-500/20";
  }
}

function enrollmentStyle(s: string) {
  switch (s) {
    case "Enrolled":
      return "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20";
    case "Pending":
      return "bg-amber-500/10 text-amber-700 ring-amber-500/20";
    default:
      return "bg-rose-500/10 text-rose-700 ring-rose-500/20";
  }
}
