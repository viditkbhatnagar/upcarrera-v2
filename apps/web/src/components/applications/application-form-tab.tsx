// Application Form tab (WS6): the structured sections the applicant submitted,
// read from GET /applications/:id/form. When the server allows `correct` (the
// owning counsellor during counsellor review) the Personal and Contact sections
// become inline-editable and save through PATCH /applications/:id/form/:section —
// only changed, non-empty fields are sent, guarded by the form's row_version.
// A lead with no form yet (no link sent / not submitted) shows a graceful state.
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Pencil,
  X,
  Loader2,
  GraduationCap,
  Info,
  User as UserIcon,
  Phone,
  Briefcase,
  ShieldCheck,
  AlertTriangle,
  Send,
  Clock,
  CheckCircle2,
  BadgeCheck,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  getApplicationForm,
  patchFormSection,
  applicationFormKeys,
  type ApplicationFormView,
  type FormSection,
  type SectionPatchData,
  type PersonalSection,
  type ContactSection,
} from "@/lib/api/application-form";
import { type ApplicationDetail } from "@/lib/api/applications";
import { SectionCard, InfoRow, dash, EmptyPanel, formatDate } from "./detail-ui";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

type FieldType = "text" | "email" | "date" | "textarea" | "select";

interface FieldDef {
  key: string;
  label: string;
  type?: FieldType;
  options?: readonly string[];
  readOnly?: boolean;
  placeholder?: string;
}

const PERSONAL_FIELDS: FieldDef[] = [
  { key: "name_on_certificate", label: "Name on certificate" },
  { key: "father_guardian_name", label: "Father / guardian name" },
  { key: "mother_name", label: "Mother name" },
  { key: "category", label: "Category", type: "select", options: ["general", "obc", "sc", "st", "ews", "other"] },
  { key: "marital_status", label: "Marital status", type: "select", options: ["single", "married", "other"] },
  { key: "aadhaar_last4", label: "Aadhaar (last 4)", placeholder: "1234" },
  { key: "dob", label: "Date of birth", type: "date" },
  { key: "gender", label: "Gender" },
  { key: "abc_id", label: "ABC ID" },
];

const CONTACT_FIELDS: FieldDef[] = [
  { key: "email", label: "Email", readOnly: true },
  { key: "phone", label: "Phone", readOnly: true },
  { key: "second_phone", label: "Alternate phone" },
  { key: "whatsapp_no", label: "WhatsApp" },
  { key: "state", label: "State" },
  { key: "district", label: "District" },
  { key: "pin_code", label: "PIN code", placeholder: "560001" },
  { key: "address", label: "Address", type: "textarea" },
];

interface ApplicationFormTabProps {
  app: ApplicationDetail;
  canCorrect: boolean;
  onSaved: () => void;
}

