import type { ComponentType, ReactNode } from "react";
import { Card } from "@/components/ui/card";

type IconType = ComponentType<{ className?: string }>;

/** Naji's titled info card: icon chip + title + a two-column field grid. */
export function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: IconType;
  children: ReactNode;
}) {
  return (
    <Card className="p-6 shadow-[var(--shadow-soft)] border-border/70">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-8 w-8 rounded-lg bg-primary-soft text-primary-soft-foreground flex items-center justify-center">
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5 break-words">{value}</p>
    </div>
  );
}

const TONES = {
  primary: "bg-primary-soft text-primary-soft-foreground",
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning-foreground",
} as const;

export type Tone = keyof typeof TONES;

export function MiniStat({
  icon: Icon,
  label,
  value,
  tone,
  progress,
}: {
  icon: IconType;
  label: string;
  value: string;
  tone: Tone;
  progress?: number;
}) {
  const bar = tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-primary";
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className={`h-9 w-9 rounded-md flex items-center justify-center shrink-0 ${TONES[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="text-sm font-bold truncate">{value}</p>
        </div>
      </div>
      {progress !== undefined && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
    </div>
  );
}

/** Centered loading / error / empty state used by every counsellor screen. */
export function StatePanel({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center shadow-[var(--shadow-soft)] border-border/70">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted">{icon}</div>
      <div className="text-base font-semibold">{title}</div>
      {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action}
    </Card>
  );
}
