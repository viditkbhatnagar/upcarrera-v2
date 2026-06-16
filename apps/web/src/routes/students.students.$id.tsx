import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet, ApiError } from "@/lib/api";
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
  GraduationCap,
  CreditCard,
  Receipt,
  CheckCircle2,
  RefreshCcw,
  AlertTriangle,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/students/students/$id")({
  head: ({ params }) => ({
    meta: [{ title: `${params.id} — Student Profile` }],
  }),
  component: StudentDetailPage,
});

/* ------------------------------------------------------------------ *
 * API shape — GET /api/students/:id (apiGet unwraps the envelope).
 *
 * The endpoint keys on the numeric `students` PK (ParseIntPipe) and returns
 * the raw students row decorated with users/course/university joins plus a
 * rolled-up `finance` block. The list screen links this route with a *display*
 * id (enrollment_id or `STU-<student_id>`), so we extract the numeric portion
 * of the route param to resolve the PK the API expects. The fetched row echoes
 * its own real `id`, and every visible value below comes from this response.
 * ------------------------------------------------------------------ */
interface ApiInvoice {
  id: number;
  university_id: number | null;
  semester_id: number | null;
  student_id: number | null;
  course_id: number | null;
  payment_status: string | null;
  total_amount: number | null;
  discount_amount: number | null;
  payable_amount: number | null;
  date: string | null;
  due_date: string | null;
  remarks: string | null;
  paid_amount_total: number;
  outstanding_amount: number;
}

interface ApiPayment {
  id: number;
  user_id: number | null;
  invoice_id: number | null;
  payment_type: string | null;
  paid_amount: number | null;
  payment_date: string | null;
  reference_no: string | null;
  remark: string | null;
}

interface ApiFinance {
  total: number;
  paid: number;
  outstanding: number;
  invoice_count: number;
  payment_count: number;
  invoices: ApiInvoice[];
  payments: ApiPayment[];
}

interface ApiStudentDetail {
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
  consultant_id: number | null;
  created_at: string | null;
  // decorated joins
  name: string | null;
  email: string | null;
  phone: string | null;
  profile_picture: string | null;
  consultant_name: string | null;
  course_title: string | null;
  university_id: number | null;
  university_title: string | null;
  admission_status_label: string | null;
  finance: ApiFinance | null;
}

/* ---------------- formatting helpers ---------------- */

const formatINR = (n: number | null | undefined) =>
  "₹" + Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function dash(value: string | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : "—";
}

