/**
 * Money and period primitives for the Fee Structure master (WS2, spec FS01-FS04).
 *
 * Money is stored as decimal(10,2) / decimal(12,2) in MySQL. To avoid binary
 * float drift (0.1 + 0.2 !== 0.3), ALL arithmetic in this module is done in
 * integer paise (1 rupee = 100 paise) and only rendered back to a fixed
 * two-decimal string for persistence. Nothing here touches the database or
 * Nest — these are pure functions, unit-tested in isolation first (TDD).
 */

/** Anything that can carry a money value across the boundary (DTO number, DB Decimal, string). */
export type NumericLike = number | string | { toString(): string } | null | undefined;

/** 100 paise = 1 rupee. The scale of the decimal(_,2) money columns. */
export const MONEY_SCALE = 100;

/** Convention: a year is two semesters. Used to reconcile per-year / per-semester bases. */
export const SEMESTERS_PER_YEAR = 2;

/** fee_structure.course_fee_basis. */
export const COURSE_FEE_BASES = ['total', 'per_year', 'per_semester'] as const;
export type CourseFeeBasis = (typeof COURSE_FEE_BASES)[number];

/** fee_structure.exam_fee_basis and fee_structure_item.basis. */
export const COMPONENT_BASES = ['one_time', 'per_year', 'per_semester'] as const;
export type ComponentBasis = (typeof COMPONENT_BASES)[number];

/** fee_structure.status lifecycle. */
export const FEE_STATUSES = ['draft', 'active', 'expired'] as const;
export type FeeStatus = (typeof FEE_STATUSES)[number];

/** university.fee_collection_model. */
export const FEE_COLLECTION_MODELS = ['upcarrera_collects', 'university_collects'] as const;
export type FeeCollectionModel = (typeof FEE_COLLECTION_MODELS)[number];

/** Derived intake lifecycle, from start_date / closing_date against "now". */
export type IntakeStatus = 'Upcoming' | 'Open' | 'Closed' | 'Unknown';

/**
 * Parse any money-ish value into integer paise, rounding half-up at the paise.
 * null / undefined / '' / NaN all collapse to 0 — negative inputs are rejected
 * by the DTO layer, never here, so this stays total.
 */
export function toPaise(value: NumericLike): number {
  if (value === null || value === undefined) return 0;
  const asNumber =
    typeof value === 'number'
      ? value
      : Number(typeof value === 'string' ? value.trim() : value.toString());
  if (!Number.isFinite(asNumber)) return 0;
  // + a sub-paise epsilon so 12.005 * 100 = 1200.4999999 still rounds to 1201.
  return Math.round(asNumber * MONEY_SCALE + (asNumber >= 0 ? 1e-6 : -1e-6));
}

/** Render integer paise as a fixed two-decimal string ("1234.50") for a Decimal column. */
export function paiseToDecimalString(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / MONEY_SCALE);
  const fraction = abs % MONEY_SCALE;
  return `${sign}${rupees}.${String(fraction).padStart(2, '0')}`;
}

