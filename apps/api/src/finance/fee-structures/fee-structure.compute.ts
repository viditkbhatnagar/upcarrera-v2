/**
 * Pure fee arithmetic for the Fee Structure master. No Nest, no Prisma, no I/O:
 * these are the functions the unit spec drives first (TDD), and the service
 * calls them inside its save/activate transactions.
 *
 *   computeTotals() — expand every component by its basis, sum the fixed
 *                     columns + items, and surface the max-discount view.
 *   canActivate()   — the Rs0 / collection-model / plan / custom-sum guard that
 *                     gates Draft -> Active.
 */
import {
  basisMultiplier,
  ComponentBasis,
  CourseFeeBasis,
  formatMoney,
  NumericLike,
  PeriodContext,
  periodContextFor,
  paiseToDecimalString,
  toPaise,
} from './fee-structure.money';

/** One "other fee" line as computeTotals needs it. */
export interface ComputeComponent {
  amount: NumericLike;
  basis: ComponentBasis | string | null | undefined;
  label?: string | null;
}

export interface ComputeTotalsInput {
  registrationFee?: NumericLike;
  courseFeeBasis?: CourseFeeBasis | string | null;
  courseFeeAmount?: NumericLike;
  courseFeePeriods?: number | null;
  examFee?: NumericLike;
  examFeeBasis?: ComponentBasis | string | null;
  discountAllowed?: boolean;
  discountMaxPct?: NumericLike;
  items?: readonly ComputeComponent[];
  /** Explicit period context override; otherwise derived from the course fee. */
  years?: number;
  semesters?: number;
}

/** A single expanded line in the breakdown the detail screen renders. */
export interface BreakdownLine {
  key: string;
  label: string;
  basis: string;
  unitPaise: number;
  multiplier: number;
  totalPaise: number;
}

export interface ComputeTotalsResult {
  /** Period context the per-period components were expanded over. */
  context: PeriodContext;
  registrationFeePaise: number;
  courseFeeTotalPaise: number;
  examFeeTotalPaise: number;
  otherFeesTotalPaise: number;
  /** course + exam + other, written to fee_structure.total_fee. Excludes registration & discount. */
  totalFeePaise: number;
  /** total * discount_max_pct, 0 when discount is off. Display only — never persisted into total_fee. */
  maxDiscountPaise: number;
  /** totalFee - maxDiscount, for the "net at max discount" line. */
  netAfterMaxDiscountPaise: number;
  breakdown: BreakdownLine[];
  /** Ready-to-persist decimal strings, matching the decimal(_,2) columns. */
  columns: {
    course_fee_total: string;
    other_fees_total: string;
    total_fee: string;
  };
}

/**
 * Expand each component by its basis and sum them. The course fee uses its own
 * period count (course_fee_periods); exam and "other" per-period fees use the
 * reconciled (years, semesters) context. total_fee = course + exam + other;
 * registration and the discount cap are deliberately kept out of it (the DDL
 * total_fee column is course+exam+other, and stage 4 snapshots the registration
 * fee separately).
 */
