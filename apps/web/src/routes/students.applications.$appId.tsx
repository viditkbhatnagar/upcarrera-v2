import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  RefreshCcw,
  AlertTriangle,
  Lock,
  SearchX,
  Mail,
  Phone,
  Pause,
  Loader2,
  FileText,
  User as UserIcon,
  Wallet,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import {
  getApplication,
  getPayments,
  acceptApplication,
  sendForm,
  markFormReceived,
  convertApplication,
  applicationKeys,
  type ApplicationDetail,
  type WorkflowAction,
} from "@/lib/api/applications";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { STAGE_META } from "@/components/applications/stage-model";
import { StageStepper } from "@/components/applications/stage-stepper";
import { StageActionBar } from "@/components/applications/stage-action-bar";
import { SummaryTab } from "@/components/applications/summary-tab";
import { MagicLinkCard } from "@/components/applications/magic-link-card";
import { ApplicationFormTab } from "@/components/applications/application-form-tab";
import { DocumentsTab } from "@/components/applications/documents-tab";
import { RegistrationFeeTab } from "@/components/applications/registration-fee-tab";
import { TimelineTab } from "@/components/applications/timeline-tab";
import {
  ReopenDialog,
  HoldDialog,
  ResumeDialog,
  SaReviewDialog,
  ConfirmDialog,
} from "@/components/applications/detail-dialogs";
import {
  RecordPaymentDrawer,
  VerifyPaymentDialog,
  MismatchDialog,
} from "@/components/applications/payment-dialogs";
import { dash, initials } from "@/components/applications/detail-ui";

export const Route = createFileRoute("/students/applications/$appId")({
  head: () => ({ meta: [{ title: "Application Profile — upCarrera" }] }),
  component: ApplicationProfilePage,
});

/**
 * The route param is the numeric application_id (the list links by it). Accept ONLY
 * an all-digits param: a custom id like `UCA-2025-0042` must NOT be coerced to a
 * numeric id (previously the last digit-run won, so it opened application 42) — it
 * resolves to null and the page shows Not Found.
 */
function numericId(param: string): number | null {
  if (!/^\d+$/.test(param)) return null;
  const n = Number(param);
  return Number.isInteger(n) && n > 0 ? n : null;
}

type DialogKind =
  | "reopen"
  | "hold"
  | "resume"
  | "sa"
  | "verify"
  | "mismatch"
  | "record"
  | null;

type ConfirmAction = Extract<
  WorkflowAction,
  "accept" | "send_form" | "mark_form_received" | "convert"
>;

const CONFIRM_COPY: Record<
  ConfirmAction,
  { title: string; description: string; confirmLabel: string; destructive?: boolean }
