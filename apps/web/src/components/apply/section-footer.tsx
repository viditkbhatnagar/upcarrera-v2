import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionFooterProps {
  onSaveDraft?: () => void;
  onContinue: () => void;
  busy: boolean;
  continueLabel?: string;
  showDraft?: boolean;
}

/** Shared per-section footer: Save draft (optional) + Save & continue. */
export function SectionFooter({
  onSaveDraft,
  onContinue,
  busy,
  continueLabel = "Save & continue",
  showDraft = true,
}: SectionFooterProps) {
  return (
    <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
      {showDraft && onSaveDraft && (
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50"
        >
          Save draft
        </button>
      )}
      <button
        type="button"
        onClick={onContinue}
        disabled={busy}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-50",
        )}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {continueLabel}
      </button>
    </div>
  );
}
