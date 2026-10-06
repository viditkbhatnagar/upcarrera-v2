// Registration-fee dialogs shared by the application detail page and the Accounts
// queue: record a fee (multipart proof), verify it, flag a mismatch, and an inline
// proof preview. Each dialog owns its mutation and reports success to the parent,
// which decides which queries to refetch.
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Upload, FileText, AlertTriangle } from "lucide-react";
import { ApiError, apiFileBlobUrl } from "@/lib/api";
import {
  recordPayment,
  verifyPayment,
  mismatchPayment,
  paymentProofUrl,
  toNumber,
  type PaidToCode,
  type PaymentModeCode,
  type Money,
} from "@/lib/api/applications";
import { istTodayIso } from "@/lib/date";
import { PAID_TO_OPTIONS, PAYMENT_MODE_OPTIONS } from "./stage-model";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/* ------------------------------------------------------------------ *
 * Record registration fee (counsellor, fee_pending → fee_verification).
 * ------------------------------------------------------------------ */

interface RecordPaymentDrawerProps {
  appId: number;
  open: boolean;
  expectedAmount: number | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function RecordPaymentDrawer({
  appId,
  open,
  expectedAmount,
  onOpenChange,
  onSuccess,
}: RecordPaymentDrawerProps) {
  const [amount, setAmount] = useState("");
  const [paidTo, setPaidTo] = useState<PaidToCode>("upcarrera");
  const [mode, setMode] = useState<PaymentModeCode>("upi");
  const [txnRef, setTxnRef] = useState("");
  const [paidOn, setPaidOn] = useState(istTodayIso());
  const [reason, setReason] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  // The client cannot resolve the expected fee (it comes from an active fee_structure
  // the server reads), so when the server 400s asking for a reason we reveal the field
  // and require it on the next submit — instead of a dead-end generic toast.
  const [reasonRequired, setReasonRequired] = useState(false);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setAmount(expectedAmount != null ? String(expectedAmount) : "");
      setPaidTo("upcarrera");
      setMode("upi");
      setTxnRef("");
      setPaidOn(istTodayIso());
      setReason("");
      setReasonRequired(false);
      setReasonError(null);
      setProof(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [open, expectedAmount]);

  const amountNum = Number(amount);
  const amountValid = amount.trim() !== "" && Number.isFinite(amountNum) && amountNum >= 0;
  const differs = expectedAmount != null && amountValid && amountNum !== expectedAmount;
  // A reason is needed when the client knows the amount differs, OR when the server
  // asked for one on a prior attempt (reasonRequired).
  const showReason = differs || reasonRequired;
  const needsReason = showReason && reason.trim() === "";
  const canSubmit = amountValid && txnRef.trim() !== "" && !!proof && !needsReason;

  const mutation = useMutation({
    mutationFn: () => {
      if (!proof) throw new ApiError("A payment proof file is required.", 400);
      return recordPayment(
        appId,
        {
          amount: amountNum,
          paid_to: paidTo,
          payment_mode: mode,
          txn_ref: txnRef.trim(),
          paid_on: paidOn,
          amount_change_reason: reason.trim() || undefined,
        },
        proof,
      );
    },
    onSuccess: () => {
      toast.success("Registration fee recorded. It is now with Accounts for verification.");
      onOpenChange(false);
      onSuccess();
    },
    onError: (err) => {
      // The server requires amount_change_reason when the recorded amount differs from
      // the active fee_structure. Reveal the field and surface the message inline
      // (keeping the drawer open) rather than a generic toast the user can't act on.
      if (
        err instanceof ApiError &&
        err.status === 400 &&
        /reason/i.test(err.message) &&
        /expected|differ/i.test(err.message)
      ) {
        setReasonRequired(true);
        setReasonError(err.message);
        return;
      }
      toast.error(errorMessage(err, "Could not record the fee."));
    },
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-lg">
          <DrawerHeader className="px-0">
            <DrawerTitle>Record registration fee</DrawerTitle>
            <DrawerDescription>
              Attach the payment proof. Accounts verifies it before the application moves on.
            </DrawerDescription>
          </DrawerHeader>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto px-1 pb-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pay-amount">Amount (INR)</Label>
                <Input
                  id="pay-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
                {expectedAmount != null && (
                  <p className="text-xs text-muted-foreground">
                    Expected: {expectedAmount.toLocaleString("en-IN")}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-date">Paid on</Label>
                <Input
                  id="pay-date"
                  type="date"
                  max={istTodayIso()}
                  value={paidOn}
                  onChange={(e) => setPaidOn(e.target.value)}
                />
              </div>
            </div>

            {showReason && (
              <div className="space-y-1.5">
                <Label htmlFor="pay-reason">
                  Reason for the different amount <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="pay-reason"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (reasonError) setReasonError(null);
                  }}
                  placeholder="Why the recorded amount differs from the expected fee"
                  rows={2}
                  aria-invalid={reasonError ? true : undefined}
                />
                {reasonError && (
                  <p className="text-xs font-medium text-destructive">{reasonError}</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Paid to</Label>
                <Select value={paidTo} onValueChange={(v) => setPaidTo(v as PaidToCode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAID_TO_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Payment mode</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as PaymentModeCode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_MODE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay-txn">Transaction reference</Label>
              <Input
                id="pay-txn"
                value={txnRef}
                onChange={(e) => setTxnRef(e.target.value)}
                placeholder="UTR / cheque no / reference"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay-proof">Payment proof</Label>
              <label
                htmlFor="pay-proof"
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3 text-sm transition hover:border-primary/50 hover:bg-muted"
              >
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span className="truncate text-foreground">
                  {proof ? proof.name : "Upload receipt or screenshot (image or PDF, ≤ 5 MB)"}
                </span>
              </label>
              <input
                ref={fileRef}
                id="pay-proof"
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                onChange={(e) => setProof(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <DrawerFooter className="px-0">
            <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Record fee
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ *
 * Verify payment (Accounts, fee_verification → sa_verification).
 * ------------------------------------------------------------------ */

interface VerifyPaymentDialogProps {
  paymentId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function VerifyPaymentDialog({
  paymentId,
  open,
  onOpenChange,
  onSuccess,
}: VerifyPaymentDialogProps) {
  const [bankDate, setBankDate] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setBankDate("");
      setNote("");
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => {
      if (paymentId == null) throw new ApiError("No payment selected.", 400);
      return verifyPayment(paymentId, {
        bank_credit_date: bankDate || undefined,
        verify_note: note.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Payment verified. The application moves to Student Affairs.");
      onOpenChange(false);
      onSuccess();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not verify the payment.")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verify payment</DialogTitle>
          <DialogDescription>
            Confirm the fee against the bank record. The verified values mirror into the
            student ledger on conversion.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="verify-bank-date">Bank credit date (optional)</Label>
            <Input
              id="verify-bank-date"
              type="date"
              value={bankDate}
              onChange={(e) => setBankDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="verify-note">Note (optional)</Label>
            <Textarea
              id="verify-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Anything worth recording about this verification"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Verify payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Flag a mismatch (Accounts, fee_verification → fee_pending).
 * ------------------------------------------------------------------ */

interface MismatchDialogProps {
  paymentId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function MismatchDialog({
  paymentId,
  open,
  onOpenChange,
  onSuccess,
}: MismatchDialogProps) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => {
      if (paymentId == null) throw new ApiError("No payment selected.", 400);
      return mismatchPayment(paymentId, reason.trim());
    },
    onSuccess: () => {
      toast.success("Marked as a mismatch. The counsellor can re-record the fee.");
      onOpenChange(false);
      onSuccess();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not flag the mismatch.")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Flag a mismatch</DialogTitle>
          <DialogDescription>
            The entry returns to the counsellor as Registration Fee and its transaction
            number is released for re-entry.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label htmlFor="mismatch-reason">
            Reason <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="mismatch-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="What does not match the bank record?"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={reason.trim() === "" || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Flag mismatch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Inline proof preview (auth-gated blob). Used by the queue + fee tab.
 * ------------------------------------------------------------------ */

interface ProofPreviewProps {
  paymentId: number;
  mime: string | null;
  fileName: string | null;
  /** When set, load from this relative API path instead of the payment proof. */
  path?: string;
}

export function ProofPreview({ paymentId, mime, fileName, path }: ProofPreviewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let active = true;
    setUrl(null);
    setError(null);
    const load = path ? apiFileBlobUrl(path) : paymentProofUrl(paymentId);
    load
      .then((blobUrl) => {
        if (!active) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        revoked = blobUrl;
        setUrl(blobUrl);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err, "Could not load the proof."));
      });
    return () => {
      active = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [paymentId, path]);

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        {error}
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-muted/40 p-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const isPdf = (mime ?? "").includes("pdf") || (fileName ?? "").toLowerCase().endsWith(".pdf");
  if (isPdf) {
    return (
      <iframe
        title={fileName ?? "Payment proof"}
        src={url}
        className="h-[60vh] w-full rounded-lg border border-border bg-background"
      />
    );
  }

  // mime-only: `|| !isPdf` made this always true (isPdf already returned above), so
  // unknown mimes rendered as a broken <img> and the download link below was dead.
  const isImage = (mime ?? "").startsWith("image/");
  if (isImage) {
    return (
      <img
        src={url}
        alt={fileName ?? "Payment proof"}
        className="max-h-[60vh] w-full rounded-lg border border-border object-contain"
      />
    );
  }

  return (
    <a
      href={url}
      download={fileName ?? "proof"}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
    >
      <FileText className="h-4 w-4" /> Download proof
    </a>
  );
}

export { toNumber };
export type { Money };
