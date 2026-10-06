// Edit Student dialog for the Students list (QA ST04).
//
// The row's Edit button did nothing. It now opens this dialog, which loads the
// RAW row from GET /students/:id, seeds the form from it, and sends
// PATCH /students/:id with only the fields that changed (student-edit-form.ts).
// The success toast fires only after the server confirms the save.
//
// Name, email and phone live on the student's login account (users), which the
// live LMS also reads; this dialog edits the students record only and says so.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPatch } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type CatalogOption,
  useCounsellorOptions,
  useCourseOptions,
  useIntakeOptions,
  useLeadSourceOptions,
  useSpecialisationOptions,
} from "@/components/applications/catalogs";
import {
  type RawStudent,
  type StudentForm,
  type StudentFormErrors,
  type StudentFormKey,
  changedFields,
  seedFromRaw,
  validateStudentForm,
} from "./student-edit-form";
import { dash, errorText } from "./profile-ui";

/** Radix Select cannot hold "" as an item value; this stands for "none". */
const NONE = "__none__";

/** students.admission_status codes (the API's ADMISSION_STATUS_LABELS). */
const STATUS_OPTIONS: CatalogOption[] = [
  { value: "0", label: "Pending" },
  { value: "1", label: "In Progress" },
  { value: "2", label: "Enrolled" },
  { value: "3", label: "Passed Out" },
  { value: "4", label: "Dropout" },
  { value: "5", label: "Cancelled" },
];

/** Keep the current value selectable even when the catalog no longer lists it. */
function withCurrent(
  options: CatalogOption[],
  value: string,
  label: string | null | undefined,
): CatalogOption[] {
  if (!value || options.some((o) => o.value === value)) return options;
  return [{ value, label: label?.trim() || "Current value" }, ...options];
}

