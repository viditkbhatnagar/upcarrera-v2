/**
 * Assign / Edit / View dialogs for the Targets screen (QA TG01).
 *
 * Assign -> POST /consultant-targets. Edit -> PATCH /consultant-targets/:id with
 * ONLY the fields that differ from the raw server row. View -> GET
 * /consultant-targets/:id. A success toast fires only in onSuccess, after the
 * server has confirmed the write; a 409 (overlapping window) or 400 is shown
 * with the API's own message and the dialog stays open.
 *
 * The form has no Remarks or Status inputs: consultant_target has no column for
 * either, so they could only ever have been dropped. Status is derived from the
 * window instead (Active / Upcoming / Ended).
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Pencil, Plus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiGet, apiPatch, apiPost } from "@/lib/api";
import { cn } from "@/lib/utils";
import { displayEmpId } from "@/components/teams/team-shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type ConsultantRow,
  type TargetApiRow,
  type TargetStatus,
  type TargetTypeCode,
  STATUS_DOT,
  STATUS_STYLES,
  TARGET_TYPES,
  TARGET_TYPE_CODES,
  TARGETS_KEY,
  currentMonth,
  dateOnly,
  formatDate,
  formatPeriod,
  formatTargetValue,
  isTargetTypeCode,
  isWholeMonth,
  lastDayOfMonth,
  mapTarget,
  targetCode,
  typeMeta,
} from "./target-model";

const POSITIVE_INT = /^[1-9]\d*$/;
const MAX_VALUE = 2_147_483_647;

/* ---------------- Form model ---------------- */

type PeriodMode = "month" | "range";

interface TargetForm {
  counsellorId: string;
  type: "" | "1" | "2";
  mode: PeriodMode;
  month: string;
  fromDate: string;
  toDate: string;
  value: string;
}

/** Seed from the RAW server row (edit) or blank defaults (assign). */
function seedForm(raw: TargetApiRow | null, presetCounsellorId: number | null): TargetForm {
  if (!raw) {
    const month = currentMonth();
    return {
      counsellorId: presetCounsellorId != null ? String(presetCounsellorId) : "",
      type: "2",
      mode: "month",
      month,
      fromDate: `${month}-01`,
      toDate: lastDayOfMonth(month),
      value: "",
    };
  }
  const from = dateOnly(raw.from_date) ?? "";
  const to = dateOnly(raw.to_date) ?? "";
  return {
    counsellorId: raw.consultant_id != null ? String(raw.consultant_id) : "",
    type: isTargetTypeCode(raw.type) ? (String(raw.type) as "1" | "2") : "",
    mode: isWholeMonth(from, to) ? "month" : "range",
    month: (from || to || `${currentMonth()}-01`).slice(0, 7),
    fromDate: from,
    toDate: to,
    value: raw.value != null ? String(raw.value) : "",
  };
}

/** The [from, to] window the form currently describes. */
function formWindow(f: TargetForm): { from: string; to: string } {
  if (f.mode === "month") {
    return f.month ? { from: `${f.month}-01`, to: lastDayOfMonth(f.month) } : { from: "", to: "" };
  }
  return { from: f.fromDate, to: f.toDate };
}

interface FormErrors {
  counsellor: string | null;
  type: string | null;
  window: string | null;
  value: string | null;
}

function validate(f: TargetForm, isCreate: boolean): FormErrors {
  const { from, to } = formWindow(f);
  const v = f.value.trim();
  return {
    counsellor: isCreate && !f.counsellorId ? "Pick a counsellor." : null,
    type: !f.type ? "Pick a target type." : null,
    window: !from || !to ? "Pick the period." : to < from ? "The end date is before the start date." : null,
    value: !POSITIVE_INT.test(v) || Number(v) > MAX_VALUE ? "Enter a whole number greater than 0." : null,
  };
}

/** Only the fields that differ from the raw row — never the display values. */
function diffForm(raw: TargetApiRow, f: TargetForm): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const { from, to } = formWindow(f);
  if (f.type && Number(f.type) !== raw.type) out.type = Number(f.type);
  if (from && from !== dateOnly(raw.from_date)) out.from_date = from;
  if (to && to !== dateOnly(raw.to_date)) out.to_date = to;
  const value = f.value.trim();
  if (value && Number(value) !== raw.value) out.value = Number(value);
  return out;
}

function useInvalidateTargets() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: TARGETS_KEY });
    // The counsellor profile's Targets tab reads targets via its own endpoint.
    qc.invalidateQueries({ queryKey: ["consultant", "performance"] });
    // The Counsellors list's Active Target column comes from GET /consultants.
    qc.invalidateQueries({ queryKey: ["consultants", "list"] });
  };
}