> = {
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

function ApplicationProfilePage() {
  const { appId } = Route.useParams();
  const id = numericId(appId);
  const qc = useQueryClient();

  const {
    data: app,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useQuery({
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
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not complete the action."),
  });

  const pendingPaymentId =
    paymentsQuery.data?.items.find((p) => p.status === "pending")?.id ?? null;

  const onAction = (action: WorkflowAction) => {
    switch (action) {
      case "verify":
      case "mismatch":
        // Both act on the pending registration-fee entry; until that id has loaded
        // (or if the payments query errored) there is nothing to verify/flag, so the
        // action bar disables them and this guards the path if it is reached anyway.
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/students/applications" className="hover:text-foreground">
            Applications
          </Link>
          <span aria-hidden>/</span>
          <span className="font-mono font-semibold text-foreground">
            {app ? displayId(app) : appId}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/students/applications"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
          {app && (
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted disabled:opacity-50"
            >
              <RefreshCcw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} /> Refresh
            </button>
          )}
        </div>
      </div>

      {id == null ? (
        <NotFoundPanel />
      ) : isLoading ? (
        <LoadingPanel />
      ) : isError ? (
        error instanceof ApiError && error.status === 403 ? (
          <AccessDeniedPanel />
        ) : error instanceof ApiError && error.status === 404 ? (
          <NotFoundPanel />
        ) : (
          <ErrorPanel message={error instanceof Error ? error.message : "Please try again."} onRetry={() => refetch()} />
        )
      ) : !app ? (
        <NotFoundPanel />
      ) : (
        <>
          <ApplicationHeader app={app} />
          <StageStepper
            stage={app.effective_stage}
            stageNo={app.stage_no}
            stageSource={app.stage_source}
            onHold={app.on_hold}
            daysInStage={app.days_in_stage}
          />
          <StageActionBar
            actions={app.allowed_actions}
            onAction={onAction}
            disabledActions={pendingPaymentId == null ? ["verify", "mismatch"] : []}
          />

          <Tabs defaultValue="summary">
            <TabsList className="flex-wrap">
              <TabsTrigger value="summary">
                <UserIcon className="mr-1.5 h-4 w-4" /> Summary
              </TabsTrigger>
              <TabsTrigger value="form">
                <FileText className="mr-1.5 h-4 w-4" /> Application Form
              </TabsTrigger>
              <TabsTrigger value="documents">
                <FileText className="mr-1.5 h-4 w-4" /> Documents
              </TabsTrigger>
              <TabsTrigger value="fee">
                <Wallet className="mr-1.5 h-4 w-4" /> Registration Fee
              </TabsTrigger>
              <TabsTrigger value="timeline">
                <History className="mr-1.5 h-4 w-4" /> Timeline
              </TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="mt-5 space-y-5">
              <MagicLinkCard appId={app.application_id} stage={app.effective_stage} />
              <SummaryTab app={app} />
            </TabsContent>
            <TabsContent value="form" className="mt-5">
              <ApplicationFormTab
                app={app}
                canCorrect={app.allowed_actions.includes("correct")}
                onSaved={invalidateAll}
              />
            </TabsContent>
            <TabsContent value="documents" className="mt-5">
              <DocumentsTab
                appId={app.application_id}
                canReview={app.allowed_actions.includes("approve")}
                onChanged={invalidateAll}
              />
            </TabsContent>
            <TabsContent value="fee" className="mt-5">
              <RegistrationFeeTab
                payments={paymentsQuery.data?.items ?? []}
                legacyFee={paymentsQuery.data?.legacy_fee ?? null}
                loading={paymentsQuery.isLoading}
                error={paymentsQuery.isError ? paymentsQuery.error : null}
                canRecord={app.allowed_actions.includes("record_payment")}
                onRecordPayment={() => setDialog("record")}
              />
            </TabsContent>
            <TabsContent value="timeline" className="mt-5">
              <TimelineTab appId={app.application_id} />
            </TabsContent>
          </Tabs>

          {/* Dialogs */}
          <ReopenDialog
            appId={app.application_id}
            open={dialog === "reopen"}
            onOpenChange={(o) => setDialog(o ? "reopen" : null)}
            onSuccess={invalidateAll}
          />
          <HoldDialog
            appId={app.application_id}
            open={dialog === "hold"}
            onOpenChange={(o) => setDialog(o ? "hold" : null)}
            onSuccess={invalidateAll}
          />
          <ResumeDialog
            appId={app.application_id}
            open={dialog === "resume"}
            onOpenChange={(o) => setDialog(o ? "resume" : null)}
            onSuccess={invalidateAll}
          />
          <SaReviewDialog
            appId={app.application_id}
            open={dialog === "sa"}
            onOpenChange={(o) => setDialog(o ? "sa" : null)}
            onSuccess={invalidateAll}
          />
          <RecordPaymentDrawer
            appId={app.application_id}
            open={dialog === "record"}
            expectedAmount={null}
            onOpenChange={(o) => setDialog(o ? "record" : null)}
            onSuccess={invalidateAll}
          />
          <VerifyPaymentDialog
            paymentId={pendingPaymentId}
            open={dialog === "verify"}
            onOpenChange={(o) => setDialog(o ? "verify" : null)}
            onSuccess={invalidateAll}
          />
          <MismatchDialog
            paymentId={pendingPaymentId}
            open={dialog === "mismatch"}
            onOpenChange={(o) => setDialog(o ? "mismatch" : null)}
            onSuccess={invalidateAll}
          />
          {confirm && (
            <ConfirmDialog
              open
              title={CONFIRM_COPY[confirm].title}
              description={CONFIRM_COPY[confirm].description}
              confirmLabel={CONFIRM_COPY[confirm].confirmLabel}
              destructive={CONFIRM_COPY[confirm].destructive}
              pending={confirmMutation.isPending}
              onConfirm={() => confirmMutation.mutate(confirm)}
              onOpenChange={(o) => !o && setConfirm(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

function displayId(app: ApplicationDetail): string {
  return (
    app.custom_application_id?.trim() ||
    app.enrollment_id?.trim() ||
    `APP-${app.application_id}`
  );
}

function ApplicationHeader({ app }: { app: ApplicationDetail }) {
  const meta = STAGE_META[app.effective_stage];
  const name = app.applicant_name ?? app.name;
  return (
    <header className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="flex flex-wrap items-start gap-4">
        {app.profile_picture ? (
          <img
            src={app.profile_picture}
            alt={dash(name)}
            className="h-16 w-16 shrink-0 rounded-2xl object-cover"
          />
        ) : (
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary/10 text-lg font-bold text-primary">
            {initials(name, `A${app.application_id}`)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{dash(name)}</h1>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
                meta.badge,
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
              {meta.label}
            </span>
            {app.on_hold && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
                <Pause className="h-3 w-3" /> On hold
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="font-mono text-xs font-semibold text-primary">{displayId(app)}</span>
            {(app.applicant_email ?? app.email) && (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> {app.applicant_email ?? app.email}
              </span>
            )}
            {(app.applicant_phone ?? app.phone) && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> {app.applicant_phone ?? app.phone}
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-right sm:grid-cols-3">
          <HeaderStat label="Course" value={dash(app.course_title)} />
          <HeaderStat label="Intake" value={dash(app.intake_name ?? app.session_title)} />
          <HeaderStat label="Counsellor" value={dash(app.owner.consultant_name)} />
        </div>
      </div>
    </header>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-left">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="truncate text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

/* ---------------- States ---------------- */

function LoadingPanel() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface px-6 py-20 text-center shadow-card">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
      <div className="text-sm font-semibold text-foreground">Loading application…</div>
    </div>
  );
}

function AccessDeniedPanel() {
  return (
    <StatePanel
      icon={<Lock className="h-10 w-10 text-amber-500" />}
      title="Access denied"
      hint="This application is outside your record-access scope. Ask an administrator if you believe you should see it."
    />
  );
}

function NotFoundPanel() {
  return (
    <StatePanel
      icon={<SearchX className="h-10 w-10 text-muted-foreground/60" />}
      title="Application not found"
      hint="It may have been deleted, or the link is incorrect."
    />
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <StatePanel
      icon={<AlertTriangle className="h-10 w-10 text-destructive/70" />}
      title="Couldn't load the application"
      hint={message}
      action={
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover"
        >
          <RefreshCcw className="h-4 w-4" /> Try again
        </button>
      }
    />
  );
}

function StatePanel({
  icon,
  title,
  hint,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface px-6 py-20 text-center shadow-card">
      <div className="grid h-20 w-20 place-items-center rounded-3xl bg-muted">{icon}</div>
      <div className="text-base font-semibold text-foreground">{title}</div>
      <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>
      {action}
    </div>
  );
}
