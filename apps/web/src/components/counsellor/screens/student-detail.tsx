import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Building2,
  CalendarDays,
  FileText,
  IndianRupee,
  Mail,
  Phone,
  RefreshCcw,
  School,
  SearchX,
  User,
  UserCheck,
} from "lucide-react";
import { apiGet, ApiError } from "@/lib/api";
import { getApplication } from "@/lib/api/applications";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAvatarUrl } from "@/hooks/use-avatar-url";
import { ApplicationFormTab } from "@/components/applications/application-form-tab";
import { FinanceTab } from "@/components/students/profile-finance";
import { DocumentsTab } from "@/components/students/profile-documents";
import { TimelineTab } from "@/components/students/profile-timeline";
import { dash, formatDate, formatINR } from "@/components/students/profile-ui";
import type { ApiStudentDetail } from "@/components/students/profile-types";
import { Field, MiniStat, Section, StatePanel } from "@/components/counsellor/shared/info";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  Pending: "bg-warning-soft text-warning-foreground border-transparent",
  "In Progress": "bg-info-soft text-info border-transparent",
  Enrolled: "bg-success-soft text-success border-success/30",
  "Passed Out": "bg-primary-soft text-primary-soft-foreground border-transparent",
  Dropout: "bg-destructive/10 text-destructive border-transparent",
  Cancelled: "bg-muted text-muted-foreground border-transparent",
};

