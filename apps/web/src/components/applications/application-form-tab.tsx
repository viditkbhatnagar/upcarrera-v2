// Application Form tab: the applicant's submitted details. When the server allows
// `correct` (owning counsellor during counsellor review) the whitelisted fields
// become inline-editable and save through PATCH /applications/:id/corrections —
// only the fields that actually changed are sent.
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, X, Loader2, GraduationCap, Info } from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  correctApplication,
  type ApplicationDetail,
  type CorrectionBody,
} from "@/lib/api/applications";
import { SectionCard, InfoRow, dash, EmptyPanel } from "./detail-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FieldKey = keyof CorrectionBody;

interface FieldDef {
  key: FieldKey;
  label: string;
  type?: "text" | "email" | "date" | "textarea";
}

const FIELDS: FieldDef[] = [
  { key: "name", label: "Full name" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone" },
  { key: "second_phone", label: "Alternate phone" },
  { key: "whatsapp_no", label: "WhatsApp" },
  { key: "dob", label: "Date of birth", type: "date" },
  { key: "gender", label: "Gender" },
  { key: "state", label: "State" },
  { key: "district", label: "District" },
  { key: "abc_id", label: "ABC ID" },
  { key: "source", label: "Source" },
  { key: "address", label: "Address", type: "textarea" },
  { key: "remarks", label: "Remarks", type: "textarea" },
];

function initialValues(app: ApplicationDetail): Record<FieldKey, string> {
  const dob = app.dob ? String(app.dob).slice(0, 10) : "";
  return {
    name: app.name ?? "",
    email: app.email ?? "",
    phone: app.phone ?? "",
    second_phone: app.second_phone ?? "",
    whatsapp_no: app.whatsapp_no ?? "",
    dob,
    gender: app.gender ?? "",
    state: app.state ?? "",
    district: app.district ?? "",
    address: app.address ?? "",
    abc_id: app.abc_id ?? "",
    source: app.source ?? "",
    remarks: app.remarks ?? "",
  };
}

interface ApplicationFormTabProps {
  app: ApplicationDetail;
  canCorrect: boolean;
  onSaved: () => void;
}

export function ApplicationFormTab({ app, canCorrect, onSaved }: ApplicationFormTabProps) {
  const base = useMemo(() => initialValues(app), [app]);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<FieldKey, string>>(base);

  const startEdit = () => {
    setValues(base);
    setEditing(true);
  };

  const changed = useMemo<CorrectionBody>(() => {
    const diff: CorrectionBody = {};
    for (const f of FIELDS) {
      const next = values[f.key].trim();
      const prev = (base[f.key] ?? "").trim();
      // Only send fields that actually changed, and never a CLEARED one (next === ""):
      // the corrections DTO validates email / dob / phone and 400s on an empty string,
      // and a correction is a typo fix — not a way to blank out a stored field.
      if (next !== prev && next !== "") diff[f.key] = next;
    }
    return diff;
  }, [values, base]);

  const changeCount = Object.keys(changed).length;

  const mutation = useMutation({
    mutationFn: () => correctApplication(app.application_id, changed),
    onSuccess: (res) => {
      toast.success(
        res.corrected && res.corrected > 0
          ? `Saved ${res.corrected} correction${res.corrected === 1 ? "" : "s"}.`
          : "No changes to save.",
      );
      setEditing(false);
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not save the corrections."),
  });

  return (
    <div className="space-y-5">
      <SectionCard
        title="Application form"
        icon={<Info className="h-4 w-4" />}
        action={
          canCorrect && !editing ? (
            <Button variant="outline" size="sm" onClick={startEdit}>
              <Pencil className="h-4 w-4" /> Edit details
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
            {FIELDS.map((f) => (
              <div
                key={f.key}
                className={f.type === "textarea" ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}
              >
                <Label htmlFor={`field-${f.key}`}>{f.label}</Label>
                {f.type === "textarea" ? (
                  <Textarea
                    id={`field-${f.key}`}
                    value={values[f.key]}
                    rows={2}
                    onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                  />
                ) : (
                  <Input
                    id={`field-${f.key}`}
                    type={f.type ?? "text"}
                    value={values[f.key]}
                    onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <dl className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
            {FIELDS.filter((f) => f.type !== "textarea").map((f) => (
              <InfoRow key={f.key} label={f.label}>
                {dash(base[f.key])}
              </InfoRow>
            ))}
            <div className="sm:col-span-2">
              <InfoRow label="Address">{dash(base.address)}</InfoRow>
              <InfoRow label="Remarks">{dash(base.remarks)}</InfoRow>
            </div>
          </dl>
        )}
      </SectionCard>

      <SectionCard title="Education records" icon={<GraduationCap className="h-4 w-4" />}>
        <EmptyPanel
          icon={<GraduationCap className="h-6 w-6" />}
          title="Qualification records load with the full student form"
          hint="The committed API exposes qualifications only after conversion (GET /students/:id/qualifications). A pre-conversion, application-scoped read lands with the student-form workstream."
        />
      </SectionCard>
    </div>
  );
}