export function ApplicationFormTab({ app, canCorrect, onSaved }: ApplicationFormTabProps) {
  const appId = app.application_id;
  const stage = app.effective_stage;
  const notStarted = stage === "lead_added";
  const awaitingSubmission = stage === "form_pending";
  const formExpected = !notStarted && !awaitingSubmission;

  const { data: form, isLoading, isError, error } = useQuery({
    queryKey: applicationFormKeys.form(appId),
    queryFn: () => getApplicationForm(appId),
    enabled: formExpected,
  });

  if (!formExpected) {
    return (
      <SectionCard title="Application form" icon={<Info className="h-4 w-4" />}>
        <EmptyPanel
          icon={notStarted ? <Send className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
          title={notStarted ? "No application form yet" : "Waiting for the applicant to submit"}
          hint={
            notStarted
              ? "Send the application form link from the Summary tab so the applicant can fill in their details."
              : "The form link has been sent. Their submitted details will appear here once they complete the form."
          }
        />
      </SectionCard>
    );
  }

  if (isLoading) {
    return (
      <SectionCard title="Application form" icon={<Info className="h-4 w-4" />}>
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </SectionCard>
    );
  }

  if (isError || !form) {
    return (
      <SectionCard title="Application form" icon={<Info className="h-4 w-4" />}>
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          {error instanceof ApiError ? error.message : "Could not load the application form."}
        </div>
      </SectionCard>
    );
  }

  return <FormBody appId={appId} form={form} canCorrect={canCorrect} onSaved={onSaved} />;
}

function FormBody({
  appId,
  form,
  canCorrect,
  onSaved,
}: {
  appId: number;
  form: ApplicationFormView;
  canCorrect: boolean;
  onSaved: () => void;
}) {
  const { program, counsellor, sections, eligibility } = form;

  return (
    <div className="space-y-5">
      {/* Program + eligibility context */}
      <SectionCard title="Programme" icon={<BadgeCheck className="h-4 w-4" />}>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
          <InfoRow label="University">{dash(program.university)}</InfoRow>
          <InfoRow label="Course">{dash(program.course)}</InfoRow>
          <InfoRow label="Specialisation">{dash(program.specialisation)}</InfoRow>
          <InfoRow label="Intake">{dash(program.intake)}</InfoRow>
          <InfoRow label="Counsellor">{dash(counsellor.name)}</InfoRow>
        </dl>
        {eligibility.status && (
          <div className="mt-3">
            <EligibilityPill status={eligibility.status} detail={eligibility.detail} />
          </div>
        )}
      </SectionCard>

      <EditableSection
        appId={appId}
        section="personal"
        title="Personal details"
        icon={<UserIcon className="h-4 w-4" />}
        fields={PERSONAL_FIELDS}
        values={sections.personal}
        rowVersion={form.row_version}
        canCorrect={canCorrect}
        onSaved={onSaved}
      />

      <EditableSection
        appId={appId}
        section="contact"
        title="Contact details"
        icon={<Phone className="h-4 w-4" />}
        fields={CONTACT_FIELDS}
        values={sections.contact}
        rowVersion={form.row_version}
        canCorrect={canCorrect}
        onSaved={onSaved}
      />

      <SectionCard title="Education" icon={<GraduationCap className="h-4 w-4" />}>
        <div className="mb-3">
          <InfoRow label="Highest qualification">
            {dash(sections.education.highest_qualification)}
          </InfoRow>
        </div>
        {sections.education.records.length === 0 ? (
          <EmptyPanel
            icon={<GraduationCap className="h-6 w-6" />}
            title="No education records yet"
            hint="Qualification records the applicant adds will appear here."
          />
        ) : (
          <ul className="space-y-2">
            {sections.education.records.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">
                    {r.label?.trim() || levelLabel(r.level_code)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.score_value != null
                      ? `${r.score_value}${r.score_type === "percentage" ? "%" : ` ${r.score_type ?? ""}`}`
                      : "—"}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {[r.institution, r.board, r.passing_year].filter(Boolean).join(" · ") || "—"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {form.employment_required && sections.employment && (
        <SectionCard title="Employment" icon={<Briefcase className="h-4 w-4" />}>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
            <InfoRow label="Status">{dash(sections.employment.employment_status)}</InfoRow>
            <InfoRow label="Experience (months)">
              {sections.employment.total_experience_months != null
                ? String(sections.employment.total_experience_months)
                : "—"}
            </InfoRow>
            <InfoRow label="Employer">{dash(sections.employment.current_employer)}</InfoRow>
            <InfoRow label="Designation">{dash(sections.employment.current_designation)}</InfoRow>
          </dl>
        </SectionCard>
      )}

      {(form.program_change_request || form.reopen_reason || form.declaration_accepted_at) && (
        <SectionCard title="Declaration & notes" icon={<ShieldCheck className="h-4 w-4" />}>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-1">
            {form.declaration_accepted_at && (
              <InfoRow label="Declaration accepted">
                {formatDate(form.declaration_accepted_at)}
              </InfoRow>
            )}
            {form.program_change_request && (
              <InfoRow label="Programme change requested">{form.program_change_request}</InfoRow>
            )}
            {form.reopen_reason && <InfoRow label="Last reopen reason">{form.reopen_reason}</InfoRow>}
          </dl>
        </SectionCard>
      )}
    </div>
  );
}

function EligibilityPill({ status, detail }: { status: string; detail: string | null }) {
  const tone =
    status === "eligible"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30"
      : status === "not_eligible"
        ? "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30"
        : "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30";
  const label =
    status === "eligible" ? "Eligible" : status === "not_eligible" ? "Not eligible" : "Needs review";
  return (
    <div className={cn("rounded-lg px-3 py-2 text-xs font-medium ring-1 ring-inset", tone)}>
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <CheckCircle2 className="h-3.5 w-3.5" /> {label}
      </span>
      {detail && <p className="mt-0.5 font-normal opacity-90">{detail}</p>}
    </div>
  );
}

interface EditableSectionProps {
  appId: number;
  section: FormSection;
  title: string;
  icon: React.ReactNode;
  fields: FieldDef[];
  values: PersonalSection | ContactSection;
  rowVersion: number;
  canCorrect: boolean;
  onSaved: () => void;
}

function EditableSection({
  appId,
  section,
  title,
  icon,
  fields,
  values,
  rowVersion,
  canCorrect,
  onSaved,
}: EditableSectionProps) {
  const qc = useQueryClient();
  const base = useMemo(() => toStringMap(fields, values), [fields, values]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(base);

  const editableFields = fields.filter((f) => !f.readOnly);

  const startEdit = () => {
    setDraft(base);
    setEditing(true);
  };

  const changed = useMemo<SectionPatchData>(() => {
    const diff: SectionPatchData = {};
    for (const f of editableFields) {
      const next = (draft[f.key] ?? "").trim();
      const prev = (base[f.key] ?? "").trim();
      // Only send changed, non-empty values: a correction is a typo fix, and the
      // per-section DTO 400s on an empty string for pattern-validated fields.
      if (next !== prev && next !== "") diff[f.key] = next;
    }
    return diff;
  }, [draft, base, editableFields]);

  const changeCount = Object.keys(changed).length;

  const mutation = useMutation({
    mutationFn: () => patchFormSection(appId, section, changed, rowVersion),
    onSuccess: () => {
      toast.success("Correction saved.");
      setEditing(false);
      qc.invalidateQueries({ queryKey: applicationFormKeys.form(appId) });
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not save the correction."),
  });

  return (
    <SectionCard
      title={title}
      icon={icon}
      action={
        canCorrect && !editing ? (
          <Button variant="outline" size="sm" onClick={startEdit}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        ) : editing ? (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              <X className="h-4 w-4" /> Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => mutation.mutate()}
              disabled={changeCount === 0 || mutation.isPending}
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save{changeCount > 0 ? ` (${changeCount})` : ""}
            </Button>
          </div>
        ) : undefined
      }
    >
      {editing ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <div
              key={f.key}
              className={f.type === "textarea" ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}
            >
              <Label htmlFor={`fld-${section}-${f.key}`}>
                {f.label}
                {f.readOnly && <span className="ml-1 text-[11px] text-muted-foreground">(read-only)</span>}
              </Label>
              <FieldEditor
                field={f}
                id={`fld-${section}-${f.key}`}
                value={draft[f.key] ?? ""}
                onChange={(v) => setDraft((p) => ({ ...p, [f.key]: v }))}
              />
            </div>
          ))}
        </div>
      ) : (
        <dl className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
          {fields
            .filter((f) => f.type !== "textarea")
            .map((f) => (
              <InfoRow key={f.key} label={f.label}>
                {dash(base[f.key])}
              </InfoRow>
            ))}
          {fields
            .filter((f) => f.type === "textarea")
            .map((f) => (
              <div key={f.key} className="sm:col-span-2">
                <InfoRow label={f.label}>{dash(base[f.key])}</InfoRow>
              </div>
            ))}
        </dl>
      )}
    </SectionCard>
  );
}

function FieldEditor({
  field,
  id,
  value,
  onChange,
}: {
  field: FieldDef;
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.readOnly) {
    return (
      <Input id={id} value={value} readOnly disabled className="opacity-70" />
    );
  }
  if (field.type === "textarea") {
    return (
      <Textarea id={id} value={value} rows={2} onChange={(e) => onChange(e.target.value)} />
    );
  }
  if (field.type === "select" && field.options) {
    return (
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {titleCase(opt)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <Input
      id={id}
      type={field.type === "date" ? "date" : field.type === "email" ? "email" : "text"}
      value={value}
      placeholder={field.placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/* ---------------- helpers ---------------- */

function toStringMap(
  fields: FieldDef[],
  values: PersonalSection | ContactSection,
): Record<string, string> {
  // The section is a flat JSON object keyed by the same field names as FieldDef.
  const rec = values as unknown as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = rec[f.key];
    out[f.key] = v == null ? "" : String(v);
  }
  return out;
}

function titleCase(value: string): string {
  return value
    .split("_")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function levelLabel(code: string | null): string {
  const map: Record<string, string> = {
    "10th": "Class 10",
    "12th": "Class 12",
    diploma: "Diploma",
    ug: "Undergraduate",
    pg: "Postgraduate",
    doctorate: "Doctorate",
  };
  return map[(code ?? "").trim().toLowerCase()] ?? (code ?? "Qualification");
}
