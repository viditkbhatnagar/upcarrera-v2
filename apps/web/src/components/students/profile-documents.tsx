// Documents tab of the student profile (QA ST01).
//
// It used to hard-code "not exposed by this endpoint yet" although
// GET /students/:id/documents existed — and that endpoint read the wrong key, so
// wiring it alone would have shown another empty tab. The API now keys on the
// student's users id (what every uploader writes) and adds rows uploaded with
// their application. Files download through the authenticated
// GET /files/student-document/:id/download.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFileBlobUrl, apiGet, ApiError } from "@/lib/api";
import type { ApiStudentDocument } from "./profile-types";
import { EmptyTab, SectionCard, TabError, TabLoading, errorText, formatDateTime } from "./profile-ui";

function fileName(path: string | null): string {
  if (!path) return "";
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

async function downloadDocument(doc: ApiStudentDocument): Promise<void> {
  const url = await apiFileBlobUrl(`/files/student-document/${doc.student_document_id}/download`);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName(doc.file) || `document-${doc.student_document_id}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function DocumentsTab({ studentId }: { studentId: number }) {
  const query = useQuery({
    queryKey: ["student-detail", studentId, "documents"],
    queryFn: () => apiGet<ApiStudentDocument[]>(`/students/${studentId}/documents`),
  });
  const [downloading, setDownloading] = useState<number | null>(null);

  if (query.isLoading) return <TabLoading label="Loading documents…" />;
  if (query.isError) {
    return (
      <TabError
        message={errorText(query.error, "The documents could not be loaded.")}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const docs = query.data ?? [];
  if (docs.length === 0) {
    return (
      <EmptyTab
        icon={FolderOpen}
        title="No documents on file"
        description="No document has been uploaded for this student or with their application."
      />
    );
  }

  const download = async (doc: ApiStudentDocument) => {
    setDownloading(doc.student_document_id);
    try {
      await downloadDocument(doc);
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.status === 404
          ? "This file isn't stored on this server. It may have been uploaded to the old CRM and not copied across."
          : errorText(err, "The file could not be downloaded."),
      );
    } finally {
      setDownloading(null);
    }
  };

  return (
    <SectionCard title={`Documents (${docs.length})`} icon={FolderOpen}>
      <ul className="divide-y divide-border/60">
        {docs.map((d) => (
          <li key={d.student_document_id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-foreground">
                {d.label?.trim() || "Untitled document"}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {formatDateTime(d.created_at)}
                {d.uploaded_by_name ? ` · by ${d.uploaded_by_name}` : ""}
                {d.source === "application" ? " · uploaded with the application" : ""}
              </div>
            </div>
            {d.file ? (
              <button
                onClick={() => void download(d)}
                disabled={downloading === d.student_document_id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-60"
              >
                {downloading === d.student_document_id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Download
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">No file attached</span>
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
