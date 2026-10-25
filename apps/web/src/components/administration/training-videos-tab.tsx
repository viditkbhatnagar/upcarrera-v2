import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  contentAdminKeys,
  createTrainingVideo,
  deleteTrainingVideo,
  isHttpUrl,
  listTrainingVideosAdmin,
  updateTrainingVideo,
  type TrainingVideoInput,
  type TrainingVideoRow,
} from "@/lib/api/content-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDelete, errMessage, ListState, RowActions } from "./content-shared";

interface Draft {
  id: number | null;
  title: string;
  description: string;
  category: string;
  video_url: string;
  thumbnail_url: string;
  duration_minutes: string;
  sort_order: string;
  status: boolean;
}

const emptyDraft = (sort: number): Draft => ({
  id: null,
  title: "",
  description: "",
  category: "",
  video_url: "",
  thumbnail_url: "",
  duration_minutes: "",
  sort_order: String(sort),
  status: true,
});

const toDraft = (v: TrainingVideoRow): Draft => ({
  id: v.id,
  title: v.title,
  description: v.description ?? "",
  category: v.category ?? "",
  video_url: v.video_url ?? "",
  thumbnail_url: v.thumbnail_url ?? "",
  duration_minutes: v.duration_seconds ? String(Math.round(v.duration_seconds / 60)) : "",
  sort_order: String(v.sort_order),
  status: v.status,
});

/** Validates the draft; returns the API body or an error message. */
function buildBody(d: Draft): { body: TrainingVideoInput } | { error: string } {
  const title = d.title.trim();
  if (!title) return { error: "Title is required." };
  if (d.video_url.trim() && !isHttpUrl(d.video_url.trim()))
    return { error: "Video URL must start with http:// or https://." };
  if (d.thumbnail_url.trim() && !isHttpUrl(d.thumbnail_url.trim()))
    return { error: "Thumbnail URL must start with http:// or https://." };
  const minutes = d.duration_minutes.trim() === "" ? null : Number(d.duration_minutes);
  if (minutes !== null && (!Number.isFinite(minutes) || minutes < 0))
    return { error: "Duration must be zero or more minutes." };
  const sort = Number(d.sort_order || 0);
  if (!Number.isInteger(sort)) return { error: "Sort order must be a whole number." };
  return {
    body: {
      title,
      description: d.description.trim(),
      ...(d.category.trim() ? { category: d.category.trim() } : {}),
      ...(d.video_url.trim() ? { video_url: d.video_url.trim() } : {}),
      ...(d.thumbnail_url.trim() ? { thumbnail_url: d.thumbnail_url.trim() } : {}),
      ...(minutes !== null ? { duration_seconds: Math.round(minutes * 60) } : {}),
      sort_order: sort,
      status: d.status,
    },
  };
}

export function TrainingVideosTab() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toDelete, setToDelete] = useState<TrainingVideoRow | null>(null);

  const query = useQuery({ queryKey: contentAdminKeys.videos, queryFn: listTrainingVideosAdmin });
  const rows = query.data?.items ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: contentAdminKeys.videos });

  const save = useMutation({
    mutationFn: ({ id, body }: { id: number | null; body: TrainingVideoInput }) =>
      id == null ? createTrainingVideo(body) : updateTrainingVideo(id, body),
    onSuccess: (_d, v) => {
      toast.success(v.id == null ? "Video added." : "Video updated.");
      setDraft(null);
      invalidate();
    },
    onError: (e) => toast.error(errMessage(e, "Could not save the video.")),
  });
  const toggle = useMutation({
    mutationFn: ({ id, status }: { id: number; status: boolean }) => updateTrainingVideo(id, { status }),
    onSuccess: (_d, v) => {
      toast.success(v.status ? "Video activated." : "Video deactivated.");
      invalidate();
    },
    onError: (e) => toast.error(errMessage(e, "Could not update the video.")),
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteTrainingVideo(id),
    onSuccess: () => {
      toast.success("Video deleted.");
      setToDelete(null);
      invalidate();
    },
    onError: (e) => toast.error(errMessage(e, "Could not delete the video.")),
  });

  const submit = () => {
    if (!draft) return;
    const r = buildBody(draft);
    if ("error" in r) return toast.error(r.error);
    save.mutate({ id: draft.id, body: r.body });
  };
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const nextSort = rows.length ? Math.max(...rows.map((r) => r.sort_order)) + 1 : 1;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setDraft(emptyDraft(nextSort))}>
          <Plus className="h-4 w-4" /> Add video
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <ListState
          loading={query.isLoading}
          error={query.error}
          empty={rows.length === 0}
          emptyText="No training videos yet. Add the first one."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Order</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="tabular-nums">{v.sort_order}</TableCell>
                  <TableCell className="max-w-[320px]">
                    <div className="truncate font-medium text-foreground">{v.title}</div>
                    {v.video_url && (
                      <a
                        href={v.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-xs text-primary hover:underline"
                      >
                        {v.video_url}
                      </a>
                    )}
                  </TableCell>
                  <TableCell>{v.category}</TableCell>
                  <TableCell className="tabular-nums">
                    {v.duration_seconds ? `${Math.round(v.duration_seconds / 60)} min` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={v.status ? "default" : "secondary"}>
                      {v.status ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <RowActions
                      active={v.status}
                      busy={toggle.isPending}
                      label={v.title}
                      onToggle={(status) => toggle.mutate({ id: v.id, status })}
                      onEdit={() => setDraft(toDraft(v))}
                      onDelete={() => setToDelete(v)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ListState>
      </div>

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{draft?.id == null ? "Add training video" : "Edit training video"}</DialogTitle>
            <DialogDescription>Shown in the counsellor Training Center when active.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="tv-title">Title</Label>
                <Input id="tv-title" maxLength={200} value={draft.title} onChange={(e) => set("title", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tv-desc">Description</Label>
                <Textarea id="tv-desc" rows={3} maxLength={5000} value={draft.description} onChange={(e) => set("description", e.target.value)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="tv-cat">Category</Label>
                  <Input id="tv-cat" maxLength={80} value={draft.category} onChange={(e) => set("category", e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="tv-dur">Duration (minutes)</Label>
                  <Input id="tv-dur" type="number" min={0} value={draft.duration_minutes} onChange={(e) => set("duration_minutes", e.target.value)} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tv-url">Video URL</Label>
                <Input id="tv-url" type="url" maxLength={500} placeholder="https://" value={draft.video_url} onChange={(e) => set("video_url", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tv-thumb">Thumbnail URL</Label>
                <Input id="tv-thumb" type="url" maxLength={500} placeholder="https://" value={draft.thumbnail_url} onChange={(e) => set("thumbnail_url", e.target.value)} />
              </div>
              <div className="flex items-end justify-between gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="tv-sort">Sort order</Label>
                  <Input id="tv-sort" type="number" className="w-28" value={draft.sort_order} onChange={(e) => set("sort_order", e.target.value)} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={draft.status} onCheckedChange={(v) => set("status", v)} /> Active
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDelete
        open={toDelete !== null}
        title={toDelete?.title ?? null}
        busy={remove.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </div>
  );
}
