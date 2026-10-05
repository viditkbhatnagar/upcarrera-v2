// Shared form model and fields for the Add Lead / Edit Application dialogs.
//
// Every value is a string so it binds straight to an Input/Select; ids are
// strings too. Edit seeds from the RAW row (GET /applications/:id) and sends
// only what changed — and a field the operator CLEARED is sent as null, so a
// university change cannot leave the old university's course on the row.

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type CatalogOption,
  labelOf,
  useCounsellorOptions,
  useCourseOptions,
  useIntakeOptions,
  useLeadSourceOptions,
  useSpecialisationOptions,
  useUniversityOptions,
} from "./catalogs";
import { INDIAN_MOBILE_ERROR, isValidEmail, normalizeIndianMobile } from "./duplicate-check";

/* ---------------- Form model ---------------- */

/** Every value is a string so it binds straight to an Input/Select. Ids as strings. */
export interface LeadForm {
  name: string;
  email: string;
  phone: string;
  university: string;
  course: string;
  specialisation: string;
  intake: string;
  source: string;
  counsellor: string;
}

export type FieldKey = keyof LeadForm;

export const EMPTY_FORM: LeadForm = {
  name: "",
  email: "",
  phone: "",
  university: "",
  course: "",
  specialisation: "",
  intake: "",
  source: "",
  counsellor: "",
};

/** The raw application row as GET /applications/:id returns it. */
export interface RawApplication {
  application_id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  university_id: number | null;
  course_id: number | null;
  specialisation_id: number | null;
  session_id: number | null;
  pipeline_user: number | null;
  created_by: number | null;
  source: string | null;
  custom_application_id: string | null;
  created_at: string | null;
}

const idText = (v: number | null | undefined) => (v != null ? String(v) : "");

/** Seed the edit form from RAW server values — never from list display strings. */
export function seedFromRaw(r: RawApplication): LeadForm {
  return {
    name: r.name ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    university: idText(r.university_id),
    course: idText(r.course_id),
    specialisation: idText(r.specialisation_id),
    intake: idText(r.session_id),
    source: r.source ?? "",
    // The counsellor the list shows is pipeline_user, else created_by. Seeding
    // with that fallback would make an untouched form "change" pipeline_user,
    // so seed only the real column and let the diff decide.
    counsellor: idText(r.pipeline_user),
  };
}

/** Academic form field -> request key, and how its value is sent. */
const ACADEMIC_FIELDS: ReadonlyArray<[FieldKey, string, (v: string) => number | string]> = [
  ["university", "university_id", Number],
  ["course", "course_id", Number],
  ["specialisation", "specialisation_id", Number],
  ["intake", "session_id", Number],
  ["counsellor", "pipeline_user", Number],
  ["source", "source", (v) => v],
];

/**
 * The academic body: for a create, the filled fields; for an edit, the fields
 * that differ from the seed. A field the edit CLEARED (seed had a value, form is
 * now "") is sent as null — dropping it would leave the old value on the row,
 * e.g. the previous university's course after a university change.
 */
export function academicBody(form: LeadForm, seed: LeadForm | null) {
  const body: Record<string, number | string | null> = {};
  for (const [field, key, toValue] of ACADEMIC_FIELDS) {
    const value = form[field];
    if (seed == null) {
      if (value !== "") body[key] = toValue(value);
    } else if (value !== seed[field]) {
      body[key] = value === "" ? null : toValue(value);
    }
  }
  return body;
}

/** The contact body for the changed fields of an edit. */
export function contactBody(form: LeadForm, seed: LeadForm) {
  const body: Record<string, string> = {};
  if (form.name.trim() !== seed.name.trim()) body.name = form.name.trim();
  if (form.email.trim() !== seed.email.trim()) body.email = form.email.trim();
  if (form.phone.trim() !== seed.phone.trim()) {
    body.phone = normalizeIndianMobile(form.phone) ?? form.phone.trim();
  }
  return body;
}

/* ---------------- Shared fields ---------------- */

export function useLeadCatalogs(form: LeadForm) {
  const universities = useUniversityOptions();
  // strict: a course tagged to another university is refused by the server.
  const courses = useCourseOptions(form.university || null, { strict: true });
  const specialisations = useSpecialisationOptions(form.course || null);
  const intakes = useIntakeOptions();
  const counsellors = useCounsellorOptions();
  const sources = useLeadSourceOptions();
  return { universities, courses, specialisations, intakes, counsellors, sources };
}

