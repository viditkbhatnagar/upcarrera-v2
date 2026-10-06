import { useState } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { saveSection } from "@/lib/applicant-api";
import { cleanPayload, contactSchema, zodFieldErrors } from "@/lib/apply-schemas";
import { FieldRow, NativeSelect, SectionCard, inputCls } from "./fields";
import { SectionFooter } from "./section-footer";
import { handleSaveError } from "./use-section-save";
import type { SectionProps } from "./types";

type State = {
  second_phone: string;
  whatsapp_no: string;
  address: string;
  state: string;
  district: string;
  pin_code: string;
};

export function ContactSection({ app, lookups, busy, setBusy, reload, goNext }: SectionProps) {
  const c = app.sections.contact;
  const [v, setV] = useState<State>({
    second_phone: c.second_phone ?? "",
    whatsapp_no: c.whatsapp_no ?? "",
    address: c.address ?? "",
    state: c.state ?? "",
    district: c.district ?? "",
    pin_code: c.pin_code ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof State) => (val: string) => setV((s) => ({ ...s, [k]: val }));

  const payload = () =>
    cleanPayload({
      // email is READ-ONLY (owned at Add Lead) — never submitted from the form.
      second_phone: v.second_phone,
      whatsapp_no: v.whatsapp_no,
      address: v.address.trim(),
      state: v.state.trim(),
      district: v.district.trim(),
      pin_code: v.pin_code,
    });

  async function save(complete: boolean) {
    if (complete) {
      const parsed = contactSchema.safeParse(v);
      if (!parsed.success) {
        setErrors(zodFieldErrors(parsed.error));
        toast.error("Please fix the highlighted fields.");
        return;
      }
      setErrors({});
    }
    setBusy(true);
    try {
      await saveSection("contact", payload(), complete, app.row_version);
      toast.success(complete ? "Contact details saved" : "Draft saved");
      await reload();
      if (complete) goNext();
    } catch (e) {
      handleSaveError(e);
    } finally {
      setBusy(false);
    }
  }

  const stateOptions = Array.from(new Set(lookups.states.map((s) => s.name))).map((name) => ({
    value: name,
    label: name,
  }));

  return (
    <SectionCard title="Contact details" description="How can we reach you?">
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldRow label="Mobile number" hint="Verified at lead creation — contact your counsellor to change it.">
          <div className="relative">
            <input className={`${inputCls} pr-9`} value={c.phone ?? "—"} readOnly disabled />
            <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </FieldRow>
        <FieldRow label="Email" hint="Set at lead creation — contact your counsellor to change it.">
          <div className="relative">
            <input className={`${inputCls} pr-9`} value={c.email ?? "—"} readOnly disabled />
            <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </FieldRow>
        <FieldRow label="Alternate phone" error={errors.second_phone}>
          <input inputMode="tel" className={inputCls} value={v.second_phone} onChange={(e) => set("second_phone")(e.target.value.replace(/\D/g, ""))} />
        </FieldRow>
        <FieldRow label="WhatsApp number" error={errors.whatsapp_no}>
          <input inputMode="tel" className={inputCls} value={v.whatsapp_no} onChange={(e) => set("whatsapp_no")(e.target.value.replace(/\D/g, ""))} />
        </FieldRow>
        <FieldRow label="Address" htmlFor="addr" required error={errors.address} className="sm:col-span-2">
          <textarea id="addr" rows={2} className={inputCls} value={v.address} onChange={(e) => set("address")(e.target.value)} />
        </FieldRow>
        <FieldRow label="State" error={errors.state}>
          <NativeSelect value={v.state} onChange={set("state")} options={stateOptions} placeholder="Select…" />
        </FieldRow>
        <FieldRow label="District" error={errors.district}>
          <input className={inputCls} value={v.district} onChange={(e) => set("district")(e.target.value)} />
        </FieldRow>
        <FieldRow label="PIN code" error={errors.pin_code}>
          <input inputMode="numeric" maxLength={6} className={inputCls} value={v.pin_code} onChange={(e) => set("pin_code")(e.target.value.replace(/\D/g, ""))} />
        </FieldRow>
      </div>
      <SectionFooter busy={busy} onSaveDraft={() => save(false)} onContinue={() => save(true)} />
    </SectionCard>
  );
}
