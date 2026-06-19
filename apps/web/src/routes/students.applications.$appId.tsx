import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  BookOpen,
  Layers,
  User as UserIcon,
  CalendarDays,
  CheckCircle2,
  Circle,
  XCircle,
  Clock,
  FileText,
  Wallet,
  Send,
  ShieldCheck,
  AlertTriangle,
  Eye,
  Download,
  Pencil,
  Plus,
  X,
  Sparkles,
  ChevronRight,
  GraduationCap,
  Briefcase,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/students/applications/$appId")({
  head: () => ({ meta: [{ title: "Application Profile — upCarrera" }] }),
  component: ApplicationProfilePage,
});

/* ---------------- Stage Model ---------------- */
type Stage =
  | "New Lead"
  | "Registration Fee Pending"
  | "Registration Fee Paid"
  | "Application Form Pending"
  | "Admin Verification Pending"
  | "Enrolled"
  | "Rejected";

const PIPELINE: Stage[] = [
  "New Lead",
  "Registration Fee Pending",
  "Registration Fee Paid",
  "Application Form Pending",
  "Admin Verification Pending",
  "Enrolled",
];

const STAGE_STYLES: Record<Stage, string> = {
  "New Lead": "bg-sky-100 text-sky-700 ring-sky-200",
  "Registration Fee Pending": "bg-orange-100 text-orange-700 ring-orange-200",
  "Registration Fee Paid": "bg-emerald-100 text-emerald-700 ring-emerald-200",
  "Application Form Pending": "bg-purple-100 text-purple-700 ring-purple-200",
  "Admin Verification Pending": "bg-yellow-100 text-yellow-800 ring-yellow-200",
  Enrolled: "bg-primary/10 text-primary ring-primary/20",
  Rejected: "bg-red-100 text-red-700 ring-red-200",
};

interface TimelineEntry {
  activity: string;
  date: string;
  by: string;
  remarks?: string;
}

