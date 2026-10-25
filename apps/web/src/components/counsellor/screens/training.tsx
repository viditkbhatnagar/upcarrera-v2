import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, Play, RefreshCcw, Search, Video } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatePanel } from "@/components/counsellor/shared/info";
import { VideoWatchDialog } from "./video-watch-dialog";
import {
  categoryIcon,
  formatDuration,
  gradientFor,
  thumbnailFor,
  type TrainingResponse,
  type TrainingVideo,
} from "./training-model";

const QUERY_KEY = ["counsellor", "training"] as const;
const ALL = "All";

function useViewportWidth() {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return w;
}

/**
 * Training Center (Naji's design), wired to GET /training-videos. Completion is
 * per counsellor (POST/DELETE /training-videos/:id/complete). Only real fields
 * are shown: the design's instructor, rating and chapter mock data have no source.
 */
export function CounsellorTraining() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<string>(ALL);
  const [watchId, setWatchId] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiGet<TrainingResponse>("/training-videos"),
    staleTime: 60_000,
  });

  const toggle = useMutation({
    mutationFn: (v: TrainingVideo) =>
      v.completed ? apiDelete(`/training-videos/${v.id}/complete`) : apiPost(`/training-videos/${v.id}/complete`),
    onSuccess: (_r, v) => {
      toast.success(v.completed ? "Marked as not completed" : "Marked as completed");
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Couldn't update your progress"),
  });

  const videos = useMemo(() => data?.items ?? [], [data]);
  const categories = data?.categories ?? [];
  const watchVideo = videos.find((v) => v.id === watchId) ?? null;

  // The row adapts so it never spills off the page (sidebar ~256px from 1024px).
  const vw = useViewportWidth();
  const container = vw >= 1024 ? vw - 304 : vw - 48;
  const inlineCount = container >= 800 ? 3 : container >= 650 ? 2 : container >= 490 ? 1 : 0;
  const inlineCats = categories.slice(0, inlineCount);
  const otherCats = categories.slice(inlineCount);
  const activeOther = otherCats.find((c) => c.name === active);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return videos.filter(
      (v) =>
        (active === ALL || v.category === active) &&
        (!q || `${v.title} ${v.description ?? ""} ${v.category}`.toLowerCase().includes(q)),
    );
  }, [videos, search, active]);

  // Featured: the next video the counsellor hasn't completed, else the first.
  const featured = videos.find((v) => !v.completed) ?? videos[0] ?? null;

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Training Center</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Video tutorials for counsellors on universities, courses, and the benefits students get.
          {data && data.total > 0 ? ` ${data.completed} of ${data.total} completed.` : ""}
        </p>
      </div>

      {isLoading ? (
        <StatePanel icon={<RefreshCcw className="h-7 w-7 animate-spin text-muted-foreground/60" />} title="Loading training videos…" />
      ) : isError ? (
        <StatePanel
          icon={<AlertTriangle className="h-7 w-7 text-destructive" />}
          title="Couldn't load the training videos"
          hint="Please try again."
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      ) : videos.length === 0 ? (
        <StatePanel
          icon={<Video className="h-7 w-7 text-muted-foreground/70" />}
          title="No training videos yet"
          hint="New videos will appear here as they are published."
        />
      ) : (
        <>
          {featured && <FeaturedCard v={featured} onWatch={setWatchId} />}

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold shrink-0">Browse by Category</h3>
              <div className="relative w-full sm:w-[380px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search videos and topics..."
                  aria-label="Search videos"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-10 rounded-full"
                />
              </div>
            </div>
            <div className="flex flex-nowrap items-center gap-2">
              <CategoryPill label="All" active={active === ALL} onClick={() => setActive(ALL)} count={videos.length} />
              {inlineCats.map((c) => (
                <CategoryPill key={c.name} label={c.name} icon={categoryIcon(c.name)} count={c.count} active={active === c.name} onClick={() => setActive(c.name)} />
              ))}
              {otherCats.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "shrink-0 inline-flex items-center gap-2 px-4 h-9 rounded-full text-sm font-medium border transition-all",
                        activeOther
                          ? "bg-foreground text-background border-foreground shadow"
                          : "bg-card text-foreground border-border hover:border-foreground/40 hover:bg-muted",
                      )}
                    >
                      {activeOther ? `${categoryIcon(activeOther.name)} ${activeOther.name}` : "Others"}
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[230px]">
                    {otherCats.map((c) => (
                      <DropdownMenuItem key={c.name} onSelect={() => setActive(c.name)} className="gap-2">
                        <span>{categoryIcon(c.name)}</span>
                        <span className="flex-1">{c.name}</span>
                        <span className="text-[10px] text-muted-foreground">{c.count}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {filtered.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">No videos match your search.</Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filtered.map((v) => <VideoCard key={v.id} v={v} onWatch={setWatchId} />)}
            </div>
          )}
        </>
      )}

      <VideoWatchDialog
        video={watchVideo}
        open={watchVideo != null}
        onOpenChange={(o) => {
          if (!o) setWatchId(null);
        }}
        onToggleComplete={(v) => toggle.mutate(v)}
        pending={toggle.isPending}
      />
    </>
  );
}

