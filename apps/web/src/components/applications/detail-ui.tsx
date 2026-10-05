// Small presentational helpers shared across the application detail tabs.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const EMPTY = "—";

export function dash(value: string | number | null | undefined): string {
  if (value == null) return EMPTY;
  const s = String(value).trim();
  return s === "" ? EMPTY : s;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function initials(name: string | null | undefined, fallback: string): string {
  const source = name && name.trim() !== "" ? name : fallback;
  return source
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

interface SectionCardProps {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SectionCard({ title, icon, action, children, className }: SectionCardProps) {
  return (
    <section className={cn("rounded-2xl border border-border bg-surface shadow-card", className)}>
      <header className="flex items-center justify-between gap-2 border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

interface InfoRowProps {
  label: string;
  children: ReactNode;
  mono?: boolean;
}

export function InfoRow({ label, children, mono }: InfoRowProps) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className={cn("text-sm text-foreground", mono && "font-mono")}>{children}</dd>
    </div>
  );
}

export function EmptyPanel({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {hint && <div className="max-w-sm text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
