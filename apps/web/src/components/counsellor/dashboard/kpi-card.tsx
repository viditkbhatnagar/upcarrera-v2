import { type KeyboardEvent } from "react";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "primary" | "success" | "warning" | "info" | "destructive";
  /** Optional real month-over-month change in percent. Omit when unknown. */
  delta?: number;
  progress?: number;
  sub?: string;
  loading?: boolean;
  onClick?: () => void;
  /** Highlights the card as the active filter. */
  active?: boolean;
}

const toneMap = {
  primary: { bg: "bg-primary-soft", fg: "text-primary-soft-foreground", bar: "bg-primary" },
  success: { bg: "bg-success-soft", fg: "text-success", bar: "bg-success" },
  warning: { bg: "bg-warning-soft", fg: "text-warning-foreground", bar: "bg-warning" },
  info: { bg: "bg-info-soft", fg: "text-info", bar: "bg-info" },
  destructive: { bg: "bg-destructive-soft", fg: "text-destructive", bar: "bg-destructive" },
};

export function KpiCard({ label, value, icon: Icon, tone = "primary", delta, progress, sub, loading, onClick, active }: KpiCardProps) {
  const t = toneMap[tone];
  const interactive = Boolean(onClick);
  return (
    <Card
      {...(interactive
        ? {
            role: "button" as const,
            tabIndex: 0,
            onClick,
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            },
          }
        : {})}
      className={cn(
        "p-5 shadow-[var(--shadow-soft)] border-border/70 transition-all",
        interactive &&
          "cursor-pointer select-none hover:shadow-[var(--shadow-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "ring-2 ring-primary border-primary/60",
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", t.bg, t.fg)}>
          <Icon className="h-5 w-5" />
        </div>
        {delta !== undefined && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium rounded-full px-2 py-0.5",
              delta >= 0 ? "text-success bg-success-soft" : "text-destructive bg-destructive/10",
            )}
          >
            {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight">{loading ? "…" : value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {progress !== undefined && (
        <div className="mt-4 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", t.bar)}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </Card>
  );
}