function Thumb({ v, featured, className }: { v: TrainingVideo; featured?: boolean; className?: string }) {
  const src = thumbnailFor(v);
  const duration = formatDuration(v.duration_seconds);
  return (
    <div className={cn("relative bg-gradient-to-br flex items-center justify-center overflow-hidden", gradientFor(v.id), className)}>
      {src && <img src={src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
      <div className={cn("absolute inset-0 transition", featured ? "bg-black/10" : "bg-black/0 group-hover:bg-black/30")} />
      <div
        className={cn(
          "relative rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-lg transition",
          featured ? "h-16 w-16 shadow-2xl group-hover:scale-110" : "h-12 w-12 opacity-0 group-hover:opacity-100",
        )}
      >
        <Play className={cn("ml-0.5 text-foreground fill-foreground", featured ? "h-7 w-7 ml-1" : "h-5 w-5")} />
      </div>
      {featured && (
        <div className="absolute top-4 left-4">
          <Badge className="bg-black/40 text-white border-0 backdrop-blur">{v.category}</Badge>
        </div>
      )}
      {duration && (
        <span
          className={cn(
            "absolute text-[11px] font-medium rounded bg-black/70 text-white",
            featured ? "bottom-4 right-4 px-2 py-0.5" : "bottom-2 right-2 px-1.5 py-0.5",
          )}
        >
          {duration}
        </span>
      )}
      {v.completed && (
        <span className="absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-success-soft text-success">
          <CheckCircle2 className="h-3 w-3" /> Completed
        </span>
      )}
    </div>
  );
}

function FeaturedCard({ v, onWatch }: { v: TrainingVideo; onWatch: (id: number) => void }) {
  return (
    <Card className="overflow-hidden border-border/70 shadow-[var(--shadow-soft)]">
      <button type="button" onClick={() => onWatch(v.id)} className="group grid w-full text-left md:grid-cols-2">
        <Thumb v={v} featured className="h-56 md:h-full min-h-[240px]" />
        <div className="p-6 md:p-8 flex flex-col justify-center">
          <h2 className="text-2xl font-bold leading-tight">{v.title}</h2>
          {v.description && <p className="mt-3 text-sm text-muted-foreground line-clamp-3">{v.description}</p>}
          <div className="mt-6">
            <Button size="lg" asChild className="rounded-full">
              <span><Play className="h-4 w-4" /> {v.completed ? "Watch Again" : "Start Watching"}</span>
            </Button>
          </div>
        </div>
      </button>
    </Card>
  );
}

function CategoryPill({ label, icon, count, active, onClick }: { label: string; icon?: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 inline-flex items-center gap-2 px-4 h-9 rounded-full text-sm font-medium border transition-all",
        active ? "bg-foreground text-background border-foreground shadow" : "bg-card text-foreground border-border hover:border-foreground/40 hover:bg-muted",
      )}
    >
      {icon && <span>{icon}</span>}
      {label}
      {typeof count === "number" && (
        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", active ? "bg-background/20 text-background" : "bg-muted text-muted-foreground")}>{count}</span>
      )}
    </button>
  );
}

function VideoCard({ v, onWatch }: { v: TrainingVideo; onWatch: (id: number) => void }) {
  return (
    <button type="button" onClick={() => onWatch(v.id)} className="group block h-full w-full text-left">
      <Card className="h-full flex flex-col overflow-hidden border-border/70 shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-card)] hover:-translate-y-0.5 transition-all">
        <Thumb v={v} className="aspect-video" />
        <div className="p-3.5 flex flex-col flex-1">
          <p className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-primary transition">{v.title}</p>
          <div className="mt-auto pt-3 flex items-center justify-between gap-2">
            <Badge variant="outline" className="text-[10px] font-medium">{v.category}</Badge>
            <span className="inline-flex items-center gap-1.5 h-8 shrink-0 px-3.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-sm group-hover:gap-2.5 transition-all">
              <Play className="h-3.5 w-3.5 fill-current" />
              Watch
            </span>
          </div>
        </div>
      </Card>
    </button>
  );
}