function initials(name: string | null | undefined, fallback: string): string {
  const source = name && name.trim() !== "" ? name : fallback;
  return source
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// The route param is a display id (e.g. "STU-1042" or an enrollment_id). The API
// keys on the numeric students PK, so resolve the numeric portion of the param.
function numericIdFromParam(param: string): number | null {
  const digits = param.match(/\d+/g);
  if (!digits || digits.length === 0) return null;
  // STU-<n> / plain <n> -> the (last) numeric run is the PK we link by.
  const n = Number(digits[digits.length - 1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Pipeline-code -> badge styling. Falls back to neutral slate for unknown labels.
const STATUS_STYLES: Record<string, string> = {
  Pending: "bg-orange-100 text-orange-700 ring-orange-200",
  "In Progress": "bg-sky-100 text-sky-700 ring-sky-200",
  Enrolled: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  "Passed Out": "bg-primary/10 text-primary ring-primary/20",
  Dropout: "bg-red-100 text-red-700 ring-red-200",
  Cancelled: "bg-slate-100 text-slate-700 ring-slate-200",
};
const STATUS_DOT: Record<string, string> = {
  Pending: "bg-orange-500",
  "In Progress": "bg-sky-500",
  Enrolled: "bg-emerald-500",
  "Passed Out": "bg-primary",
  Dropout: "bg-red-500",
  Cancelled: "bg-slate-400",
};

function statusStyle(label: string | null | undefined): string {
  return (label && STATUS_STYLES[label]) || "bg-slate-100 text-slate-700 ring-slate-200";
}
function statusDot(label: string | null | undefined): string {
  return (label && STATUS_DOT[label]) || "bg-slate-400";
}

/* ---------------- page ---------------- */

function StudentDetailPage() {
  const { id: rawParam } = Route.useParams();
  const numericId = numericIdFromParam(rawParam);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["student-detail", numericId],
    queryFn: () => apiGet<ApiStudentDetail>(`/students/${numericId}`),
    enabled: numericId != null,
  });

  return (
    <div className="space-y-5">
      {/* Breadcrumb / back */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/students/students" className="hover:text-foreground">
            Students
          </Link>
          <span>/</span>
          <span className="font-mono font-semibold text-foreground">{rawParam}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/students/students"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
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
        <StudentDetailContent student={data} />
      )}
    </div>
  );
}

function StudentDetailContent({ student }: { student: ApiStudentDetail }) {
  const displayName = dash(student.name);
  const displayId = dash(student.enrollment_id ?? `STU-${student.student_id}`);
  const finance = student.finance;

  return (
    <>
      {/* Header card */}
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-start gap-4">
          {student.profile_picture ? (
            <img
              src={student.profile_picture}
              alt={displayName}
              className="h-16 w-16 shrink-0 rounded-2xl object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-lg font-bold text-primary">
              {initials(student.name, `S${student.student_id}`)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {displayName}
              </h1>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
                  statusStyle(student.admission_status_label),
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    statusDot(student.admission_status_label),
                  )}
                />
                {dash(student.admission_status_label)}
              </span>
            </div>
            <div className="mt-1 text-sm">
              <span className="font-mono text-xs font-semibold text-primary">{displayId}</span>
              <span className="mx-2 text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                Enrolled {formatDate(student.enrollment_date ?? student.created_at)}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill icon={Mail} label={dash(student.email)} />
              <Pill icon={Phone} label={dash(student.phone)} />
              <Pill icon={Building2} label={dash(student.university_title)} />
              <Pill icon={BookOpen} label={dash(student.course_title)} />
              <Pill icon={UserIcon} label={dash(student.consultant_name)} />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
          <TabTrig value="overview" icon={UserIcon} label="Overview" />
          <TabTrig value="finance" icon={Wallet} label="Finance" />
          <TabTrig value="documents" icon={FolderOpen} label="Documents" />
          <TabTrig value="university" icon={School} label="University" />
          <TabTrig value="comm" icon={MessageCircle} label="Communication" />
          <TabTrig value="timeline" icon={Activity} label="Timeline" />
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab student={student} />
        </TabsContent>
        <TabsContent value="finance">
          <FinanceTab finance={finance} />
        </TabsContent>
        <TabsContent value="documents">
          <EmptyTab
            icon={FolderOpen}
            title="No documents available"
            description="Student documents are not exposed by this endpoint yet."
          />
        </TabsContent>
        <TabsContent value="university">
          <UniversityTab student={student} />
        </TabsContent>
        <TabsContent value="comm">
          <EmptyTab
            icon={MessageCircle}
            title="No communication history"
            description="Calls, WhatsApp, and email logs are not exposed by this endpoint yet."
          />
        </TabsContent>
        <TabsContent value="timeline">
          <EmptyTab
            icon={Activity}
            title="No timeline activity"
            description="Activity events are not exposed by this endpoint yet."
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ---------------- tabs ---------------- */

function OverviewTab({ student }: { student: ApiStudentDetail }) {
  const finance = student.finance;
  const total = finance?.total ?? 0;
  const paid = finance?.paid ?? 0;
  const collection = total > 0 ? Math.round((paid / total) * 100) : 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SectionCard title="Student Information" icon={UserIcon}>
        <InfoRow label="Full Name" value={dash(student.name)} />
        <InfoRow label="Email" value={dash(student.email)} />
        <InfoRow label="Phone" value={dash(student.phone)} />
        <InfoRow
          label="Enrollment ID"
          value={<span className="font-mono">{dash(student.enrollment_id)}</span>}
        />
      </SectionCard>

      <SectionCard title="Admission Information" icon={GraduationCap}>
        <InfoRow
          label="Application ID"
          value={<span className="font-mono">{dash(student.application_id)}</span>}
        />
        <InfoRow label="Enrollment Date" value={formatDate(student.enrollment_date)} />
        <InfoRow label="Source" value={dash(student.source)} />
        <InfoRow label="Counsellor" value={dash(student.consultant_name)} />
      </SectionCard>

      <SectionCard title="University Information" icon={Building2}>
        <InfoRow label="University" value={dash(student.university_title)} />
        <InfoRow label="Course" value={dash(student.course_title)} />
        <InfoRow
          label="Specialisation"
          value={student.specialisation_id != null ? `#${student.specialisation_id}` : "—"}
        />
        <InfoRow
          label="Session"
          value={student.session_id != null ? `#${student.session_id}` : "—"}
        />
      </SectionCard>

      <SectionCard title="Current Status" icon={Activity}>
        <InfoRow
          label="Status"
          value={
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                statusStyle(student.admission_status_label),
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  statusDot(student.admission_status_label),
                )}
              />
              {dash(student.admission_status_label)}
            </span>
          }
        />
        <InfoRow label="Fee Collection" value={total > 0 ? `${collection}%` : "—"} />
        <InfoRow label="Outstanding" value={formatINR(finance?.outstanding)} />
        <InfoRow label="Invoices" value={String(finance?.invoice_count ?? 0)} />
      </SectionCard>
    </div>
  );
}

function FinanceTab({ finance }: { finance: ApiFinance | null }) {
  if (!finance || (finance.invoice_count === 0 && finance.payment_count === 0)) {
    return (
      <div className="space-y-4">
        <FinanceStats finance={finance} />
        <EmptyTab
          icon={Wallet}
          title="No finance records"
          description="This student has no invoices or payments on file yet."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FinanceStats finance={finance} />

      <SectionCard title="Invoices" icon={CreditCard}>
        {finance.invoices.length === 0 ? (
          <EmptyInline label="No invoices issued." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 font-semibold">Invoice</th>
                  <th className="py-2 font-semibold">Date</th>
                  <th className="py-2 font-semibold">Due</th>
                  <th className="py-2 font-semibold">Payable</th>
                  <th className="py-2 font-semibold">Paid</th>
                  <th className="py-2 font-semibold">Outstanding</th>
                  <th className="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {finance.invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 font-mono text-xs">#{inv.id}</td>
                    <td className="py-2.5">{formatDate(inv.date)}</td>
                    <td className="py-2.5">{formatDate(inv.due_date)}</td>
                    <td className="py-2.5 font-semibold">{formatINR(inv.payable_amount)}</td>
                    <td className="py-2.5 text-emerald-600">{formatINR(inv.paid_amount_total)}</td>
                    <td className="py-2.5 text-orange-600">{formatINR(inv.outstanding_amount)}</td>
                    <td className="py-2.5">
                      <InvoiceStatusBadge
                        status={inv.payment_status}
                        outstanding={inv.outstanding_amount}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Payment History" icon={Receipt}>
        {finance.payments.length === 0 ? (
          <EmptyInline label="No payments recorded." />
        ) : (
          <div className="space-y-2">
            {finance.payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      {formatINR(p.paid_amount)}{" "}
                      {p.payment_type && (
                        <span className="text-xs font-normal text-muted-foreground">
                          via {p.payment_type}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(p.payment_date)}
                      {p.reference_no ? ` · Ref ${p.reference_no}` : ""}
                      {p.invoice_id != null ? ` · Invoice #${p.invoice_id}` : ""}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function FinanceStats({ finance }: { finance: ApiFinance | null }) {
  const total = finance?.total ?? 0;
  const paid = finance?.paid ?? 0;
  const outstanding = finance?.outstanding ?? 0;
  const collection = total > 0 ? Math.round((paid / total) * 100) : 0;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <FinStat label="Total Fee" value={formatINR(total)} tone="text-foreground" />
      <FinStat label="Paid" value={formatINR(paid)} tone="text-emerald-600" />
      <FinStat label="Outstanding" value={formatINR(outstanding)} tone="text-orange-600" />
      <FinStat label="Invoices" value={String(finance?.invoice_count ?? 0)} tone="text-foreground" />
      <FinStat label="Collection" value={total > 0 ? `${collection}%` : "—"} tone="text-primary" />
    </div>
  );
}

function InvoiceStatusBadge({
  status,
  outstanding,
}: {
  status: string | null;
  outstanding: number;
}) {
  const label = status && status.trim() !== "" ? status : outstanding <= 0 ? "paid" : "pending";
  const isPaid = label.toLowerCase() === "paid" || outstanding <= 0;
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset",
        isPaid
          ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
          : "bg-orange-100 text-orange-700 ring-orange-200",
      )}
    >
      {label}
    </span>
  );
}

function UniversityTab({ student }: { student: ApiStudentDetail }) {
  return (
    <SectionCard title="University Information" icon={School}>
      <InfoRow label="University" value={dash(student.university_title)} />
      <InfoRow
        label="University ID"
        value={student.university_id != null ? `#${student.university_id}` : "—"}
      />
      <InfoRow label="Course" value={dash(student.course_title)} />
      <InfoRow
        label="Course ID"
        value={student.course_id != null ? `#${student.course_id}` : "—"}
      />
      <InfoRow
        label="Enrollment ID"
        value={<span className="font-mono">{dash(student.enrollment_id)}</span>}
      />
    </SectionCard>
  );
}

/* ---------------- state views ---------------- */

function LoadingState() {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <div className="flex items-start gap-4">
          <Skeleton className="h-16 w-16 rounded-2xl" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
            <div className="flex gap-2">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-7 w-44" />
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
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
    error instanceof Error ? error.message : "Something went wrong while loading this student.";
  return (
    <div className="rounded-2xl border border-border bg-surface p-10 text-center shadow-card">
      <AlertTriangle className="mx-auto h-10 w-10 text-red-500/60" />
      <h2 className="mt-3 text-lg font-semibold text-foreground">
        {notFound ? "Student not found" : "Couldn’t load student"}
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
          to="/students/students"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Students
        </Link>
      </div>
    </div>
  );
}

function NotFoundState({ param }: { param: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-10 text-center shadow-card">
      <Inbox className="mx-auto h-10 w-10 text-muted-foreground/50" />
      <h2 className="mt-3 text-lg font-semibold text-foreground">Student not found</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        No numeric student id could be resolved from{" "}
        <span className="font-mono text-foreground">{param}</span>.
      </p>
      <Link
        to="/students/students"
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Students
      </Link>
    </div>
  );
}

/* ---------------- presentational primitives ---------------- */

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

function EmptyTab({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof FolderOpen;
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

function EmptyInline({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background px-4 py-8 text-center">
      <HeadphonesIcon className="h-4 w-4 text-muted-foreground/50" />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