/** Render integer paise as "₹1,23,456.78" (Indian digit grouping) for UI reasons. */
export function formatMoney(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / MONEY_SCALE);
  const fraction = String(abs % MONEY_SCALE).padStart(2, '0');
  const digits = String(rupees);
  // Indian grouping: last 3 digits, then groups of 2.
  const head = digits.length > 3 ? digits.slice(0, -3) : '';
  const tail = digits.slice(-3);
  const grouped = head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${tail}` : tail;
  return `${sign}₹${grouped}.${fraction}`;
}

/**
 * The (years, semesters) a per-year / per-semester component is expanded over.
 * Phase 1 has no standalone duration columns, so the counts are reconciled from
 * the course-fee basis and its period count (the Admin confirms a suggestion
 * parsed from the free-text course duration). A `total` course fee carries no
 * multi-period information, so exam/other per-period components fall back to a
 * single unit.
 */
export interface PeriodContext {
  years: number;
  semesters: number;
}

export function periodContextFor(
  basis: CourseFeeBasis | string | null | undefined,
  periods: number | null | undefined,
): PeriodContext {
  const count = periods && periods > 0 ? Math.floor(periods) : 1;
  if (basis === 'per_year') return { years: count, semesters: count * SEMESTERS_PER_YEAR };
  if (basis === 'per_semester') {
    return { years: Math.max(1, Math.ceil(count / SEMESTERS_PER_YEAR)), semesters: count };
  }
  return { years: 1, semesters: 1 };
}

/** The multiplier a component basis applies against the period context. */
export function basisMultiplier(
  basis: ComponentBasis | string | null | undefined,
  ctx: PeriodContext,
): number {
  if (basis === 'per_year') return ctx.years;
  if (basis === 'per_semester') return ctx.semesters;
  return 1;
}

/**
 * Best-effort parse of a free-text course duration ("2 Years", "4 Semesters",
 * "18 Months") into a (years, semesters) context, trying each candidate string
 * in turn. Returns null when none yields a positive period count, so the caller
 * can reject a per-year / per-semester fee that has no resolvable duration
 * rather than silently multiplying it by 1.
 */
export function parseDurationToContext(
  ...candidates: Array<string | null | undefined>
): PeriodContext | null {
  for (const raw of candidates) {
    if (!raw) continue;
    const match = String(raw)
      .toLowerCase()
      .match(/(\d+(?:\.\d+)?)\s*(years?|yrs?|semesters?|sems?|months?|mos?)/);
    if (!match) continue;
    const n = Number(match[1]);
    if (!Number.isFinite(n) || n <= 0) continue;
    const unit = match[2];
    if (unit.startsWith('y')) {
      const years = Math.max(1, Math.round(n));
      return { years, semesters: years * SEMESTERS_PER_YEAR };
    }
    if (unit.startsWith('s')) {
      const semesters = Math.max(1, Math.round(n));
      return { years: Math.max(1, Math.ceil(semesters / SEMESTERS_PER_YEAR)), semesters };
    }
    if (unit.startsWith('m')) {
      const years = Math.max(1, Math.round(n / 12));
      return { years, semesters: years * SEMESTERS_PER_YEAR };
    }
  }
  return null;
}

/** Normalise a DATE/DATETIME-ish value to a Date, or null. */
function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Month names (first three letters) in calendar order, for parsing a free-text intake month. */
const MONTH_PREFIXES = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
] as const;

/**
 * Map a free-text / numeric month ("March", "mar", "03", "3") to a 0-based index,
 * defaulting to January (0) when it cannot be parsed so any ordering stays
 * deterministic rather than throwing on messy data.
 */
export function monthToIndex(month: string | number | null | undefined): number {
  if (month == null) return 0;
  const s = String(month).trim().toLowerCase();
  if (s === '') return 0;
  const n = Number(s);
  if (Number.isInteger(n) && n >= 1 && n <= 12) return n - 1;
  const idx = MONTH_PREFIXES.findIndex((m) => s.startsWith(m));
  return idx >= 0 ? idx : 0;
}

/** The (year, month) a dateless intake is anchored to, as a UTC timestamp, or null. */
function intakeYearMonthMs(
  year: number | null | undefined,
  month: string | null | undefined,
): number | null {
  if (year == null) return null;
  const y = Number(year);
  if (!Number.isFinite(y)) return null;
  return Date.UTC(y, monthToIndex(month), 1);
}

/**
 * Derive the intake lifecycle shown in the list/detail: Upcoming before the
 * start date, Open between start and closing (inclusive), Closed after closing.
 * Production intakes have a NULL start_date, so when there is none it falls back
 * to the (year, month) pair — the whole calendar month reads as Open — and only
 * returns a clearly-labelled Unknown when there is nothing at all to reason from.
 */
export function deriveIntakeStatus(
  startDate: Date | string | null | undefined,
  closingDate: Date | string | null | undefined,
  now: Date = new Date(),
  period?: { year?: number | null; month?: string | null },
): IntakeStatus {
  const start = toDate(startDate);
  const closing = toDate(closingDate);
  if (start) {
    if (now.getTime() < start.getTime()) return 'Upcoming';
    if (closing && now.getTime() > closing.getTime()) return 'Closed';
    return 'Open';
  }
  const ms = intakeYearMonthMs(period?.year, period?.month);
  if (ms !== null) {
    const anchor = new Date(ms);
    const monthEnd = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1);
    if (now.getTime() < ms) return 'Upcoming';
    if (now.getTime() >= monthEnd) return 'Closed';
    return 'Open';
  }
  return 'Unknown';
}

/** An intake the copy picker can order and choose between. */
export interface IntakeLike {
  id: number;
  start_date: Date | string | null;
  year?: number | null;
  month?: string | null;
}

/**
 * A deterministic sort key for an intake: a real start_date first, else the
 * (year, month) anchor, both on one UTC-ms timeline (tier 0); an intake with
 * neither falls to tier 1, ordered by id. This lets copy-to-next-intake work
 * even when every production intake has a NULL start_date.
 */
function intakeSortKey(i: IntakeLike): { tier: number; value: number; id: number } {
  const d = toDate(i.start_date);
  if (d) return { tier: 0, value: d.getTime(), id: i.id };
  const ms = intakeYearMonthMs(i.year, i.month);
  if (ms !== null) return { tier: 0, value: ms, id: i.id };
  return { tier: 1, value: i.id, id: i.id };
}

function compareIntakes(a: IntakeLike, b: IntakeLike): number {
  const ka = intakeSortKey(a);
  const kb = intakeSortKey(b);
  if (ka.tier !== kb.tier) return ka.tier - kb.tier;
  if (ka.value !== kb.value) return ka.value - kb.value;
  return ka.id - kb.id;
}

/**
 * The id of the intake immediately after the current one in the deterministic
 * order above, or null when the current intake is the last (or absent). The
 * current intake is located by id, so ordering no longer requires it — or any
 * intake — to carry a start_date.
 */
export function pickNextIntakeId(
  intakes: readonly IntakeLike[],
  currentId: number,
): number | null {
  const sorted = [...intakes].sort(compareIntakes);
  const idx = sorted.findIndex((i) => i.id === currentId);
  if (idx < 0 || idx + 1 >= sorted.length) return null;
  return sorted[idx + 1].id;
}
