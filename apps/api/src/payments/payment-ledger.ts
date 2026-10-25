/**
 * Pure fee arithmetic for the counsellor Payments screen. No I/O: the service
 * loads the rows, this folds them into one record per student, so the rules
 * are testable on their own.
 *
 * The money model mirrors StudentProfileService.finance() so a counsellor sees
 * the same totals on Payments as on the student profile:
 *   total = ONE basis, never a sum of two: invoice payables when the student
 *           has any invoice, else the agreed course fee, else the sum of the
 *           scheduled installments (student_payments).
 *   paid  = installments marked Paid + payments recorded against invoices.
 *
 * On top of that it splits what is still owed into "due" (an unpaid instalment
 * or invoice whose due date has passed) and "pending" (everything else).
 */

export type PaymentStatus = 'Paid' | 'Partial' | 'Pending' | 'Overdue';
export type InstallmentStatus = 'Paid' | 'Pending' | 'Overdue';
export type FeeBasis = 'invoices' | 'course_fee' | 'installments' | 'none';

/** A student_payments row (the legacy fee ledger). Dates are YYYY-MM-DD. */
export interface LedgerRow {
  id: number;
  label: string | null;
  amount: number;
  dueDate: string | null;
  paidDate: string | null;
  status: string | null;
  mode: string | null;
}

/** An invoice row. */
export interface InvoiceRow {
  id: number;
  payable: number;
  dueDate: string | null;
}

/** A payment recorded against an invoice. */
export interface InvoicePaymentRow {
  id: number;
  invoiceId: number | null;
  amount: number;
  date: string | null;
  mode: string | null;
  reference: string | null;
}

export interface FeeInput {
  ledger: LedgerRow[];
  invoices: InvoiceRow[];
  invoicePayments: InvoicePaymentRow[];
  /** The agreed fee for the student's specialisation, or null when none is on file. */
  courseFee: number | null;
  /** Today, YYYY-MM-DD (IST). Injected so tests are deterministic. */
  today: string;
}

export interface Installment {
  key: string;
  label: string;
  amount: number;
  paidAmount: number;
  dueDate: string | null;
  status: InstallmentStatus;
  paidOn: string | null;
}

export interface Receipt {
  key: string;
  /** Row id in the source table, prefixed (INST- ledger, PAY- invoice payment). */
  paymentId: string;
  date: string | null;
  amount: number;
  mode: string | null;
  reference: string | null;
}

export interface FeeSummary {
  total: number;
  paid: number;
  due: number;
  pending: number;
  status: PaymentStatus;
  basis: FeeBasis;
  nextDueDate: string | null;
  lastPaymentOn: string | null;
  modes: string[];
  installments: Installment[];
  receipts: Receipt[];
}

const toMoney = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const isPaidStatus = (status: string | null | undefined): boolean =>
  status?.trim().toLowerCase() === 'paid';

const byDueDate = (a: Installment, b: Installment): number => {
  if (a.dueDate === b.dueDate) return a.key.localeCompare(b.key);
  if (a.dueDate == null) return 1;
  if (b.dueDate == null) return -1;
  return a.dueDate.localeCompare(b.dueDate);
};

const isPast = (due: string | null, today: string): boolean => due != null && due < today;

