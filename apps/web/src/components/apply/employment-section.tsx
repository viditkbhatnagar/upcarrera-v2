import { useState } from "react";
import { toast } from "sonner";
import { saveSection } from "@/lib/applicant-api";
import { cleanPayload, employmentSchema, zodFieldErrors } from "@/lib/apply-schemas";
import { FieldRow, NativeSelect, SectionCard, inputCls } from "./fields";
import { SectionFooter } from "./section-footer";
import { handleSaveError } from "./use-section-save";
import type { SectionProps } from "./types";

type State = {
  employment_status: string;
  total_experience_months: string;
  current_employer: string;
  current_designation: string;
};

export function EmploymentSection({ app, lookups, busy, setBusy, reload, goNext }: SectionProps) {
  const emp = app.sections.employment;
  const [v, setV] = useState<State>({
    employment_status: emp?.employment_status ?? "",
    total_experience_months: emp?.total_experience_months != null ? String(emp.total_experience_months) : "",
    current_employer: emp?.current_employer ?? "",
    current_designation: emp?.current_designation ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof State) => (val: string) => setV((s) => ({ ...s, [k]: val }));

  const payload = () =>
    cleanPayload({
      employment_status: v.employment_status,
      total_experience_months: v.total_experience_months ? Number(v.total_experience_months) : undefined,
      current_employer: v.current_employer.trim(),
      current_designation: v.current_designation.trim(),
    });

  async function save(complete: boolean) {
    if (complete) {
      const parsed = employmentSchema.safeParse({
        employment_status: v.employment_status || undefined,
        total_experience_months: v.total_experience_months ? Number(v.total_experience_months) : undefined,
        current_employer: v.current_employer || undefined,
        current_designation: v.current_designation || undefined,
      });
      if (!parsed.success) {
        setErrors(zodFieldErrors(parsed.error));
        toast.error("Please complete your employment details.");
        return;
      }
      setErrors({});
    }
    setBusy(true);
    try {
      await saveSection("employment", payload(), complete, app.row_version);
      toast.success(complete ? "Employment saved" : "Draft saved");
      await reload();
      if (complete) goNext();
    } catch (e) {
      handleSaveError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Employment" description="This course requires your work details.">
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldRow label="Employment status" required error={errors.employment_status} className="sm:col-span-2">
          <NativeSelect value={v.employment_status} onChange={set("employment_status")} options={lookups.employment_statuses} placeholder="Select…" />
        </FieldRow>
        <FieldRow label="Total experience (months)" error={errors.total_experience_months}>
          <input inputMode="numeric" className={inputCls} value={v.total_experience_months} onChange={(e) => set("total_experience_months")(e.target.value.replace(/\D/g, ""))} />
        </FieldRow>
        <FieldRow label="Current employer" error={errors.current_employer}>
          <input className={inputCls} value={v.current_employer} onChange={(e) => set("current_employer")(e.target.value)} />
        </FieldRow>
        <FieldRow label="Current designation" error={errors.current_designation} className="sm:col-span-2">
          <input className={inputCls} value={v.current_designation} onChange={(e) => set("current_designation")(e.target.value)} />
        </FieldRow>
      </div>
      <SectionFooter busy={busy} onSaveDraft={() => save(false)} onContinue={() => save(true)} />
    </SectionCard>
  );
}
