// Edit Application dialog for the Applications list.
//
// QA AP09: the row "Edit" button did nothing. Edit seeds from the RAW row
// (GET /applications/:id) and PATCHes only the fields that changed — the same
// seed/diff discipline as the university/course/intake editors, so a display
// value can never be written back over real data. A field the operator CLEARED
// (the course after a university change, the specialisation after a course
// change) is sent as null, and a changed university needs a course.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPatch } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DuplicateChecking, DuplicateNotice, useDuplicateCheck } from "./duplicate-check";
import {
  academicBody,
  contactBody,
  DialogFooterButtons,
  ErrorBanner,
  errorText,
  LeadFields,
  type RawApplication,
  seedFromRaw,
  useLeadCatalogs,
  useLeadForm,
  validateLead,
} from "./lead-form";

export function EditApplicationDialog({
  applicationId,
  displayId,
  onClose,
}: {
  /** The numeric application_id (never the display id). null = closed. */
  applicationId: number | null;
  displayId: string | null;
  onClose: () => void;
}) {
  const open = applicationId != null;
  const raw = useQuery({
    queryKey: ["applications", "detail", applicationId],
    queryFn: () => apiGet<RawApplication>(`/applications/${applicationId}`),
    enabled: open,
    // Always seed from the current server row, not a cached copy.
    staleTime: 0,
    gcTime: 0,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto p-0">
        <DialogHeader className="px-6 pb-0 pt-6">
          <DialogTitle className="text-xl font-semibold">Edit Application</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{displayId}</span> — only the fields you change are saved.
          </DialogDescription>
        </DialogHeader>
        {raw.isLoading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading application…
          </div>
        ) : raw.isError || !raw.data ? (
          <div className="px-6 py-8">
            <ErrorBanner message={errorText(raw.error, "Couldn't load this application.")} />
          </div>
        ) : (
          <EditForm key={raw.data.application_id} row={raw.data} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({ row, onClose }: { row: RawApplication; onClose: () => void }) {
  const queryClient = useQueryClient();
  const seed = useMemo(() => seedFromRaw(row), [row]);
  const { form, errors, setErrors, update } = useLeadForm(seed);
  const catalogs = useLeadCatalogs(form);
  const [saveError, setSaveError] = useState<string | null>(null);

  const contact = contactBody(form, seed);
  const academic = academicBody(form, seed);
  const dirty = Object.keys(contact).length > 0 || Object.keys(academic).length > 0;

  // Only a CHANGED mobile/email can collide with another application.
  const duplicate = useDuplicateCheck(
    contact.phone !== undefined ? form.phone : "",
    contact.email !== undefined ? form.email : "",
    row.application_id,
  );

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (Object.keys(contact).length > 0) {
        await apiPatch(`/applications/${row.application_id}`, contact);
      }
      if (Object.keys(academic).length > 0) {
        try {
          await apiPatch(`/applications/${row.application_id}/academic`, academic);
        } catch (err) {
          if (Object.keys(contact).length === 0) throw err;
          throw new Error(
            `The contact details were saved, but the course details were not: ${errorText(err, "request failed")}`,
          );
        }
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
      toast.success("Application updated");
      onClose();
    },
    onError: (err) => {
      // A partial save still changed the row — refresh the list either way.
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
      setSaveError(errorText(err, "Could not save the changes. Please try again."));
    },
  });

  const save = () => {
    setSaveError(null);
    const next = validateLead(form, catalogs, seed);
    setErrors(next);
    if (Object.keys(next).length > 0 || duplicate.matches.length > 0 || !dirty) return;
    saveEdit.mutate();
  };

  return (
    <>
      <div className="space-y-4 px-6 py-5">
        <LeadFields form={form} errors={errors} update={update} catalogs={catalogs} seed={seed} />
        {row.pipeline_user == null && row.created_by != null && (
          <p className="text-[11px] text-muted-foreground">
            No counsellor is assigned; the list shows the user who created it.
          </p>
        )}
        <DuplicateChecking checking={duplicate.checking} />
        <DuplicateNotice matches={duplicate.matches} />
        <ErrorBanner message={saveError} />
      </div>
      <DialogFooterButtons
        onCancel={onClose}
        onSave={save}
        disabled={!dirty || saveEdit.isPending || duplicate.matches.length > 0}
        pending={saveEdit.isPending}
        label={dirty ? "Save changes" : "No changes"}
      />
    </>
  );
}
