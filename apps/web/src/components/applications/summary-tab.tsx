// Summary tab: the applicant snapshot, programme, owner, stage telemetry and the
// hold block. Pure presentation of the GET /applications/:id payload.
import {
  Mail,
  Phone,
  MessageCircle,
  Building2,
  BookOpen,
  CalendarRange,
  User as UserIcon,
  Pause,
  Clock,
  MapPin,
} from "lucide-react";
import type { ApplicationDetail } from "@/lib/api/applications";
import { STAGE_META } from "./stage-model";
import { SectionCard, InfoRow, dash, formatDate, formatDateTime } from "./detail-ui";

export function SummaryTab({ app }: { app: ApplicationDetail }) {
  const meta = STAGE_META[app.effective_stage];
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <SectionCard title="Applicant" icon={<UserIcon className="h-4 w-4" />}>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
            <InfoRow label="Full name">{dash(app.applicant_name ?? app.name)}</InfoRow>
            <InfoRow label="Date of birth">{formatDate(app.dob)}</InfoRow>
            <InfoRow label="Email">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                {dash(app.applicant_email ?? app.email)}
              </span>
            </InfoRow>
            <InfoRow label="Phone">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                {dash(app.applicant_phone ?? app.phone)}
              </span>
            </InfoRow>
            <InfoRow label="WhatsApp">
              {app.whatsapp_no ? (
                <span className="inline-flex items-center gap-1.5">
                  <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                  {app.whatsapp_no}
                </span>
              ) : (
                "—"
              )}
            </InfoRow>
            <InfoRow label="Gender">{dash(app.gender)}</InfoRow>
            <InfoRow label="Location">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                {[app.district, app.state].filter(Boolean).join(", ") || "—"}
              </span>
            </InfoRow>
            <InfoRow label="Source">{dash(app.source)}</InfoRow>
          </dl>
          {app.address && (
            <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-sm text-foreground">
              {app.address}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Programme" icon={<BookOpen className="h-4 w-4" />}>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
            <InfoRow label="University">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                {dash(app.university_title)}
              </span>
            </InfoRow>
            <InfoRow label="Course">{dash(app.course_title)}</InfoRow>
            <InfoRow label="Intake">
              <span className="inline-flex items-center gap-1.5">
                <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
                {dash(app.session_title)}
              </span>
            </InfoRow>
            <InfoRow label="ABC ID">{dash(app.abc_id)}</InfoRow>
          </dl>
        </SectionCard>
      </div>

      <div className="space-y-5">
        <SectionCard title="Stage" icon={<Clock className="h-4 w-4" />}>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${meta.badge}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
            {app.stage_source === "legacy" && (
              <span className="text-[11px] font-medium text-muted-foreground">legacy</span>
            )}
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1">
            <InfoRow label="Days in stage">{app.days_in_stage}</InfoRow>
            <InfoRow label="Created">{formatDate(app.created_at)}</InfoRow>
            <InfoRow label="Status">{dash(app.status_label)}</InfoRow>
          </dl>
        </SectionCard>

        <SectionCard title="Owner" icon={<UserIcon className="h-4 w-4" />}>
          <InfoRow label="Counsellor">{dash(app.owner.consultant_name)}</InfoRow>
        </SectionCard>

        {app.hold && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-card dark:border-amber-500/30 dark:bg-amber-500/10">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
              <Pause className="h-4 w-4" /> On hold
            </div>
            <dl className="mt-2 space-y-1">
              <InfoRow label="Since">{formatDateTime(app.hold.at)}</InfoRow>
              <InfoRow label="Follow-up">{formatDate(app.hold.followup_date)}</InfoRow>
              {app.hold.reason && <InfoRow label="Reason">{app.hold.reason}</InfoRow>}
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}
