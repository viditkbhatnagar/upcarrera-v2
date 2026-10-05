// Registration Fee tab: the pre-conversion registration-fee entries (with proof
// preview), a Record-payment entry point (owned by the page so the action bar and
// this tab share one drawer), and the read-only legacy LMS fee block.
import { useState } from "react";
import {
  Wallet,
  Plus,
  Eye,
  Receipt,
  Landmark,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  formatINR,
  type ApplicationPayment,
  type LegacyFee,
} from "@/lib/api/applications";
import {
  PAID_TO_LABEL,
  PAYMENT_MODE_LABEL,
  PAYMENT_STATUS_BADGE,
} from "./stage-model";
import { SectionCard, InfoRow, EmptyPanel, dash, formatDate } from "./detail-ui";
import { ProofPreview } from "./payment-dialogs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface RegistrationFeeTabProps {
  payments: ApplicationPayment[];
  legacyFee: LegacyFee | null;
  /** The payments query is still loading its first result. */
  loading: boolean;
  /** The payments query failed (null when it has not). */
  error: unknown;
  canRecord: boolean;
  onRecordPayment: () => void;
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function FeeState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">{children}</div>
  );
}

export function RegistrationFeeTab({
  payments,
  legacyFee,
  loading,
  error,
  canRecord,
  onRecordPayment,
}: RegistrationFeeTabProps) {
  const [proof, setProof] = useState<ApplicationPayment | null>(null);
  const hasLegacy =
    legacyFee &&
    (legacyFee.amount != null ||
      legacyFee.paid_date != null ||
      legacyFee.fee_receipt != null);

  return (
    <div className="space-y-5">
      <SectionCard
        title="Registration fee"
        icon={<Wallet className="h-4 w-4" />}
        action={
          canRecord ? (
            <Button size="sm" onClick={onRecordPayment}>
              <Plus className="h-4 w-4" /> Record payment
            </Button>
          ) : undefined
        }
      >
        {loading ? (
          <FeeState>
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the registration fee…
          </FeeState>
        ) : error ? (
          <FeeState>
            <AlertTriangle className="h-4 w-4 text-destructive" />
            {error instanceof ApiError ? error.message : "Could not load the registration fee."}
          </FeeState>
        ) : payments.length === 0 ? (
          <EmptyPanel
            icon={<Receipt className="h-6 w-6" />}
            title="No registration-fee entry yet"
            hint={
              canRecord
                ? "Record the registration fee with its proof to move the application to Accounts."
                : "A registration-fee entry will appear here once the counsellor records it."
            }
          />
        ) : (
          <ul className="space-y-3">
            {payments.map((p) => (
              <li
                key={p.id}
                className="rounded-xl border border-border bg-background p-4 transition hover:border-primary/30"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold text-foreground">
                        {formatINR(p.amount)}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                          PAYMENT_STATUS_BADGE[p.status] ?? PAYMENT_STATUS_BADGE.pending,
                        )}
                      >
                        {statusLabel(p.status)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {PAID_TO_LABEL[p.paid_to ?? ""] ?? dash(p.paid_to)} ·{" "}
                      {PAYMENT_MODE_LABEL[p.payment_mode ?? ""] ?? dash(p.payment_mode)} ·{" "}
                      Paid {formatDate(p.paid_on)}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setProof(p)}>
                    <Eye className="h-4 w-4" /> Proof
                  </Button>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 border-t border-border pt-3 sm:grid-cols-4">
                  <InfoRow label="Txn ref" mono>
                    {dash(p.txn_ref)}
                  </InfoRow>
                  <InfoRow label="Recorded">{formatDate(p.entered_at ?? p.created_at)}</InfoRow>
                  {p.status === "verified" && (
                    <InfoRow label="Verified">{formatDate(p.verified_at)}</InfoRow>
                  )}
                  {p.status === "mismatch" && p.mismatch_reason && (
                    <div className="col-span-2 sm:col-span-4">
                      <InfoRow label="Mismatch reason">{p.mismatch_reason}</InfoRow>
                    </div>
                  )}
                  {p.amount_change_reason && (
                    <div className="col-span-2 sm:col-span-4">
                      <InfoRow label="Amount note">{p.amount_change_reason}</InfoRow>
                    </div>
                  )}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Legacy LMS fee" icon={<Landmark className="h-4 w-4" />}>
        {loading ? (
          <FeeState>
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </FeeState>
        ) : error ? (
          <FeeState>
            <AlertTriangle className="h-4 w-4 text-destructive" />
            {error instanceof ApiError ? error.message : "Could not load the legacy fee."}
          </FeeState>
        ) : hasLegacy ? (
          <dl className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
            <InfoRow label="Amount">{formatINR(legacyFee!.amount)}</InfoRow>
            <InfoRow label="Paid date">{formatDate(legacyFee!.paid_date)}</InfoRow>
            <InfoRow label="Mode">{dash(legacyFee!.payment_mode)}</InfoRow>
            <InfoRow label="Paid to">{dash(legacyFee!.payment_to)}</InfoRow>
            <InfoRow label="Receipt">{dash(legacyFee!.fee_receipt)}</InfoRow>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            No legacy fee is recorded on this application.
          </p>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          Read-only. These are the pre-CRM LMS columns; verified CRM payments mirror into them.
        </p>
      </SectionCard>

      <Dialog open={!!proof} onOpenChange={(o) => !o && setProof(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payment proof</DialogTitle>
          </DialogHeader>
          {proof && (
            <ProofPreview
              paymentId={proof.id}
              mime={proof.proof_mime}
              fileName={proof.proof_original_name}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
