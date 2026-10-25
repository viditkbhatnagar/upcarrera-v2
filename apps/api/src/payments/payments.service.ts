import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordAccessService, AccessUser } from '../workflow/record-access.service';
import { istTodayIso } from '../workflow/ist-date';
import { ListPaymentsDto } from './dto/list-payments.dto';
import {
  summariseFees,
  FeeSummary,
  LedgerRow,
  InvoiceRow,
  InvoicePaymentRow,
  PaymentStatus,
} from './payment-ledger';

/** Hard cap on students loaded per request (a counsellor never has this many). */
const MAX_STUDENTS = 5000;
const DAY_MS = 86_400_000;

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);

export interface PaymentRecord extends FeeSummary {
  id: number;
  student_ref: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  university: string | null;
  course: string | null;
  intake: string | null;
}

type StudentRow = {
  id: number;
  student_id: number;
  student_no: string | null;
  enrollment_id: string | null;
  course_id: number | null;
  specialisation_id: number | null;
  session_id: number | null;
};

/**
 * Counsellor-facing payments: one record per student the caller may see, built
 * from the fee ledger (student_payments), invoice + payment, and the agreed
 * course fee. Scope is the same RecordAccessService rule the applications use
 * (counsellor = own students via students.consultant_id; team leader / manager =
 * their hierarchy; admin = all; every other role = none).
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: RecordAccessService,
  ) {}

  async list(user: AccessUser, q: ListPaymentsDto) {
    const students = await this.scopedStudents(user);
    const all = await this.buildRecords(students);

    const facets = {
      universities: distinct(all.map((r) => r.university)),
      courses: distinct(all.map((r) => r.course)),
      intakes: distinct(all.map((r) => r.intake)),
      modes: distinct(all.flatMap((r) => r.modes)),
    };

    const today = istTodayIso();
    const items = all.filter((r) => matches(r, q, today));
    const summary = {
      students: items.length,
      total_fee: sum(items, (r) => r.total),
      collected: sum(items, (r) => r.paid),
      due: sum(items, (r) => r.due),
      pending: sum(items, (r) => r.pending),
      by_status: countBy(items.map((r) => r.status)),
    };

    return {
      items: items.map(toListItem),
      total: items.length,
      summary,
      facets,
    };
  }

  async detail(user: AccessUser, id: number) {
    const students = await this.scopedStudents(user, id);
    const [record] = await this.buildRecords(students);
    if (!record) throw new NotFoundException('Payment record not found');
    return record;
  }

  /* ------------------------------------------------------------------ */

  private async scopedStudents(user: AccessUser, id?: number): Promise<StudentRow[]> {
    const scope = await this.access.scopeFor(user);
    if (scope.scope !== 'all' && scope.scope !== 'owners') return [];
    return this.prisma.students.findMany({
      where: {
        deleted_at: null,
        ...(id != null ? { id } : {}),
        ...(scope.scope === 'owners' ? { consultant_id: { in: scope.ids } } : {}),
      },
      select: {
        id: true,
        student_id: true,
        student_no: true,
        enrollment_id: true,
        course_id: true,
        specialisation_id: true,
        session_id: true,
      },
      orderBy: { id: 'desc' },
      take: MAX_STUDENTS,
    });
  }

  /** One bulk query per table; nothing runs per student. */
  private async buildRecords(students: StudentRow[]): Promise<PaymentRecord[]> {
    if (students.length === 0) return [];
    const userIds = students.map((s) => s.student_id);
    const courseIds = uniq(students.map((s) => s.course_id));
    const specIds = uniq(students.map((s) => s.specialisation_id));
    const sessionIds = uniq(students.map((s) => s.session_id));

    const [users, courses, sessions, specs, special, ledger, invoices] = await Promise.all([
      this.prisma.users.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true, phone: true, university_id: true },
      }),
      courseIds.length
        ? this.prisma.course.findMany({
            where: { id: { in: courseIds } },
            select: { id: true, title: true, university_id: true },
          })
        : [],
      sessionIds.length
        ? this.prisma.sessions.findMany({
            where: { session_id: { in: sessionIds } },
            select: { session_id: true, session_title: true },
          })
        : [],
      specIds.length
        ? this.prisma.specialisations.findMany({
            where: { id: { in: specIds } },
            select: { id: true, total_amount: true },
          })
        : [],
      specIds.length
        ? this.prisma.student_special_fees.findMany({
            where: { student_id: { in: userIds }, specialisation_id: { in: specIds }, deleted_at: null },
            select: { student_id: true, specialisation_id: true, special_fee: true },
          })
        : [],
      this.prisma.student_payments.findMany({
        where: { student_id: { in: userIds }, deleted_at: null },
        orderBy: [{ due_date: 'asc' }, { student_payment_id: 'asc' }],
      }),
      this.prisma.invoice.findMany({
        where: { student_id: { in: userIds }, deleted_at: null },
        select: { id: true, student_id: true, payable_amount: true, due_date: true },
      }),
    ]);

    const invoiceIds = invoices.map((i) => i.id);
    const payments = invoiceIds.length
      ? await this.prisma.payment.findMany({
          where: { invoice_id: { in: invoiceIds }, deleted_at: null },
          select: {
            id: true,
            invoice_id: true,
            paid_amount: true,
            payment_date: true,
            payment_type: true,
            reference_no: true,
          },
        })
      : [];

    const universityIds = uniq([
      ...courses.map((c) => c.university_id),
      ...users.map((u) => u.university_id),
    ]);
    const universities = universityIds.length
      ? await this.prisma.university.findMany({
          where: { id: { in: universityIds } },
          select: { id: true, title: true },
        })
      : [];

    const userById = new Map(users.map((u) => [u.id, u]));
    const courseById = new Map(courses.map((c) => [c.id, c]));
    const sessionById = new Map(sessions.map((s) => [s.session_id, s.session_title]));
    const specById = new Map(specs.map((s) => [s.id, s.total_amount]));
    const specialByKey = new Map(
      special.map((s) => [`${s.student_id}:${s.specialisation_id}`, Number(s.special_fee)]),
    );
    const universityById = new Map(universities.map((u) => [u.id, u.title]));

    const ledgerByUser = group(ledger, (r) => r.student_id);
    const invoicesByUser = group(invoices, (i) => i.student_id ?? -1);
    const invoiceOwner = new Map(invoices.map((i) => [i.id, i.student_id]));
    const paymentsByUser = group(payments, (p) => invoiceOwner.get(p.invoice_id ?? -1) ?? -1);

    const today = istTodayIso();
    return students.map((s) => {
      const u = userById.get(s.student_id);
      const course = s.course_id != null ? courseById.get(s.course_id) : undefined;
      const universityId = course?.university_id ?? u?.university_id ?? null;

      const standard = s.specialisation_id != null ? specById.get(s.specialisation_id) : null;
      const agreed =
        s.specialisation_id != null
          ? specialByKey.get(`${s.student_id}:${s.specialisation_id}`)
          : undefined;
      const courseFee = agreed ?? (standard != null && standard > 0 ? standard : null);

      const fees = summariseFees({
        today,
        courseFee,
        ledger: (ledgerByUser.get(s.student_id) ?? []).map(
          (r): LedgerRow => ({
            id: r.student_payment_id,
            label: r.installment_details,
            amount: r.amount ?? 0,
            dueDate: iso(r.due_date),
            paidDate: iso(r.paid_date),
            status: r.status,
            mode: r.payment_mode,
          }),
        ),
        invoices: (invoicesByUser.get(s.student_id) ?? []).map(
          (i): InvoiceRow => ({ id: i.id, payable: i.payable_amount ?? 0, dueDate: iso(i.due_date) }),
        ),
        invoicePayments: (paymentsByUser.get(s.student_id) ?? []).map(
          (p): InvoicePaymentRow => ({
            id: p.id,
            invoiceId: p.invoice_id,
            amount: p.paid_amount ?? 0,
            date: iso(p.payment_date),
            mode: p.payment_type ?? null,
            reference: p.reference_no,
          }),
        ),
      });

      return {
        ...fees,
        id: s.id,
        student_ref: s.student_no ?? s.enrollment_id ?? `STU-${s.id}`,
        name: u?.name ?? null,
        email: u?.email ?? null,
        phone: u?.phone ?? null,
        university: universityId != null ? (universityById.get(universityId) ?? null) : null,
        course: course?.title ?? null,
        intake: s.session_id != null ? (sessionById.get(s.session_id) ?? null) : null,
      };
    });
  }
}

