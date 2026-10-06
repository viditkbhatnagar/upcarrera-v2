import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ClipboardList,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  FileText,
  Info,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  listDocumentRequirements,
  listDocumentTypes,
  createDocumentRequirement,
  updateDocumentRequirement,
  deleteDocumentRequirement,
  masterSettingsKeys,
  CANONICAL_COURSE_LEVELS,
  COURSE_LEVEL_LABELS,
  APPLIES_WHEN_OPTIONS,
  type CanonicalCourseLevel,
  type DocumentRequirement,
  type DocumentRequirementInput,
} from "@/lib/api/master-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/administration/document-checklist")({
  head: () => ({ meta: [{ title: "Document Checklist — upCarrera" }] }),
  component: DocumentChecklistPage,
});

interface DraftState {
  id: number | null;
  document_type_id: string;
  is_required: boolean;
  applies_when: string; // 'always' | 'employment'
  max_files: string;
  help_text: string;
  sort_order: string;
}

const emptyDraft = (nextSort: number): DraftState => ({
  id: null,
  document_type_id: "",
  is_required: true,
  applies_when: "always",
  max_files: "1",
  help_text: "",
  sort_order: String(nextSort),
});

function DocumentChecklistPage() {
  const qc = useQueryClient();
  const [level, setLevel] = useState<CanonicalCourseLevel>("ug");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<DraftState>(emptyDraft(0));
  const [confirmDelete, setConfirmDelete] = useState<DocumentRequirement | null>(null);

  const reqsQuery = useQuery({
    queryKey: masterSettingsKeys.requirements(level),
    queryFn: () => listDocumentRequirements(level),
  });
  const typesQuery = useQuery({
    queryKey: masterSettingsKeys.documentTypes,
    queryFn: () => listDocumentTypes(),
  });

  const rows = useMemo(
    () => [...(reqsQuery.data?.items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [reqsQuery.data],
  );
  const typeTitle = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of typesQuery.data?.items ?? []) map.set(t.id, t.title ?? `Type ${t.id}`);
    return map;
  }, [typesQuery.data]);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: masterSettingsKeys.requirements(level) });

  const saveMutation = useMutation({
    mutationFn: (payload: { id: number | null; body: DocumentRequirementInput }) =>
      payload.id == null
        ? createDocumentRequirement(payload.body)
        : updateDocumentRequirement(payload.id, payload.body),
    onSuccess: () => {
      toast.success(draft.id == null ? "Requirement added." : "Requirement updated.");
      setDialogOpen(false);
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not save the requirement."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteDocumentRequirement(id),
    onSuccess: () => {
      toast.success("Requirement removed.");
      setConfirmDelete(null);
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not remove the requirement."),
  });

  const reorderMutation = useMutation({
    mutationFn: async (vars: { a: DocumentRequirement; b: DocumentRequirement }) => {
      // Swap the two rows' sort_order values (two PATCHes under one action).
      await updateDocumentRequirement(vars.a.id, { sort_order: vars.b.sort_order });
      await updateDocumentRequirement(vars.b.id, { sort_order: vars.a.sort_order });
    },
    onSuccess: () => invalidate(),
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not reorder."),
  });

  const openCreate = () => {
    const nextSort = rows.length ? Math.max(...rows.map((r) => r.sort_order)) + 1 : 1;
    setDraft(emptyDraft(nextSort));
    setDialogOpen(true);
  };

  const openEdit = (row: DocumentRequirement) => {
    setDraft({
      id: row.id,
      document_type_id: String(row.document_type_id),
      is_required: row.is_required,
      applies_when: row.applies_when === "employment" ? "employment" : "always",
      max_files: String(row.max_files),
      help_text: row.help_text ?? "",
      sort_order: String(row.sort_order),
    });
    setDialogOpen(true);
  };

  const submit = () => {
    const documentTypeId = Number(draft.document_type_id);
    if (!Number.isInteger(documentTypeId) || documentTypeId <= 0) {
      toast.error("Choose a document type.");
      return;
    }
    const maxFiles = Number(draft.max_files);
    const sortOrder = Number(draft.sort_order);
    const body: DocumentRequirementInput = {
      course_level: level,
      document_type_id: documentTypeId,
      is_required: draft.is_required,
      applies_when: draft.applies_when,
      max_files: Number.isInteger(maxFiles) && maxFiles > 0 ? maxFiles : 1,
      help_text: draft.help_text.trim() ? draft.help_text.trim() : null,
      sort_order: Number.isInteger(sortOrder) && sortOrder >= 0 ? sortOrder : 0,
    };
    saveMutation.mutate({ id: draft.id, body });
  };

  const move = (index: number, dir: -1 | 1) => {
    const other = index + dir;
    if (other < 0 || other >= rows.length) return;
    reorderMutation.mutate({ a: rows[index], b: rows[other] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Master Settings
          </div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            <ClipboardList className="h-6 w-6 text-primary" /> Document Checklist
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The documents an applicant must upload, per course level. Student Affairs cannot approve
            an application until every <span className="font-medium text-foreground">required</span>{" "}
            document here is verified.
          </p>
        </div>
        <Button onClick={openCreate} disabled={typesQuery.isLoading}>
          <Plus className="h-4 w-4" /> Add requirement
        </Button>
      </div>

      {/* Level selector */}
      <div className="flex flex-wrap gap-2">
        {CANONICAL_COURSE_LEVELS.map((lvl) => (
          <button
            key={lvl}
            onClick={() => setLevel(lvl)}
            className={[
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors ring-1 ring-inset",
              lvl === level
                ? "bg-primary text-primary-foreground ring-primary"
                : "bg-surface text-muted-foreground ring-border hover:bg-muted hover:text-foreground",
            ].join(" ")}
          >
            {COURSE_LEVEL_LABELS[lvl]}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {reqsQuery.isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : reqsQuery.isError ? (
          <div className="flex items-center gap-2 px-6 py-10 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            {reqsQuery.error instanceof ApiError
              ? reqsQuery.error.message
              : "Could not load the checklist."}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="text-sm font-semibold text-foreground">
              No documents configured for {COURSE_LEVEL_LABELS[level]}
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              Add the documents applicants to a {COURSE_LEVEL_LABELS[level].toLowerCase()} course
              must upload. With none configured, the approval gate falls back to “at least one
              verified document”.
            </p>
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add requirement
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Order</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Applies</TableHead>
                <TableHead className="text-center">Max files</TableHead>
                <TableHead>Help text</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <button
                        className="grid h-6 w-6 place-items-center rounded hover:bg-muted disabled:opacity-30"
                        onClick={() => move(index, -1)}
                        disabled={index === 0 || reorderMutation.isPending}
                        aria-label="Move up"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="grid h-6 w-6 place-items-center rounded hover:bg-muted disabled:opacity-30"
                        onClick={() => move(index, 1)}
                        disabled={index === rows.length - 1 || reorderMutation.isPending}
                        aria-label="Move down"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-foreground">
                    {row.document_type_title ?? typeTitle.get(row.document_type_id) ?? `Type ${row.document_type_id}`}
                  </TableCell>
                  <TableCell>
                    {row.is_required ? (
                      <Badge>Required</Badge>
                    ) : (
                      <Badge variant="secondary">Optional</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.applies_when === "employment" ? (
                      <span className="text-xs text-muted-foreground">If employed</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Always</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">{row.max_files}</TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                    {row.help_text ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConfirmDelete(row)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {draft.id == null ? "Add document requirement" : "Edit document requirement"}
            </DialogTitle>
            <DialogDescription>
              For {COURSE_LEVEL_LABELS[level]} courses.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dr-type">Document type</Label>
              <Select
                value={draft.document_type_id || undefined}
                onValueChange={(v) => setDraft((p) => ({ ...p, document_type_id: v }))}
                disabled={draft.id != null}
              >
                <SelectTrigger id="dr-type">
                  <SelectValue placeholder="Select a document type" />
                </SelectTrigger>
                <SelectContent>
                  {(typesQuery.data?.items ?? []).map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.title ?? `Type ${t.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div>
                <Label htmlFor="dr-required" className="cursor-pointer">
                  Required
                </Label>
                <p className="text-xs text-muted-foreground">Blocks SA approval until verified.</p>
              </div>
              <Switch
                id="dr-required"
                checked={draft.is_required}
                onCheckedChange={(v) => setDraft((p) => ({ ...p, is_required: v }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="dr-applies">Applies when</Label>
                <Select
                  value={draft.applies_when}
                  onValueChange={(v) => setDraft((p) => ({ ...p, applies_when: v }))}
                >
                  <SelectTrigger id="dr-applies">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APPLIES_WHEN_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt === "always" ? "Always" : "Only if employed"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dr-maxfiles">Max files</Label>
                <Input
                  id="dr-maxfiles"
                  type="number"
                  min={1}
                  max={20}
                  value={draft.max_files}
                  onChange={(e) => setDraft((p) => ({ ...p, max_files: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dr-help">Help text</Label>
              <Textarea
                id="dr-help"
                rows={2}
                value={draft.help_text}
                placeholder="Guidance shown to the applicant (optional)"
                onChange={(e) => setDraft((p) => ({ ...p, help_text: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dr-sort">Sort order</Label>
              <Input
                id="dr-sort"
                type="number"
                min={0}
                value={draft.sort_order}
                onChange={(e) => setDraft((p) => ({ ...p, sort_order: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {draft.id == null ? "Add requirement" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={confirmDelete != null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this requirement?</DialogTitle>
            <DialogDescription>
              <span className="inline-flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" />
                {confirmDelete?.document_type_title ?? "This document"} will no longer be required
                for {COURSE_LEVEL_LABELS[level]} applicants.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
