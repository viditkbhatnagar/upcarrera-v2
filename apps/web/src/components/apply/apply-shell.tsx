import type { ReactNode } from "react";
import { Check, Clock, GraduationCap, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ApplyStep {
  key: string;
  label: string;
  complete: boolean;
}

interface ApplyShellProps {
  applicationId: string;
  steps: ApplyStep[];
  currentStep: string;
  onNavigate: (key: string) => void;
  expiresAt: string | null;
  onSaveExit: () => void;
  children: ReactNode;
}

function formatExpiry(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function ApplyShell({
  applicationId,
  steps,
  currentStep,
  onNavigate,
  expiresAt,
  onSaveExit,
  children,
}: ApplyShellProps) {
  const currentIndex = Math.max(0, steps.findIndex((s) => s.key === currentStep));
  const expiry = formatExpiry(expiresAt);

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <GraduationCap className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight text-foreground">upCarrera Admissions</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">{applicationId}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onSaveExit}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted"
          >
            <LogOut className="h-3.5 w-3.5" /> Save &amp; exit
          </button>
        </div>
      </header>

      {/* Sticky progress */}
      <div className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>
              Step {currentIndex + 1} of {steps.length}
            </span>
            {expiry && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Link valid until {expiry}
              </span>
            )}
          </div>
          <div className="mt-2 -mx-1 flex gap-1.5 overflow-x-auto pb-1">
            {steps.map((step, i) => {
              const active = step.key === currentStep;
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => onNavigate(step.key)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                    active
                      ? "bg-primary text-primary-foreground"
                      : step.complete
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground hover:bg-muted/70",
                  )}
                >
                  {step.complete && !active && <Check className="h-3 w-3" />}
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-black/10 text-[10px] dark:bg-white/10">
                    {i + 1}
                  </span>
                  {step.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5 pb-24">{children}</main>
    </div>
  );
}
