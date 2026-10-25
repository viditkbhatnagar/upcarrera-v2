import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { STAGE_META } from "@/components/applications/stage-model";
import type { ApplicationListRow, Stage } from "@/lib/api/applications";

const STAGE_TONE: Record<Stage, string> = {
  lead_added: "bg-primary-soft text-primary-soft-foreground",
  form_pending: "bg-info-soft text-info",
  counsellor_review: "bg-primary-soft text-primary-soft-foreground",
  fee_pending: "bg-warning-soft text-warning-foreground",
  fee_verification: "bg-warning-soft text-warning-foreground",
  sa_verification: "bg-info-soft text-info",
  converted: "bg-success-soft text-success",
  rejected: "bg-destructive-soft text-destructive",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

interface RecentActivityProps {
  rows: readonly ApplicationListRow[] | undefined;
  loading?: boolean;
}

export function RecentActivity({ rows, loading }: RecentActivityProps) {
  const items = rows ?? [];
  return (
    <Card className="p-6 shadow-[var(--shadow-soft)] border-border/70">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">Recent Applications</h3>
          <p className="text-xs text-muted-foreground">Your newest leads and where they stand</p>
        </div>
      </div>
      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No applications yet.</p>
      ) : (
        <ul className="space-y-4">
          {items.map((a) => {
            const meta = STAGE_META[a.stage];
            const Icon = meta.icon;
            const detail = [a.applicant_name, [a.course_title, a.university_title].filter(Boolean).join(", ")]
              .filter(Boolean)
              .join(" — ");
            return (
              <li key={a.application_id}>
                <Link
                  to="/students/applications/$appId"
                  params={{ appId: String(a.application_id) }}
                  className="flex items-start gap-3 rounded-lg -m-1 p-1 hover:bg-muted/40 transition-colors"
                >
                  <span className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${STAGE_TONE[a.stage]}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{meta.label}</p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(a.created_at)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{detail || "—"}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
