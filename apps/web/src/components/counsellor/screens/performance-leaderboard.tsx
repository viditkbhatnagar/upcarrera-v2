import type { ComponentType } from "react";
import { Award, CheckCircle2, Crown, Flame, Medal, Trophy, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useLeaderboard, type LeaderboardRow } from "@/components/counsellor/use-leaderboard";

const TOP_N = 8;
const nf = (n: number) => n.toLocaleString("en-IN");

interface EarnedBadge {
  label: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  cls: string;
}

/**
 * Objective, data-derived badges only — no arbitrary scoring. Criteria are
 * business-tunable (Naji); these mirror metrics the dashboard already computes.
 */
function earnedBadges(pct: number, ytd: number, rank: number | null): EarnedBadge[] {
  const out: EarnedBadge[] = [];
  if (rank === 1) {
    out.push({ label: "Top Performer", hint: "#1 on the board this month", icon: Crown, cls: "border-warning/40 bg-warning/10 text-warning-foreground" });
  } else if (rank != null && rank <= 3) {
    out.push({ label: `Top ${rank}`, hint: "Top 3 this month", icon: Medal, cls: "border-info/40 bg-info/10 text-info" });
  }
  if (pct >= 100) {
    out.push({ label: "Target Met", hint: "Hit your monthly points target", icon: CheckCircle2, cls: "border-success/40 bg-success/10 text-success" });
  }
  // Highest YTD enrolment milestone reached.
  const milestone = [100, 50, 25, 10].find((m) => ytd >= m);
  if (milestone) {
    out.push({ label: `${milestone}+ Enrollments`, hint: "Year-to-date milestone", icon: Flame, cls: "border-primary/40 bg-primary/10 text-primary" });
  }
  return out;
}

function RankMark({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="h-4 w-4 text-warning" />;
  if (rank === 2) return <Medal className="h-4 w-4 text-muted-foreground" />;
  if (rank === 3) return <Medal className="h-4 w-4 text-amber-700" />;
  return <span className="text-xs font-semibold text-muted-foreground tabular-nums">{rank}</span>;
}

function label(row: LeaderboardRow): string {
  const name = row.name?.trim();
  if (name) return name;
  return row.employee_code?.trim() || `Counsellor ${row.consultant_id}`;
}

export function LeaderboardAndBadges({ pct, ytd }: { pct: number; ytd: number }) {
  const lb = useLeaderboard();
  const data = lb.data;
  const rows = data?.rows ?? [];
  const top = rows.slice(0, TOP_N);
  const selfInTop = top.some((r) => r.is_self);
  const selfRow = rows.find((r) => r.is_self);
  const period = data ? `${data.month} ${data.year}` : "";
  const badges = earnedBadges(pct, ytd, data?.self.rank ?? null);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <Card className="xl:col-span-2 p-5 shadow-[var(--shadow-soft)] border-border/70">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-warning" />
            <div>
              <h2 className="text-base font-semibold">Counsellor Leaderboard</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Ranked by points earned{period ? ` · ${period}` : ""}</p>
            </div>
          </div>
          {data?.self.rank != null && (
            <span className="text-xs text-muted-foreground">
              Your rank <span className="font-semibold text-foreground">#{data.self.rank}</span>
            </span>
          )}
        </div>

        {lb.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : lb.isError ? (
          <p className="py-10 text-center text-sm text-destructive">Couldn't load the leaderboard.</p>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center">
            <Users className="mx-auto h-7 w-7 text-muted-foreground/60" />
            <p className="mt-2 text-sm text-muted-foreground">No enrollments recorded this month yet.</p>
            <p className="text-xs text-muted-foreground/70">The board fills as counsellors convert students.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {top.map((r) => (
              <li
                key={r.consultant_id}
                className={cn(
                  "flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-md",
                  r.is_self && "bg-primary/5 ring-1 ring-primary/20",
                )}
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted">
                  <RankMark rank={r.rank} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight truncate">
                    {label(r)}
                    {r.is_self && <span className="ml-1.5 text-[10px] font-semibold text-primary">You</span>}
                  </p>
                  {r.employee_code && <p className="text-[11px] font-mono text-muted-foreground">{r.employee_code}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{nf(r.points)} pts</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">{nf(r.admissions)} enrolled</p>
                </div>
              </li>
            ))}
            {!selfInTop && selfRow && (
              <li className="flex items-center gap-3 py-2.5 px-2 -mx-2 mt-1 rounded-md bg-primary/5 ring-1 ring-primary/20 border-t border-dashed border-border">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted">
                  <RankMark rank={selfRow.rank} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight truncate">
                    {label(selfRow)}
                    <span className="ml-1.5 text-[10px] font-semibold text-primary">You</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{nf(selfRow.points)} pts</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">{nf(selfRow.admissions)} enrolled</p>
                </div>
              </li>
            )}
          </ul>
        )}
      </Card>

      <Card className="p-5 shadow-[var(--shadow-soft)] border-border/70">
        <div className="flex items-center gap-2 mb-4">
          <Award className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Your Badges</h2>
        </div>
        {badges.length === 0 ? (
          <div className="py-8 text-center">
            <Award className="mx-auto h-7 w-7 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No badges yet</p>
            <p className="text-xs text-muted-foreground/70">Hit your monthly target and climb the board to earn them.</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {badges.map((b) => {
              const Icon = b.icon;
              return (
                <li key={b.label} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5", b.cls)}>
                  <Icon className="h-5 w-5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">{b.label}</p>
                    <p className="text-[11px] opacity-80">{b.hint}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