/* ---------------- Page ---------------- */
function ApplicationProfilePage() {
  const { appId } = Route.useParams();
  const navigate = useNavigate();

  // Mock seeded "current" application data — in real app, fetch by id
  const initial = useMemo(() => seedApp(appId), [appId]);
  const [stage, setStage] = useState<Stage>(initial.stage);
  const [stageDates, setStageDates] = useState<Record<string, string>>(initial.stageDates);
  const [timeline, setTimeline] = useState<TimelineEntry[]>(initial.timeline);
  const [tab, setTab] = useState<"snapshot" | "plan" | "form" | "history">("snapshot");
  const [rejected, setRejected] = useState(stage === "Rejected");

  // Drawers / modals
  const [planOpen, setPlanOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [sendFormOpen, setSendFormOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const moveStage = (s: Stage, activity: string, remarks?: string) => {
    const now = new Date();
    const stamp = `${now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} ${now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
    setStage(s);
    setStageDates((p) => ({ ...p, [s]: stamp }));
    setTimeline((t) => [
      { activity, date: stamp, by: "Priya Sharma", remarks },
      ...t,
    ]);
    if (s === "Rejected") setRejected(true);
  };

  const stageIdx = PIPELINE.indexOf(stage);

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/students/applications"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Applications
        </Link>
        <div className="text-xs text-muted-foreground">
          Student Management <ChevronRight className="inline h-3 w-3" /> Applications{" "}
          <ChevronRight className="inline h-3 w-3" />
          <span className="font-mono font-semibold text-foreground">{appId}</span>
        </div>
      </div>

      {/* Profile Header */}
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-xl font-bold text-primary">
              {initial.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <span className="font-mono text-primary">{appId}</span>
                <span>·</span>
                <span>Created {initial.created}</span>
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                {initial.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {initial.phone}</span>
                <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {initial.email}</span>
                <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> {initial.university}</span>
                <span className="inline-flex items-center gap-1"><BookOpen className="h-3 w-3" /> {initial.course}</span>
                <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3" /> {initial.specialization}</span>
                <span className="inline-flex items-center gap-1"><Layers className="h-3 w-3" /> {initial.intake}</span>
                <span className="inline-flex items-center gap-1"><UserIcon className="h-3 w-3" /> {initial.counsellor}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1", STAGE_STYLES[stage])}>
              {stage}
            </span>
            <StageActionButtons
              stage={stage}
              rejected={rejected}
              onGeneratePlan={() => setPlanOpen(true)}
              onUpdatePayment={() => setPayOpen(true)}
              onSendForm={() => setSendFormOpen(true)}
              onVerify={() => setVerifyOpen(true)}
              onCorrection={() => setCorrectionOpen(true)}
              onReject={() => setRejectOpen(true)}
            />
          </div>
        </div>
      </div>

      {/* Lead Flow Tracker */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="mb-4 text-sm font-semibold text-foreground">Lead Flow</div>
        <div className="flex items-stretch gap-1 overflow-x-auto scrollbar-thin pb-1">
          {PIPELINE.map((s, i) => {
            const completed = !rejected && i < stageIdx;
            const current = !rejected && i === stageIdx;
            return (
              <div key={s} className="flex min-w-[170px] flex-1 items-center gap-1">
                <div
                  className={cn(
                    "flex w-full flex-col gap-1.5 rounded-xl border p-3 transition",
                    completed && "border-emerald-300 bg-emerald-50",
                    current && "border-sky-400 bg-sky-50 ring-2 ring-sky-200",
                    !completed && !current && "border-border bg-background",
                    rejected && i > 0 && "opacity-40",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {completed ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : current ? (
                      <Clock className="h-4 w-4 text-sky-600" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Stage {i + 1}
                    </span>
                  </div>
                  <div className={cn(
                    "text-xs font-semibold leading-tight",
                    completed ? "text-emerald-800" : current ? "text-sky-800" : "text-muted-foreground",
                  )}>
                    {s}
                  </div>
                  {stageDates[s] && (
                    <div className="text-[10px] text-muted-foreground">{stageDates[s]}</div>
                  )}
                </div>
                {i < PIPELINE.length - 1 && (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                )}
              </div>
            );
          })}
          {rejected && (
            <div className="flex min-w-[170px] flex-1 items-center gap-1">
              <div className="flex w-full flex-col gap-1.5 rounded-xl border border-red-300 bg-red-50 p-3 ring-2 ring-red-200">
                <div className="flex items-center gap-1.5">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Alt</span>
                </div>
                <div className="text-xs font-semibold text-red-800">Rejected</div>
                {stageDates["Rejected"] && (
                  <div className="text-[10px] text-muted-foreground">{stageDates["Rejected"]}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,300px]">
        {/* Main column */}
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface p-1 shadow-sm">
            {([
              { k: "snapshot", label: "Lead Snapshot" },
              { k: "plan", label: "Payment Plan" },
              { k: "form", label: "Application Form" },
              { k: "history", label: "Lead History" },
            ] as const).map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={cn(
                  "flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition",
                  tab === t.k ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "snapshot" && <LeadSnapshotTab data={initial} />}
          {tab === "plan" && (
            <PaymentPlanTab data={initial} stage={stage} onRecordPayment={() => setPayOpen(true)} />
          )}
          {tab === "form" && <ApplicationFormTab data={initial} stage={stage} />}
          {tab === "history" && <LeadHistoryTab entries={timeline} />}
        </div>

        {/* Right summary sidebar */}
        <aside className="space-y-3">
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Summary
            </div>
            <SummaryRow label="Current Stage" value={stage} />
            <SummaryRow label="Assigned Counsellor" value={initial.counsellor} />
            <SummaryRow label="Days in Stage" value={`${initial.daysInStage} days`} />
            <SummaryRow label="Registration Fee" value={initial.regFeeStatus} />
            <SummaryRow label="Application Form" value={initial.formStatus} />
            <SummaryRow label="Verification" value={initial.verificationStatus} />
            <SummaryRow label="Last Activity" value={timeline[0]?.date || "—"} />
            <SummaryRow label="Next Action" value={nextExpectedAction(stage)} accent />
          </div>
        </aside>
      </div>

      {/* Modals */}
      <GeneratePlanDrawer
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        onSubmit={() => {
          moveStage("Registration Fee Pending", "Payment Plan Generated", "Registration fee account created");
          setPlanOpen(false);
          toast.success("Payment plan generated");
        }}
      />
      <UpdatePaymentDrawer
        open={payOpen}
        onClose={() => setPayOpen(false)}
        onSubmit={() => {
          setTimeline((t) => [
            {
              activity: "Payment Submitted",
              date: new Date().toLocaleString("en-IN"),
              by: "Priya Sharma",
              remarks: "Sent to Finance → Payment Verification",
            },
            ...t,
          ]);
          setPayOpen(false);
          toast.success("Payment submitted for verification");
        }}
      />
      <SendFormModal
        open={sendFormOpen}
        onClose={() => setSendFormOpen(false)}
        onSubmit={() => {
          moveStage("Application Form Pending", "Application Form Sent", "Form link emailed to student");
          setSendFormOpen(false);
          toast.success("Application form sent");
        }}
      />
      <VerifyModal
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        onApprove={() => {
          moveStage("Enrolled", "Enrollment Approved", "Student record created");
          setVerifyOpen(false);
          toast.success("Application approved — student enrolled");
        }}
      />
      <CorrectionModal
        open={correctionOpen}
        onClose={() => setCorrectionOpen(false)}
        onSubmit={() => {
          moveStage("Application Form Pending", "Correction Requested", "Sent back to student");
          setCorrectionOpen(false);
          toast.success("Correction request sent");
        }}
      />
      <RejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onSubmit={() => {
          moveStage("Rejected", "Application Rejected");
          setRejectOpen(false);
          toast.success("Application rejected");
        }}
      />
    </div>
  );
}

/* ---------------- Stage Action Buttons ---------------- */
function StageActionButtons(props: {
  stage: Stage;
  rejected: boolean;
  onGeneratePlan: () => void;
  onUpdatePayment: () => void;
  onSendForm: () => void;
  onVerify: () => void;
  onCorrection: () => void;
  onReject: () => void;
}) {
  if (props.rejected) return null;
  const cls = "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition";
  switch (props.stage) {
    case "New Lead":
      return (
        <button onClick={props.onGeneratePlan} className={cn(cls, "bg-primary text-primary-foreground hover:bg-primary-hover")}>
          <Wallet className="h-3.5 w-3.5" /> Generate Payment Plan
        </button>
      );
    case "Registration Fee Pending":
      return (
        <button onClick={props.onUpdatePayment} className={cn(cls, "bg-primary text-primary-foreground hover:bg-primary-hover")}>
          <Wallet className="h-3.5 w-3.5" /> Update Registration Payment
        </button>
      );
    case "Registration Fee Paid":
      return (
        <button onClick={props.onSendForm} className={cn(cls, "bg-primary text-primary-foreground hover:bg-primary-hover")}>
          <Send className="h-3.5 w-3.5" /> Send Application Form
        </button>
      );
    case "Admin Verification Pending":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={props.onVerify} className={cn(cls, "bg-emerald-600 text-white hover:bg-emerald-700")}>
            <ShieldCheck className="h-3.5 w-3.5" /> Verify Application
          </button>
          <button onClick={props.onCorrection} className={cn(cls, "border border-border bg-surface text-foreground hover:bg-muted")}>
            <AlertTriangle className="h-3.5 w-3.5" /> Request Correction
          </button>
          <button onClick={props.onReject} className={cn(cls, "border border-red-200 bg-surface text-red-600 hover:bg-red-50")}>
            <XCircle className="h-3.5 w-3.5" /> Reject
          </button>
        </div>
      );
    default:
      return null;
  }
}

/* ---------------- Tabs ---------------- */
function LeadSnapshotTab({ data }: { data: ReturnType<typeof seedApp> }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card space-y-4">
      <SectionTitle>Lead Information</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Info label="Student Name" value={data.name} />
        <Info label="Phone" value={data.phone} />
        <Info label="Email" value={data.email} />
        <Info label="University" value={data.university} />
        <Info label="Course" value={data.course} />
        <Info label="Specialisation" value={data.specialization} />
        <Info label="Intake" value={data.intake} />
        <Info label="Lead Source" value={data.leadSource} />
        <Info label="Referred By" value={data.referredBy || "—"} />
        <Info label="Assigned Counsellor" value={data.counsellor} />
        <Info label="Created Date" value={data.created} />
      </div>
      <SectionTitle>Lead Notes</SectionTitle>
      <div className="rounded-xl border border-border bg-background p-3 text-sm text-foreground">
        {data.notes}
      </div>
    </div>
  );
}

function PaymentPlanTab({
  data,
  stage,
  onRecordPayment,
}: {
  data: ReturnType<typeof seedApp>;
  stage: Stage;
  onRecordPayment: () => void;
}) {
  const hasPlan = stage !== "New Lead";
  if (!hasPlan) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
        <Wallet className="mx-auto h-10 w-10 text-muted-foreground" />
        <div className="mt-3 text-sm font-semibold text-foreground">No payment plan yet</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Generate a payment plan from the header to proceed.
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="Registration Fee" value="₹5,000" />
        <Stat label="Course Fee" value="₹85,000" />
        <Stat label="Discount" value="₹2,000" />
        <Stat label="Scholarship" value="₹3,000" />
        <Stat label="Net Fee" value="₹85,000" accent />
      </div>

      <div className="rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-semibold text-foreground">Installment Plan</div>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button
              onClick={onRecordPayment}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              <Plus className="h-3.5 w-3.5" /> Record Payment
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/60">
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2">Installment</th>
              <th className="px-3 py-2">Due Date</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.installments.map((i) => (
              <tr key={i.no} className="border-t border-border">
                <td className="px-3 py-2 font-medium">Installment {i.no}</td>
                <td className="px-3 py-2 text-xs">{i.due}</td>
                <td className="px-3 py-2 font-semibold">₹{i.amount.toLocaleString("en-IN")}</td>
                <td className="px-3 py-2">
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                    i.status === "Paid"
                      ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
                      : i.status === "Overdue"
                        ? "bg-red-100 text-red-700 ring-red-200"
                        : "bg-orange-100 text-orange-700 ring-orange-200",
                  )}>
                    {i.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Reg Fee Status" value={data.regFeeStatus} />
        <Stat label="Amount Paid" value="₹5,000" />
        <Stat label="Outstanding" value="₹80,000" />
        <Stat label="Verification" value={data.verificationStatus} />
      </div>
    </div>
  );
}

function ApplicationFormTab({
  data,
  stage,
}: {
  data: ReturnType<typeof seedApp>;
  stage: Stage;
}) {
  const submitted =
    stage === "Admin Verification Pending" || stage === "Enrolled" || stage === "Rejected";
  if (!submitted) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
        <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
        <div className="mt-3 text-sm font-semibold text-foreground">Form not submitted yet</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {stage === "Application Form Pending"
            ? "Awaiting student submission."
            : "Application form will appear here once submitted."}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <FormSection title="Personal Information" icon={UserIcon}>
        <Info label="Full Name" value={data.name} />
        <Info label="Gender" value="Male" />
        <Info label="Date of Birth" value="14 Aug 1998" />
        <Info label="Nationality" value="Indian" />
        <Info label="Marital Status" value="Single" />
      </FormSection>
      <FormSection title="Contact Information" icon={Phone}>
        <Info label="Mobile" value={data.phone} />
        <Info label="WhatsApp" value={data.phone} />
        <Info label="Email" value={data.email} />
        <Info label="Alternate" value="+91 9876510000" />
      </FormSection>
      <FormSection title="Address Information" icon={Building2}>
        <Info label="Country" value="India" />
        <Info label="State" value="Karnataka" />
        <Info label="City" value="Bengaluru" />
        <Info label="Pincode" value="560001" />
        <Info label="Address" value="MG Road, Bengaluru" />
      </FormSection>
      <FormSection title="Course Selection" icon={BookOpen}>
        <Info label="University" value={data.university} />
        <Info label="Course" value={data.course} />
        <Info label="Specialisation" value={data.specialization} />
        <Info label="Intake" value={data.intake} />
      </FormSection>
      <FormSection title="Academic Qualifications" icon={GraduationCap}>
        <Info label="Highest Qualification" value="UG" />
        <Info label="Degree" value="B.Com" />
        <Info label="Board / University" value="Bangalore University" />
        <Info label="Year" value="2020" />
        <Info label="Score" value="74%" />
      </FormSection>
      <FormSection title="Employment Information" icon={Briefcase}>
        <Info label="Status" value="Employed" />
        <Info label="Company" value="Infosys Ltd" />
        <Info label="Designation" value="Analyst" />
        <Info label="Experience" value="3 years" />
      </FormSection>
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <SectionTitle>Documents</SectionTitle>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {["Photo", "ID Proof", "10th Certificate", "12th Certificate", "Degree Certificate", "Experience Letter"].map(
            (d) => (
              <div key={d} className="flex items-center justify-between rounded-xl border border-border bg-background p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <FileText className="h-4 w-4 text-muted-foreground" /> {d}
                </div>
                <div className="flex items-center gap-1">
                  <button className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted">
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted">
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <SectionTitle>Declarations</SectionTitle>
        <div className="mt-3 space-y-2 text-sm text-foreground">
          <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Information accuracy confirmed</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Terms & Conditions accepted</div>
        </div>
      </div>
    </div>
  );
}

function LeadHistoryTab({ entries }: { entries: TimelineEntry[] }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <SectionTitle>Activity Timeline</SectionTitle>
      <ol className="mt-4 relative space-y-5 border-l border-border pl-5">
        {entries.map((e, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-[26px] top-1 grid h-3 w-3 place-items-center rounded-full bg-primary ring-4 ring-primary/15" />
            <div className="text-sm font-semibold text-foreground">{e.activity}</div>
            <div className="text-[11px] text-muted-foreground">
              {e.date} · {e.by}
            </div>
            {e.remarks && (
              <div className="mt-1 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground">
                {e.remarks}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------------- Modals / Drawers ---------------- */
function ModalShell({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />
      <div className={cn(
        "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-h-[85vh] overflow-hidden flex flex-col rounded-2xl bg-surface shadow-2xl",
        wide ? "max-w-2xl" : "max-w-lg",
      )}>
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="text-base font-semibold text-foreground">{title}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-border bg-background/50 px-5 py-3">
          {footer}
        </div>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

function GeneratePlanDrawer({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: () => void }) {
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Generate Payment Plan"
      wide
      footer={
        <>
          <button onClick={onClose} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">Cancel</button>
          <button onClick={onSubmit} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover">Generate Plan</button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Registration Fee"><input className={inputCls} defaultValue="5000" /></FormField>
        <FormField label="Course Fee"><input className={inputCls} defaultValue="85000" /></FormField>
        <FormField label="Discount"><input className={inputCls} defaultValue="2000" /></FormField>
        <FormField label="Scholarship"><input className={inputCls} defaultValue="3000" /></FormField>
        <FormField label="Installment Plan">
          <select className={inputCls}>
            <option>3 Installments</option>
            <option>6 Installments</option>
            <option>12 Installments</option>
          </select>
        </FormField>
      </div>
      <FormField label="Remarks">
        <textarea className={cn(inputCls, "h-20 py-2")} placeholder="Optional remarks" />
      </FormField>
    </ModalShell>
  );
}

function UpdatePaymentDrawer({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: () => void }) {
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Update Registration Payment"
      wide
      footer={
        <>
          <button onClick={onClose} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">Cancel</button>
          <button onClick={onSubmit} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover">Submit Payment</button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Amount Received"><input className={inputCls} defaultValue="5000" /></FormField>
        <FormField label="Payment Date"><input type="date" className={inputCls} /></FormField>
        <FormField label="Payment Mode">
          <select className={inputCls}>
            <option>UPI</option>
            <option>Bank Transfer</option>
            <option>Card</option>
            <option>Cash</option>
          </select>
        </FormField>
        <FormField label="Transaction ID"><input className={inputCls} placeholder="TXN..." /></FormField>
        <FormField label="Payment Proof"><input type="file" className={cn(inputCls, "py-1.5")} /></FormField>
      </div>
      <FormField label="Remarks"><textarea className={cn(inputCls, "h-20 py-2")} /></FormField>
    </ModalShell>
  );
}

function SendFormModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: () => void }) {
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Send Application Form"
      footer={
        <>
          <button onClick={onClose} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">Cancel</button>
          <button className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">Preview</button>
          <button onClick={onSubmit} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover">Send Form</button>
        </>
      }
    >
      <FormField label="Student Email"><input className={inputCls} defaultValue="student@example.com" /></FormField>
      <FormField label="Student Mobile"><input className={inputCls} defaultValue="+91 9876543210" /></FormField>
      <FormField label="Form Expiry Date"><input type="date" className={inputCls} /></FormField>
      <FormField label="Message Template">
        <select className={inputCls}>
          <option>Default Welcome Template</option>
          <option>Scholarship Template</option>
        </select>
      </FormField>
    </ModalShell>
  );
}

function VerifyModal({ open, onClose, onApprove }: { open: boolean; onClose: () => void; onApprove: () => void }) {
  const items = [
    "Personal Details Verified",
    "Academic Details Verified",
    "Documents Verified",
    "Eligibility Verified",
    "Fee Plan Verified",
    "University Criteria Met",
  ];
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Verify Application"
      footer={
        <>
          <button onClick={onClose} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">Cancel</button>
          <button onClick={onApprove} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Approve Enrollment</button>
        </>
      }
    >
      <div className="space-y-2">
        {items.map((i) => (
          <label key={i} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
            <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-border" />
            {i}
          </label>
        ))}
      </div>
    </ModalShell>
  );
}

function CorrectionModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: () => void }) {
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Request Correction"
      footer={
        <>
          <button onClick={onClose} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">Cancel</button>
          <button onClick={onSubmit} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover">Send Correction Request</button>
        </>
      }
    >
      <FormField label="Correction Notes"><textarea className={cn(inputCls, "h-24 py-2")} /></FormField>
      <FormField label="Required Updates">
        <textarea className={cn(inputCls, "h-24 py-2")} placeholder="Fields/documents student needs to update" />
      </FormField>
    </ModalShell>
  );
}

function RejectModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: () => void }) {
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Reject Application"
      footer={
        <>
          <button onClick={onClose} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">Cancel</button>
          <button onClick={onSubmit} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">Reject Application</button>
        </>
      }
    >
      <FormField label="Reason">
        <select className={inputCls}>
          <option>Eligibility not met</option>
          <option>Incomplete documentation</option>
          <option>Duplicate application</option>
          <option>Other</option>
        </select>
      </FormField>
      <FormField label="Remarks"><textarea className={cn(inputCls, "h-24 py-2")} /></FormField>
    </ModalShell>
  );
}

/* ---------------- Helpers ---------------- */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-3", accent ? "border-accent/30 bg-accent/5" : "border-border bg-background")}>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-base font-bold", accent ? "text-accent" : "text-foreground")}>{value}</div>
    </div>
  );
}

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-xs font-semibold text-right", accent ? "text-primary" : "text-foreground")}>{value}</div>
    </div>
  );
}

function FormSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof UserIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function nextExpectedAction(stage: Stage): string {
  switch (stage) {
    case "New Lead": return "Generate payment plan";
    case "Registration Fee Pending": return "Collect registration fee";
    case "Registration Fee Paid": return "Send application form";
    case "Application Form Pending": return "Await student submission";
    case "Admin Verification Pending": return "Verify application";
    case "Enrolled": return "—";
    case "Rejected": return "—";
  }
}

/* ---------------- Mock data ---------------- */
function seedApp(id: string) {
  return {
    id,
    name: "Aarav Sharma",
    phone: "+91 9876543210",
    email: "aarav.sharma@gmail.com",
    university: "Amity University Online",
    course: "MBA",
    specialization: "Marketing",
    intake: "January 2026",
    counsellor: "Priya Sharma",
    created: "10 Jul 2026",
    leadSource: "Website",
    referredBy: "",
    notes: "Student looking for scholarship; interested in marketing specialisation. Follow up after document review.",
    daysInStage: 3,
    regFeeStatus: "Pending",
    formStatus: "Not Sent",
    verificationStatus: "Pending",
    stage: "New Lead" as Stage,
    stageDates: { "New Lead": "10 Jul 2026 09:00 AM" } as Record<string, string>,
    installments: [
      { no: 1, due: "15 Aug 2026", amount: 28333, status: "Pending" },
      { no: 2, due: "15 Nov 2026", amount: 28333, status: "Pending" },
      { no: 3, due: "15 Feb 2027", amount: 28334, status: "Pending" },
    ],
    timeline: [
      { activity: "Lead Created", date: "10 Jul 2026 09:00 AM", by: "Priya Sharma", remarks: "Lead captured via website" },
    ] as TimelineEntry[],
  };
}
