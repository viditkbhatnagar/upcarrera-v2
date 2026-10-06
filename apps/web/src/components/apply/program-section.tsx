import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Lock } from "lucide-react";
import { confirmProgram } from "@/lib/applicant-api";
import { FieldRow, SectionCard, inputCls } from "./fields";
import { SectionFooter } from "./section-footer";
import { handleSaveError } from "./use-section-save";
import type { SectionProps } from "./types";

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-semibold text-foreground">{value || "—"}</span>
    </div>
  );
}

export function ProgramSection({ app, busy, setBusy, reload, goNext }: SectionProps) {
  const [showChange, setShowChange] = useState(Boolean(app.program_change_request));
  const [reason, setReason] = useState(app.program_change_request ?? "");
  const confirmed = Boolean(app.sections && app.progress.steps.find((s) => s.key === "program")?.complete);

  async function confirm() {
    setBusy(true);
    try {
      await confirmProgram(app.row_version);
      toast.success("Program confirmed");
      await reload();
      goNext();
    } catch (e) {
      handleSaveError(e);
    } finally {
      setBusy(false);
    }
  }

  async function requestChange() {
    if (reason.trim().length < 1) {
      toast.error("Describe the change you'd like.");
      return;
    }
    setBusy(true);
    try {
      await confirmProgram(app.row_version, reason.trim());
      toast.success("Your counsellor has been notified.");
      await reload();
    } catch (e) {
      handleSaveError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Your program" description="Please confirm the program your counsellor set up for you.">
      <div className="rounded-2xl border border-border bg-muted/40 p-4">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> Locked
        </div>
        <div className="divide-y divide-border">
          <Row label="University" value={app.program.university} />
          <Row label="Course" value={app.program.course} />
          <Row label="Specialisation" value={app.program.specialisation} />
          <Row label="Intake" value={app.program.intake} />
        </div>
      </div>

      {confirmed && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> You confirmed this program.
        </p>
      )}

      <div className="mt-4">
        {!showChange ? (
          <button type="button" onClick={() => setShowChange(true)} className="text-sm font-semibold text-primary hover:underline">
            Something looks wrong? Request a change
          </button>
        ) : (
          <div className="rounded-2xl border border-border bg-surface p-4">
            <FieldRow label="Request a change" hint="Your counsellor will review this. The program is not changed automatically.">
              <textarea rows={3} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. I'd like to switch my specialisation to Finance." />
            </FieldRow>
            {app.program_change_request && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">A change request is already on file with your counsellor.</p>
            )}
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={requestChange} disabled={busy} className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50">
                Send request
              </button>
              <button type="button" onClick={() => setShowChange(false)} className="rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <SectionFooter busy={busy} showDraft={false} continueLabel="Confirm & continue" onContinue={confirm} />
    </SectionCard>
  );
}
