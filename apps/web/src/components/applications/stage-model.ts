// Presentation metadata for the Phase 1 stages and workflow actions. The data
// layer (lib/api/applications.ts) owns the canonical Stage union + numbers; this
// module only decides how each one LOOKS and READS. Both light and dark are
// given intentional treatments.
import {
  UserPlus,
  Send,
  ClipboardCheck,
  Wallet,
  BadgeCheck,
  ShieldCheck,
  GraduationCap,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { STAGES, STAGE_NO, type Stage, type WorkflowAction } from "@/lib/api/applications";

export { STAGES, STAGE_NO };
export type { Stage, WorkflowAction };

/** The seven forward stages the stepper walks through (rejected is an off-ramp). */
export const PIPELINE_STAGES: Stage[] = [
  "lead_added",
  "form_pending",
  "counsellor_review",
  "fee_pending",
  "fee_verification",
  "sa_verification",
  "converted",
];

export interface StageMeta {
  key: Stage;
  no: number;
  label: string;
  short: string;
  icon: LucideIcon;
  /** Pill styling (badge). Includes a deliberate dark-mode treatment. */
  badge: string;
  /** Solid dot / progress-fill colour. */
  dot: string;
}

export const STAGE_META: Readonly<Record<Stage, StageMeta>> = {
  lead_added: {
    key: "lead_added",
    no: 1,
    label: "Lead Added",
    short: "New lead captured",
    icon: UserPlus,
    badge:
      "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30",
    dot: "bg-sky-500",
  },
  form_pending: {
    key: "form_pending",
    no: 2,
    label: "Form Pending",
    short: "Awaiting the student form",
    icon: Send,
    badge:
      "bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30",
    dot: "bg-violet-500",
  },
  counsellor_review: {
    key: "counsellor_review",
    no: 3,
    label: "Counsellor Review",
    short: "Counsellor verifying details",
    icon: ClipboardCheck,
    badge:
      "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
    dot: "bg-amber-500",
  },
  fee_pending: {
    key: "fee_pending",
    no: 4,
    label: "Registration Fee",
    short: "Awaiting the registration fee",
    icon: Wallet,
    badge:
      "bg-orange-100 text-orange-700 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/30",
    dot: "bg-orange-500",
  },
  fee_verification: {
    key: "fee_verification",
    no: 5,
    label: "Fee Verification",
    short: "Accounts verifying the fee",
    icon: BadgeCheck,
    badge:
      "bg-cyan-100 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-500/30",
    dot: "bg-cyan-500",
  },
  sa_verification: {
    key: "sa_verification",
    no: 6,
    label: "SA Verification",
    short: "Student Affairs review",
    icon: ShieldCheck,
    badge:
      "bg-indigo-100 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30",
    dot: "bg-indigo-500",
  },
  converted: {
    key: "converted",
    no: 7,
    label: "Converted",
    short: "Enrolled as a student",
    icon: GraduationCap,
    badge:
      "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
    dot: "bg-emerald-500",
  },
  rejected: {
    key: "rejected",
    no: 0,
    label: "Rejected",
    short: "Application closed",
    icon: XCircle,
    badge:
      "bg-red-100 text-red-700 ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30",
    dot: "bg-red-500",
  },
};

export function stageLabel(stage: Stage): string {
  return STAGE_META[stage]?.label ?? stage;
}

/* ------------------------------------------------------------------ *
 * Action metadata — how each `allowed_actions` entry renders.
 * `correct` is intentionally omitted: it is surfaced as inline editing
 * inside the Application Form tab, not as a stage-bar button.
 * ------------------------------------------------------------------ */

export type ActionTone = "primary" | "default" | "destructive";

export interface ActionMeta {
  label: string;
  tone: ActionTone;
  icon: LucideIcon;
}

// `send_back` and `reject` are deliberately absent: the server emits them at
// `sa_verification` alongside `approve`, but all three Student-Affairs decisions are
// taken inside the SA review dialog (opened by the single `approve` button), so they
// are never rendered as standalone action-bar buttons. Being a Partial map, their
// omission simply keeps them out of the bar (StageActionBar filters by ACTION_META).
export const ACTION_META: Partial<Record<WorkflowAction, ActionMeta>> = {
  send_form: { label: "Send form", tone: "primary", icon: Send },
  mark_form_received: { label: "Mark form received", tone: "primary", icon: ClipboardCheck },
  accept: { label: "Accept application", tone: "primary", icon: BadgeCheck },
  reopen: { label: "Reopen", tone: "default", icon: Send },
  record_payment: { label: "Record registration fee", tone: "primary", icon: Wallet },
  verify: { label: "Verify payment", tone: "primary", icon: BadgeCheck },
  mismatch: { label: "Flag mismatch", tone: "destructive", icon: XCircle },
  hold: { label: "Put on hold", tone: "default", icon: ClipboardCheck },
  resume: { label: "Resume", tone: "primary", icon: Send },
  approve: { label: "Student Affairs review", tone: "primary", icon: ShieldCheck },
  convert: { label: "Convert to student", tone: "primary", icon: GraduationCap },
};

/** Paid-to / mode code → human label, matching the committed DTO vocabularies. */
export const PAID_TO_LABEL: Record<string, string> = {
  upcarrera: "upCarrera",
  university: "University",
};

export const PAYMENT_MODE_LABEL: Record<string, string> = {
  upi: "UPI",
  neft: "NEFT",
  imps: "IMPS",
  rtgs: "RTGS",
  cheque: "Cheque",
  dd: "Demand Draft",
  card: "Card",
  cash: "Cash",
};

export const PAID_TO_OPTIONS = [
  { value: "upcarrera", label: "upCarrera" },
  { value: "university", label: "University" },
] as const;

export const PAYMENT_MODE_OPTIONS = [
  { value: "upi", label: "UPI" },
  { value: "neft", label: "NEFT" },
  { value: "imps", label: "IMPS" },
  { value: "rtgs", label: "RTGS" },
  { value: "cheque", label: "Cheque" },
  { value: "dd", label: "Demand Draft" },
  { value: "card", label: "Card" },
  { value: "cash", label: "Cash" },
] as const;

/** Verification-status pill styling for payments and documents. */
export const PAYMENT_STATUS_BADGE: Record<string, string> = {
  pending:
    "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
  verified:
    "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  mismatch:
    "bg-red-100 text-red-700 ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30",
  void: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-500/30",
};

export const DOC_STATUS_BADGE: Record<string, string> = {
  pending:
    "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
  verified:
    "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  rejected:
    "bg-red-100 text-red-700 ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30",
};