export function computeTotals(input: ComputeTotalsInput): ComputeTotalsResult {
  const ctx: PeriodContext =
    input.years !== undefined && input.semesters !== undefined
      ? { years: input.years, semesters: input.semesters }
      : periodContextFor(input.courseFeeBasis, input.courseFeePeriods);

  const breakdown: BreakdownLine[] = [];

  // Course fee: its own multiplier (1 when the basis is a flat total).
  const courseUnit = toPaise(input.courseFeeAmount);
  const courseMultiplier =
    input.courseFeeBasis === 'total' || !input.courseFeeBasis
      ? 1
      : input.courseFeePeriods && input.courseFeePeriods > 0
        ? Math.floor(input.courseFeePeriods)
        : 1;
  const courseFeeTotalPaise = courseUnit * courseMultiplier;
  breakdown.push({
    key: 'course_fee',
    label: 'Course fee',
    basis: input.courseFeeBasis ?? 'total',
    unitPaise: courseUnit,
    multiplier: courseMultiplier,
    totalPaise: courseFeeTotalPaise,
  });

  // Exam fee.
  const examUnit = toPaise(input.examFee);
  const examMultiplier = basisMultiplier(input.examFeeBasis, ctx);
  const examFeeTotalPaise = examUnit * examMultiplier;
  if (examUnit > 0) {
    breakdown.push({
      key: 'exam_fee',
      label: 'Exam fee',
      basis: input.examFeeBasis ?? 'one_time',
      unitPaise: examUnit,
      multiplier: examMultiplier,
      totalPaise: examFeeTotalPaise,
    });
  }

  // Other fees (repeater items).
  let otherFeesTotalPaise = 0;
  (input.items ?? []).forEach((item, index) => {
    const unit = toPaise(item.amount);
    const multiplier = basisMultiplier(item.basis, ctx);
    const total = unit * multiplier;
    otherFeesTotalPaise += total;
    breakdown.push({
      key: `item_${index}`,
      label: item.label?.trim() || `Other fee ${index + 1}`,
      basis: (item.basis as string) ?? 'one_time',
      unitPaise: unit,
      multiplier,
      totalPaise: total,
    });
  });

  const totalFeePaise = courseFeeTotalPaise + examFeeTotalPaise + otherFeesTotalPaise;

  const pct = Number(input.discountMaxPct ?? 0);
  const validPct = input.discountAllowed && Number.isFinite(pct) && pct > 0 ? pct : 0;
  const maxDiscountPaise = Math.round((totalFeePaise * validPct) / 100);
  const netAfterMaxDiscountPaise = totalFeePaise - maxDiscountPaise;

  return {
    context: ctx,
    registrationFeePaise: toPaise(input.registrationFee),
    courseFeeTotalPaise,
    examFeeTotalPaise,
    otherFeesTotalPaise,
    totalFeePaise,
    maxDiscountPaise,
    netAfterMaxDiscountPaise,
    breakdown,
    columns: {
      course_fee_total: paiseToDecimalString(courseFeeTotalPaise),
      other_fees_total: paiseToDecimalString(otherFeesTotalPaise),
      total_fee: paiseToDecimalString(totalFeePaise),
    },
  };
}

export interface CanActivateInput {
  /** Recomputed course_fee_total (any money-ish form). */
  courseFeeTotal: NumericLike;
  registrationFee: NumericLike;
  /** Recomputed total_fee (course + exam + other). */
  totalFee: NumericLike;
  feeCollectionModel?: string | null;
  allowFull: boolean;
  allowPerYear: boolean;
  allowPerSemester: boolean;
  allowCustom: boolean;
  discountAllowed: boolean;
  discountMaxPct?: NumericLike;
  /** The custom schedule rows; only consulted when allowCustom is true. */
  customInstalments?: ReadonlyArray<{ amount: NumericLike }>;
}

export interface CanActivateResult {
  ok: boolean;
  reasons: string[];
}

/**
 * The spec Rs0 guard plus the surrounding activation rules. Every blocking
 * condition contributes one human-readable reason (the form shows them inline,
 * the activate endpoint returns them on a 422). An Active structure requires an
 * empty reasons list.
 */
export function canActivate(input: CanActivateInput): CanActivateResult {
  const reasons: string[] = [];

  const courseFeeTotalPaise = toPaise(input.courseFeeTotal);
  if (courseFeeTotalPaise <= 0) {
    reasons.push('Course fee is ₹0 — a ₹0 course fee cannot be activated.');
  }

  // A ₹0 registration fee is legitimate (some programs have none): the spec Rs0
  // guard applies to the COURSE fee only. `registrationFee` is kept on the input
  // for callers/snapshots, but it never blocks activation.

  if (!input.feeCollectionModel) {
    reasons.push('University collection model is not set.');
  }

  const anyPlan =
    input.allowFull || input.allowPerYear || input.allowPerSemester || input.allowCustom;
  if (!anyPlan) {
    reasons.push('Enable at least one instalment option.');
  }

  if (input.allowCustom) {
    const totalFeePaise = toPaise(input.totalFee);
    const sumPaise = (input.customInstalments ?? []).reduce(
      (sum, row) => sum + toPaise(row.amount),
      0,
    );
    if (sumPaise !== totalFeePaise) {
      reasons.push(
        `Custom plan sums to ${formatMoney(sumPaise)}, expected ${formatMoney(totalFeePaise)}.`,
      );
    }
  }

  if (input.discountAllowed) {
    const pct = Number(input.discountMaxPct ?? NaN);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      reasons.push('Discount is enabled but no valid maximum percentage is set.');
    }
  }

  return { ok: reasons.length === 0, reasons };
}
