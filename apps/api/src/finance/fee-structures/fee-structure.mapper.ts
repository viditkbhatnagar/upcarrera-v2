/**
 * Presentation mapping for fee_structure rows: turns Prisma rows (Decimal
 * money, bare FK ids) into the JSON the web list/detail screens consume, with
 * money as plain numbers, the resolved university/course/intake labels, the
 * derived intake status, the recomputed breakdown and the activation check.
 */
import type {
  fee_structure,
  fee_structure_instalment,
  fee_structure_item,
} from '@prisma/client';
import { canActivate } from './fee-structure.compute';
import { computeTotals } from './fee-structure.compute';
import {
  deriveIntakeStatus,
  formatMoney,
  IntakeStatus,
  type PeriodContext,
  toPaise,
} from './fee-structure.money';

/** Prisma Decimal | number | string -> number, or null. */
export function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number((value as { toString(): string }).toString());
  return Number.isFinite(n) ? n : null;
}

/** The labels a row is decorated with, bulk-resolved by the service (no N+1). */
export interface RowDecoration {
  universityTitle: string | null;
  feeCollectionModel: string | null;
  courseTitle: string | null;
  intakeName: string | null;
  intakeStartDate: Date | null;
  intakeClosingDate: Date | null;
  /** (year, month) fallback for the status badge when the intake has no start_date. */
  intakeYear?: number | null;
  intakeMonth?: string | null;
  copiedFromCode?: string | null;
}

/** The scalar view shared by the list item and the detail payload. */
export function baseFeeView(row: fee_structure, decoration: RowDecoration, now: Date = new Date()) {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    currency: row.currency,
    university_id: row.university_id,
    university_title: decoration.universityTitle,
    fee_collection_model: decoration.feeCollectionModel,
    course_id: row.course_id,
    course_title: decoration.courseTitle,
    intake_id: row.intake_id,
    intake_name: decoration.intakeName,
    intake_start_date: decoration.intakeStartDate,
    intake_closing_date: decoration.intakeClosingDate,
    intake_status: deriveIntakeStatus(decoration.intakeStartDate, decoration.intakeClosingDate, now, {
      year: decoration.intakeYear ?? null,
      month: decoration.intakeMonth ?? null,
    }) as IntakeStatus,
    registration_fee: decimalToNumber(row.registration_fee),
    course_fee_basis: row.course_fee_basis,
    course_fee_amount: decimalToNumber(row.course_fee_amount),
    course_fee_periods: row.course_fee_periods,
    course_fee_total: decimalToNumber(row.course_fee_total),
    exam_fee: decimalToNumber(row.exam_fee),
    exam_fee_basis: row.exam_fee_basis,
    other_fees_total: decimalToNumber(row.other_fees_total),
    total_fee: decimalToNumber(row.total_fee),
    discount_allowed: row.discount_allowed,
    discount_max_pct: decimalToNumber(row.discount_max_pct),
    allow_full: row.allow_full,
    allow_per_year: row.allow_per_year,
    allow_per_semester: row.allow_per_semester,
    allow_custom: row.allow_custom,
    copied_from_id: row.copied_from_id,
    copied_from_code: decoration.copiedFromCode ?? null,
    activated_at: row.activated_at,
    expired_at: row.expired_at,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** The full detail payload: base view + children + recomputed breakdown + activation. */
export function detailView(
  row: fee_structure,
  items: fee_structure_item[],
  instalments: fee_structure_instalment[],
  decoration: RowDecoration,
  now: Date = new Date(),
  period?: PeriodContext,
) {
  const totals = computeTotals({
    registrationFee: row.registration_fee ?? undefined,
    courseFeeBasis: row.course_fee_basis,
    courseFeeAmount: row.course_fee_amount ?? undefined,
    courseFeePeriods: row.course_fee_periods,
    examFee: row.exam_fee ?? undefined,
    examFeeBasis: row.exam_fee_basis,
    discountAllowed: row.discount_allowed,
    discountMaxPct: row.discount_max_pct ?? undefined,
    items: items.map((it) => ({ amount: it.amount, basis: it.basis, label: it.label })),
    // Expand per-year / per-semester components over the course's real duration,
    // independent of the course-fee basis (so the displayed breakdown matches the
    // persisted total_fee). Falls back to the basis-derived context when absent.
    years: period?.years,
    semesters: period?.semesters,
  });

  const activation = canActivate({
    courseFeeTotal: row.course_fee_total ?? 0,
    registrationFee: row.registration_fee ?? 0,
    totalFee: row.total_fee ?? 0,
    feeCollectionModel: decoration.feeCollectionModel,
    allowFull: row.allow_full,
    allowPerYear: row.allow_per_year,
    allowPerSemester: row.allow_per_semester,
    allowCustom: row.allow_custom,
    discountAllowed: row.discount_allowed,
    discountMaxPct: row.discount_max_pct ?? undefined,
    customInstalments: instalments.map((i) => ({ amount: i.amount })),
  });

  const customSumPaise = instalments.reduce((sum, i) => sum + toPaise(i.amount), 0);

  return {
    ...baseFeeView(row, decoration, now),
    items: items.map((it) => ({
      id: it.id,
      fee_type_id: it.fee_type_id,
      label: it.label,
      amount: decimalToNumber(it.amount),
      basis: it.basis,
      sort_order: it.sort_order,
    })),
    instalments: instalments.map((ins) => ({
      id: ins.id,
      seq: ins.seq,
      label: ins.label,
      amount: decimalToNumber(ins.amount),
      due_offset_days: ins.due_offset_days,
    })),
    breakdown: totals.breakdown.map((line) => ({
      key: line.key,
      label: line.label,
      basis: line.basis,
      unit: line.unitPaise / 100,
      multiplier: line.multiplier,
      total: line.totalPaise / 100,
    })),
    computed: {
      course_fee_total: totals.courseFeeTotalPaise / 100,
      exam_fee_total: totals.examFeeTotalPaise / 100,
      other_fees_total: totals.otherFeesTotalPaise / 100,
      total_fee: totals.totalFeePaise / 100,
      max_discount: totals.maxDiscountPaise / 100,
      net_after_max_discount: totals.netAfterMaxDiscountPaise / 100,
      custom_instalment_sum: customSumPaise / 100,
      custom_instalment_sum_label: formatMoney(customSumPaise),
      total_fee_label: formatMoney(totals.totalFeePaise),
    },
    activation,
  };
}
