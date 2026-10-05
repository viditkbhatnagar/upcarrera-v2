// Timeline tab: the merged stage log + field-level audit + the legacy creation
// event (GET /applications/:id/timeline), newest first.
import { useQuery } from "@tanstack/react-query";
import {
  History,
  Loader2,
  AlertTriangle,
  GitBranch,
  Pencil,
  Pause,
  Play,
  Flag,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  getTimeline,
  applicationKeys,
  type TimelineEntry,
} from "@/lib/api/applications";
import { stageLabel, type Stage } from "./stage-model";
import { SectionCard, EmptyPanel, formatDateTime } from "./detail-ui";

function iconFor(entry: TimelineEntry) {
  if (entry.source === "audit") return Pencil;
  if (entry.event === "hold") return Pause;
  if (entry.event === "resume") return Play;
  if (entry.event === "rejected") return Flag;
  return GitBranch;
}

function titleFor(entry: TimelineEntry): string {
  if (entry.source === "legacy") return "Application created";
  if (entry.source === "audit") {
    return entry.field ? `Updated ${humanize(entry.field)}` : humanize(entry.event);
  }
  return humanize(entry.event);
}

function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function asStage(value: string | null | undefined): string | null {
  if (!value) return null;
  return stageLabel(value as Stage);
}

export function TimelineTab({ appId }: { appId: number }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: applicationKeys.timeline(appId),
    queryFn: () => getTimeline(appId),
  });

  if (isLoading) {
    return (
      <SectionCard title="Timeline" icon={<History className="h-4 w-4" />}>
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </SectionCard>
    );
  }

  if (isError) {
    return (
      <SectionCard title="Timeline" icon={<History className="h-4 w-4" />}>
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          {error instanceof ApiError ? error.message : "Could not load the timeline."}
        </div>
      </SectionCard>
    );
  }

  const items = data?.items ?? [];

  return (
    <SectionCard title="Timeline" icon={<History className="h-4 w-4" />}>
      {items.length === 0 ? (
        <EmptyPanel
          icon={<History className="h-6 w-6" />}
          title="Nothing recorded yet"
          hint="Stage changes, field corrections and reviews will appear here as they happen."
        />
      ) : (
        <ol className="relative space-y-5 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-border">
          {items.map((entry, i) => {
            const Icon = iconFor(entry);
            const from = asStage(entry.from_stage);
            const to = asStage(entry.to_stage);
            return (
              <li
                key={`${entry.source}-${entry.change_id ?? "na"}-${i}`}
                className="relative flex gap-4"
              >
                <span className="z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-surface text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{titleFor(entry)}</span>
                    <time className="text-xs text-muted-foreground">{formatDateTime(entry.at)}</time>
                  </div>
                  {from && to && from !== to && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {from} <span aria-hidden>→</span> {to}
                    </div>
                  )}
                  {entry.source === "audit" && (entry.old_value || entry.new_value) && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      <span className="line-through opacity-70">{entry.old_value || "—"}</span>{" "}
                      <span aria-hidden>→</span>{" "}
                      <span className="text-foreground">{entry.new_value || "—"}</span>
                    </div>
                  )}
                  {entry.reason && (
                    <div className="mt-1 rounded-lg bg-muted/50 px-3 py-1.5 text-xs text-foreground">
                      {entry.reason}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}
