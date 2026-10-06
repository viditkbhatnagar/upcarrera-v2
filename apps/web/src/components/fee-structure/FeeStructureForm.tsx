import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
  Lock,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiGet, ApiError } from "@/lib/api";
import { useUniversityOptions, useCourseOptions } from "@/components/applications/catalogs";
import {
  activateFeeStructure,
  createFeeStructure,
  formatInr,
  feeStructureKeys,
  listIntakes,
  updateFeeStructure,
  BASIS_LABEL,
  type ComponentBasis,
  type CourseFeeBasis,
  type CreateFeeStructurePayload,
  type FeeCollectionModel,
  type FeeStructureDetail,
  type UpdateFeeStructurePayload,
} from "@/lib/api/fee-structures";
import {
  activationReasons,
  computePreview,
  parseDurationYears,
} from "@/components/fee-structure/preview";
import { CollectionModelBadge, StatusChip } from "@/components/fee-structure/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ItemRow {
  label: string;
  amount: string;
  basis: ComponentBasis;
}

interface InstalmentRow {
  seq: number;
  label: string;
  amount: string;
  due_offset_days: string;
}

interface FormState {
  university_id: string;
  course_id: string;
  intake_id: string;
  registration_fee: string;
  course_fee_basis: CourseFeeBasis;
  course_fee_amount: string;
  course_fee_periods: string;
  exam_fee: string;
  exam_fee_basis: ComponentBasis;
  discount_allowed: boolean;
  discount_max_pct: string;
  allow_full: boolean;
  allow_per_year: boolean;
  allow_per_semester: boolean;
  allow_custom: boolean;
  notes: string;
  items: ItemRow[];
  instalments: InstalmentRow[];
}

const EMPTY_FORM: FormState = {
  university_id: "",
  course_id: "",
  intake_id: "",
  registration_fee: "",
  course_fee_basis: "total",
  course_fee_amount: "",
  course_fee_periods: "1",
  exam_fee: "",
  exam_fee_basis: "one_time",
  discount_allowed: false,
  discount_max_pct: "",
  allow_full: true,
  allow_per_year: false,
  allow_per_semester: false,
  allow_custom: false,
  notes: "",
  items: [],
  instalments: [],
};

function moneyStr(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : String(n);
}

function seedFromDetail(detail: FeeStructureDetail): FormState {
  return {
    university_id: String(detail.university_id),
    course_id: String(detail.course_id),
    intake_id: String(detail.intake_id),
    registration_fee: moneyStr(detail.registration_fee),
    course_fee_basis: detail.course_fee_basis ?? "total",
    course_fee_amount: moneyStr(detail.course_fee_amount),
    course_fee_periods: detail.course_fee_periods != null ? String(detail.course_fee_periods) : "1",
    exam_fee: moneyStr(detail.exam_fee),
    exam_fee_basis: detail.exam_fee_basis ?? "one_time",
    discount_allowed: detail.discount_allowed,
    discount_max_pct: moneyStr(detail.discount_max_pct),
    allow_full: detail.allow_full,
    allow_per_year: detail.allow_per_year,
    allow_per_semester: detail.allow_per_semester,
    allow_custom: detail.allow_custom,
    notes: detail.notes ?? "",
    items: detail.items.map((it) => ({
      label: it.label,
      amount: moneyStr(it.amount),
      basis: it.basis,
    })),
    instalments: detail.instalments.map((ins) => ({
      seq: ins.seq,
      label: ins.label ?? "",
      amount: moneyStr(ins.amount),
      due_offset_days: String(ins.due_offset_days),
    })),
  };
}

