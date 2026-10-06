// Client-side mirror of the server's fee math, for LIVE totals and the inline
// Activate reason as the Admin types (the server remains the source of truth on
// save/activate). Kept in integer paise to avoid float drift, same as the API.
import type {
  ComponentBasis,
  CourseFeeBasis,
  FeeCollectionModel,
} from "@/lib/api/fee-structures";

const SEMESTERS_PER_YEAR = 2;

function toPaise(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100 + (n >= 0 ? 1e-6 : -1e-6));
}

export interface PreviewItem {
  amount: string | number;
  basis: ComponentBasis;
}

export interface PreviewInput {
  registration_fee: string | number;
  course_fee_basis: CourseFeeBasis;
  course_fee_amount: string | number;
  course_fee_periods: string | number;
  exam_fee: string | number;
  exam_fee_basis: ComponentBasis;
  discount_allowed: boolean;
  discount_max_pct: string | number;
  items: PreviewItem[];
}

export interface PreviewResult {
  years: number;
  semesters: number;
  courseFeeTotal: number;
  examFeeTotal: number;
  otherFeesTotal: number;
  totalFee: number;
  maxDiscount: number;
  netAfterDiscount: number;
}

function periodContext(basis: CourseFeeBasis, periods: number): { years: number; semesters: number } {
  const count = periods > 0 ? Math.floor(periods) : 1;
  if (basis === "per_year") return { years: count, semesters: count * SEMESTERS_PER_YEAR };
  if (basis === "per_semester") {
    return { years: Math.max(1, Math.ceil(count / SEMESTERS_PER_YEAR)), semesters: count };
  }
  return { years: 1, semesters: 1 };
}

function multiplier(basis: ComponentBasis, ctx: { years: number; semesters: number }): number {
  if (basis === "per_year") return ctx.years;
  if (basis === "per_semester") return ctx.semesters;
  return 1;
}

export function computePreview(input: PreviewInput): PreviewResult {
  const periods = Number(input.course_fee_periods) || 1;
  const ctx = periodContext(input.course_fee_basis, periods);

  const courseMultiplier = input.course_fee_basis === "total" ? 1 : periods > 0 ? Math.floor(periods) : 1;
  const courseFeeTotal = toPaise(input.course_fee_amount) * courseMultiplier;
  const examFeeTotal = toPaise(input.exam_fee) * multiplier(input.exam_fee_basis, ctx);
  const otherFeesTotal = input.items.reduce(
    (sum, it) => sum + toPaise(it.amount) * multiplier(it.basis, ctx),
    0,
  );
  const totalFee = courseFeeTotal + examFeeTotal + otherFeesTotal;
  const pct = input.discount_allowed ? Number(input.discount_max_pct) || 0 : 0;
  const maxDiscount = Math.round((totalFee * pct) / 100);

  return {
    years: ctx.years,
    semesters: ctx.semesters,
    courseFeeTotal: courseFeeTotal / 100,
    examFeeTotal: examFeeTotal / 100,
    otherFeesTotal: otherFeesTotal / 100,
    totalFee: totalFee / 100,
    maxDiscount: maxDiscount / 100,
    netAfterDiscount: (totalFee - maxDiscount) / 100,
  };
}

export interface ActivationInput extends PreviewInput {
  feeCollectionModel: FeeCollectionModel | null;
  allow_full: boolean;
  allow_per_year: boolean;
  allow_per_semester: boolean;
  allow_custom: boolean;
  customInstalments: Array<{ amount: string | number }>;
}

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

/** The inline activation blockers, mirroring the server canActivate(). */
export function activationReasons(input: ActivationInput): string[] {
  const reasons: string[] = [];
  const preview = computePreview(input);

  if (toPaise(preview.courseFeeTotal) <= 0) {
    reasons.push("Course fee is ₹0 — a ₹0 course fee cannot be activated.");
  }
  if (toPaise(input.registration_fee) <= 0) {
    reasons.push("Registration fee is ₹0 — set a registration fee before activating.");
  }
  if (!input.feeCollectionModel) {
    reasons.push("University collection model is not set.");
  }
  if (!(input.allow_full || input.allow_per_year || input.allow_per_semester || input.allow_custom)) {
    reasons.push("Enable at least one instalment option.");
  }
  if (input.allow_custom) {
    const sum = input.customInstalments.reduce((s, r) => s + toPaise(r.amount), 0);
    const total = toPaise(preview.totalFee);
    if (sum !== total) {
      reasons.push(`Custom plan sums to ${INR.format(sum / 100)}, expected ${INR.format(total / 100)}.`);
    }
  }
  if (input.discount_allowed) {
    const pct = Number(input.discount_max_pct);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      reasons.push("Discount is enabled but no valid maximum percentage is set.");
    }
  }
  return reasons;
}

/** Parse a free-text course duration ("2 Years", "4 Semesters", "18 months") into years. */
export function parseDurationYears(duration: string | null | undefined): number | null {
  if (!duration) return null;
  const text = duration.toLowerCase();
  const num = Number(text.match(/\d+(\.\d+)?/)?.[0]);
  if (!Number.isFinite(num) || num <= 0) return null;
  if (text.includes("sem")) return Math.max(1, Math.round(num / SEMESTERS_PER_YEAR));
  if (text.includes("month")) return Math.max(1, Math.round(num / 12));
  return Math.round(num);
}
