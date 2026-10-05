// Stage-action dialogs for the application detail page: reopen, hold, resume, the
// Student Affairs review (four checks + approve / send back / reject), and a
// generic confirm for the no-input transitions (send form, mark received, accept,
// convert). Each owns its mutation and reports success so the page can refetch.
import { useEffect, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  reopenApplication,
  holdApplication,
  resumeApplication,
  saReview,
} from "@/lib/api/applications";
import { istTodayIso } from "@/lib/date";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

interface ActionDialogProps {
  appId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

/* ------------------------------------------------------------------ *
 * Generic confirm — the transitions that need no extra input.
 * ------------------------------------------------------------------ */

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  pending: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive,
  pending,
  onConfirm,
  onOpenChange,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Reopen — send the student back to the form (reason shown to them).
 * ------------------------------------------------------------------ */

export function ReopenDialog({ appId, open, onOpenChange, onSuccess }: ActionDialogProps) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => reopenApplication(appId, reason.trim()),
    onSuccess: () => {
      toast.success("Application reopened and returned to the form stage.");
      onOpenChange(false);
      onSuccess();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not reopen the application.")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reopen application</DialogTitle>
          <DialogDescription>
            The student returns to the application form. Your reason is shown to them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label htmlFor="reopen-reason">
            Reason <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="reopen-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="What should the student correct or add?"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={reason.trim().length < 3 || mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Reopen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Hold — pause the application with a reason and a follow-up date.
 * ------------------------------------------------------------------ */

export function HoldDialog({ appId, open, onOpenChange, onSuccess }: ActionDialogProps) {
  const [reason, setReason] = useState("");
  const [followup, setFollowup] = useState(istTodayIso());
  useEffect(() => {
    if (open) {
      setReason("");
      setFollowup(istTodayIso());
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => holdApplication(appId, { reason: reason.trim(), followup_date: followup }),
    onSuccess: () => {
      toast.success("Application put on hold.");
      onOpenChange(false);
      onSuccess();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not put the application on hold.")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Put application on hold</DialogTitle>
          <DialogDescription>
            The stage is kept. Resume returns it to the same stage and owner.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="hold-reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="hold-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this on hold?"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hold-followup">
              Follow-up date <span className="text-destructive">*</span>
            </Label>
            <Input
              id="hold-followup"
              type="date"
              min={istTodayIso()}
              value={followup}
              onChange={(e) => setFollowup(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={reason.trim().length < 3 || !followup || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Put on hold
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Resume — lift a hold (optional note).
 * ------------------------------------------------------------------ */

export function ResumeDialog({ appId, open, onOpenChange, onSuccess }: ActionDialogProps) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => resumeApplication(appId, reason.trim() || undefined),
    onSuccess: () => {
      toast.success("Application resumed.");
      onOpenChange(false);
      onSuccess();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not resume the application.")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resume application</DialogTitle>
          <DialogDescription>
            It returns to the same stage and owner it was held at.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label htmlFor="resume-reason">Note (optional)</Label>
          <Textarea
            id="resume-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Anything worth recording"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Resume
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Student Affairs review — four checks + approve / send back / reject.
 * ------------------------------------------------------------------ */

const SA_CHECKS = [
  { key: "identity_ok", label: "Identity verified", hint: "Photo ID matches the applicant" },
  { key: "eligibility_ok", label: "Eligibility met", hint: "Qualifications satisfy the programme" },
  { key: "legible_ok", label: "Documents legible", hint: "Every uploaded document is readable" },
  { key: "program_ok", label: "Programme correct", hint: "University, course and intake are right" },
] as const;

type CheckKey = (typeof SA_CHECKS)[number]["key"];
type Decision = "approve" | "send_back" | "reject";

export function SaReviewDialog({ appId, open, onOpenChange, onSuccess }: ActionDialogProps) {
  const [checks, setChecks] = useState<Record<CheckKey, boolean>>({
    identity_ok: false,
    eligibility_ok: false,
    legible_ok: false,
    program_ok: false,
  });
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);

  useEffect(() => {
    if (open) {
      setChecks({ identity_ok: false, eligibility_ok: false, legible_ok: false, program_ok: false });
      setReason("");
      setDecision(null);
    }
  }, [open]);

  const allChecked = SA_CHECKS.every((c) => checks[c.key]);

  const mutation = useMutation({
    mutationFn: (d: Decision) =>
      saReview(appId, {
        ...checks,
        decision: d,
        reason: reason.trim() || undefined,
      }),
    onSuccess: (data) => {
      if (data.decision === "approved") {
        toast.success(
          data.student_no
            ? `Approved. Student ${data.student_no} created.`
            : "Application approved and converted.",
        );
      } else if (data.decision === "sent_back") {
        toast.success("Sent back to the counsellor for review.");
      } else {
        toast.success("Application rejected.");
      }
      onOpenChange(false);
      onSuccess();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not record the review.")),
  });

  const submit = (d: Decision) => {
    setDecision(d);
    mutation.mutate(d);
  };

  const pendingFor = (d: Decision) => mutation.isPending && decision === d;
  const reasonMissing = reason.trim() === "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Student Affairs review</DialogTitle>
          <DialogDescription>
            All four checks must pass to approve. A reason is required to send back or reject.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <fieldset className="space-y-2.5">
            {SA_CHECKS.map((c) => (
              <label
                key={c.key}
                htmlFor={`sa-${c.key}`}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-3 transition hover:bg-muted/50"
              >
                <Checkbox
                  id={`sa-${c.key}`}
                  checked={checks[c.key]}
                  onCheckedChange={(v) =>
                    setChecks((prev) => ({ ...prev, [c.key]: v === true }))
                  }
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{c.label}</span>
                  <span className="block text-xs text-muted-foreground">{c.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="sa-reason">Reason / note</Label>
            <Textarea
              id="sa-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Required to send back or reject"
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="destructive"
            onClick={() => submit("reject")}
            disabled={reasonMissing || mutation.isPending}
          >
            {pendingFor("reject") && <Loader2 className="h-4 w-4 animate-spin" />}
            Reject
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => submit("send_back")}
              disabled={reasonMissing || mutation.isPending}
            >
              {pendingFor("send_back") && <Loader2 className="h-4 w-4 animate-spin" />}
              Send back
            </Button>
            <Button
              onClick={() => submit("approve")}
              disabled={!allChecked || mutation.isPending}
              title={allChecked ? undefined : "Tick all four checks to approve"}
            >
              {pendingFor("approve") && <Loader2 className="h-4 w-4 animate-spin" />}
              Approve
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