export function summariseFees(input: FeeInput): FeeSummary {
  const { today } = input;

  // ---- installments: the ledger plus the invoices ------------------------
  const ledgerInstallments: Installment[] = input.ledger.map((row) => {
    const amount = toMoney(row.amount);
    const paid = isPaidStatus(row.status);
    return {
      key: `inst-${row.id}`,
      label: row.label?.trim() || 'Installment',
      amount,
      paidAmount: paid ? amount : 0,
      dueDate: row.dueDate,
      status: paid ? 'Paid' : isPast(row.dueDate, today) ? 'Overdue' : 'Pending',
      paidOn: paid ? (row.paidDate ?? null) : null,
    };
  });

  const paidByInvoice = new Map<number, number>();
  const lastPaidByInvoice = new Map<number, string>();
  for (const p of input.invoicePayments) {
    if (p.invoiceId == null) continue;
    paidByInvoice.set(p.invoiceId, (paidByInvoice.get(p.invoiceId) ?? 0) + toMoney(p.amount));
    if (p.date && p.date > (lastPaidByInvoice.get(p.invoiceId) ?? '')) {
      lastPaidByInvoice.set(p.invoiceId, p.date);
    }
  }
  const invoiceInstallments: Installment[] = input.invoices.map((inv) => {
    const amount = toMoney(inv.payable);
    const paidAmount = Math.min(paidByInvoice.get(inv.id) ?? 0, amount);
    const settled = amount > 0 && paidAmount >= amount;
    return {
      key: `inv-${inv.id}`,
      label: `Invoice #${inv.id}`,
      amount,
      paidAmount,
      dueDate: inv.dueDate,
      status: settled ? 'Paid' : isPast(inv.dueDate, today) ? 'Overdue' : 'Pending',
      paidOn: settled ? (lastPaidByInvoice.get(inv.id) ?? null) : null,
    };
  });

  const installments = [...ledgerInstallments, ...invoiceInstallments].sort(byDueDate);

  // ---- totals --------------------------------------------------------------
  const ledgerScheduled = ledgerInstallments.reduce((s, i) => s + i.amount, 0);
  const ledgerPaid = ledgerInstallments.reduce((s, i) => s + i.paidAmount, 0);
  const invoiceTotal = invoiceInstallments.reduce((s, i) => s + i.amount, 0);
  const invoicePaid = input.invoicePayments.reduce((s, p) => s + toMoney(p.amount), 0);

  const basis: FeeBasis =
    input.invoices.length > 0
      ? 'invoices'
      : input.courseFee != null
        ? 'course_fee'
        : input.ledger.length > 0
          ? 'installments'
          : 'none';
  const total =
    basis === 'invoices'
      ? invoiceTotal
      : basis === 'course_fee'
        ? (input.courseFee ?? 0)
        : basis === 'installments'
          ? ledgerScheduled
          : 0;
  const paid = ledgerPaid + invoicePaid;
  const outstanding = Math.max(total - paid, 0);

  // Overdue = the unpaid part of every instalment / invoice already past due,
  // capped at what is actually outstanding.
  const overdueRaw = installments
    .filter((i) => i.status === 'Overdue')
    .reduce((s, i) => s + (i.amount - i.paidAmount), 0);
  const due = Math.min(overdueRaw, outstanding);
  const pending = outstanding - due;

  const status: PaymentStatus =
    outstanding === 0 && (total > 0 || paid > 0)
      ? 'Paid'
      : due > 0
        ? 'Overdue'
        : paid > 0
          ? 'Partial'
          : 'Pending';

  // ---- receipts ------------------------------------------------------------
  const receipts: Receipt[] = [
    ...input.ledger
      .filter((row) => isPaidStatus(row.status))
      .map((row) => ({
        key: `inst-${row.id}`,
        paymentId: `INST-${row.id}`,
        date: row.paidDate ?? null,
        amount: toMoney(row.amount),
        mode: row.mode?.trim() || null,
        reference: null,
      })),
    ...input.invoicePayments.map((p) => ({
      key: `pay-${p.id}`,
      paymentId: `PAY-${p.id}`,
      date: p.date,
      amount: toMoney(p.amount),
      mode: p.mode?.trim() || null,
      reference: p.reference?.trim() || null,
    })),
  ].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.key.localeCompare(a.key));

  const unpaidDue = installments
    .filter((i) => i.status !== 'Paid' && i.dueDate != null)
    .map((i) => i.dueDate as string)
    .sort();

  return {
    total,
    paid,
    due,
    pending,
    status,
    basis,
    nextDueDate: status === 'Paid' ? null : (unpaidDue[0] ?? null),
    lastPaymentOn: receipts.find((r) => r.date != null)?.date ?? null,
    modes: [...new Set(receipts.map((r) => r.mode).filter((m): m is string => m != null))],
    installments,
    receipts,
  };
}
