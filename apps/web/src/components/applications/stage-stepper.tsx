// The seven-stage progress stepper for an application. Reads the server-derived
// effective stage; shows hold and legacy badges. `rejected` is a terminal
// off-ramp rendered as its own banner rather than a step.
import { Check, Pause, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { PIPELINE_STAGES, STAGE_META, type Stage } from "./stage-model";

interface StageStepperProps {
  stage: Stage;
  stageNo: number;
  stageSource: "workflow" | "legacy";
  onHold: boolean;
  daysInStage: number;
}

export function StageStepper({
  stage,
  stageNo,
  stageSource,
  onHold,
  daysInStage,
}: StageStepperProps) {
  if (stage === "rejected") {
    const meta = STAGE_META.rejected;
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-card dark:border-red-500/30 dark:bg-red-500/10">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-red-500/15 text-red-600 dark:text-red-300">
            <XCircle className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{meta.label}</span>
              {stageSource === "legacy" && <LegacyBadge />}
            </div>
            <p className="text-xs text-muted-foreground">
              This application is closed. Staff create a new application rather than reopening it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Admission pipeline</span>
          {stageSource === "legacy" && <LegacyBadge />}
          {onHold && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
              <Pause className="h-3 w-3" /> On hold
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {daysInStage} {daysInStage === 1 ? "day" : "days"} in current stage
        </span>
      </div>

      <ol className="flex items-stretch gap-1 overflow-x-auto scrollbar-thin pb-1">
        {PIPELINE_STAGES.map((s, i) => {
          const meta = STAGE_META[s];
          const state: "done" | "current" | "todo" =
            meta.no < stageNo ? "done" : meta.no === stageNo ? "current" : "todo";
          const Icon = meta.icon;
          return (
            <li key={s} className="flex min-w-[128px] flex-1 items-center gap-1">
              <div
                className={cn(
                  "group flex w-full flex-col gap-2 rounded-xl border p-3 transition",
                  state === "current"
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : state === "done"
                      ? "border-border bg-muted/40"
                      : "border-dashed border-border bg-background",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "grid h-8 w-8 place-items-center rounded-lg transition-transform",
                      state === "current" && !onHold && "scale-105",
                      state === "done"
                        ? "bg-primary text-primary-foreground"
                        : state === "current"
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {state === "done" ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] font-semibold uppercase tracking-wide",
                      state === "current" ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {meta.no}/7
                  </span>
                </div>
                <div>
                  <div
                    className={cn(
                      "text-xs font-semibold leading-tight",
                      state === "todo" ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {meta.label}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                    {meta.short}
                  </div>
                </div>
              </div>
              {i < PIPELINE_STAGES.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "h-0.5 w-3 shrink-0 rounded-full",
                    meta.no < stageNo ? "bg-primary" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function LegacyBadge() {
  return (
    <span
      title="Derived from legacy LMS data — not set by the CRM workflow"
      className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-500/30"
    >
      Legacy
    </span>
  );
}
