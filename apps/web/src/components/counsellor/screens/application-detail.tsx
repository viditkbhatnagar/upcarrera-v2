import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Lock,
  Mail,
  MapPin,
  Pause,
  Pencil,
  Phone,
  RefreshCcw,
  SearchX,
  User,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  acceptApplication,
  applicationKeys,
  convertApplication,
  getApplication,
  getPayments,
  markFormReceived,
  sendForm,
  type ApplicationDetail,
  type WorkflowAction,
} from "@/lib/api/applications";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAvatarUrl } from "@/hooks/use-avatar-url";
import { PIPELINE_STAGES, STAGE_META } from "@/components/applications/stage-model";
import { StageActionBar } from "@/components/applications/stage-action-bar";
import { MagicLinkCard } from "@/components/applications/magic-link-card";
import { ApplicationFormTab } from "@/components/applications/application-form-tab";
import { DocumentsTab } from "@/components/applications/documents-tab";
import { RegistrationFeeTab } from "@/components/applications/registration-fee-tab";
import { TimelineTab } from "@/components/applications/timeline-tab";
import { EditApplicationDialog } from "@/components/applications/edit-application-dialog";
import {
  ConfirmDialog,
  HoldDialog,
  ReopenDialog,
  ResumeDialog,
  SaReviewDialog,
} from "@/components/applications/detail-dialogs";
import {
  MismatchDialog,
  RecordPaymentDrawer,
  VerifyPaymentDialog,
} from "@/components/applications/payment-dialogs";
import { dash, formatDate, initials } from "@/components/applications/detail-ui";
import { Field, Section, StatePanel } from "@/components/counsellor/shared/info";
import { StageBadge } from "@/components/counsellor/shared/stage-badge";

type DialogKind = "reopen" | "hold" | "resume" | "sa" | "verify" | "mismatch" | "record" | null;
type ConfirmAction = Extract<WorkflowAction, "accept" | "send_form" | "mark_form_received" | "convert">;

const CONFIRM_COPY: Record<ConfirmAction, { title: string; description: string; confirmLabel: string }> = {
  accept: {
    title: "Accept application?",
    description: "The application moves to Registration Fee so the fee can be recorded.",
    confirmLabel: "Accept",
  },
  send_form: {
    title: "Send the application form?",
    description: "Marks the form as sent and moves the lead to Form Pending.",
    confirmLabel: "Send form",
  },
  mark_form_received: {
    title: "Mark the form as received?",
    description: "Moves the application into Counsellor Review.",
    confirmLabel: "Mark received",
  },
  convert: {
    title: "Convert to student?",
    description: "Creates the student record from this application. This cannot be undone.",
    confirmLabel: "Convert",
  },
};

