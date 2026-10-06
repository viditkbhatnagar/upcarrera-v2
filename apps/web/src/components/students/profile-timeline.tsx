// Timeline tab of the student profile (QA ST01).
//
// Built by GET /students/:id/timeline from timestamps the records really hold —
// application created/converted, student record, enrolment, fee installments,
// invoices, documents, dropout, last edit. Nothing is invented: a student with
// few records gets a short timeline, and one with none gets an empty state.

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  FilePlus2,
  GraduationCap,
  Pencil,
  Receipt,
  UserMinus,
  UserPlus,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/api";
import type { ApiTimeline, ApiTimelineEvent } from "./profile-types";
import { EmptyTab, SectionCard, TabError, TabLoading, errorText, formatDateTime } from "./profile-ui";

const EVENT_STYLE: Record<ApiTimelineEvent["type"], { icon: LucideIcon; tone: string }> = {
  application_created: { icon: FilePlus2, tone: "bg-sky-100 text-sky-700" },
  application_converted: { icon: UserPlus, tone: "bg-primary/10 text-primary" },
  student_created: { icon: UserPlus, tone: "bg-primary/10 text-primary" },
  enrolled: { icon: GraduationCap, tone: "bg-emerald-100 text-emerald-700" },
  course_enrolment: { icon: BookOpen, tone: "bg-emerald-100 text-emerald-700" },
  payment_received: { icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700" },
  installment_scheduled: { icon: Clock, tone: "bg-orange-100 text-orange-700" },
  invoice_issued: { icon: Receipt, tone: "bg-slate-100 text-slate-700" },
  invoice_payment: { icon: Wallet, tone: "bg-emerald-100 text-emerald-700" },
  document_uploaded: { icon: FileText, tone: "bg-slate-100 text-slate-700" },
  dropout: { icon: UserMinus, tone: "bg-red-100 text-red-700" },
  profile_updated: { icon: Pencil, tone: "bg-slate-100 text-slate-700" },
};

/**
 * DATE columns (enrolment date, an installment's paid date) arrive as UTC
 * midnight and carry no time of day; show them as dates, not "05:30 am".
 */
function when(e: ApiTimelineEvent): string {
  if (e.type === "enrolled" || /T00:00:00(\.000)?Z$/.test(e.at)) {
    const d = new Date(e.at);
    return Number.isNaN(d.getTime())
      ? e.at
      : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }
  return formatDateTime(e.at);
}

export function TimelineTab({ studentId }: { studentId: number }) {
  const query = useQuery({
    queryKey: ["student-detail", studentId, "timeline"],
    queryFn: () => apiGet<ApiTimeline>(`/students/${studentId}/timeline`),
  });

  if (query.isLoading) return <TabLoading label="Loading timeline…" />;
  if (query.isError) {
    return (
      <TabError
        message={errorText(query.error, "The timeline could not be loaded.")}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const events = query.data?.items ?? [];
  if (events.length === 0) {
    return (
      <EmptyTab
        icon={Activity}
        title="No recorded activity"
        description="This student's records carry no dated events yet."
      />
    );
  }

  return (
    <SectionCard title="Timeline" icon={Activity}>
      <ol className="relative space-y-4 border-l border-border pl-6">
        {events.map((e) => {
          const style = EVENT_STYLE[e.type] ?? EVENT_STYLE.profile_updated;
          const Icon = style.icon;
          return (
            <li key={e.key} className="relative">
              <span
                className={cn(
                  "absolute -left-[37px] flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-surface",
                  style.tone,
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="text-sm font-semibold text-foreground">{e.title}</div>
              <div className="text-xs text-muted-foreground">
                {when(e)}
                {e.actor_name ? ` · ${e.actor_name}` : ""}
                {e.detail ? ` · ${e.detail}` : ""}
              </div>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}
