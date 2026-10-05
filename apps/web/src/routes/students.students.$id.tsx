import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet, ApiError } from "@/lib/api";
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  BookOpen,
  User as UserIcon,
  Wallet,
  MessageCircle,
  FolderOpen,
  School,
  Activity,
  GraduationCap,
  RefreshCcw,
  AlertTriangle,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { StudentCallPanel } from "@/components/calls/student-call-panel";
import type {
  ApiLinkedApplication,
  ApiStudentDetail,
} from "@/components/students/profile-types";
import {
  InfoRow,
  SectionCard,
  dash,
  formatDate,
  formatINR,
} from "@/components/students/profile-ui";
import { FinanceTab } from "@/components/students/profile-finance";
import { DocumentsTab } from "@/components/students/profile-documents";
import { TimelineTab } from "@/components/students/profile-timeline";

export const Route = createFileRoute("/students/students/$id")({
  head: ({ params }) => ({
    meta: [{ title: `${params.id} — Student Profile` }],
  }),
  component: StudentDetailPage,
});

/* ------------------------------------------------------------------ *
 * GET /api/students/:id (apiGet unwraps the envelope).
 *
 * The endpoint keys on the numeric `students` PK (ParseIntPipe) and returns the
 * raw students row decorated server-side with every name the page shows —
 * university, course, specialisation, session, counsellor — plus the finance
 * block and the application the student came from. Raw ids are never rendered
 * (QA ST01); Documents and Timeline load from their own endpoints when opened.
 * ------------------------------------------------------------------ */

const LINK_BASIS_HINT: Record<ApiLinkedApplication["link_basis"], string> = {
  application_id: "",
  records: "Linked through the student's documents or qualifications",
  contact: "Matched by the student's email or mobile",
};

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

  // The URL carries the internal students.id (what GET /students/:id takes), but
  // the operator knows this person by their printed id — STU-1688, not 1547. Show
  // the real one as soon as the record loads, falling back to the raw param while
  // it is in flight (QA ST05).
  const crumbId = data
    ? dash(data.enrollment_id ?? `STU-${data.student_id}`)
    : rawParam;

  return (
    <div className="space-y-5">
      {/* Breadcrumb / back */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/students/students" className="hover:text-foreground">
            Students
          </Link>
          <span>/</span>
          <span className="font-mono font-semibold text-foreground">{crumbId}</span>
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
          <DocumentsTab studentId={student.id} />
        </TabsContent>
        <TabsContent value="university">
          <UniversityTab student={student} />
        </TabsContent>
        <TabsContent value="comm">
          <StudentCallPanel phone={student.phone} name={student.name} />
        </TabsContent>
        <TabsContent value="timeline">
          <TimelineTab studentId={student.id} />
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ---------------- tabs ---------------- */

/** Application ID / Enrollment ID: the student's own value, else the linked application's. */
function admissionIds(student: ApiStudentDetail) {
  const app = student.application;
  const ownAppId = student.application_id?.trim() ? student.application_id : null;
  const ownEnrId = student.enrollment_id?.trim() ? student.enrollment_id : null;
  return {
    applicationId: ownAppId ?? app?.display_id ?? null,
    applicationHint:
      !ownAppId && app ? "From the linked application" : app ? LINK_BASIS_HINT[app.link_basis] : "",
    enrollmentId: ownEnrId ?? app?.enrollment_id ?? null,
    enrollmentHint: !ownEnrId && app?.enrollment_id ? "From the linked application" : "",
  };
}

function OverviewTab({ student }: { student: ApiStudentDetail }) {
  const finance = student.finance;
  const total = finance?.total ?? 0;
  const paid = finance?.paid ?? 0;
  const collection = total > 0 ? Math.round((paid / total) * 100) : 0;
  const ids = admissionIds(student);
  const app = student.application;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SectionCard title="Student Information" icon={UserIcon}>
        <InfoRow label="Full Name" value={dash(student.name)} />
        <InfoRow label="Email" value={dash(student.email)} />
        <InfoRow label="Phone" value={dash(student.phone)} />
        <InfoRow label="WhatsApp" value={dash(student.whatsapp_no)} />
        <InfoRow
          label="Enrollment ID"
          value={<span className="font-mono">{dash(ids.enrollmentId)}</span>}
          hint={ids.enrollmentHint || undefined}
        />
      </SectionCard>

      <SectionCard title="Admission Information" icon={GraduationCap}>
        <InfoRow
          label="Application ID"
          value={<span className="font-mono">{dash(ids.applicationId)}</span>}
          hint={ids.applicationHint || undefined}
        />
        {app && (
          <>
            <InfoRow
              label="Application created"
              value={formatDate(app.created_at)}
              hint={app.created_by_name ? `by ${app.created_by_name}` : undefined}
            />
            <InfoRow
              label="Converted to student"
              value={app.is_converted ? formatDate(app.converted_at) : "Not converted"}
              hint={app.converted_by_name ? `by ${app.converted_by_name}` : undefined}
            />
          </>
        )}
        {!app && !ids.applicationId && (
          <InfoRow
            label="Application"
            value="None linked"
            hint="No application in the records points at this student"
          />
        )}
        <InfoRow label="Enrollment Date" value={formatDate(student.enrollment_date)} />
        <InfoRow label="Source" value={dash(student.source)} />
        <InfoRow label="Counsellor" value={dash(student.consultant_name)} />
      </SectionCard>

      <SectionCard title="University Information" icon={Building2}>
        <InfoRow label="University" value={dash(student.university_title)} />
        <InfoRow label="Course" value={dash(student.course_title)} />
        <InfoRow label="Specialisation" value={dash(student.specialisation_title)} />
        <InfoRow label="Session" value={dash(student.session_title)} />
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
        <InfoRow label="Paid" value={formatINR(finance?.paid)} />
        <InfoRow label="Outstanding" value={formatINR(finance?.outstanding)} />
        <InfoRow label="Fee installments" value={String(finance?.installment_count ?? 0)} />
      </SectionCard>
    </div>
  );
}

function UniversityTab({ student }: { student: ApiStudentDetail }) {
  const ids = admissionIds(student);
  return (
    <SectionCard title="University Information" icon={School}>
      <InfoRow label="University" value={dash(student.university_title)} />
      <InfoRow label="Course" value={dash(student.course_title)} />
      <InfoRow label="Specialisation" value={dash(student.specialisation_title)} />
      <InfoRow label="Session" value={dash(student.session_title)} />
      <InfoRow label="Mode" value={dash(student.mode)} />
      <InfoRow label="ABC ID" value={<span className="font-mono">{dash(student.abc_id)}</span>} />
      <InfoRow
        label="Enrollment ID"
        value={<span className="font-mono">{dash(ids.enrollmentId)}</span>}
        hint={ids.enrollmentHint || undefined}
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