/* ---------------- Assign / Edit ---------------- */

export interface TargetFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null -> Assign (POST); a raw row -> Edit (PATCH changed fields only). */
  target: TargetApiRow | null;
  presetCounsellorId?: number | null;
  counsellors: ConsultantRow[];
}

export function TargetFormDialog(props: TargetFormDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {props.open && (
          <TargetFormBody
            key={props.target?.consultant_target_id ?? `new-${props.presetCounsellorId ?? ""}`}
            {...props}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TargetFormBody({ onOpenChange, target, presetCounsellorId, counsellors }: TargetFormDialogProps) {
  const isCreate = target == null;
  const [form, setForm] = useState<TargetForm>(() => seedForm(target, presetCounsellorId ?? null));
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const invalidate = useInvalidateTargets();

  const set = <K extends keyof TargetForm>(key: K, value: TargetForm[K]) => {
    setServerError(null);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const errors = validate(form, isCreate);
  const hasErrors = Object.values(errors).some(Boolean);
  const changes = useMemo(() => (target ? diffForm(target, form) : null), [target, form]);
  const unchanged = !isCreate && changes != null && Object.keys(changes).length === 0;
  const { from, to } = formWindow(form);

  const mut = useMutation({
    mutationFn: () => {
      if (isCreate) {
        return apiPost<TargetApiRow>("/consultant-targets", {
          consultant_id: Number(form.counsellorId),
          type: Number(form.type),
          from_date: from,
          to_date: to,
          value: Number(form.value.trim()),
        });
      }
      return apiPatch<TargetApiRow>(`/consultant-targets/${target.consultant_target_id}`, changes);
    },
    onSuccess: () => {
      invalidate();
      toast.success(isCreate ? "Target assigned" : "Target updated");
      onOpenChange(false);
    },
    // 409 = overlapping window for this counsellor + type; the API names the clash.
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : "Couldn’t save the target";
      setServerError(msg);
      toast.error(msg);
    },
  });

  const submit = () => {
    setTouched(true);
    if (hasErrors || unchanged || mut.isPending) return;
    mut.mutate();
  };

  const show = (msg: string | null) => (touched ? msg : null);
  const meta = form.type ? TARGET_TYPES[Number(form.type) as TargetTypeCode] : null;
  const fixedCounsellor = !isCreate
    ? counsellors.find((c) => c.id === target.consultant_id)
    : undefined;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-semibold">
          {isCreate ? "Assign Target" : `Edit Target ${targetCode(target.consultant_target_id)}`}
        </DialogTitle>
        <DialogDescription>
          {isCreate
            ? "Set a point or admission target for a counsellor over a period."
            : "Only the fields you change are saved."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
        <Field label="Counsellor" error={show(errors.counsellor)} className="sm:col-span-2">
          {isCreate ? (
            <Select value={form.counsellorId} onValueChange={(v) => set("counsellorId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Pick counsellor" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {counsellors.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {(c.name?.trim() || `Unknown counsellor #${c.id}`) +
                      ` · ${displayEmpId(c.employee_code, c.id)}` +
                      (c.status === 0 ? " (inactive)" : "")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
              {target.consultant_name?.trim() ||
                fixedCounsellor?.name ||
                (target.consultant_id != null ? `Unknown counsellor #${target.consultant_id}` : "No counsellor")}
              {target.consultant_id != null && (
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {displayEmpId(target.consultant_employee_code ?? fixedCounsellor?.employee_code, target.consultant_id)}
                </span>
              )}
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                A target stays with its counsellor. To move it, assign a new target to the other counsellor.
              </div>
            </div>
          )}
        </Field>

        <Field label="Target Type" error={show(errors.type)}>
          <Select value={form.type} onValueChange={(v) => set("type", v as "1" | "2")}>
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {TARGET_TYPE_CODES.map((code) => (
                <SelectItem key={code} value={String(code)}>
                  {TARGET_TYPES[code].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={`Target Value${meta ? ` (${meta.unit})` : ""}`} error={show(errors.value)}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            placeholder={meta?.placeholder ?? ""}
            value={form.value}
            onChange={(e) => set("value", e.target.value)}
          />
        </Field>

        {meta && (
          <p className="text-xs text-muted-foreground sm:col-span-2">{meta.definition}</p>
        )}

        <div className="space-y-2 sm:col-span-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-foreground">Period</Label>
            <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
              {(["month", "range"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    // Switching keeps the same window so nothing jumps.
                    const w = formWindow(form);
                    setServerError(null);
                    setForm((f) => ({
                      ...f,
                      mode: m,
                      fromDate: w.from || f.fromDate,
                      toDate: w.to || f.toDate,
                      month: (w.from || f.month).slice(0, 7),
                    }));
                  }}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-semibold transition",
                    form.mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "month" ? "Whole month" : "Custom dates"}
                </button>
              ))}
            </div>
          </div>
          {form.mode === "month" ? (
            <Input type="month" value={form.month} onChange={(e) => set("month", e.target.value)} />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                aria-label="Start date"
                value={form.fromDate}
                onChange={(e) => set("fromDate", e.target.value)}
              />
              <Input
                type="date"
                aria-label="End date"
                value={form.toDate}
                onChange={(e) => set("toDate", e.target.value)}
              />
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarRange className="h-3.5 w-3.5" />
            {from && to ? formatPeriod(from, to) : "No period selected"}
            {from && to && !isWholeMonth(from, to) && to >= from && (
              <span>({from} to {to})</span>
            )}
          </div>
          {show(errors.window) && <p className="text-xs font-medium text-rose-600">{errors.window}</p>}
        </div>
      </div>

      {serverError && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-700">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {serverError}
        </div>
      )}

      <DialogFooter className="gap-2">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={mut.isPending || unchanged || (touched && hasErrors)}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isCreate ? <Plus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          {mut.isPending ? "Saving…" : isCreate ? "Assign Target" : unchanged ? "No Changes" : "Save Changes"}
        </button>
      </DialogFooter>
    </>
  );
}

/* ---------------- View ---------------- */

export interface TargetViewDialogProps {
  targetId: number | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (raw: TargetApiRow) => void;
}

export function TargetViewDialog({ targetId, onOpenChange, onEdit }: TargetViewDialogProps) {
  const open = targetId != null;
  const q = useQuery({
    queryKey: [...TARGETS_KEY, "detail", targetId],
    queryFn: () => apiGet<TargetApiRow>(`/consultant-targets/${targetId}`),
    enabled: open,
  });
  const row = q.data ? mapTarget(q.data) : null;
  const meta = row ? typeMeta(row.typeCode) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            Target {targetId != null ? targetCode(targetId) : ""}
          </DialogTitle>
          <DialogDescription>Achieved is calculated live from enrolments in the period.</DialogDescription>
        </DialogHeader>

        {q.isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading target…</div>
        ) : q.isError || !row || !meta ? (
          <div className="py-10 text-center text-sm text-rose-600">
            {q.error instanceof ApiError ? q.error.message : "Couldn’t load this target."}
          </div>
        ) : (
          <dl className="grid grid-cols-[8.5rem_1fr] gap-x-4 gap-y-2.5 text-sm">
            <Detail label="Counsellor">
              {row.counsellorName}
              <span className="ml-2 font-mono text-xs text-muted-foreground">{row.counsellorDisplayId}</span>
            </Detail>
            <Detail label="Target type">
              <span className="font-semibold">{meta.label}</span>
              <p className="mt-0.5 text-xs text-muted-foreground">{meta.definition}</p>
            </Detail>
            <Detail label="Period">
              {row.period}
              {isWholeMonth(row.fromDate, row.toDate) && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {formatDate(row.fromDate)} – {formatDate(row.toDate)}
                </span>
              )}
            </Detail>
            <Detail label="Target">{formatTargetValue(row.value, row.typeCode)}</Detail>
            <Detail label="Achieved">{formatTargetValue(row.achieved, row.typeCode)}</Detail>
            <Detail label="Progress">{row.progressPct == null ? "— (no target value)" : `${row.progressPct}%`}</Detail>
            <Detail label="Status">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
                  STATUS_STYLES[row.status],
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[row.status])} />
                {row.status}
              </span>
              <span className="ml-2 text-xs text-muted-foreground">
                {statusHint(row.status)}
              </span>
            </Detail>
            <Detail label="Last updated">{formatTimestamp(q.data?.updated_at ?? q.data?.created_at)}</Detail>
          </dl>
        )}

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Close
          </button>
          <button
            type="button"
            disabled={!q.data}
            onClick={() => q.data && onEdit(q.data)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function statusHint(status: TargetStatus): string {
  if (status === "Active") return "The period includes today.";
  if (status === "Upcoming") return "The period has not started yet.";
  return "The period has ended.";
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ---------------- Bits ---------------- */

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-semibold text-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{children}</dd>
    </>
  );
}
