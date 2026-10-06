import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { saveSection } from "@/lib/applicant-api";
import { cleanPayload, educationSchema, zodFieldErrors } from "@/lib/apply-schemas";
import { cn } from "@/lib/utils";
import { FieldRow, NativeSelect, SectionCard, inputCls } from "./fields";
import { SectionFooter } from "./section-footer";
import { handleSaveError } from "./use-section-save";
import type { SectionProps } from "./types";

interface RecordState {
  id?: number;
  level_code: string;
  institution: string;
  board: string;
  passing_year: string;
  score_type: string;
  score_value: string;
  score_scale: string;
}

function emptyRecord(level = ""): RecordState {
  return { level_code: level, institution: "", board: "", passing_year: "", score_type: "percentage", score_value: "", score_scale: "" };
}

export function EducationSection({ app, lookups, busy, setBusy, reload, goNext }: SectionProps) {
  const e = app.sections.education;
  const [highest, setHighest] = useState(e.highest_qualification ?? "");
  const [records, setRecords] = useState<RecordState[]>(
    e.records.length
      ? e.records.map((r) => ({
          id: r.id,
          level_code: r.level_code ?? "",
          institution: r.institution ?? "",
          board: r.board ?? "",
          passing_year: r.passing_year != null ? String(r.passing_year) : "",
          score_type: r.score_type ?? "percentage",
          score_value: r.score_value != null ? String(r.score_value) : "",
          score_scale: r.score_scale != null ? String(r.score_scale) : "",
        }))
      : [emptyRecord()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = (i: number, patch: Partial<RecordState>) =>
    setRecords((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRecord = () => setRecords((rs) => [...rs, emptyRecord()]);
  const removeRecord = (i: number) => setRecords((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs));

  function buildRecords() {
    return records.map((r) =>
      cleanPayload({
        id: r.id,
        level_code: r.level_code,
        institution: r.institution.trim(),
        board: r.board.trim(),
        passing_year: r.passing_year ? Number(r.passing_year) : undefined,
        score_type: r.score_type,
        score_value: r.score_value ? Number(r.score_value) : undefined,
        score_scale: r.score_type === "cgpa" && r.score_scale ? Number(r.score_scale) : undefined,
      }),
    );
  }

  async function save(complete: boolean) {
    const payloadRecords = buildRecords();
    if (complete) {
      const parsed = educationSchema.safeParse({
        highest_qualification: highest || undefined,
        records: records.map((r) => ({
          id: r.id,
          level_code: r.level_code || undefined,
          institution: r.institution || undefined,
          board: r.board || undefined,
          passing_year: r.passing_year ? Number(r.passing_year) : undefined,
          score_type: r.score_type || undefined,
          score_value: r.score_value ? Number(r.score_value) : undefined,
          score_scale: r.score_scale ? Number(r.score_scale) : undefined,
        })),
      });
      if (!parsed.success) {
        setErrors(zodFieldErrors(parsed.error));
        toast.error("Please complete your education details.");
        return;
      }
      setErrors({});
    }
    setBusy(true);
    try {
      await saveSection(
        "education",
        cleanPayload({ highest_qualification: highest, records: payloadRecords }),
        complete,
        app.row_version,
      );
      toast.success(complete ? "Education saved" : "Draft saved");
      await reload();
      if (complete) goNext();
    } catch (err) {
      handleSaveError(err);
    } finally {
      setBusy(false);
    }
  }

  const elig = app.eligibility;

  return (
    <SectionCard title="Education" description="Add your qualifications, most recent first.">
      <FieldRow label="Highest qualification" required error={errors.highest_qualification} className="mb-5">
        <NativeSelect value={highest} onChange={setHighest} options={lookups.qualification_levels} placeholder="Select…" />
      </FieldRow>

      {elig.status && (
        <div
          className={cn(
            "mb-5 rounded-xl border p-3 text-sm font-medium",
            elig.status === "eligible" && "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300",
            elig.status === "not_eligible" && "border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300",
            elig.status === "needs_review" && "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300",
          )}
        >
          {elig.detail}
        </div>
      )}

      <div className="space-y-4">
        {records.map((r, i) => (
          <div key={i} className="rounded-2xl border border-border bg-muted/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">Qualification {i + 1}</span>
              {records.length > 1 && (
                <button type="button" onClick={() => removeRecord(i)} className="inline-flex items-center gap-1 text-xs font-semibold text-destructive hover:underline">
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldRow label="Level">
                <NativeSelect value={r.level_code} onChange={(val) => update(i, { level_code: val })} options={lookups.qualification_levels} placeholder="Select…" />
              </FieldRow>
              <FieldRow label="Institution / School">
                <input className={inputCls} value={r.institution} onChange={(ev) => update(i, { institution: ev.target.value })} />
              </FieldRow>
              <FieldRow label="Board / University">
                <input className={inputCls} value={r.board} onChange={(ev) => update(i, { board: ev.target.value })} />
              </FieldRow>
              <FieldRow label="Year of passing">
                <input inputMode="numeric" maxLength={4} className={inputCls} value={r.passing_year} onChange={(ev) => update(i, { passing_year: ev.target.value.replace(/\D/g, "") })} />
              </FieldRow>
              <FieldRow label="Score type">
                <div className="inline-flex rounded-xl border border-border bg-surface p-0.5">
                  {["percentage", "cgpa"].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => update(i, { score_type: t })}
                      className={cn(
                        "rounded-lg px-3 py-2 text-xs font-semibold capitalize transition",
                        r.score_type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                      )}
                    >
                      {t === "cgpa" ? "CGPA" : "Percentage"}
                    </button>
                  ))}
                </div>
              </FieldRow>
              <FieldRow label={r.score_type === "cgpa" ? "CGPA" : "Percentage"}>
                <div className="flex gap-2">
                  <input inputMode="decimal" className={inputCls} value={r.score_value} onChange={(ev) => update(i, { score_value: ev.target.value.replace(/[^\d.]/g, "") })} placeholder={r.score_type === "cgpa" ? "8.5" : "72.5"} />
                  {r.score_type === "cgpa" && (
                    <input inputMode="decimal" className={`${inputCls} w-24`} value={r.score_scale} onChange={(ev) => update(i, { score_scale: ev.target.value.replace(/[^\d.]/g, "") })} placeholder="of 10" />
                  )}
                </div>
              </FieldRow>
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={addRecord} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <Plus className="h-4 w-4" /> Add another qualification
      </button>

      <SectionFooter busy={busy} onSaveDraft={() => save(false)} onContinue={() => save(true)} />
    </SectionCard>
  );
}