export type Catalogs = ReturnType<typeof useLeadCatalogs>;

interface FieldsProps {
  form: LeadForm;
  errors: Partial<Record<FieldKey, string>>;
  update: (k: FieldKey, v: string) => void;
  catalogs: Catalogs;
  /** Edit mode keeps legacy values selectable even if the catalog lacks them. */
  seed?: LeadForm | null;
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-red-500">{message}</p> : null;
}

function CatalogSelect({
  id,
  label,
  required,
  value,
  onChange,
  options,
  loading,
  failed,
  placeholder,
  emptyText,
  error,
  hint,
}: {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  options: CatalogOption[];
  loading?: boolean;
  failed?: boolean;
  placeholder: string;
  emptyText: string;
  error?: string;
  hint?: string | null;
}) {
  const unavailable = !loading && !failed && options.length === 0;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} {required && <span className="text-accent">*</span>}
      </Label>
      <Select value={value} onValueChange={onChange} disabled={loading || failed || unavailable}>
        <SelectTrigger id={id} className={cn(error && "border-red-400 focus:ring-red-300")}>
          <SelectValue
            placeholder={
              loading
                ? "Loading…"
                : failed
                  ? `Couldn't load ${label.toLowerCase()}`
                  : unavailable
                    ? emptyText
                    : placeholder
            }
          />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && !error && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      <FieldError message={error} />
    </div>
  );
}

/** Keep a seeded value visible even when the live catalog no longer lists it. */
function withSeeded(options: CatalogOption[], value: string | undefined, label: string) {
  if (!value || options.some((o) => o.value === value)) return options;
  return [{ value, label }, ...options];
}

export function LeadFields({ form, errors, update, catalogs, seed }: FieldsProps) {
  const { universities, courses, specialisations, intakes, counsellors, sources } = catalogs;
  // The seeded course belongs to the seeded university (and the seeded
  // specialisation to the seeded course): keep them selectable only while
  // their parent is unchanged, so a stale one cannot be re-picked.
  const seededCourse = seed && form.university === seed.university ? seed.course : undefined;
  const seededSpec = seed && form.course === seed.course ? seed.specialisation : undefined;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="lead-name">
          Lead Name <span className="text-accent">*</span>
        </Label>
        <Input
          id="lead-name"
          placeholder="Enter student name"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          className={cn(errors.name && "border-red-400 focus-visible:ring-red-300")}
        />
        <FieldError message={errors.name} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="lead-email">
            Email Address <span className="text-accent">*</span>
          </Label>
          <Input
            id="lead-email"
            type="email"
            placeholder="student@email.com"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            className={cn(errors.email && "border-red-400 focus-visible:ring-red-300")}
          />
          <FieldError message={errors.email} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead-phone">
            Mobile Number <span className="text-accent">*</span>
          </Label>
          <Input
            id="lead-phone"
            inputMode="tel"
            placeholder="98765 43210"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            className={cn(errors.phone && "border-red-400 focus-visible:ring-red-300")}
          />
          <FieldError message={errors.phone} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CatalogSelect
          id="lead-university"
          label="University"
          required
          value={form.university}
          onChange={(v) => update("university", v)}
          options={withSeeded(universities.options, seed?.university, `University #${seed?.university}`)}
          loading={universities.isLoading}
          failed={universities.isError}
          placeholder="Select university"
          emptyText="No universities set up"
          error={errors.university}
        />
        <CatalogSelect
          id="lead-course"
          label="Course"
          required
          value={form.course}
          onChange={(v) => update("course", v)}
          options={withSeeded(courses.options, seededCourse, `Course #${seededCourse}`)}
          loading={courses.isLoading}
          failed={courses.isError}
          placeholder="Select course"
          emptyText="No courses set up"
          error={errors.course}
          hint={
            form.university && !courses.scoped && courses.options.length > 0
              ? "No courses are tagged to this university yet — showing courses not tagged to any university."
              : null
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CatalogSelect
          id="lead-spec"
          label="Specialisation"
          value={form.specialisation}
          onChange={(v) => update("specialisation", v)}
          options={withSeeded(
            specialisations.options,
            seededSpec,
            `Specialisation #${seededSpec}`,
          )}
          loading={specialisations.isLoading}
          failed={specialisations.isError}
          placeholder="Select specialisation"
          emptyText="None for this course"
        />
        <CatalogSelect
          id="lead-intake"
          label="Intake"
          required={intakes.options.length > 0}
          value={form.intake}
          onChange={(v) => update("intake", v)}
          options={withSeeded(intakes.options, seed?.intake, `Intake #${seed?.intake}`)}
          loading={intakes.isLoading}
          failed={intakes.isError}
          placeholder="Select intake"
          emptyText="No intakes set up"
          error={errors.intake}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CatalogSelect
          id="lead-source"
          label="Source"
          required={sources.options.length > 0}
          value={form.source}
          onChange={(v) => update("source", v)}
          options={withSeeded(sources.options, seed?.source, seed?.source ?? "")}
          loading={sources.isLoading}
          failed={sources.isError}
          placeholder="Select source"
          emptyText="No lead sources set up"
          error={errors.source}
        />
        <CatalogSelect
          id="lead-counsellor"
          label="Assigned Counsellor"
          value={form.counsellor}
          onChange={(v) => update("counsellor", v)}
          options={withSeeded(
            counsellors.assignable,
            seed?.counsellor,
            labelOf(counsellors.all, seed?.counsellor) ?? `User #${seed?.counsellor}`,
          )}
          loading={counsellors.isLoading}
          failed={counsellors.isError}
          placeholder="Select counsellor"
          emptyText="No counsellors set up"
        />
      </div>
    </div>
  );
}

