import { summariseFees, FeeInput } from '../src/payments/payment-ledger';

const base: FeeInput = {
  today: '2026-10-25',
  ledger: [],
  invoices: [],
  invoicePayments: [],
  courseFee: null,
};

const row = (id: number, amount: number, dueDate: string | null, status: string, paidDate: string | null = null) => ({
  id,
  label: `Inst ${id}`,
  amount,
  dueDate,
  paidDate,
  status,
  mode: 'Online',
});

describe('summariseFees', () => {
  it('is Pending with no fee on file', () => {
    const s = summariseFees(base);
    expect(s).toMatchObject({ total: 0, paid: 0, status: 'Pending', basis: 'none', nextDueDate: null });
  });

  it('is Paid when every installment is paid', () => {
    const s = summariseFees({
      ...base,
      ledger: [row(1, 1000, '2026-08-01', 'Paid', '2026-08-01'), row(2, 500, '2026-09-01', 'Paid', '2026-09-02')],
    });
    expect(s).toMatchObject({ total: 1500, paid: 1500, due: 0, pending: 0, status: 'Paid', nextDueDate: null });
    expect(s.lastPaymentOn).toBe('2026-09-02');
    expect(s.receipts).toHaveLength(2);
  });

  it('is Overdue when an unpaid installment is past due, even with money paid', () => {
    const s = summariseFees({
      ...base,
      ledger: [row(1, 1000, '2026-08-01', 'Paid', '2026-08-01'), row(2, 1000, '2026-10-01', 'Pending'), row(3, 500, '2026-12-01', 'Pending')],
    });
    expect(s).toMatchObject({ total: 2500, paid: 1000, due: 1000, pending: 500, status: 'Overdue' });
    expect(s.nextDueDate).toBe('2026-10-01');
  });

  it('is Partial when part is paid and nothing is past due', () => {
    const s = summariseFees({
      ...base,
      ledger: [row(1, 1000, '2026-08-01', 'Paid', '2026-08-01'), row(2, 1000, '2026-12-01', 'Pending')],
    });
    expect(s).toMatchObject({ due: 0, pending: 1000, status: 'Partial', nextDueDate: '2026-12-01' });
  });

  it('uses invoices as the single total basis and nets invoice payments', () => {
    const s = summariseFees({
      ...base,
      courseFee: 99999,
      invoices: [{ id: 7, payable: 2000, dueDate: '2026-10-01' }],
      invoicePayments: [{ id: 1, invoiceId: 7, amount: 500, date: '2026-09-15', mode: 'bank', reference: 'R1' }],
    });
    expect(s).toMatchObject({ basis: 'invoices', total: 2000, paid: 500, due: 1500, pending: 0, status: 'Overdue' });
    expect(s.receipts[0]).toMatchObject({ paymentId: 'PAY-1', reference: 'R1' });
  });

  it('falls back to the course fee, capping due at what is outstanding', () => {
    const s = summariseFees({
      ...base,
      courseFee: 3000,
      ledger: [row(1, 1000, '2026-08-01', 'Paid', '2026-08-01'), row(2, 5000, '2026-09-01', 'Pending')],
    });
    expect(s).toMatchObject({ basis: 'course_fee', total: 3000, paid: 1000, due: 2000, pending: 0 });
  });
});