function numOrUndef(value: string): number | undefined {
  const t = value.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function FeeStructureForm({
  mode,
  detail,
}: {
  mode: "create" | "edit";
  detail?: FeeStructureDetail;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState<FormState>(() =>
    detail ? seedFromDetail(detail) : EMPTY_FORM,
  );
  const seeded = useMemo(() => (detail ? seedFromDetail(detail) : EMPTY_FORM), [detail]);
  const [changeReason, setChangeReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (detail) setForm(seedFromDetail(detail));
  }, [detail]);

  const set = (partial: Partial<FormState>) => setForm((f) => ({ ...f, ...partial }));

  const keyLocked = mode === "edit";
  const isExpired = detail?.status === "expired";
  const isActive = detail?.status === "active";
  const readOnly = isExpired;

  // Catalogs.
  const universities = useUniversityOptions();
  const courses = useCourseOptions(form.university_id || null, { strict: true });
  const intakes = useQuery({ queryKey: ["intakes", "v2"], queryFn: listIntakes });

  // The chosen university's collection model (drives the inline Activate reason).
  const uniDetailQuery = useQuery({
    queryKey: ["university", form.university_id],
    queryFn: () => apiGet<{ fee_collection_model: FeeCollectionModel | null }>(`/universities/${form.university_id}`),
    enabled: !!form.university_id,
  });
  const feeCollectionModel =
    uniDetailQuery.data?.fee_collection_model ?? detail?.fee_collection_model ?? null;

  // Prefill course-fee periods from the course duration (create mode only).
  const courseDetailQuery = useQuery({
    queryKey: ["course", form.course_id],
    queryFn: () => apiGet<{ duration: string | null; total_duration: string | null }>(`/courses/${form.course_id}`),
    enabled: mode === "create" && !!form.course_id,
  });
  useEffect(() => {
    if (mode !== "create" || !courseDetailQuery.data) return;
    const years = parseDurationYears(
      courseDetailQuery.data.duration ?? courseDetailQuery.data.total_duration,
    );
    if (years) {
      setForm((f) => ({
        ...f,
        course_fee_periods:
          f.course_fee_basis === "per_semester" ? String(years * 2) : String(years),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseDetailQuery.data]);

  const preview = useMemo(
    () =>
      computePreview({
        registration_fee: form.registration_fee,
        course_fee_basis: form.course_fee_basis,
        course_fee_amount: form.course_fee_amount,
        course_fee_periods: form.course_fee_periods,
        exam_fee: form.exam_fee,
        exam_fee_basis: form.exam_fee_basis,
        discount_allowed: form.discount_allowed,
        discount_max_pct: form.discount_max_pct,
        items: form.items.map((it) => ({ amount: it.amount, basis: it.basis })),
      }),
    [form],
  );

  const customSum = useMemo(
    () => form.instalments.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [form.instalments],
  );

  const reasons = useMemo(
    () =>
      activationReasons({
        registration_fee: form.registration_fee,
        course_fee_basis: form.course_fee_basis,
        course_fee_amount: form.course_fee_amount,
        course_fee_periods: form.course_fee_periods,
        exam_fee: form.exam_fee,
        exam_fee_basis: form.exam_fee_basis,
        discount_allowed: form.discount_allowed,
        discount_max_pct: form.discount_max_pct,
        items: form.items.map((it) => ({ amount: it.amount, basis: it.basis })),
        feeCollectionModel,
        allow_full: form.allow_full,
        allow_per_year: form.allow_per_year,
        allow_per_semester: form.allow_per_semester,
        allow_custom: form.allow_custom,
        customInstalments: form.instalments.map((r) => ({ amount: r.amount })),
      }),
    [form, feeCollectionModel],
  );

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(seeded), [form, seeded]);

  // Mutations.
  const saveMut = useMutation({
    mutationFn: async () => {
      if (mode === "create") {
        return createFeeStructure(buildCreatePayload(form));
      }
      return updateFeeStructure(detail!.id, buildUpdatePayload(form, isActive ? changeReason : undefined));
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: feeStructureKeys.all });
      setError(null);
      if (mode === "create") {
        toast.success(`${res.code ?? "Fee structure"} created.`);
        navigate({ to: "/universities/fee-structure/$id", params: { id: String(res.id) } });
      } else {
        toast.success("Changes saved.");
        setChangeReason("");
      }
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "Save failed. Please try again.";
      setError(msg);
      toast.error(msg);
    },
  });

  const activateMut = useMutation({
    mutationFn: () => activateFeeStructure(detail!.id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: feeStructureKeys.all });
      toast.success(`${res.code ?? "Fee structure"} activated.`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Activation failed."),
  });

  const onSave = () => {
    setError(null);
    if (mode === "create" && (!form.university_id || !form.course_id || !form.intake_id)) {
      setError("Pick a university, course and intake.");
      return;
    }
    if (isActive && !changeReason.trim()) {
      setError("A change reason is required to edit an active fee structure.");
      return;
    }
    saveMut.mutate();
  };

  const title =
    mode === "create" ? "New fee structure" : detail?.code ?? `Fee structure #${detail?.id}`;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" asChild className="-ml-2 h-7 text-muted-foreground">
            <Link to="/universities/fee-structure">
              <ArrowLeft className="mr-1 h-4 w-4" /> Fee structures
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {detail && <StatusChip status={detail.status} />}
          </div>
          {detail?.copied_from_id && detail.copied_from_code && (
            <Link
              to="/universities/fee-structure/$id"
              params={{ id: String(detail.copied_from_id) }}
              className="text-xs text-primary hover:underline"
            >
              Copied from {detail.copied_from_code}
            </Link>
          )}
        </div>
        {mode === "edit" && detail?.status === "draft" && (
          <div className="flex flex-col items-end gap-1">
            <Button
              onClick={() => activateMut.mutate()}
              disabled={reasons.length > 0 || dirty || activateMut.isPending}
            >
              {activateMut.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1 h-4 w-4" />
              )}
              Activate
            </Button>
            {(reasons.length > 0 || dirty) && (
              <p className="max-w-xs text-right text-xs text-amber-600">
                {dirty ? "Save your changes first." : reasons[0]}
              </p>
            )}
          </div>
        )}
      </div>

      {isExpired && (
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          <Lock className="h-4 w-4" /> This fee structure is expired and read-only. Copy it to a new
          intake to make changes.
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Form column */}
        <div className="space-y-6">
          {/* Identity */}
          <Section title="University · course · intake" subtitle="Locked after creation.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FieldSelect
                label="University"
                value={form.university_id}
                disabled={keyLocked || readOnly}
                onChange={(v) => set({ university_id: v, course_id: "" })}
                placeholder="Select university"
                options={universities.options}
              />
              <FieldSelect
                label="Course"
                value={form.course_id}
                disabled={keyLocked || readOnly || !form.university_id}
                onChange={(v) => set({ course_id: v })}
                placeholder={form.university_id ? "Select course" : "Pick a university first"}
                options={courses.options}
              />
              <FieldSelect
                label="Intake"
                value={form.intake_id}
                disabled={keyLocked || readOnly}
                onChange={(v) => set({ intake_id: v })}
                placeholder="Select intake"
                options={(intakes.data?.items ?? []).map((i) => ({
                  value: String(i.id),
                  label: i.name ?? `Intake #${i.id}`,
                }))}
              />
            </div>
            {form.university_id && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                Collection model:
                <CollectionModelBadge model={feeCollectionModel} universityId={Number(form.university_id)} />
              </div>
            )}
          </Section>

          {/* Registration + course + exam */}
          <Section title="Fees">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <MoneyField
                label="Registration fee"
                value={form.registration_fee}
                onChange={(v) => set({ registration_fee: v })}
                disabled={readOnly}
                hint="Snapshotted into the student's payment at stage 4."
              />
            </div>

            <div className="mt-4 space-y-3 rounded-lg border bg-muted/20 p-4">
              <Label className="text-sm font-medium">Course fee</Label>
              <RadioGroup
                value={form.course_fee_basis}
                onValueChange={(v) => set({ course_fee_basis: v as CourseFeeBasis })}
                className="flex flex-wrap gap-4"
                disabled={readOnly}
              >
                {(["total", "per_year", "per_semester"] as CourseFeeBasis[]).map((b) => (
                  <label key={b} className="flex cursor-pointer items-center gap-2 text-sm">
                    <RadioGroupItem value={b} id={`cfb-${b}`} />
                    {BASIS_LABEL[b]}
                  </label>
                ))}
              </RadioGroup>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <MoneyField
                  label={form.course_fee_basis === "total" ? "Amount" : "Amount per period"}
                  value={form.course_fee_amount}
                  onChange={(v) => set({ course_fee_amount: v })}
                  disabled={readOnly}
                />
                {form.course_fee_basis !== "total" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Number of {form.course_fee_basis === "per_year" ? "years" : "semesters"}
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.course_fee_periods}
                      onChange={(e) => set({ course_fee_periods: e.target.value })}
                      disabled={readOnly}
                    />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Course fee total:{" "}
                <span className="font-medium text-foreground">{formatInr(preview.courseFeeTotal)}</span>
              </p>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <MoneyField
                label="Exam fee"
                value={form.exam_fee}
                onChange={(v) => set({ exam_fee: v })}
                disabled={readOnly}
              />
              <BasisSelect
                label="Exam fee basis"
                value={form.exam_fee_basis}
                onChange={(v) => set({ exam_fee_basis: v })}
                disabled={readOnly}
              />
            </div>
          </Section>

          {/* Other fees repeater */}
          <Section
            title="Other fees"
            subtitle="Alumni fee, ID card, convocation…"
            action={
              !readOnly && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    set({ items: [...form.items, { label: "", amount: "", basis: "one_time" }] })
                  }
                >
                  <Plus className="mr-1 h-4 w-4" /> Add
                </Button>
              )
            }
          >
            {form.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No other fees.</p>
            ) : (
              <div className="space-y-2">
                {form.items.map((it, i) => (
                  <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_160px_auto]">
                    <Input
                      placeholder="Label"
                      value={it.label}
                      onChange={(e) =>
                        set({ items: form.items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })
                      }
                      disabled={readOnly}
                    />
                    <Input
                      type="number"
                      min={0}
                      placeholder="Amount"
                      value={it.amount}
                      onChange={(e) =>
                        set({ items: form.items.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })
                      }
                      disabled={readOnly}
                    />
                    <BasisSelect
                      value={it.basis}
                      onChange={(v) =>
                        set({ items: form.items.map((x, j) => (j === i ? { ...x, basis: v } : x)) })
                      }
                      disabled={readOnly}
                      compact
                    />
                    {!readOnly && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => set({ items: form.items.filter((_, j) => j !== i) })}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Discount */}
          <Section title="Discount">
            <div className="flex items-center gap-3">
              <Switch
                checked={form.discount_allowed}
                onCheckedChange={(c) => set({ discount_allowed: c })}
                disabled={readOnly}
              />
              <span className="text-sm">Allow a discount on this structure</span>
            </div>
            {form.discount_allowed && (
              <div className="mt-3 max-w-[200px] space-y-1.5">
                <Label className="text-xs">Maximum discount %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.discount_max_pct}
                  onChange={(e) => set({ discount_max_pct: e.target.value })}
                  disabled={readOnly}
                />
              </div>
            )}
          </Section>

          {/* Instalment options */}
          <Section title="Instalment options" subtitle="At least one plan is required to activate.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <PlanCheck label="Full payment" checked={form.allow_full} onChange={(c) => set({ allow_full: c })} disabled={readOnly} />
              <PlanCheck label="Per year" checked={form.allow_per_year} onChange={(c) => set({ allow_per_year: c })} disabled={readOnly} />
              <PlanCheck label="Per semester" checked={form.allow_per_semester} onChange={(c) => set({ allow_per_semester: c })} disabled={readOnly} />
              <PlanCheck label="Custom schedule" checked={form.allow_custom} onChange={(c) => set({ allow_custom: c })} disabled={readOnly} />
            </div>

            {form.allow_custom && (
              <div className="mt-4 space-y-3 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Custom schedule</Label>
                  {!readOnly && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        set({
                          instalments: [
                            ...form.instalments,
                            {
                              seq: form.instalments.length + 1,
                              label: "",
                              amount: "",
                              due_offset_days: "0",
                            },
                          ],
                        })
                      }
                    >
                      <Plus className="mr-1 h-4 w-4" /> Add row
                    </Button>
                  )}
                </div>
                {form.instalments.length > 0 && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-[40px_1fr_120px_140px_auto] gap-2 px-1 text-xs text-muted-foreground">
                      <span>#</span>
                      <span>Label</span>
                      <span>Amount</span>
                      <span>Days after start</span>
                      <span />
                    </div>
                    {form.instalments.map((ins, i) => (
                      <div key={i} className="grid grid-cols-[40px_1fr_120px_140px_auto] items-center gap-2">
                        <span className="text-sm tabular-nums text-muted-foreground">{ins.seq}</span>
                        <Input
                          placeholder="At admission"
                          value={ins.label}
                          onChange={(e) =>
                            set({ instalments: form.instalments.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })
                          }
                          disabled={readOnly}
                        />
                        <Input
                          type="number"
                          min={0}
                          value={ins.amount}
                          onChange={(e) =>
                            set({ instalments: form.instalments.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })
                          }
                          disabled={readOnly}
                        />
                        <Input
                          type="number"
                          value={ins.due_offset_days}
                          onChange={(e) =>
                            set({ instalments: form.instalments.map((x, j) => (j === i ? { ...x, due_offset_days: e.target.value } : x)) })
                          }
                          disabled={readOnly}
                        />
                        {!readOnly && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              set({
                                instalments: form.instalments
                                  .filter((_, j) => j !== i)
                                  .map((x, j) => ({ ...x, seq: j + 1 })),
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <CustomSumCheck sum={customSum} total={preview.totalFee} />
              </div>
            )}
          </Section>

          {/* Notes + active change reason */}
          <Section title="Notes">
            <Textarea
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Internal notes (optional)"
              rows={2}
              disabled={readOnly}
            />
            {isActive && (
              <div className="mt-4 space-y-1.5">
                <Label className="text-xs text-amber-700">Change reason (required for an active structure)</Label>
                <Textarea
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="Why is this active structure being edited?"
                  rows={2}
                />
              </div>
            )}
          </Section>
        </div>

        {/* Sticky totals */}
        <div className="lg:sticky lg:top-6 lg:h-fit">
          <Card>
            <CardContent className="space-y-3 p-5">
              <h3 className="text-sm font-semibold">Totals</h3>
              <TotalRow label="Course fee" value={preview.courseFeeTotal} />
              <TotalRow label="Exam fee" value={preview.examFeeTotal} />
              <TotalRow label="Other fees" value={preview.otherFeesTotal} />
              <div className="my-2 border-t" />
              <TotalRow label="Total fee" value={preview.totalFee} strong />
              {form.discount_allowed && (
                <>
                  <TotalRow label="Max discount" value={-preview.maxDiscount} muted />
                  <TotalRow label="Net at max discount" value={preview.netAfterDiscount} />
                </>
              )}
              <TotalRow label="Registration fee" value={Number(form.registration_fee) || 0} muted />

              {!readOnly && (
                <Button className="mt-2 w-full" onClick={onSave} disabled={saveMut.isPending}>
                  {saveMut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  {mode === "create" ? "Create draft" : "Save changes"}
                </Button>
              )}

              {detail?.status === "draft" && reasons.length > 0 && (
                <div className="mt-2 space-y-1 rounded-md bg-amber-50 p-3 text-xs text-amber-700">
                  <div className="flex items-center gap-1 font-medium">
                    <Info className="h-3.5 w-3.5" /> To activate:
                  </div>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function buildCreatePayload(form: FormState): CreateFeeStructurePayload {
  return {
    university_id: Number(form.university_id),
    course_id: Number(form.course_id),
    intake_id: Number(form.intake_id),
    registration_fee: numOrUndef(form.registration_fee),
    course_fee_basis: form.course_fee_basis,
    course_fee_amount: numOrUndef(form.course_fee_amount),
    course_fee_periods: form.course_fee_basis === "total" ? 1 : numOrUndef(form.course_fee_periods),
    exam_fee: numOrUndef(form.exam_fee),
    exam_fee_basis: form.exam_fee_basis,
    discount_allowed: form.discount_allowed,
    discount_max_pct: form.discount_allowed ? numOrUndef(form.discount_max_pct) : undefined,
    allow_full: form.allow_full,
    allow_per_year: form.allow_per_year,
    allow_per_semester: form.allow_per_semester,
    allow_custom: form.allow_custom,
    notes: form.notes.trim() || undefined,
    items: cleanItems(form.items),
    instalments: form.allow_custom ? cleanInstalments(form.instalments) : [],
  };
}

function buildUpdatePayload(form: FormState, changeReason?: string): UpdateFeeStructurePayload {
  const base = buildCreatePayload(form);
  const { university_id: _u, course_id: _c, intake_id: _i, ...rest } = base;
  void _u;
  void _c;
  void _i;
  return { ...rest, change_reason: changeReason };
}

function cleanItems(items: ItemRow[]): CreateFeeStructurePayload["items"] {
  return items
    .filter((it) => it.label.trim() !== "")
    .map((it, i) => ({
      label: it.label.trim(),
      amount: Number(it.amount) || 0,
      basis: it.basis,
      sort_order: i,
    }));
}

function cleanInstalments(rows: InstalmentRow[]): CreateFeeStructurePayload["instalments"] {
  return rows.map((r, i) => ({
    seq: i + 1,
    label: r.label.trim() || undefined,
    amount: Number(r.amount) || 0,
    due_offset_days: Number(r.due_offset_days) || 0,
  }));
}

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {action}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  placeholder,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function MoneyField({
  label,
  value,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
        <Input
          type="number"
          min={0}
          className="pl-6"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function BasisSelect({
  label,
  value,
  onChange,
  disabled,
  compact,
}: {
  label?: string;
  value: ComponentBasis;
  onChange: (v: ComponentBasis) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const select = (
    <Select value={value} onValueChange={(v) => onChange(v as ComponentBasis)} disabled={disabled}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(["one_time", "per_year", "per_semester"] as ComponentBasis[]).map((b) => (
          <SelectItem key={b} value={b}>
            {BASIS_LABEL[b]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  if (compact) return select;
  return (
    <div className="space-y-1.5">
      {label && <Label className="text-xs">{label}</Label>}
      {select}
    </div>
  );
}

function PlanCheck({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (c: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors",
        checked ? "border-primary/40 bg-primary/5" : "border-border",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <Checkbox checked={checked} onCheckedChange={(c) => onChange(c === true)} disabled={disabled} />
      {label}
    </label>
  );
}

function CustomSumCheck({ sum, total }: { sum: number; total: number }) {
  const ok = Math.round(sum * 100) === Math.round(total * 100);
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-xs",
        ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
      )}
    >
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
      Custom plan sums to {formatInr(sum)} of {formatInr(total)}
      {ok ? " — matches." : " — must match the total fee."}
    </div>
  );
}

function TotalRow({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: number;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={cn(muted && "text-muted-foreground")}>{label}</span>
      <span className={cn("tabular-nums", strong && "text-base font-semibold")}>{formatInr(value)}</span>
    </div>
  );
}