/**
 * Field-level validation. `seed` (edit) re-validates only what changed — but a
 * changed university or course always needs a course, since the course decides
 * which university the list shows for the row.
 */
export function validateLead(
  form: LeadForm,
  catalogs: Catalogs,
  seed: LeadForm | null,
): Partial<Record<FieldKey, string>> {
  const e: Partial<Record<FieldKey, string>> = {};
  const touched = (k: FieldKey) => seed == null || form[k].trim() !== seed[k].trim();

  if (!form.name.trim()) e.name = "Lead name is required";
  if (touched("email")) {
    if (!form.email.trim()) e.email = "Email is required";
    else if (!isValidEmail(form.email)) e.email = "Invalid email address";
  }
  if (touched("phone")) {
    if (!form.phone.trim()) e.phone = "Mobile number is required";
    else if (!normalizeIndianMobile(form.phone)) e.phone = INDIAN_MOBILE_ERROR;
  }
  if (seed == null) {
    if (!form.university) e.university = "University is required";
    if (!form.course) e.course = "Course is required";
    if (!form.intake && catalogs.intakes.options.length > 0) e.intake = "Intake is required";
    if (!form.source && catalogs.sources.options.length > 0) e.source = "Source is required";
    return e;
  }
  const universityChanged = form.university !== seed.university;
  if (universityChanged || form.course !== seed.course) {
    if (!form.university) e.university = "University is required";
    if (!form.course) {
      e.course = universityChanged
        ? "Choose a course of the new university"
        : "Course is required";
    }
  }
  return e;
}

export function useLeadForm(initial: LeadForm) {
  const [form, setForm] = useState<LeadForm>(initial);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const update = (field: FieldKey, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // A course belongs to a university: changing the university clears it.
      if (field === "university" && value !== prev.university) {
        return { ...next, course: "", specialisation: "" };
      }
      if (field === "course" && value !== prev.course) return { ...next, specialisation: "" };
      return next;
    });
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };
  return { form, setForm, errors, setErrors, update };
}

export function ErrorBanner({ message }: { message: string | null }) {
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

export const errorText = (err: unknown, fallback: string) =>
  err instanceof ApiError || err instanceof Error ? err.message : fallback;

export function DialogFooterButtons({
  onCancel,
  onSave,
  disabled,
  pending,
  label,
}: {
  onCancel: () => void;
  onSave: () => void;
  disabled: boolean;
  pending: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-6 py-4">
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {pending ? "Saving…" : label}
      </button>
    </div>
  );
}
