import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

/** A surface container with the app's card elevation. */
export default function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-2xl bg-surface shadow-card ring-1 ring-ink/[0.04] ${className}`}
    >
      {children}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: string;
  loading?: boolean;
}

/**
 * A summary metric card for the dashboard. `accent` is a Tailwind text color class
 * for the leading rule, e.g. "text-accent".
 */
export function StatCard({
  label,
  value,
  hint,
  accent = "text-accent",
  loading = false,
}: StatCardProps) {
  return (
    <Card className="group relative overflow-hidden p-5 transition-shadow hover:shadow-card-hover">
      <span
        className={`absolute left-0 top-5 h-8 w-1 rounded-r-full bg-current ${accent}`}
        aria-hidden
      />
      <p className="pl-3 text-xs font-medium uppercase tracking-wider text-ink-400">
        {label}
      </p>
      <p className="mt-3 pl-3 text-3xl font-semibold tabular-nums text-ink">
        {loading ? (
          <span className="inline-block h-8 w-16 animate-pulse rounded-md bg-ink/10" />
        ) : (
          value
        )}
      </p>
      {hint && <p className="mt-1 pl-3 text-xs text-ink-400">{hint}</p>}
    </Card>
  );
}
