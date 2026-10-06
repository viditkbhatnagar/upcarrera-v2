// Documents tab: the application's uploaded documents with their SA review state.
// When the caller can act at Student Affairs verification, each document gets
// Verify / Reject controls (POST /applications/:id/documents/:docId/review).
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileText,
  Download,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  getDocuments,
  reviewDocument,
  applicationKeys,
  type ApplicationDocument,
} from "@/lib/api/applications";
import { applicationDocumentFileUrl } from "@/lib/api/application-form";
import { DOC_STATUS_BADGE } from "./stage-model";
import { SectionCard, EmptyPanel, formatDate } from "./detail-ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function docStatusLabel(status: ApplicationDocument["verification_status"]): string {
  if (status === "verified") return "Verified";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

async function downloadDocument(appId: number, doc: ApplicationDocument): Promise<void> {
  // Scoped, record-access-guarded stream: GET /applications/:id/documents/:docId/file.
  const url = await applicationDocumentFileUrl(appId, doc.id);
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  a.download = doc.original_name ?? doc.label ?? `document-${doc.id}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

interface DocumentsTabProps {
  appId: number;
  canReview: boolean;
  onChanged: () => void;
}

export function DocumentsTab({ appId, canReview, onChanged }: DocumentsTabProps) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: applicationKeys.documents(appId),
    queryFn: () => getDocuments(appId),
  });

  if (isLoading) {
    return (
      <SectionCard title="Documents" icon={<FileText className="h-4 w-4" />}>
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </SectionCard>
    );
  }

  if (isError) {
    return (
      <SectionCard title="Documents" icon={<FileText className="h-4 w-4" />}>
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          {error instanceof ApiError ? error.message : "Could not load documents."}
        </div>
      </SectionCard>
    );
  }

  const docs = data?.items ?? [];

  return (
    <SectionCard
      title="Documents"
      icon={<FileText className="h-4 w-4" />}
      action={
        canReview ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-300">
            <ShieldCheck className="h-3.5 w-3.5" /> Review mode
          </span>
        ) : undefined
      }
    >
      {docs.length === 0 ? (
        <EmptyPanel
          icon={<FileText className="h-6 w-6" />}
          title="No documents uploaded yet"
          hint="Documents attached to this application will appear here with their review status."
        />
      ) : (
        <ul className="space-y-3">
          {docs.map((doc) => (
            <DocumentRow
              key={doc.id}
              appId={appId}
              doc={doc}
              canReview={canReview}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

interface DocumentRowProps {
  appId: number;
  doc: ApplicationDocument;
  canReview: boolean;
  onChanged: () => void;
}

function DocumentRow({ appId, doc, canReview, onChanged }: DocumentRowProps) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [downloading, setDownloading] = useState(false);

  const mutation = useMutation({
    mutationFn: (vars: { status: "verified" | "rejected"; reason?: string }) =>
      reviewDocument(appId, doc.id, vars),
    onSuccess: (_res, vars) => {
      toast.success(vars.status === "verified" ? "Document verified." : "Document rejected.");
      setRejecting(false);
      setReason("");
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not record the review."),
  });

  const status = doc.verification_status;
  const badge = DOC_STATUS_BADGE[status ?? "pending"] ?? DOC_STATUS_BADGE.pending;

  const onDownload = async () => {
    setDownloading(true);
    try {
      await downloadDocument(appId, doc);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not open the document.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <li className="rounded-xl border border-border bg-background p-4 transition hover:border-primary/30">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <FileText className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">
              {doc.label || doc.original_name || `Document #${doc.id}`}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {doc.original_name ?? "—"} · {formatDate(doc.created_at)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
              badge,
            )}
          >
            {docStatusLabel(status)}
          </span>
          <Button variant="outline" size="sm" onClick={onDownload} disabled={downloading}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            View
          </Button>
        </div>
      </div>

      {doc.rejection_reason && status === "rejected" && (
        <div className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
          Rejected: {doc.rejection_reason}
        </div>
      )}

      {canReview && (
        <div className="mt-3 border-t border-border pt-3">
          {rejecting ? (
            <div className="space-y-2">
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Reason for rejecting this document"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={reason.trim() === "" || mutation.isPending}
                  onClick={() => mutation.mutate({ status: "rejected", reason: reason.trim() })}
                >
                  {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirm reject
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRejecting(true)}
                disabled={mutation.isPending}
              >
                <XCircle className="h-4 w-4" /> Reject
              </Button>
              <Button
                size="sm"
                onClick={() => mutation.mutate({ status: "verified" })}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Verify
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