function numericId(param: string): number | null {
  if (!/^\d+$/.test(param)) return null;
  const n = Number(param);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function displayId(app: ApplicationDetail): string {
  return app.custom_application_id?.trim() || app.enrollment_id?.trim() || `APP-${app.application_id}`;
}

/**
 * Lead View (Naji's design) wired to the real application workflow:
 *   GET /applications/:id            -> header, overview, pipeline, allowed actions
 *   GET /applications/:id/payments   -> Payment tab
 *   timeline / documents / form tabs -> their existing sub-resource endpoints
 * Workflow actions (send form, record payment, review, hold ...) keep their
 * existing endpoints; the buttons are rendered from the server's allowed_actions.
 */
export function CounsellorApplicationDetail({ appId }: { appId: string }) {
  const id = numericId(appId);
  const qc = useQueryClient();

  const { data: app, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: id != null ? applicationKeys.detail(id) : ["application", "detail", "invalid"],
    queryFn: () => getApplication(id as number),
    enabled: id != null,
    retry: (count, err) => !(err instanceof ApiError && [403, 404].includes(err.status)) && count < 2,
  });
  const paymentsQuery = useQuery({
    queryKey: id != null ? applicationKeys.payments(id) : ["application", "payments", "invalid"],
    queryFn: () => getPayments(id as number),
    enabled: id != null && !!app,
  });

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [tab, setTab] = useState("overview");
  const avatarUrl = useAvatarUrl(app?.profile_picture);

  const invalidateAll = () => {
    if (id == null) return;
    qc.invalidateQueries({ queryKey: applicationKeys.detail(id) });
    qc.invalidateQueries({ queryKey: applicationKeys.timeline(id) });
    qc.invalidateQueries({ queryKey: applicationKeys.documents(id) });
    qc.invalidateQueries({ queryKey: applicationKeys.payments(id) });
    qc.invalidateQueries({ queryKey: applicationKeys.list });
    qc.invalidateQueries({ queryKey: applicationKeys.queue });
  };

  const confirmMutation = useMutation({
    mutationFn: (action: ConfirmAction) => {
      if (id == null) throw new ApiError("Invalid application.", 400);
      switch (action) {
        case "accept":
          return acceptApplication(id);
        case "send_form":
          return sendForm(id);
        case "mark_form_received":
          return markFormReceived(id);
        case "convert":
          return convertApplication(id);
      }
    },
    onSuccess: () => {
      toast.success("Done.");
      setConfirm(null);
      invalidateAll();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not complete the action."),
  });

  const pendingPaymentId = paymentsQuery.data?.items.find((p) => p.status === "pending")?.id ?? null;

  const onAction = (action: WorkflowAction) => {
    switch (action) {
      case "verify":
      case "mismatch":
        if (pendingPaymentId == null) {
          toast.error("The recorded payment is still loading. Try again in a moment.");
          return;
        }
        setDialog(action);
        return;
      case "reopen":
      case "hold":
      case "resume":
        setDialog(action);
        return;
      case "approve":
        setDialog("sa");
        return;
      case "record_payment":
        setDialog("record");
        return;
      case "accept":
      case "send_form":
      case "mark_form_received":
      case "convert":
        setConfirm(action);
        return;
      default:
        return;
    }
  };

  const crumb = (
    <div className="flex items-center gap-2 text-sm">
      <Link to="/students/applications" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All Applications
      </Link>
      <span className="text-muted-foreground">/</span>
      <span className="font-mono text-xs">{app ? displayId(app) : appId}</span>
    </div>
  );

  if (id == null) return <>{crumb}<NotFound /></>;
  if (isLoading) {
    return (
      <>
        {crumb}
        <StatePanel icon={<RefreshCcw className="h-7 w-7 animate-spin text-muted-foreground/60" />} title="Loading application…" />
      </>
    );
  }
  if (isError) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <>
          {crumb}
          <StatePanel
            icon={<Lock className="h-7 w-7 text-warning" />}
            title="Access denied"
            hint="This application is outside your record-access scope."
          />
        </>
      );
    }
    if (error instanceof ApiError && error.status === 404) return <>{crumb}<NotFound /></>;
    return (
      <>
        {crumb}
        <StatePanel
          icon={<AlertTriangle className="h-7 w-7 text-destructive" />}
          title="Couldn't load the application"
          hint={error instanceof Error ? error.message : "Please try again."}
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      </>
    );
  }
  if (!app) return <>{crumb}<NotFound /></>;

  const stage = app.effective_stage;
  const name = app.applicant_name ?? app.name;
  const email = app.applicant_email ?? app.email;
  const phone = app.applicant_phone ?? app.phone;
  const location = [app.district, app.state].filter(Boolean).join(", ");
  const rejected = stage === "rejected";
  const currentIdx = rejected ? -1 : PIPELINE_STAGES.indexOf(stage);
  const showForm = STAGE_META[stage].no >= 3 || rejected;

  return (
    <>
      {crumb}

      <Card className="p-6 shadow-[var(--shadow-soft)] border-border/70">
        <div className="flex flex-wrap items-start gap-5">
          <Avatar className="h-16 w-16">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={dash(name)} className="object-cover" />}
            <AvatarFallback className="bg-[image:var(--gradient-primary)] text-primary-foreground text-lg font-semibold">
              {initials(name, `A${app.application_id}`)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">{dash(name)}</h1>
              <StageBadge stage={stage} />
              {app.on_hold && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning-foreground">
                  <Pause className="h-3 w-3" /> On hold
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">{displayId(app)}</span>
              {phone && (
                <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {phone}</span>
              )}
              {email && (
                <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {email}</span>
              )}
              {location && (
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {location}</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" disabled={isFetching} onClick={() => refetch()}>
              <RefreshCcw className={cn("h-4 w-4", isFetching && "animate-spin")} /> Refresh
            </Button>
          </div>
        </div>

        <div className="mt-7">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Pipeline Progress
            {rejected && <span className="ml-2 normal-case text-destructive">· Application rejected</span>}
          </p>
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {PIPELINE_STAGES.map((s, i) => {
              const done = i < currentIdx;
              const active = i === currentIdx;
              return (
                <div key={s} className="flex items-center flex-1 min-w-fit">
                  <div className="flex flex-col items-center gap-1.5 flex-1">
                    <div
                      className={cn(
                        "h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold border-2",
                        done && "bg-success text-success-foreground border-success",
                        active && "bg-primary text-primary-foreground border-primary ring-4 ring-primary-soft",
                        !done && !active && "bg-card text-muted-foreground border-border",
                      )}
                    >
                      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <span
                      className={cn(
                        "text-[10px] text-center whitespace-nowrap",
                        active ? "font-semibold text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {STAGE_META[s].label}
                    </span>
                  </div>
                  {i < PIPELINE_STAGES.length - 1 && (
                    <div className={cn("h-0.5 flex-1 min-w-6 -mt-5", done ? "bg-success" : "bg-border")} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <StageActionBar
        actions={app.allowed_actions}
        onAction={onAction}
        disabledActions={pendingPaymentId == null ? ["verify", "mismatch"] : []}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/60 max-w-full h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="payment">Payment</TabsTrigger>
          {showForm && <TabsTrigger value="application">Application</TabsTrigger>}
          {showForm && <TabsTrigger value="documents">Documents</TabsTrigger>}
          <TabsTrigger value="timeline">Activity Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-6">
          <MagicLinkCard appId={app.application_id} stage={stage} />
          <Section title="Personal & Contact Information" icon={User}>
            <Field label="Name" value={dash(name)} />
            <Field label="Email ID" value={dash(email)} />
            <Field label="Phone" value={dash(phone)} />
            <Field label="WhatsApp" value={dash(app.whatsapp_no)} />
            <Field label="Date of birth" value={formatDate(app.dob)} />
            <Field label="Gender" value={dash(app.gender)} />
            <Field label="Location" value={dash(location)} />
          </Section>
          <Section title="Course Information" icon={FileText}>
            <Field label="University" value={dash(app.university_title)} />
            <Field label="Course" value={dash(app.course_title)} />
            <Field label="Intake" value={dash(app.intake_name ?? app.session_title)} />
            <Field label="Source" value={dash(app.source)} />
            <Field label="Counsellor" value={dash(app.owner.consultant_name)} />
            <Field label="Created" value={formatDate(app.created_at)} />
            <Field label="Days in stage" value={String(app.days_in_stage)} />
          </Section>
          {app.hold && (
            <Section title="On hold" icon={Pause}>
              <Field label="Since" value={formatDate(app.hold.at)} />
              <Field label="Follow-up" value={formatDate(app.hold.followup_date)} />
              <Field label="Reason" value={dash(app.hold.reason)} />
            </Section>
          )}
        </TabsContent>

        <TabsContent value="payment" className="mt-4">
          <RegistrationFeeTab
            payments={paymentsQuery.data?.items ?? []}
            legacyFee={paymentsQuery.data?.legacy_fee ?? null}
            loading={paymentsQuery.isLoading}
            error={paymentsQuery.isError ? paymentsQuery.error : null}
            canRecord={app.allowed_actions.includes("record_payment")}
            onRecordPayment={() => setDialog("record")}
          />
        </TabsContent>

        {showForm && (
          <TabsContent value="application" className="mt-4">
            <ApplicationFormTab
              app={app}
              canCorrect={app.allowed_actions.includes("correct")}
              onSaved={invalidateAll}
            />
          </TabsContent>
        )}
        {showForm && (
          <TabsContent value="documents" className="mt-4">
            <DocumentsTab
              appId={app.application_id}
              canReview={app.allowed_actions.includes("approve")}
              onChanged={invalidateAll}
            />
          </TabsContent>
        )}
        <TabsContent value="timeline" className="mt-4">
          <TimelineTab appId={app.application_id} />
        </TabsContent>
      </Tabs>

      <EditApplicationDialog
        applicationId={editOpen ? app.application_id : null}
        displayId={displayId(app)}
        onClose={() => {
          setEditOpen(false);
          invalidateAll();
        }}
      />
      <ReopenDialog appId={app.application_id} open={dialog === "reopen"} onOpenChange={(o) => setDialog(o ? "reopen" : null)} onSuccess={invalidateAll} />
      <HoldDialog appId={app.application_id} open={dialog === "hold"} onOpenChange={(o) => setDialog(o ? "hold" : null)} onSuccess={invalidateAll} />
      <ResumeDialog appId={app.application_id} open={dialog === "resume"} onOpenChange={(o) => setDialog(o ? "resume" : null)} onSuccess={invalidateAll} />
      <SaReviewDialog appId={app.application_id} open={dialog === "sa"} onOpenChange={(o) => setDialog(o ? "sa" : null)} onSuccess={invalidateAll} />
      <RecordPaymentDrawer
        appId={app.application_id}
        open={dialog === "record"}
        expectedAmount={null}
        onOpenChange={(o) => setDialog(o ? "record" : null)}
        onSuccess={invalidateAll}
      />
      <VerifyPaymentDialog paymentId={pendingPaymentId} open={dialog === "verify"} onOpenChange={(o) => setDialog(o ? "verify" : null)} onSuccess={invalidateAll} />
      <MismatchDialog paymentId={pendingPaymentId} open={dialog === "mismatch"} onOpenChange={(o) => setDialog(o ? "mismatch" : null)} onSuccess={invalidateAll} />
      {confirm && (
        <ConfirmDialog
          open
          title={CONFIRM_COPY[confirm].title}
          description={CONFIRM_COPY[confirm].description}
          confirmLabel={CONFIRM_COPY[confirm].confirmLabel}
          pending={confirmMutation.isPending}
          onConfirm={() => confirmMutation.mutate(confirm)}
          onOpenChange={(o) => !o && setConfirm(null)}
        />
      )}
    </>
  );
}

function NotFound() {
  return (
    <StatePanel
      icon={<SearchX className="h-7 w-7 text-muted-foreground/70" />}
      title="Application not found"
      hint="It may have been deleted, or the link is incorrect."
    />
  );
}
