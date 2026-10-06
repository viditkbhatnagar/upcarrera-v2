/**
 * Counsellor Targets — API shapes, the one target-type taxonomy, and the
 * display mapping (QA TG01, TG02).
 *
 * Kept outside the route file because TanStack Router's autoCodeSplitting
 * splits route modules, so the dialogs cannot import from the route.
 *
 * DISPLAY vs RAW: everything on `TargetRow` except `raw` is for rendering
 * only. Edit forms seed from `raw` (the server's values) and PATCH only the
 * fields that differ from it, so a display coercion (a "—", a derived month,
 * a status) can never reach a request body.
 */
import { GraduationCap, HelpCircle, Trophy } from "lucide-react";
import type { ApiConsultant } from "@/components/teams/team-shared";
import { displayEmpId } from "@/components/teams/team-shared";

/* ---------------- API shapes ---------------- */

/**
 * GET /consultant-targets[/:id]. consultant_target has only type, from_date,
 * to_date, value and consultant_id (+ audit). achieved, performance and
 * is_active are computed server-side.
 */
export interface TargetApiRow {
  consultant_target_id: number;
  type: number | null;
  from_date: string | null;
  to_date: string | null;
  value: number | null;
  consultant_id: number | null;
  consultant_name: string | null;
  consultant_employee_code?: string | null;
  is_active?: boolean;
  achieved: number;
  performance: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TargetsResponse {
  items: TargetApiRow[];
  total: number;
  page: number;
  limit: number;
  /** Over every matching target, not just the rows returned (newer API). */
  summary?: TargetsSummary;
}

export interface TargetsSummary {
  active: number;
  upcoming: number;
  ended: number;
  /** Distinct users.id that have at least one target. */
  consultant_ids: number[];
  /** Distinct YYYY-MM of the window starts, newest first. */
  months: string[];
}

/** GET /consultants row — the hierarchy fields the No-Targets panel shows. */
export interface ConsultantRow extends ApiConsultant {
  manager_name?: string | null;
  team_leader_name?: string | null;
}

export const TARGETS_KEY = ["consultant-targets"] as const;
export const TARGETS_LIST_KEY = ["consultant-targets", "list"] as const;

/* ---------------- Target types ---------------- */

/**
 * The only two codes consultant_target.type encodes (ConsultantsService
 * TARGET_TYPE_POINTS / TARGET_TYPE_COUNT). There is no revenue target type.
 */
export type TargetTypeCode = 1 | 2;

export interface TargetTypeMeta {
  label: string;
  unit: string;
  definition: string;
  icon: typeof Trophy;
  tone: string;
  placeholder: string;
}

export const TARGET_TYPES: Record<TargetTypeCode, TargetTypeMeta> = {
  1: {
    label: "Point Target",
    unit: "pts",
    definition:
      "Points earned in the period: the sum of the course specialisation points of every student the counsellor enrolled between the start and end dates.",
    icon: Trophy,
    tone: "bg-amber-500/10 text-amber-700 ring-amber-500/20",
    placeholder: "e.g. 120",
  },
  2: {
    label: "Admission Target",
    unit: "admissions",
    definition:
      "Admissions in the period: the number of students the counsellor enrolled between the start and end dates.",
    icon: GraduationCap,
    tone: "bg-indigo-500/10 text-indigo-700 ring-indigo-500/20",
    placeholder: "e.g. 15",
  },
};

export const TARGET_TYPE_CODES: TargetTypeCode[] = [2, 1];

/** Legacy rows can carry a NULL or unknown type — shown as such, never guessed. */
export const UNKNOWN_TYPE_META: TargetTypeMeta = {
  label: "Type not set",
  unit: "",
  definition: "This target has no type recorded, so nothing is counted towards it.",
  icon: HelpCircle,
  tone: "bg-muted text-muted-foreground ring-border",
  placeholder: "",
};

export function isTargetTypeCode(n: number | null | undefined): n is TargetTypeCode {
  return n === 1 || n === 2;
}

export function typeMeta(code: number | null): TargetTypeMeta {
  return isTargetTypeCode(code) ? TARGET_TYPES[code] : UNKNOWN_TYPE_META;
}

/* ---------------- Dates ---------------- */

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2025-04-01T00:00:00.000Z" -> "2025-04-01". The column is a DATE, so no TZ shift. */
export function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m ? m[1] : null;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Today as the SERVER sees it (UTC). Target status must use this, not the
 * browser's local date: the API's is_active is computed from the UTC date, and
 * in IST between 00:00 and 05:30 on the 1st the two disagree about which
 * month's target is active.
 */
export function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function currentMonth(): string {
  return todayIso().slice(0, 7);
}

/** "2025-04" -> "2025-04-30". */
export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}

