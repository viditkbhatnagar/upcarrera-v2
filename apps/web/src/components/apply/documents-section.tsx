import { useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Eye, FileText, Loader2, Trash2, Upload } from "lucide-react";
import {
  deleteDocument,
  documentBlobUrl,
  uploadDocument,
  type ChecklistItem,
  type DocFile,
} from "@/lib/applicant-api";
import { cn } from "@/lib/utils";
import { SectionCard } from "./fields";
import { SectionFooter } from "./section-footer";
import { handleSaveError } from "./use-section-save";
import type { SectionProps } from "./types";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ".pdf,.jpg,.jpeg,.png";

function sizeLabel(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ChecklistRow({
  item,
  busy,
  onUpload,
  onDelete,
  progress,
}: {
  item: ChecklistItem;
  busy: boolean;
  onUpload: (requirementId: number, file: File) => void;
  onDelete: (docId: number) => void;
  progress: number | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasFiles = item.files.length > 0;

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("That file is larger than 5 MB. Please choose a smaller one.");
      return;
    }
    onUpload(item.requirement_id, file);
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">{item.label}</span>
            {item.is_required ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Required</span>
            ) : (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Optional</span>
            )}
            {hasFiles && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          </div>
          {item.help_text && <p className="mt-0.5 text-xs text-muted-foreground">{item.help_text}</p>}
        </div>
      </div>

      {hasFiles && (
        <ul className="mt-3 space-y-2">
          {item.files.map((f) => (
            <FileRow key={f.id} file={f} onDelete={() => onDelete(f.id)} disabled={busy} />
          ))}
        </ul>
      )}

      {progress != null ? (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Uploading… {progress}%</p>
        </div>
      ) : (
        <>
          <input ref={inputRef} type="file" accept={ACCEPT} capture="environment" className="hidden" onChange={pick} />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50"
          >
            <Upload className="h-4 w-4" /> {hasFiles ? "Replace file" : "Upload file"}
          </button>
        </>
      )}
    </div>
  );
}

function FileRow({ file, onDelete, disabled }: { file: DocFile; onDelete: () => void; disabled: boolean }) {
  const [previewing, setPreviewing] = useState(false);
  async function preview() {
    setPreviewing(true);
    try {
      const url = await documentBlobUrl(file.id);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      handleSaveError(e);
    } finally {
      setPreviewing(false);
    }
  }
  return (
    <li className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2">
      <span className="flex min-w-0 items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm text-foreground">{file.original_name ?? file.label ?? "Document"}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{sizeLabel(file.size_bytes)}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={preview} disabled={previewing} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Preview">
          {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
        </button>
        <button type="button" onClick={onDelete} disabled={disabled} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Delete">
          <Trash2 className="h-4 w-4" />
        </button>
      </span>
    </li>
  );
}

export function DocumentsSection({ app, busy, setBusy, reload, goNext }: SectionProps) {
  const [progressByReq, setProgressByReq] = useState<Record<number, number | null>>({});
  const checklist = app.documents.checklist;

  async function onUpload(requirementId: number, file: File) {
    setBusy(true);
    setProgressByReq((p) => ({ ...p, [requirementId]: 0 }));
    try {
      await uploadDocument(file, requirementId, (pct) => setProgressByReq((p) => ({ ...p, [requirementId]: pct })));
      toast.success("Document uploaded");
      await reload();
    } catch (e) {
      handleSaveError(e);
    } finally {
      setProgressByReq((p) => ({ ...p, [requirementId]: null }));
      setBusy(false);
    }
  }

  async function onDelete(docId: number) {
    setBusy(true);
    try {
      await deleteDocument(docId);
      toast.success("Document removed");
      await reload();
    } catch (e) {
      handleSaveError(e);
    } finally {
      setBusy(false);
    }
  }

  const requiredMissing = checklist.filter((c) => c.is_required && c.files.length === 0).length;

  return (
    <SectionCard title="Documents" description="Upload clear photos or PDFs (max 5 MB each).">
      {checklist.length === 0 ? (
        <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          No documents are required for this program. You can continue.
        </p>
      ) : (
        <div className="space-y-3">
          {checklist.map((item) => (
            <ChecklistRow
              key={item.requirement_id}
              item={item}
              busy={busy}
              progress={progressByReq[item.requirement_id] ?? null}
              onUpload={onUpload}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {requiredMissing > 0 && (
        <p className={cn("mt-4 text-sm font-medium text-amber-600 dark:text-amber-400")}>
          {requiredMissing} required document{requiredMissing > 1 ? "s" : ""} still needed.
        </p>
      )}

      <SectionFooter busy={busy} showDraft={false} continueLabel="Continue" onContinue={goNext} />
    </SectionCard>
  );
}
