import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Ban,
  CheckCircle2,
  Clock,
  Link2,
  Loader2,
  Mail,
  RotateCcw,
  Send,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  getMagicLinkStatus,
  issueMagicLink,
  magicLinkKeys,
  reopenForm,
  revokeMagicLink,
  type MagicLinkStatus,
} from "@/lib/api/magic-link";
import { applicationKeys } from "@/lib/api/applications";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/applications/detail-dialogs";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtRelative(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

interface MagicLinkCardProps {
  appId: number;
  stage: string;
}

export function MagicLinkCard({ appId, stage }: MagicLinkCardProps) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<"revoke" | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);

  const statusQuery = useQuery({
    queryKey: magicLinkKeys.status(appId),
    queryFn: () => getMagicLinkStatus(appId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: magicLinkKeys.status(appId) });
    qc.invalidateQueries({ queryKey: applicationKeys.detail(appId) });
    qc.invalidateQueries({ queryKey: applicationKeys.timeline(appId) });
  };

  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Something went wrong.");

  const sendMutation = useMutation({
    mutationFn: (resend: boolean) => issueMagicLink(appId, resend),
    onSuccess: (r) => {
      toast.success(`Link sent to ${r.sent_to ?? "the applicant"}.`);
      invalidate();
    },
    onError,
  });
  const revokeMutation = useMutation({
    mutationFn: () => revokeMagicLink(appId),
    onSuccess: () => {
      toast.success("Link revoked.");
      setConfirm(null);
      invalidate();
    },
    onError,
  });

  const status = statusQuery.data;
  const busy = sendMutation.isPending || revokeMutation.isPending;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Link2 className="h-4 w-4 text-primary" /> Magic link
        </h3>
        {status?.progress && (
          <span className="text-xs font-semibold text-muted-foreground">
            {status.progress.completed} of {status.progress.total} steps
          </span>
        )}
      </div>

      {statusQuery.isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <StatusBody status={status} stage={stage} />
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {stage === "lead_added" && (
          <ActionBtn icon={<Send className="h-4 w-4" />} label="Send link" busy={busy} onClick={() => sendMutation.mutate(false)} primary />
        )}
        {stage === "form_pending" && (
          <>
            <ActionBtn icon={<RotateCcw className="h-4 w-4" />} label="Resend" busy={busy} onClick={() => sendMutation.mutate(true)} primary />
            {status?.active && (
              <ActionBtn icon={<Ban className="h-4 w-4" />} label="Revoke" busy={busy} onClick={() => setConfirm("revoke")} />
            )}
          </>
        )}
        {stage === "counsellor_review" && (
          <ActionBtn icon={<RotateCcw className="h-4 w-4" />} label="Reopen for student" busy={busy} onClick={() => setReopenOpen(true)} />
        )}
      </div>

      <ConfirmDialog
        open={confirm === "revoke"}
        title="Revoke the magic link?"
        description="The student's current link and any open session stop working immediately. You can send a new link afterwards."
        confirmLabel="Revoke"
        destructive
        pending={revokeMutation.isPending}
        onConfirm={() => revokeMutation.mutate()}
        onOpenChange={(o) => !o && setConfirm(null)}
      />

      <ReopenDialog appId={appId} open={reopenOpen} onOpenChange={setReopenOpen} onDone={invalidate} />
    </div>
  );
}

function StatusBody({ status, stage }: { status: MagicLinkStatus | undefined; stage: string }) {
  if (!status) return null;
  if (status.last_submitted_at && stage !== "form_pending" && stage !== "lead_added") {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4" /> Form submitted {fmtRelative(status.last_submitted_at)}
      </p>
    );
  }
  const active = status.active;
  if (!active) {
    return <p className="text-sm text-muted-foreground">No active link. Send one to invite the student to fill the form.</p>;
  }
  return (
    <div className="space-y-1.5 text-sm">
      <p className="inline-flex items-center gap-1.5 text-foreground">
        <Mail className="h-4 w-4 text-muted-foreground" /> Sent to <span className="font-semibold">{active.sent_to ?? "—"}</span>
      </p>
      <p className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Clock className="h-3.5 w-3.5" /> Expires {fmtDate(active.expires_at)}
      </p>
      <p className="text-xs text-muted-foreground">
        {active.open_count > 0
          ? `Opened ${active.open_count}×, last ${fmtRelative(active.last_opened_at)}`
          : "Not opened yet"}
      </p>
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  busy,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  busy: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={
        primary
          ? "inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-50"
          : "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-muted disabled:opacity-50"
      }
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function ReopenDialog({
  appId,
  open,
  onOpenChange,
  onDone,
}: {
  appId: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () => reopenForm(appId, reason.trim()),
    onSuccess: () => {
      toast.success("Form reopened — a new link was emailed to the student.");
      setReason("");
      onOpenChange(false);
      onDone();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not reopen the form."),
  });
  const valid = reason.trim().length >= 10;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reopen the form for the student</DialogTitle>
          <DialogDescription>
            The application returns to Form Pending and the student gets a fresh link. Your reason is shown to them as a
            banner on every section.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label htmlFor="reopen-reason" className="text-sm font-semibold text-foreground">
            Reason (10–500 characters)
          </label>
          <textarea
            id="reopen-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="e.g. Please re-upload a clearer photo of your marksheet."
          />
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!valid || mutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Reopen &amp; send link
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