/** The window is exactly one calendar month (1st to last day). */
export function isWholeMonth(from: string | null, to: string | null): boolean {
  if (!from || !to) return false;
  return from.endsWith("-01") && to === lastDayOfMonth(from.slice(0, 7));
}

export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1] ?? "?"} ${y}`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MONTH_NAMES[m - 1] ?? "?"} ${y}`;
}

export function formatPeriod(from: string | null, to: string | null): string {
  if (isWholeMonth(from, to)) return formatMonth(from!.slice(0, 7));
  if (from && to) return `${formatDate(from)} – ${formatDate(to)}`;
  if (from) return `From ${formatDate(from)}`;
  if (to) return `Until ${formatDate(to)}`;
  return "No period set";
}

/* ---------------- Row mapping ---------------- */

export type TargetStatus = "Active" | "Upcoming" | "Ended";

export const STATUS_STYLES: Record<TargetStatus, string> = {
  Active: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  Upcoming: "bg-sky-500/10 text-sky-700 ring-sky-500/20",
  Ended: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
};
export const STATUS_DOT: Record<TargetStatus, string> = {
  Active: "bg-emerald-500",
  Upcoming: "bg-sky-500",
  Ended: "bg-rose-500",
};

/**
 * Status is derived from the window, not stored (there is no status column).
 * Active = the window contains today — the same rule as the counsellor profile.
 * The server's is_active wins when present, and the fallback uses the same UTC
 * date the server does, so this screen and the profile always agree.
 */
export function deriveStatus(
  from: string | null,
  to: string | null,
  isActive?: boolean,
): TargetStatus {
  if (isActive === true) return "Active";
  const today = todayUtcIso();
  if (from && from > today) return "Upcoming";
  if (to && to < today) return "Ended";
  return isActive === false ? "Ended" : "Active";
}

export interface TargetRow {
  targetId: number;
  code: string;
  fromDate: string | null;
  toDate: string | null;
  /** YYYY-MM of the window start; drives the month filter. */
  month: string | null;
  period: string;
  typeCode: number | null;
  typeLabel: string;
  counsellorId: number | null;
  counsellorName: string;
  /** employee_code ?? UC-<users.id> — display only. */
  counsellorDisplayId: string;
  value: number | null;
  achieved: number;
  /** null when there is no value to measure against. */
  progressPct: number | null;
  status: TargetStatus;
  raw: TargetApiRow;
}

export function targetCode(id: number): string {
  return `TG-${String(id).padStart(4, "0")}`;
}

export function mapTarget(t: TargetApiRow): TargetRow {
  const fromDate = dateOnly(t.from_date);
  const toDate = dateOnly(t.to_date);
  const value = t.value;
  return {
    targetId: t.consultant_target_id,
    code: targetCode(t.consultant_target_id),
    fromDate,
    toDate,
    month: fromDate ? fromDate.slice(0, 7) : toDate ? toDate.slice(0, 7) : null,
    period: formatPeriod(fromDate, toDate),
    typeCode: t.type,
    typeLabel: typeMeta(t.type).label,
    counsellorId: t.consultant_id,
    counsellorName:
      t.consultant_name?.trim() ||
      (t.consultant_id != null ? `Unknown counsellor #${t.consultant_id}` : "No counsellor"),
    counsellorDisplayId:
      t.consultant_id != null ? displayEmpId(t.consultant_employee_code, t.consultant_id) : "—",
    value,
    achieved: t.achieved ?? 0,
    progressPct: value && value > 0 ? Math.round(((t.achieved ?? 0) / value) * 100) : null,
    status: deriveStatus(fromDate, toDate, t.is_active),
    raw: t,
  };
}

/** Newest window first: start date, then end date, then id. Undated rows last. */
export function compareTargets(a: TargetRow, b: TargetRow): number {
  const byDate = (x: string | null, y: string | null) =>
    x === y ? 0 : x == null ? 1 : y == null ? -1 : x < y ? 1 : -1;
  return (
    byDate(a.fromDate, b.fromDate) || byDate(a.toDate, b.toDate) || b.targetId - a.targetId
  );
}

export function formatTargetValue(value: number | null, code: number | null): string {
  if (value == null) return "—";
  const unit = typeMeta(code).unit;
  return unit ? `${value.toLocaleString("en-IN")} ${unit}` : value.toLocaleString("en-IN");
}
