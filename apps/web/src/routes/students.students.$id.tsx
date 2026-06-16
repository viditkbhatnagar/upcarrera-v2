import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  BookOpen,
  Layers,
  User as UserIcon,
  Wallet,
  MessageCircle,
  HeadphonesIcon,
  FolderOpen,
  School,
  Activity,
  CalendarDays,
  GraduationCap,
  Plus,
  CreditCard,
  Receipt,
  ShieldCheck,
  CheckCircle2,
  FileText,
  Pencil,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  getStudentById,
  formatINR,
  STATUS_STYLES,
  STATUS_DOT,
  type Student,
  type Installment,
} from "@/lib/students-data";

export const Route = createFileRoute("/students/students/$id")({
  head: ({ params }) => ({
    meta: [{ title: `${params.id} — Student Profile` }],
  }),
  loader: ({ params }) => {
    const student = getStudentById(params.id);
    if (!student) throw notFound();
    return { student };
  },
  notFoundComponent: () => (
    <div className="rounded-2xl border border-border bg-surface p-10 text-center">
      <h2 className="text-lg font-semibold text-foreground">Student not found</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The student you are looking for does not exist.
      </p>
      <Link
        to="/students/students"
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Students
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
  component: StudentDetailPage,
});

function StudentDetailPage() {
  // TODO(api): No catalog endpoint supplies this screen's data. The route param is a
  // synthetic display id (STU-2026-NNNNNN), while GET /api/students/:id keys on the
  // numeric students PK and returns only the raw students row (course_id/consultant_id/
  // session_id FKs + JSON progress blobs) — no name/email/phone/university name/course
  // title/batch/total fee/paid/overdue/coordinator that every card and tab here renders.
  // Wiring it would 404 on the current id format and leave the UI undefined. Needs a
  // decorated student-detail endpoint (users join + university/course names + fee/
  // installments + coordinator) before this can be wired. Keeping mock data for now.
  const { student } = Route.useLoaderData() as { student: Student };

  return (
    <div className="space-y-5">
      {/* Breadcrumb / back */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/students/students" className="hover:text-foreground">Students</Link>
          <span>/</span>
          <span className="font-mono font-semibold text-foreground">{student.id}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/students/students"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover">
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-lg font-bold text-primary">
            {student.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">{student.name}</h1>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
                  STATUS_STYLES[student.status],
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[student.status])} />
                {student.status}
              </span>
            </div>
            <div className="mt-1 text-sm">
              <span className="font-mono text-xs font-semibold text-primary">{student.id}</span>
              <span className="mx-2 text-muted-foreground">·</span>
              <span className="text-muted-foreground">Enrolled {student.enrollmentDate}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill icon={Mail} label={student.email} />
              <Pill icon={Phone} label={student.phone} />
              <Pill icon={Building2} label={student.university} />
              <Pill icon={BookOpen} label={student.course} />
              <Pill icon={Layers} label={student.batch} />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
          <TabTrig value="overview" icon={UserIcon} label="Overview" />
          <TabTrig value="finance" icon={Wallet} label="Finance" />
          <TabTrig value="followups" icon={Phone} label="Follow-ups" />
          <TabTrig value="support" icon={HeadphonesIcon} label="Support" />
          <TabTrig value="documents" icon={FolderOpen} label="Documents" />
          <TabTrig value="university" icon={School} label="University" />
          <TabTrig value="comm" icon={MessageCircle} label="Communication" />
          <TabTrig value="timeline" icon={Activity} label="Timeline" />
        </TabsList>

        <TabsContent value="overview"><OverviewTab student={student} /></TabsContent>
        <TabsContent value="finance"><FinanceTab student={student} /></TabsContent>
        <TabsContent value="followups"><FollowUpsTab /></TabsContent>
        <TabsContent value="support"><SupportTab /></TabsContent>
        <TabsContent value="documents"><DocumentsTab /></TabsContent>
        <TabsContent value="university"><UniversityTab /></TabsContent>
        <TabsContent value="comm"><CommunicationTab /></TabsContent>
        <TabsContent value="timeline"><TimelineTab student={student} /></TabsContent>
      </Tabs>
    </div>
  );
}

function TabTrig({
  value,
  icon: Icon,
  label,
}: {
  value: string;
  icon: typeof UserIcon;
  label: string;
}) {
  return (
    <TabsTrigger value={value} className="gap-1.5 text-xs">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </TabsTrigger>
  );
}

function Pill({ icon: Icon, label }: { icon: typeof Mail; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      {label}
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon: typeof UserIcon;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-right text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function OverviewTab({ student }: { student: Student }) {
  const collection = Math.round((student.paid / student.totalFee) * 100);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SectionCard title="Student Information" icon={UserIcon}>
        <InfoRow label="Full Name" value={student.name} />
        <InfoRow label="Email" value={student.email} />
        <InfoRow label="Phone" value={student.phone} />
        <InfoRow label="Student ID" value={<span className="font-mono">{student.id}</span>} />
      </SectionCard>

      <SectionCard title="Admission Information" icon={GraduationCap}>
        <InfoRow label="Application ID" value={<span className="font-mono">APP-2026-000{student.id.slice(-3)}</span>} />
        <InfoRow label="Enrollment Date" value={student.enrollmentDate} />
        <InfoRow label="Source" value="Direct" />
        <InfoRow label="Counsellor" value={student.coordinator} />
      </SectionCard>

      <SectionCard title="University Information" icon={Building2}>
        <InfoRow label="University" value={student.university} />
        <InfoRow label="Course" value={student.course} />
        <InfoRow label="Batch" value={student.batch} />
        <InfoRow label="Specialisation" value="Marketing" />
      </SectionCard>

      <SectionCard title="Current Status" icon={Activity}>
        <InfoRow
          label="Status"
          value={
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                STATUS_STYLES[student.status],
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[student.status])} />
              {student.status}
            </span>
          }
        />
        <InfoRow label="Fee Collection" value={`${collection}%`} />
        <InfoRow label="Outstanding" value={formatINR(student.totalFee - student.paid)} />
        <InfoRow label="Support Tickets" value="2 Open" />
      </SectionCard>
    </div>
  );
}

