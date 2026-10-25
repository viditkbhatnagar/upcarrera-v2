import { CheckCircle2, Loader2, VideoOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDuration, gradientFor, resolveVideoSource, type TrainingVideo } from "./training-model";

/**
 * Lightbox-style video viewer (Naji's layout: the film fills the popup with the
 * title underneath). Plays the real source: a YouTube / Vimeo embed or a direct
 * video file. A video with no URL yet shows a "not available" panel instead.
 */
export function VideoWatchDialog({
  video,
  open,
  onOpenChange,
  onToggleComplete,
  pending,
}: {
  video: TrainingVideo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleComplete: (video: TrainingVideo) => void;
  pending: boolean;
}) {
  const source = resolveVideoSource(video?.video_url);
  const duration = formatDuration(video?.duration_seconds);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {video && (
        <DialogContent className="max-w-3xl gap-0 overflow-hidden bg-background p-0">
          <div className="relative aspect-video bg-black">
            {source.kind === "embed" && (
              <iframe
                key={video.id}
                src={source.src}
                title={video.title}
                className="absolute inset-0 h-full w-full"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            )}
            {source.kind === "file" && (
              <video key={video.id} src={source.src} controls autoPlay playsInline className="absolute inset-0 h-full w-full" />
            )}
            {source.kind === "none" && (
              <div className={cn("absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br text-white", gradientFor(video.id))}>
                <div className="absolute inset-0 bg-black/45" />
                <VideoOff className="relative h-10 w-10" />
                <p className="relative text-sm font-medium">This video isn't available yet</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-start justify-between gap-3 p-4 pr-12 sm:p-5 sm:pr-12">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base leading-snug sm:text-lg">{video.title}</DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                {video.category}
                {duration ? ` · ${duration}` : ""}
              </DialogDescription>
              {video.description && <p className="mt-2 text-sm text-muted-foreground">{video.description}</p>}
            </div>
            <Button
              size="sm"
              variant={video.completed ? "outline" : "default"}
              disabled={pending}
              onClick={() => onToggleComplete(video)}
              className="shrink-0 gap-1.5"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {video.completed ? "Completed" : "Mark as completed"}
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
