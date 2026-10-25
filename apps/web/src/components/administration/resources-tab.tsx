import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  contentAdminKeys,
  createResource,
  deleteResource,
  isHttpUrl,
  listResourcesAdmin,
  RESOURCE_TYPES,
  updateResource,
  type ResourceInput,
  type ResourceRow,
  type ResourceType,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDelete, errMessage, ListState, RowActions } from "./content-shared";

interface Draft {
  id: number | null;
  title: string;
  description: string;
  type: ResourceType;
  category: string;
  file_url: string;
  sort_order: string;
  status: boolean;
}

const emptyDraft = (sort: number): Draft => ({
  id: null,
  title: "",
  description: "",
  type: "PDF",
  category: "",
  file_url: "",
  sort_order: String(sort),
  status: true,
});

const toDraft = (r: ResourceRow): Draft => ({
  id: r.id,
  title: r.title,
  description: r.description ?? "",
  type: (RESOURCE_TYPES as readonly string[]).includes(r.type) ? (r.type as ResourceType) : "PDF",
  category: r.category ?? "",
  file_url: r.file_url ?? "",
  sort_order: String(r.sort_order),
  status: r.status,
});

function buildBody(d: Draft): { body: ResourceInput } | { error: string } {
  const title = d.title.trim();
  if (!title) return { error: "Title is required." };
  if (d.file_url.trim() && !isHttpUrl(d.file_url.trim()))
    return { error: "File URL must start with http:// or https://." };
  const sort = Number(d.sort_order || 0);
  if (!Number.isInteger(sort)) return { error: "Sort order must be a whole number." };
  return {
    body: {
      title,
      description: d.description.trim(),
      type: d.type,
      ...(d.category.trim() ? { category: d.category.trim() } : {}),
      ...(d.file_url.trim() ? { file_url: d.file_url.trim() } : {}),
      sort_order: sort,
      status: d.status,
    },
  };
}

export function ResourcesTab() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toDelete, setToDelete] = useState<ResourceRow | null>(null);

  const query = useQuery({ queryKey: contentAdminKeys.resources, queryFn: listResourcesAdmin });
  const rows = query.data?.items ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: contentAdminKeys.resources });

  const save = useMutation({
    mutationFn: ({ id, body }: { id: number | null; body: ResourceInput }) =>
      id == null ? createResource(body) : updateResource(id, body),
    onSuccess: (_d, v) => {
      toast.success(v.id == null ? "Resource added." : "Resource updated.");
      setDraft(null);
      invalidate();
    },
    onError: (e) => toast.error(errMessage(e, "Could not save the resource.")),
  });
  const toggle = useMutation({
    mutationFn: ({ id, status }: { id: number; status: boolean }) => updateResource(id, { status }),
    onSuccess: (_d, v) => {
      toast.success(v.status ? "Resource activated." : "Resource deactivated.");
      invalidate();
    },
    onError: (e) => toast.error(errMessage(e, "Could not update the resource.")),
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteResource(id),
    onSuccess: () => {
      toast.success("Resource deleted.");
      setToDelete(null);
      invalidate();
    },
    onError: (e) => toast.error(errMessage(e, "Could not delete the resource.")),
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
          <Plus className="h-4 w-4" /> Add resource
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <ListState
          loading={query.isLoading}
          error={query.error}
          empty={rows.length === 0}
          emptyText="No resources yet. Add the first one."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Order</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="tabular-nums">{r.sort_order}</TableCell>
                  <TableCell className="max-w-[320px]">
                    <div className="truncate font-medium text-foreground">{r.title}</div>
                    {r.file_url && (
                      <a
                        href={r.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-xs text-primary hover:underline"
                      >
                        {r.file_url}
                      </a>
                    )}
                  </TableCell>
                  <TableCell>{r.type}</TableCell>
                  <TableCell>{r.category}</TableCell>
                  <TableCell>
                    <Badge variant={r.status ? "default" : "secondary"}>
                      {r.status ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <RowActions
                      active={r.status}
                      busy={toggle.isPending}
                      label={r.title}
                      onToggle={(status) => toggle.mutate({ id: r.id, status })}
                      onEdit={() => setDraft(toDraft(r))}
                      onDelete={() => setToDelete(r)}
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
            <DialogTitle>{draft?.id == null ? "Add resource" : "Edit resource"}</DialogTitle>
            <DialogDescription>Shown in the counsellor Resources library when active.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="rs-title">Title</Label>
                <Input id="rs-title" maxLength={200} value={draft.title} onChange={(e) => set("title", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rs-desc">Description</Label>
                <Textarea id="rs-desc" rows={3} maxLength={5000} value={draft.description} onChange={(e) => set("description", e.target.value)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="rs-type">Type</Label>
                  <Select value={draft.type} onValueChange={(v) => set("type", v as ResourceType)}>
                    <SelectTrigger id="rs-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RESOURCE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="rs-cat">Category (folder)</Label>
                  <Input id="rs-cat" maxLength={80} value={draft.category} onChange={(e) => set("category", e.target.value)} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rs-url">File URL</Label>
                <Input id="rs-url" type="url" maxLength={500} placeholder="https://" value={draft.file_url} onChange={(e) => set("file_url", e.target.value)} />
              </div>
              <div className="flex items-end justify-between gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="rs-sort">Sort order</Label>
                  <Input id="rs-sort" type="number" className="w-28" value={draft.sort_order} onChange={(e) => set("sort_order", e.target.value)} />
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
