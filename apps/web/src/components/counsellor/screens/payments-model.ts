// Shapes + display helpers for the counsellor Payments screens. The numbers all
// come from GET /payments and GET /payments/:id (apps/api/src/payments).

export type PaymentStatus = "Paid" | "Partial" | "Pending" | "Overdue";
export type InstallmentStatus = "Paid" | "Pending" | "Overdue";

export const PAYMENT_STATUSES: readonly PaymentStatus[] = ["Paid", "Partial", "Pending", "Overdue"];

export interface PaymentRow {
  id: number;
  student_ref: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  university: string | null;
  course: string | null;
  intake: string | null;
  total: number;
  paid: number;
  due: number;
  pending: number;
  status: PaymentStatus;
  nextDueDate: string | null;
  lastPaymentOn: string | null;
  modes: string[];
}

export interface PaymentInstallment {
  key: string;
  label: string;
  amount: number;
  paidAmount: number;
  dueDate: string | null;
  status: InstallmentStatus;
  paidOn: string | null;
}

export interface PaymentReceipt {
  key: string;
  paymentId: string;
  date: string | null;
  amount: number;
  mode: string | null;
  reference: string | null;
}

export interface PaymentDetailData extends PaymentRow {
  installments: PaymentInstallment[];
  receipts: PaymentReceipt[];
}

export interface PaymentsResponse {
  items: PaymentRow[];
  total: number;
  summary: {
    students: number;
    total_fee: number;
    collected: number;
    due: number;
    pending: number;
    by_status: Record<PaymentStatus, number>;
  };
  facets: { universities: string[]; courses: string[]; intakes: string[]; modes: string[] };
}

export const paymentStatusStyles: Record<PaymentStatus, string> = {
  Paid: "bg-success-soft text-success border-transparent",
  Partial: "bg-info-soft text-info border-transparent",
  Pending: "bg-warning-soft text-warning-foreground border-transparent",
  Overdue: "bg-destructive/10 text-destructive border-transparent",
};

export const installmentStatusStyles: Record<InstallmentStatus, string> = {
  Paid: "bg-success-soft text-success border-transparent",
  Pending: "bg-warning-soft text-warning-foreground border-transparent",
  Overdue: "bg-destructive/10 text-destructive border-transparent",
};

export const EMPTY = "—";

export function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

/** YYYY-MM-DD -> "05 Oct 2026" (noon avoids timezone day-shift). */
export function fmtDay(iso: string | null | undefined, month: "short" | "long" = "short"): string {
  return iso
    ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month, year: "numeric" })
    : EMPTY;
}

export const initialsOf = (name: string | null | undefined): string =>
  (name ?? "").split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?";

export const paidPercent = (paid: number, total: number): number =>
  total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
