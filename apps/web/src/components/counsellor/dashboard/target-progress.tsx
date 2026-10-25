import { Target } from "lucide-react";
import { Card } from "@/components/ui/card";

interface TargetProgressProps {
  target: number;
  achieved: number;
  loading?: boolean;
}

const RADIUS = 78;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const nf = (n: number) => n.toLocaleString("en-IN");

export function TargetProgress({ target, achieved, loading }: TargetProgressProps) {
  const hasTarget = target > 0;
  const pct = hasTarget ? Math.round((achieved / target) * 100) : 0;
  const remaining = Math.max(0, target - achieved);
  const offset = CIRCUMFERENCE - (Math.min(100, pct) / 100) * CIRCUMFERENCE;
  const month = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <Card className="p-6 shadow-[var(--shadow-soft)] border-border/70">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Target Progress</h3>
          <p className="text-xs text-muted-foreground">{month}</p>
        </div>
        <div className="h-9 w-9 rounded-lg bg-primary-soft text-primary-soft-foreground flex items-center justify-center">
          <Target className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center">
        <div className="relative h-48 w-48">
          <svg className="-rotate-90" viewBox="0 0 200 200" width="100%" height="100%" role="img" aria-label={`${pct}% of monthly target achieved`}>
            <circle cx="100" cy="100" r={RADIUS} strokeWidth="14" className="stroke-muted" fill="none" />
            <circle
              cx="100"
              cy="100"
              r={RADIUS}
              strokeWidth="14"
              strokeLinecap="round"
              stroke="url(#tg)"
              fill="none"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 1s ease" }}
            />
            <defs>
              <linearGradient id="tg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--primary)" />
                <stop offset="100%" stopColor="var(--info)" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-3xl font-bold">{loading ? "…" : hasTarget ? `${pct}%` : "—"}</p>
            <p className="text-xs text-muted-foreground">{hasTarget ? "Achieved" : "No target set"}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 w-full gap-2 text-center">
          <Stat label="Target" value={nf(target)} />
          <Stat label="Achieved" value={nf(achieved)} accent />
          <Stat label="Remaining" value={nf(remaining)} />
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/50 py-2">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={"text-sm font-bold " + (accent ? "text-primary" : "")}>{value}</p>
    </div>
  );
}