/* ---------------------------- helpers ---------------------------- */

/** List rows omit the heavy per-installment / receipt arrays. */
function toListItem(r: PaymentRecord) {
  const { installments: _i, receipts: _r, ...rest } = r;
  void _i;
  void _r;
  return rest;
}

function uniq<T>(values: Array<T | null | undefined>): T[] {
  return [...new Set(values.filter((v): v is T => v != null))];
}

function distinct(values: Array<string | null>): string[] {
  return uniq(values.map((v) => v?.trim() || null)).sort((a, b) => a.localeCompare(b));
}

function group<T>(rows: T[], key: (row: T) => number): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = out.get(k);
    if (bucket) bucket.push(row);
    else out.set(k, [row]);
  }
  return out;
}

function sum<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((s, r) => s + pick(r), 0);
}

function countBy(values: PaymentStatus[]): Record<PaymentStatus, number> {
  const out: Record<PaymentStatus, number> = { Paid: 0, Partial: 0, Pending: 0, Overdue: 0 };
  for (const v of values) out[v] += 1;
  return out;
}

function inAmount(value: number, min?: number, max?: number): boolean {
  return (min == null || value >= min) && (max == null || value <= max);
}

function inDates(value: string | null, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  return (!from || value >= from.slice(0, 10)) && (!to || value <= to.slice(0, 10));
}

function matches(r: PaymentRecord, q: ListPaymentsDto, today: string): boolean {
  if (q.university && r.university !== q.university) return false;
  if (q.course && r.course !== q.course) return false;
  if (q.intake && r.intake !== q.intake) return false;
  if (q.status && r.status !== q.status) return false;
  if (q.mode && !r.modes.includes(q.mode)) return false;

  const needle = q.search?.trim().toLowerCase();
  if (needle) {
    const hay = `${r.name ?? ''} ${r.student_ref} ${r.email ?? ''} ${r.phone ?? ''}`.toLowerCase();
    if (!hay.includes(needle)) return false;
  }

  if (q.due) {
    if (q.due === 'overdue') {
      if (!(r.due > 0)) return false;
    } else {
      if (!r.nextDueDate) return false;
      const days = Math.round(
        (Date.parse(`${r.nextDueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS,
      );
      if (days < 0 || days > (q.due === 'next7' ? 7 : 30)) return false;
    }
  }
  return (
    inDates(r.nextDueDate, q.due_from, q.due_to) &&
    inDates(r.lastPaymentOn, q.paid_from, q.paid_to) &&
    inAmount(r.total, q.total_min, q.total_max) &&
    inAmount(r.paid, q.paid_min, q.paid_max) &&
    inAmount(r.due, q.due_min, q.due_max) &&
    inAmount(r.pending, q.pending_min, q.pending_max)
  );
}
