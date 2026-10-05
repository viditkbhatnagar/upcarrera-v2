// Presentational primitives and formatters shared by the student profile tabs.

import type { ReactNode } from "react";
import { AlertTriangle, FolderOpen, Inbox, Loader2, RefreshCcw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const formatINR = (n: number | null | undefined): string =>
  "₹" + Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dash(value: string | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : "—";
}

export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function SectionCard({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function InfoRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  /** A short note under the value, e.g. where a derived value came from. */
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-right text-sm font-medium text-foreground">
        {value}
        {hint && <div className="text-[11px] font-normal text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}

export function FinStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-card">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-lg font-bold tracking-tight", tone)}>{value}</div>
    </div>
  );
}

export function EmptyTab({
  icon: Icon = FolderOpen,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

export function EmptyInline({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background px-4 py-8 text-center">
      <Inbox className="h-4 w-4 text-muted-foreground/50" />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export function TabLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-6 py-16 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function TabError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
      <AlertTriangle className="h-8 w-8 text-red-500/60" />
      <div className="text-sm font-semibold text-foreground">Couldn’t load this section</div>
      <p className="max-w-sm text-xs text-muted-foreground">{message}</p>
      <button
        onClick={onRetry}
        className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
      >
        <RefreshCcw className="h-3.5 w-3.5" />
        Retry
      </button>
    </div>
  );
}
