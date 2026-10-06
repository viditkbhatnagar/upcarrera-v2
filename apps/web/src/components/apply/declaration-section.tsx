import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { submitApplication, type ApplicationView, type SubmitResult } from "@/lib/applicant-api";
import { cn } from "@/lib/utils";
import { SectionCard } from "./fields";
import { handleSaveError } from "./use-section-save";

interface DeclarationSectionProps {
  app: ApplicationView;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onSubmitted: (result: SubmitResult) => void;
}

function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (b: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface p-3.5 transition hover:bg-muted/40">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-border text-primary focus:ring-primary/30"
      />
      <span className="text-sm text-foreground">{children}</span>
    </label>
  );
}

export function DeclarationSection({ app, busy, setBusy, onSubmitted }: DeclarationSectionProps) {
  const [accuracy, setAccuracy] = useState(false);
  const [terms, setTerms] = useState(false);

  const incompleteSteps = app.progress.steps.filter((s) => !s.complete);
  const serverComplete = app.progress.completed >= app.progress.total;
  const notEligible = app.eligibility.status === "not_eligible";
  const canSubmit = serverComplete && !notEligible && accuracy && terms && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const result = await submitApplication(app.row_version);
      onSubmitted(result);
    } catch (e) {
      handleSaveError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Review & submit" description="Almost there — confirm and submit your application.">
      {!serverComplete && (
        <div className="mb-4 flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Finish these first:</p>
            <p>{incompleteSteps.map((s) => s.label).join(", ")}</p>
          </div>
        </div>
      )}
      {notEligible && (
        <div className="mb-4 flex gap-3 rounded-xl border border-red-300 bg-red-50 p-3.5 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm">{app.eligibility.detail ?? "Please contact your counsellor about eligibility."}</p>
        </div>
      )}

      <div className="space-y-2.5">
        <Checkbox checked={accuracy} onChange={setAccuracy}>
          I confirm that the information I have provided is true and accurate to the best of my knowledge.
        </Checkbox>
        <Checkbox checked={terms} onChange={setTerms}>
          I accept the terms and conditions and authorise upCarrera to process my application.
        </Checkbox>
      </div>

      {serverComplete && !notEligible && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Everything looks complete.
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className={cn(
          "mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-base font-bold text-primary-foreground transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto",
        )}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
        Submit application
      </button>
    </SectionCard>
  );
}
