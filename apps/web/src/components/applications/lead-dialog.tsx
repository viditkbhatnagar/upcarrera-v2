// Add Lead dialog for the Applications list (the Edit dialog lives in
// edit-application-dialog.tsx; both share lead-form.tsx).
//
// QA AP02: "Add Lead" used to build an id with Math.random(), show "Lead Created
// Successfully" and send nothing. It now creates the application with ONE
// POST /applications (the academic fields ride along, so a lead is never left
// half-saved), shows the id the SERVER issued (APP-YYYY-NNNNNN), and refreshes
// the list and stage counts by invalidating the ["applications"] queries.
//
// QA AP10: the mobile must be a 10-digit Indian number, and an applicant that
// already has an application is shown (with its counsellor) instead of saved
// twice. The server enforces both; this only says so earlier.

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eye, Plus } from "lucide-react";
import { apiPost } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { labelOf } from "./catalogs";
import { DuplicateChecking, DuplicateNotice, normalizeIndianMobile, useDuplicateCheck } from "./duplicate-check";
import {
  academicBody,
  DialogFooterButtons,
  EMPTY_FORM,
  ErrorBanner,
  errorText,
  LeadFields,
  useLeadCatalogs,
  useLeadForm,
  validateLead,
} from "./lead-form";


/* ---------------- Add Lead ---------------- */

interface CreatedApplication {
  application_id: number;
  custom_application_id: string | null;
  created_at: string | null;
}

interface CreatedSummary {
  id: string;
  name: string;
  university: string;
  course: string;
  intake: string | null;
  counsellor: string | null;
  createdAt: string | null;
}

export function AddLeadDialog({
  open,
  onClose,
  onShowInList,
}: {
  open: boolean;
  onClose: () => void;
  /** Close the dialog and narrow the list to this application id. */
  onShowInList: (displayId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { form, setForm, errors, setErrors, update } = useLeadForm(EMPTY_FORM);
  const catalogs = useLeadCatalogs(form);
  const [created, setCreated] = useState<CreatedSummary | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const duplicate = useDuplicateCheck(form.phone, form.email);

  // Default the assignee to the signed-in user (not a prototype name).
  const defaultCounsellor = catalogs.counsellors.currentUserId ?? "";
  useEffect(() => {
    if (open && !form.counsellor && defaultCounsellor) {
      setForm((f) => ({ ...f, counsellor: defaultCounsellor }));
    }
  }, [open, form.counsellor, defaultCounsellor, setForm]);

  const reset = () => {
    setForm({ ...EMPTY_FORM, counsellor: defaultCounsellor });
    setErrors({});
    setSaveError(null);
    setCreated(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const createLead = useMutation({
    mutationFn: () =>
      apiPost<CreatedApplication>("/applications", {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: normalizeIndianMobile(form.phone),
        ...academicBody(form, null),
      }),
    onSuccess: (row) => {
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
      const { universities, courses, intakes, counsellors } = catalogs;
      setCreated({
        id: row.custom_application_id || `APP-${row.application_id}`,
        name: form.name.trim(),
        university: labelOf(universities.options, form.university) ?? "—",
        course: labelOf(courses.options, form.course) ?? "—",
        intake: labelOf(intakes.options, form.intake),
        counsellor: labelOf(counsellors.assignable, form.counsellor),
        createdAt: row.created_at,
      });
    },
    onError: (err) => {
      // 409 = the applicant already has an application; refresh the notice too.
      void queryClient.invalidateQueries({ queryKey: ["applications", "check-duplicate"] });
      setSaveError(errorText(err, "Could not save the lead. Please try again."));
    },
  });

  const save = () => {
    setSaveError(null);
    const next = validateLead(form, catalogs, null);
    setErrors(next);
    if (Object.keys(next).length > 0 || duplicate.matches.length > 0) return;
    createLead.mutate();
  };

  const blocked = createLead.isPending || duplicate.matches.length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto p-0">
        {created ? (
          <CreatedScreen
            created={created}
            onClose={close}
            onShow={() => {
              const id = created.id;
              close();
              onShowInList(id);
            }}
            onAnother={reset}
          />
        ) : (
          <>
            <DialogHeader className="px-6 pb-0 pt-6">
              <DialogTitle className="text-xl font-semibold">Add New Lead</DialogTitle>
              <DialogDescription>Capture basic enquiry information.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 px-6 py-5">
              <LeadFields form={form} errors={errors} update={update} catalogs={catalogs} />
              <DuplicateChecking checking={duplicate.checking} />
              <DuplicateNotice
                matches={duplicate.matches}
                onShow={(id) => {
                  close();
                  onShowInList(id);
                }}
              />
              <ErrorBanner message={saveError} />
            </div>
            <DialogFooterButtons
              onCancel={close}
              onSave={save}
              disabled={blocked}
              pending={createLead.isPending}
              label="Save Lead"
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold text-foreground">{children}</span>
    </div>
  );
}

function CreatedScreen({
  created,
  onClose,
  onShow,
  onAnother,
}: {
  created: CreatedSummary;
  onClose: () => void;
  onShow: () => void;
  onAnother: () => void;
}) {
  const createdOn = created.createdAt ? new Date(created.createdAt) : null;
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-100">
        <CheckCircle2 className="h-7 w-7 text-emerald-600" />
      </div>
      <DialogTitle className="text-xl font-semibold">Lead saved</DialogTitle>
      <DialogDescription className="mt-1 text-sm text-muted-foreground">
        The application was created and is now in the list.
      </DialogDescription>

      <div className="mt-6 w-full space-y-3">
        <SummaryRow label="Application ID">
          <span className="font-mono">{created.id}</span>
        </SummaryRow>
        <SummaryRow label="Lead Name">{created.name}</SummaryRow>
        <SummaryRow label="University">{created.university}</SummaryRow>
        <SummaryRow label="Course">{created.course}</SummaryRow>
        {created.intake && <SummaryRow label="Intake">{created.intake}</SummaryRow>}
        <SummaryRow label="Counsellor">{created.counsellor ?? "Not assigned"}</SummaryRow>
        <SummaryRow label="Stage">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
            New Lead
          </span>
        </SummaryRow>
        {createdOn && !Number.isNaN(createdOn.getTime()) && (
          <SummaryRow label="Created On">
            {createdOn.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
          </SummaryRow>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
        >
          Close
        </button>
        <button
          type="button"
          onClick={onAnother}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
        >
          <Plus className="h-4 w-4" />
          Add another
        </button>
        <button
          type="button"
          onClick={onShow}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:bg-accent-hover"
        >
          <Eye className="h-4 w-4" />
          Show in list
        </button>
      </div>
    </div>
  );
}