export function StudentEditDialog({
  studentId,
  displayId,
  onClose,
}: {
  /** The numeric students.id (never the display id). null = closed. */
  studentId: number | null;
  displayId: string | null;
  onClose: () => void;
}) {
  const open = studentId != null;
  const raw = useQuery({
    queryKey: ["students", "edit-seed", studentId],
    queryFn: () => apiGet<RawStudent>(`/students/${studentId}`),
    enabled: open,
    // Always seed from the current server row, not a cached copy.
    staleTime: 0,
    gcTime: 0,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto p-0">
        <DialogHeader className="px-6 pb-0 pt-6">
          <DialogTitle className="text-xl font-semibold">Edit Student</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{displayId}</span> — only the fields you change are saved.
          </DialogDescription>
        </DialogHeader>
        {raw.isLoading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading student…
          </div>
        ) : raw.isError || !raw.data ? (
          <div className="px-6 py-8">
            <ErrorBanner message={errorText(raw.error, "Couldn't load this student.")} />
          </div>
        ) : (
          <EditForm key={raw.data.id} row={raw.data} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function useEditCatalogs(form: StudentForm, row: RawStudent) {
  const courses = useCourseOptions(null);
  const specialisations = useSpecialisationOptions(form.course_id || null);
  const intakes = useIntakeOptions();
  const counsellors = useCounsellorOptions();
  const sources = useLeadSourceOptions();
  return {
    courses: withCurrent(courses.options, String(row.course_id ?? ""), row.course_title),
    specialisations: withCurrent(
      specialisations.options,
      // Only keep the stored specialisation while the stored course is selected.
      form.course_id === String(row.course_id ?? "") ? String(row.specialisation_id ?? "") : "",
      row.specialisation_title,
    ),
    intakes: withCurrent(intakes.options, String(row.session_id ?? ""), row.session_title),
    counsellors: withCurrent(
      counsellors.assignable,
      String(row.consultant_id ?? ""),
      row.consultant_name,
    ),
    sources: withCurrent(sources.options, row.source?.trim() ?? "", row.source),
  };
}

function EditForm({ row, onClose }: { row: RawStudent; onClose: () => void }) {
  const queryClient = useQueryClient();
  const seed = useMemo(() => seedFromRaw(row), [row]);
  const [form, setForm] = useState<StudentForm>(seed);
  const [errors, setErrors] = useState<StudentFormErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const catalogs = useEditCatalogs(form, row);

  const body = changedFields(form, seed);
  const dirty = Object.keys(body).length > 0;

  const update = (key: StudentFormKey, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // A new course invalidates a specialisation that belongs to the old one.
      if (key === "course_id" && value !== prev.course_id) next.specialisation_id = "";
      return next;
    });
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const save = useMutation({
    mutationFn: () => apiPatch(`/students/${row.id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["students"] });
      void queryClient.invalidateQueries({ queryKey: ["student-detail", row.id] });
      toast.success("Student updated");
      onClose();
    },
    onError: (err) => setSaveError(errorText(err, "Could not save the changes. Please try again.")),
  });

  const submit = () => {
    setSaveError(null);
    const next = validateStudentForm(form, seed);
    setErrors(next);
    if (Object.keys(next).length > 0 || !dirty) return;
    save.mutate();
  };

  const field = { form, errors, update };

  return (
    <>
      <div className="space-y-5 px-6 py-5">
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
          <div className="font-semibold text-foreground">{dash(row.name)}</div>
          <div className="text-xs text-muted-foreground">
            {dash(row.email)} · {dash(row.phone)}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Name, email and phone belong to the student’s login account and are not changed here.
          </p>
        </div>

        <FieldGroup title="Admission">
          <SelectField {...field} name="admission_status" label="Status" options={STATUS_OPTIONS} />
          <SelectField {...field} name="consultant_id" label="Counsellor" options={catalogs.counsellors} />
          <TextField {...field} name="enrollment_id" label="Enrollment ID" />
          <TextField {...field} name="enrollment_date" label="Enrollment date" type="date" />
          <SelectField {...field} name="source" label="Source" options={catalogs.sources} clearable />
          <TextField {...field} name="mode" label="Mode" placeholder="e.g. Online" />
        </FieldGroup>

        <FieldGroup title="Programme">
          <SelectField {...field} name="course_id" label="Course" options={catalogs.courses} clearable />
          <SelectField
            {...field}
            name="specialisation_id"
            label="Specialisation"
            options={catalogs.specialisations}
            clearable
            disabled={!form.course_id}
          />
          <SelectField {...field} name="session_id" label="Session" options={catalogs.intakes} clearable />
          <TextField {...field} name="abc_id" label="ABC ID" />
        </FieldGroup>

        <FieldGroup title="Contact & address">
          <TextField {...field} name="whatsapp_no" label="WhatsApp number" placeholder="+91 98765 43210" />
          <TextField {...field} name="second_phone" label="Alternate phone" />
          <TextField {...field} name="district" label="District" />
          <TextField {...field} name="state" label="State" />
          <div className="sm:col-span-2">
            <Label htmlFor="student-edit-address" className="text-xs font-semibold">
              Address
            </Label>
            <Textarea
              id="student-edit-address"
              className="mt-1.5 min-h-[72px] text-sm"
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
            />
          </div>
        </FieldGroup>

        {form.admission_status === "4" && seed.admission_status !== "4" && (
          <p className="text-xs text-orange-700">
            Saving as Dropout also records the dropout date on the student’s account.
          </p>
        )}
        <ErrorBanner message={saveError} />
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!dirty || save.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          {save.isPending ? "Saving…" : dirty ? "Save changes" : "No changes"}
        </button>
      </div>
    </>
  );
}

/* ---------------- field primitives ---------------- */

interface FieldProps {
  form: StudentForm;
  errors: StudentFormErrors;
  update: (key: StudentFormKey, value: string) => void;
  name: StudentFormKey;
  label: string;
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-[11px] text-red-600">{message}</p> : null;
}

function TextField({
  form,
  errors,
  update,
  name,
  label,
  type = "text",
  placeholder,
}: FieldProps & { type?: string; placeholder?: string }) {
  const id = `student-edit-${name}`;
  return (
    <div>
      <Label htmlFor={id} className="text-xs font-semibold">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        className={cn("mt-1.5 h-9 text-sm", errors[name] && "border-red-400")}
        value={form[name]}
        onChange={(e) => update(name, e.target.value)}
      />
      <FieldError message={errors[name]} />
    </div>
  );
}

function SelectField({
  form,
  errors,
  update,
  name,
  label,
  options,
  clearable,
  disabled,
}: FieldProps & { options: CatalogOption[]; clearable?: boolean; disabled?: boolean }) {
  return (
    <div>
      <Label className="text-xs font-semibold">{label}</Label>
      <Select
        value={form[name] || (clearable ? NONE : undefined)}
        onValueChange={(v) => update(name, v === NONE ? "" : v)}
        disabled={disabled}
      >
        <SelectTrigger className={cn("mt-1.5 h-9 text-sm", errors[name] && "border-red-400")}>
          <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {clearable && <SelectItem value={NONE}>None</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError message={errors[name]} />
    </div>
  );
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