function numericIdFromParam(param: string): number | null {
  const digits = param.match(/\d+/g);
  if (!digits || digits.length === 0) return null;
  const n = Number(digits[digits.length - 1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function initialsOf(name: string | null | undefined, fallback: string): string {
  const source = name && name.trim() !== "" ? name : fallback;
  return source.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

/**
 * Student detail (Naji's design) wired to the real student profile:
 *   GET /students/:id               -> hero, overview, university, finance block
 *   GET /students/:id/documents     -> Documents tab
 *   GET /students/:id/timeline      -> Timeline tab
 *   GET /applications/:id           -> Application tab (the application it came from)
 */
export function CounsellorStudentDetail({ idParam }: { idParam: string }) {
  const numericId = numericIdFromParam(idParam);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["student-detail", numericId],
    queryFn: () => apiGet<ApiStudentDetail>(`/students/${numericId}`),
    enabled: numericId != null,
  });

  const displayId = data ? dash(data.enrollment_id ?? `STU-${data.student_id}`) : idParam;

  return (
    <>
      <div className="flex items-center gap-2 text-sm">
        <Link to="/students/students" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> My Enrollments
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-mono text-xs">{displayId}</span>
      </div>

      {numericId == null || (isError && error instanceof ApiError && error.status === 404) ? (
        <StatePanel
          icon={<SearchX className="h-7 w-7 text-muted-foreground/70" />}
          title="Student not found"
          hint="The student may not be in your enrollments, or the link is incorrect."
        />
      ) : isLoading ? (
        <StatePanel icon={<RefreshCcw className="h-7 w-7 animate-spin text-muted-foreground/60" />} title="Loading student…" />
      ) : isError || !data ? (
        <StatePanel
          icon={<AlertTriangle className="h-7 w-7 text-destructive" />}
          title="Couldn't load the student"
          hint={error instanceof Error ? error.message : "Please try again."}
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      ) : (
        <StudentContent student={data} displayId={displayId} />
      )}
    </>
  );
}

function StudentContent({ student: s, displayId }: { student: ApiStudentDetail; displayId: string }) {
  const avatarUrl = useAvatarUrl(s.profile_picture);
  const name = dash(s.name);
  const finance = s.finance;
  const total = finance?.total ?? 0;
  const paid = finance?.paid ?? 0;
  const paidPct = total > 0 ? Math.round((paid / total) * 100) : 0;
  const course = s.specialisation_title ? `${dash(s.course_title)} · ${s.specialisation_title}` : dash(s.course_title);
  const linkedAppId = s.application?.application_id ?? null;

  return (
    <>
      <Card className="p-6 shadow-[var(--shadow-soft)] border-border/70 overflow-hidden relative">
        <div className="absolute inset-x-0 top-0 h-24 bg-[image:var(--gradient-primary)] opacity-10" />
        <div className="relative flex flex-wrap items-start gap-5">
          <Avatar className="h-20 w-20 ring-4 ring-background">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={name} className="object-cover" />}
            <AvatarFallback className="bg-[image:var(--gradient-primary)] text-primary-foreground text-xl font-semibold">
              {initialsOf(s.name, `S${s.student_id}`)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">{name}</h1>
              <Badge
                variant="outline"
                className={cn(STATUS_STYLES[s.admission_status_label ?? ""] ?? "bg-muted text-muted-foreground")}
              >
                {dash(s.admission_status_label)}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">{displayId}</span>
              <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {dash(s.phone)}</span>
              <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {dash(s.email)}</span>
              <span>Enrolled {formatDate(s.enrollment_date ?? s.created_at)}</span>
            </div>
          </div>
        </div>

        <div className="relative mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          <MiniStat icon={Building2} label="University" value={dash(s.university_title)} tone="primary" />
          <MiniStat icon={BookOpen} label="Course" value={course} tone="primary" />
          <MiniStat icon={CalendarDays} label="Intake" value={dash(s.session_title)} tone="info" />
          <MiniStat
            icon={IndianRupee}
            label="Fee Progress"
            value={total > 0 ? `${formatINR(paid)} / ${formatINR(total)}` : "—"}
            tone="warning"
            progress={total > 0 ? paidPct : undefined}
          />
        </div>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList className="bg-muted/60 w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {linkedAppId != null && <TabsTrigger value="application">Application</TabsTrigger>}
          <TabsTrigger value="registration">University &amp; Registration</TabsTrigger>
          <TabsTrigger value="finance">Payments</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-6">
          <Section title="Personal & Contact Information" icon={User}>
            <Field label="Name" value={name} />
            <Field label="Email ID" value={dash(s.email)} />
            <Field label="Phone" value={dash(s.phone)} />
            <Field label="WhatsApp" value={dash(s.whatsapp_no)} />
          </Section>
          <Section title="Course Information" icon={FileText}>
            <Field label="University" value={dash(s.university_title)} />
            <Field label="Course" value={dash(s.course_title)} />
            <Field label="Specialisation" value={dash(s.specialisation_title)} />
            <Field label="Intake" value={dash(s.session_title)} />
            <Field label="Source" value={dash(s.source)} />
            <Field label="Counsellor" value={dash(s.consultant_name)} />
          </Section>
        </TabsContent>

        {linkedAppId != null && (
          <TabsContent value="application" className="mt-4">
            <LinkedApplicationForm applicationId={linkedAppId} />
          </TabsContent>
        )}

        <TabsContent value="registration" className="mt-4">
          <Section title="University & Registration" icon={School}>
            <Field label="University" value={dash(s.university_title)} />
            <Field label="Course" value={dash(s.course_title)} />
            <Field label="Specialisation" value={dash(s.specialisation_title)} />
            <Field label="Intake" value={dash(s.session_title)} />
            <Field label="Mode" value={dash(s.mode)} />
            <Field label="ABC ID" value={dash(s.abc_id)} />
            <Field label="Enrollment ID" value={dash(s.enrollment_id)} />
            <Field label="Application ID" value={dash(s.application_id ?? s.application?.display_id)} />
            <Field label="Status" value={dash(s.admission_status_label)} />
            <Field
              label="Enrolled"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5 text-success" />
                  {formatDate(s.enrollment_date ?? s.created_at)}
                </span>
              }
            />
          </Section>
        </TabsContent>

        <TabsContent value="finance" className="mt-4">
          <FinanceTab finance={finance} />
        </TabsContent>
        <TabsContent value="documents" className="mt-4">
          <DocumentsTab studentId={s.id} />
        </TabsContent>
        <TabsContent value="timeline" className="mt-4">
          <TimelineTab studentId={s.id} />
        </TabsContent>
      </Tabs>
    </>
  );
}

/** Read-only view of the application this student was converted from. */
function LinkedApplicationForm({ applicationId }: { applicationId: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["application", "detail", applicationId],
    queryFn: () => getApplication(applicationId),
  });
  if (isLoading) return <StatePanel icon={<RefreshCcw className="h-6 w-6 animate-spin text-muted-foreground/60" />} title="Loading application…" />;
  if (isError || !data) {
    return <StatePanel icon={<AlertTriangle className="h-6 w-6 text-destructive" />} title="Couldn't load the application form" />;
  }
  return <ApplicationFormTab app={data} canCorrect={false} onSaved={() => undefined} />;
}