function FinanceTab({ student }: { student: Student }) {
  const outstanding = student.totalFee - student.paid;
  const collection = Math.round((student.paid / student.totalFee) * 100);
  const installments: Installment[] = [
    { no: 1, due: "10 Jan 2026", amount: 25000, status: "Paid", paidOn: "08 Jan 2026" },
    { no: 2, due: "10 Apr 2026", amount: 25000, status: "Paid", paidOn: "10 Apr 2026" },
    { no: 3, due: "10 Jul 2026", amount: 25000, status: "Overdue" },
    { no: 4, due: "10 Oct 2026", amount: 25000, status: "Pending" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <FinStat label="Total Fee" value={formatINR(student.totalFee)} tone="text-foreground" />
        <FinStat label="Paid" value={formatINR(student.paid)} tone="text-emerald-600" />
        <FinStat label="Outstanding" value={formatINR(outstanding)} tone="text-orange-600" />
        <FinStat label="Overdue" value={formatINR(student.overdue)} tone="text-red-600" />
        <FinStat label="Collection" value={`${collection}%`} tone="text-primary" />
      </div>

      <SectionCard title="Installment Schedule" icon={CreditCard}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 font-semibold">#</th>
                <th className="py-2 font-semibold">Due Date</th>
                <th className="py-2 font-semibold">Amount</th>
                <th className="py-2 font-semibold">Status</th>
                <th className="py-2 font-semibold">Paid On</th>
              </tr>
            </thead>
            <tbody>
              {installments.map((i) => (
                <tr key={i.no} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5">#{i.no}</td>
                  <td className="py-2.5">{i.due}</td>
                  <td className="py-2.5 font-semibold">{formatINR(i.amount)}</td>
                  <td className="py-2.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                        i.status === "Paid"
                          ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
                          : i.status === "Overdue"
                          ? "bg-red-100 text-red-700 ring-red-200"
                          : "bg-orange-100 text-orange-700 ring-orange-200",
                      )}
                    >
                      {i.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-muted-foreground">{i.paidOn ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Payment History" icon={Receipt}>
        <div className="space-y-2">
          {[
            { date: "10 Apr 2026", amount: 25000, mode: "UPI", ref: "TXN20260410-9382" },
            { date: "08 Jan 2026", amount: 25000, mode: "Net Banking", ref: "TXN20260108-2210" },
            { date: "02 Jan 2026", amount: 5000, mode: "UPI", ref: "TXN20260102-0091" },
          ].map((p) => (
            <div
              key={p.ref}
              className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {formatINR(p.amount)} <span className="text-xs font-normal text-muted-foreground">via {p.mode}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{p.date} · Ref {p.ref}</div>
                </div>
              </div>
              <button className="text-xs font-semibold text-primary hover:underline">
                Receipt
              </button>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function FinStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-card">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-lg font-bold tracking-tight", tone)}>{value}</div>
    </div>
  );
}

function FollowUpsTab() {
  const items = [
    {
      date: "12 Jun 2026",
      exec: "Priya Sharma",
      summary: "Discussed fee installment plan; student requested 7-day extension.",
      next: "19 Jun 2026",
      status: "Open",
    },
    {
      date: "02 Jun 2026",
      exec: "Rahul Verma",
      summary: "Onboarding call completed. Course portal walkthrough done.",
      next: "—",
      status: "Closed",
    },
  ];
  return (
    <SectionCard
      title="Follow-up History"
      icon={Phone}
      action={
        <button className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:bg-accent-hover">
          <Plus className="h-3.5 w-3.5" />
          Add Follow-up
        </button>
      }
    >
      <div className="space-y-3">
        {items.map((f, i) => (
          <div key={i} className="rounded-xl border border-border bg-background p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-semibold text-foreground">{f.date}</span>
                <span className="text-muted-foreground">· {f.exec}</span>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                  f.status === "Open"
                    ? "bg-sky-100 text-sky-700 ring-sky-200"
                    : "bg-emerald-100 text-emerald-700 ring-emerald-200",
                )}
              >
                {f.status}
              </span>
            </div>
            <p className="text-sm text-foreground">{f.summary}</p>
            <div className="mt-2 text-xs text-muted-foreground">
              Next follow-up: <span className="font-medium text-foreground">{f.next}</span>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function SupportTab() {
  const stats = [
    { label: "Open", count: 2, tone: "bg-sky-100 text-sky-700" },
    { label: "Resolved", count: 5, tone: "bg-emerald-100 text-emerald-700" },
    { label: "Escalated", count: 1, tone: "bg-red-100 text-red-700" },
  ];
  const tickets = [
    { id: "TKT-4821", title: "Unable to access university portal", status: "Open", date: "11 Jun 2026" },
    { id: "TKT-4790", title: "ID card delivery delayed", status: "Escalated", date: "05 Jun 2026" },
    { id: "TKT-4710", title: "Course material download issue", status: "Resolved", date: "22 May 2026" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface p-3 shadow-card">
            <div className={cn("inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold", s.tone)}>
              {s.label}
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">{s.count}</div>
          </div>
        ))}
      </div>
      <SectionCard
        title="Support Tickets"
        icon={HeadphonesIcon}
        action={
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:bg-accent-hover">
            <Plus className="h-3.5 w-3.5" />
            New Ticket
          </button>
        }
      >
        <div className="space-y-2">
          {tickets.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5"
            >
              <div>
                <div className="text-sm font-semibold text-foreground">{t.title}</div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-mono">{t.id}</span> · {t.date}
                </div>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                  t.status === "Open"
                    ? "bg-sky-100 text-sky-700 ring-sky-200"
                    : t.status === "Escalated"
                    ? "bg-red-100 text-red-700 ring-red-200"
                    : "bg-emerald-100 text-emerald-700 ring-emerald-200",
                )}
              >
                {t.status}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function DocumentsTab() {
  const docs = [
    { name: "Aadhaar Card", category: "ID Proof", status: "Verified" },
    { name: "PAN Card", category: "ID Proof", status: "Verified" },
    { name: "10th Marksheet", category: "Qualification", status: "Verified" },
    { name: "12th Marksheet", category: "Qualification", status: "Verified" },
    { name: "Graduation Certificate", category: "Qualification", status: "Pending" },
    { name: "Payment Receipt - Jan", category: "Payment Proof", status: "Verified" },
    { name: "Admission Letter", category: "Admission", status: "Issued" },
    { name: "Enrollment Confirmation", category: "Enrollment", status: "Issued" },
  ];
  return (
    <SectionCard title="Student Documents" icon={FolderOpen}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {docs.map((d) => (
          <div
            key={d.name}
            className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">{d.name}</div>
                <div className="text-xs text-muted-foreground">{d.category}</div>
              </div>
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                d.status === "Verified" || d.status === "Issued"
                  ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
                  : "bg-orange-100 text-orange-700 ring-orange-200",
              )}
            >
              {d.status}
            </span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function UniversityTab() {
  const items: Array<[string, "Done" | "Pending" | "In Progress"]> = [
    ["Enrollment Submitted", "Done"],
    ["Enrollment Approved", "Done"],
    ["Student ID Received", "Done"],
    ["Portal Access Received", "Done"],
    ["Certificate Request Status", "In Progress"],
    ["Certificate Received", "Pending"],
  ];
  return (
    <div className="space-y-4">
      <SectionCard title="University Coordination" icon={School}>
        <div className="space-y-2">
          {items.map(([label, status]) => (
            <div
              key={label}
              className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5"
            >
              <div className="flex items-center gap-3">
                <ShieldCheck
                  className={cn(
                    "h-4 w-4",
                    status === "Done"
                      ? "text-emerald-600"
                      : status === "In Progress"
                      ? "text-sky-600"
                      : "text-muted-foreground",
                  )}
                />
                <div className="text-sm font-medium text-foreground">{label}</div>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                  status === "Done"
                    ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
                    : status === "In Progress"
                    ? "bg-sky-100 text-sky-700 ring-sky-200"
                    : "bg-slate-100 text-slate-700 ring-slate-200",
                )}
              >
                {status}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="University Remarks" icon={FileText}>
        <p className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
          Enrollment confirmed. Awaiting final certificate dispatch from university registrar's
          office. ETA: 30 days.
        </p>
      </SectionCard>
    </div>
  );
}

function CommunicationTab() {
  const logs = [
    { type: "Call", icon: Phone, who: "Priya Sharma", date: "12 Jun 2026 · 10:42 AM", note: "Outbound · 4m 12s · Discussed fee extension." },
    { type: "WhatsApp", icon: MessageCircle, who: "Auto-bot", date: "11 Jun 2026 · 09:00 AM", note: "Sent installment reminder template." },
    { type: "Email", icon: Mail, who: "Operations", date: "08 Jun 2026 · 06:30 PM", note: "Receipt for installment #2 emailed." },
    { type: "Call", icon: Phone, who: "Rahul Verma", date: "02 Jun 2026 · 03:10 PM", note: "Onboarding · 12m 04s." },
  ];
  return (
    <SectionCard title="Communication Timeline" icon={MessageCircle}>
      <div className="space-y-2">
        {logs.map((l, i) => (
          <div key={i} className="flex gap-3 rounded-lg border border-border bg-background p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <l.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-foreground">{l.type}</div>
                <div className="text-xs text-muted-foreground">{l.date}</div>
              </div>
              <div className="text-xs text-muted-foreground">{l.who}</div>
              <div className="mt-1 text-sm text-foreground">{l.note}</div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function TimelineTab({ student }: { student: Student }) {
  const events = [
    { title: "Certificate request raised", date: "10 Jun 2026", icon: ShieldCheck, tone: "bg-sky-100 text-sky-700" },
    { title: "Payment received — ₹25,000", date: "10 Apr 2026", icon: Wallet, tone: "bg-emerald-100 text-emerald-700" },
    { title: "Support ticket TKT-4710 resolved", date: "22 May 2026", icon: HeadphonesIcon, tone: "bg-emerald-100 text-emerald-700" },
    { title: "Portal access received from university", date: "20 Jan 2026", icon: School, tone: "bg-primary/10 text-primary" },
    { title: "Enrollment confirmed", date: "15 Jan 2026", icon: GraduationCap, tone: "bg-primary/10 text-primary" },
    { title: "Student created", date: student.enrollmentDate, icon: UserIcon, tone: "bg-muted text-foreground" },
    { title: "Application approved", date: "05 Jan 2026", icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700" },
  ];
  return (
    <SectionCard title="Activity Timeline" icon={Activity}>
      <ol className="relative ml-3 space-y-4 border-l border-border pl-5">
        {events.map((e, i) => (
          <li key={i} className="relative">
            <span
              className={cn(
                "absolute -left-[27px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-surface",
                e.tone,
              )}
            >
              <e.icon className="h-3 w-3" />
            </span>
            <div className="text-sm font-semibold text-foreground">{e.title}</div>
            <div className="text-xs text-muted-foreground">{e.date}</div>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}
