import { useState } from "react";
import { toast } from "sonner";
import { saveSection } from "@/lib/applicant-api";
import { cleanPayload, personalSchema, zodFieldErrors } from "@/lib/apply-schemas";
import { FieldRow, NativeSelect, SectionCard, inputCls } from "./fields";
import { SectionFooter } from "./section-footer";
import { handleSaveError } from "./use-section-save";
import { GENDER_OPTIONS, type SectionProps } from "./types";

type State = {
  name_on_certificate: string;
  father_guardian_name: string;
  mother_name: string;
  gender: string;
  dob: string;
  category: string;
  marital_status: string;
  aadhaar_last4: string;
  nationality: string;
  abc_id: string;
};

export function PersonalSection({ app, lookups, busy, setBusy, reload, goNext }: SectionProps) {
  const p = app.sections.personal;
  const [v, setV] = useState<State>({
    name_on_certificate: p.name_on_certificate ?? "",
    father_guardian_name: p.father_guardian_name ?? "",
    mother_name: p.mother_name ?? "",
    gender: p.gender ?? "",
    dob: p.dob ?? "",
    category: p.category ?? "",
    marital_status: p.marital_status ?? "",
    aadhaar_last4: p.aadhaar_last4 ?? "",
    nationality: p.nationality != null ? String(p.nationality) : "",
    abc_id: p.abc_id ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof State) => (val: string) => setV((s) => ({ ...s, [k]: val }));

  function buildPayload() {
    return cleanPayload({
      name_on_certificate: v.name_on_certificate.trim(),
      father_guardian_name: v.father_guardian_name.trim(),
      mother_name: v.mother_name.trim(),
      gender: v.gender,
      dob: v.dob,
      category: v.category,
      marital_status: v.marital_status,
      aadhaar_last4: v.aadhaar_last4,
      nationality: v.nationality ? Number(v.nationality) : undefined,
      abc_id: v.abc_id.trim(),
    });
  }

  async function save(complete: boolean) {
    if (complete) {
      const parsed = personalSchema.safeParse({
        ...v,
        nationality: v.nationality ? Number(v.nationality) : undefined,
        category: v.category || undefined,
        marital_status: v.marital_status || undefined,
        aadhaar_last4: v.aadhaar_last4 || "",
      });
      if (!parsed.success) {
        setErrors(zodFieldErrors(parsed.error));
        toast.error("Please fix the highlighted fields.");
        return;
      }
      setErrors({});
    }
    setBusy(true);
    try {
      await saveSection("personal", buildPayload(), complete, app.row_version);
      toast.success(complete ? "Personal details saved" : "Draft saved");
      await reload();
      if (complete) goNext();
    } catch (e) {
      handleSaveError(e);
    } finally {
      setBusy(false);
    }
  }

  const countryOptions = lookups.countries.map((c) => ({ value: String(c.id), label: c.name }));

  return (
    <SectionCard title="Personal details" description="Tell us a little about yourself.">
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldRow label="Name on certificate" htmlFor="noc" required error={errors.name_on_certificate} className="sm:col-span-2">
          <input id="noc" className={inputCls} value={v.name_on_certificate} onChange={(e) => set("name_on_certificate")(e.target.value)} placeholder="As printed on your 10th certificate" />
        </FieldRow>
        <FieldRow label="Father / Guardian name" error={errors.father_guardian_name}>
          <input className={inputCls} value={v.father_guardian_name} onChange={(e) => set("father_guardian_name")(e.target.value)} />
        </FieldRow>
        <FieldRow label="Mother's name" error={errors.mother_name}>
          <input className={inputCls} value={v.mother_name} onChange={(e) => set("mother_name")(e.target.value)} />
        </FieldRow>
        <FieldRow label="Date of birth" htmlFor="dob" required error={errors.dob}>
          <input id="dob" type="date" className={inputCls} value={v.dob} onChange={(e) => set("dob")(e.target.value)} />
        </FieldRow>
        <FieldRow label="Gender" required error={errors.gender}>
          <NativeSelect value={v.gender} onChange={set("gender")} options={GENDER_OPTIONS} placeholder="Select…" />
        </FieldRow>
        <FieldRow label="Category" error={errors.category}>
          <NativeSelect value={v.category} onChange={set("category")} options={lookups.categories} placeholder="Select…" />
        </FieldRow>
        <FieldRow label="Marital status" error={errors.marital_status}>
          <NativeSelect value={v.marital_status} onChange={set("marital_status")} options={lookups.marital_statuses} placeholder="Select…" />
        </FieldRow>
        <FieldRow label="Nationality" error={errors.nationality}>
          <NativeSelect value={v.nationality} onChange={set("nationality")} options={countryOptions} placeholder="Select…" />
        </FieldRow>
        <FieldRow label="Aadhaar (last 4 digits)" hint="We never ask for the full number." error={errors.aadhaar_last4}>
          <input inputMode="numeric" maxLength={4} className={inputCls} value={v.aadhaar_last4} onChange={(e) => set("aadhaar_last4")(e.target.value.replace(/\D/g, ""))} placeholder="1234" />
        </FieldRow>
        <FieldRow label="ABC ID" hint="Academic Bank of Credits (optional)." error={errors.abc_id}>
          <input className={inputCls} value={v.abc_id} onChange={(e) => set("abc_id")(e.target.value)} />
        </FieldRow>
      </div>
      <SectionFooter busy={busy} onSaveDraft={() => save(false)} onContinue={() => save(true)} />
    </SectionCard>
  );
}
