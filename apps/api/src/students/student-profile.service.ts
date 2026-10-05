import { Injectable } from '@nestjs/common';
import type { Prisma, students } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeIndianMobile } from './indian-mobile';

/**
 * The read side of the student profile (QA ST01): the application the student
 * came from, their documents, their money and a timeline of what happened.
 *
 * KEY CONVENTION. A `students` row has two ids: its own PK (`students.id`, what
 * the /students/:id routes take) and `students.student_id`, the student's
 * `users.id`. Every satellite table is keyed on the USERS id — the legacy CRM
 * (App/Students::view, document_add) and this API's own writers
 * (convertApplication, POST /files/student-document) all stamp users.id into
 * student_document.student_id, qualification.student_id and
 * student_payments.student_id. Reading them by the students PK returned another
 * student's rows, or none. Every query here keys on `student.student_id`.
 *
 * Every related table is resolved with one bulk query; nothing runs per row.
 */

/** How the profile found the student's application. */
export type ApplicationLinkBasis = 'application_id' | 'records' | 'contact';

export interface LinkedApplication {
  application_id: number;
  display_id: string;
  enrollment_id: string | null;
  name: string | null;
  created_at: Date | null;
  created_by: number | null;
  created_by_name: string | null;
  converted_at: Date | null;
  converted_by: number | null;
  converted_by_name: string | null;
  is_converted: boolean;
  /**
   * application_id: students.application_id equals the application's
   *                 custom_application_id (written by the convert step).
   * records:        the student's own documents/qualifications carry this
   *                 application's id (stamped by the convert step).
   * contact:        the one converted application with the student's email or
   *                 mobile — used only when exactly one matches.
   */
  link_basis: ApplicationLinkBasis;
}

export type TimelineEventType =
  | 'application_created'
  | 'application_converted'
  | 'student_created'
  | 'enrolled'
  | 'course_enrolment'
  | 'payment_received'
  | 'installment_scheduled'
  | 'invoice_issued'
  | 'invoice_payment'
  | 'document_uploaded'
  | 'dropout'
  | 'profile_updated';

export interface TimelineEvent {
  key: string;
  type: TimelineEventType;
  at: Date;
  title: string;
  detail: string | null;
  actor_name: string | null;
}

const APPLICATION_SELECT = {
  application_id: true,
  custom_application_id: true,
  enrollment_id: true,
  name: true,
  email: true,
  phone: true,
  created_at: true,
  created_by: true,
  converted_at: true,
  converted_by: true,
  is_converted: true,
} satisfies Prisma.applicationsSelect;

type ApplicationPick = Prisma.applicationsGetPayload<{
  select: typeof APPLICATION_SELECT;
}>;

/** Coerces a mixed Float/Decimal/Int/null money value to a finite number (0 when blank). */
function toMoney(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isPaidStatus(status: string | null | undefined): boolean {
  return status?.trim().toLowerCase() === 'paid';
}

function formatRupees(amount: number | null | undefined): string {
  return `₹${Math.round(toMoney(amount)).toLocaleString('en-IN')}`;
}

/** The 10-digit key a phone is compared on, or null when too short to mean anything. */
function phoneKey(raw: string | null | undefined): string | null {
  const canonical = normalizeIndianMobile(raw);
  if (canonical) return canonical;
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/** The id the Applications list prints, so the profile shows the same one. */
function applicationDisplayId(r: {
  application_id: number;
  custom_application_id: string | null;
  enrollment_id: string | null;
}): string {
  if (r.custom_application_id?.trim()) return r.custom_application_id;
  if (r.enrollment_id?.trim()) return r.enrollment_id;
  return `APP-${r.application_id}`;
}

/** Which store `finance.total` was taken from. */
type FinanceBasis = 'invoices' | 'course_fee' | 'installments' | 'none';

const TOTAL_BY_BASIS: Record<
  FinanceBasis,
  (t: { invoices: number; courseFee: number; installments: number }) => number
> = {
  invoices: (t) => t.invoices,
  course_fee: (t) => t.courseFee,
  installments: (t) => t.installments,
  none: () => 0,
};

@Injectable()
export class StudentProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /* ------------------------------------------------------------------ *
   * Users id -> name, for every actor a profile section mentions.
   * ------------------------------------------------------------------ */
  private async userNames(ids: Array<number | null | undefined>) {
    const unique = [
      ...new Set(ids.filter((id): id is number => id != null && id > 0)),
    ];
    if (unique.length === 0) return new Map<number, string | null>();
    const rows = await this.prisma.users.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((u) => [u.id, u.name ?? null]));
  }

  /* ------------------------------------------------------------------ *
   * Linked application
   * ------------------------------------------------------------------ */

  /**
   * The application this student was converted from, found only through links
   * the data actually holds (see LinkedApplication.link_basis), strongest first.
   * Returns null when nothing links them — legacy students imported before the
   * CRM had applications have none.
   */
  async linkedApplication(student: students): Promise<LinkedApplication | null> {
    const found =
      (await this.applicationByCustomId(student.application_id)) ??
      (await this.applicationByRecords(student.student_id)) ??
      (await this.applicationByContact(student.student_id));
    if (!found) return null;

    const names = await this.userNames([
      found.row.created_by,
      found.row.converted_by,
    ]);
    const { row } = found;
    return {
      application_id: row.application_id,
      display_id: applicationDisplayId(row),
      enrollment_id: row.enrollment_id?.trim() ? row.enrollment_id : null,
      name: row.name,
      created_at: row.created_at,
      created_by: row.created_by,
      created_by_name:
        row.created_by != null ? (names.get(row.created_by) ?? null) : null,
      converted_at: row.converted_at,
      converted_by: row.converted_by,
      converted_by_name:
        row.converted_by != null ? (names.get(row.converted_by) ?? null) : null,
      is_converted: row.is_converted === 1,
      link_basis: found.basis,
    };
  }

  private async applicationByCustomId(customId: string | null) {
    const id = customId?.trim();
    if (!id) return null;
    const rows = await this.prisma.applications.findMany({
      where: { custom_application_id: id, deleted_at: null },
      select: APPLICATION_SELECT,
      orderBy: { application_id: 'desc' },
      take: 5,
    });
    // Prefer the converted one if an id was ever reused.
    const row = rows.find((r) => r.is_converted === 1) ?? rows[0];
    return row ? { row, basis: 'application_id' as const } : null;
  }

  private async applicationByRecords(userId: number) {
    const [docs, quals] = await Promise.all([
      this.prisma.student_document.findMany({
        where: { student_id: userId, application_id: { not: null } },
        select: { application_id: true },
      }),
      this.prisma.qualification.findMany({
        where: { student_id: userId, application_id: { not: null } },
        select: { application_id: true },
      }),
    ]);
    const ids = [
      ...new Set(
        [...docs, ...quals]
          .map((r) => r.application_id)
          .filter((id): id is number => id != null && id > 0),
      ),
    ];
    // Two different applications on one student's records is ambiguous — skip.
    if (ids.length !== 1) return null;
    const row = await this.prisma.applications.findFirst({
      where: { application_id: ids[0], deleted_at: null },
      select: APPLICATION_SELECT,
    });
    return row ? { row, basis: 'records' as const } : null;
  }

  private async applicationByContact(userId: number) {
    const user = await this.prisma.users.findFirst({
      where: { id: userId },
      select: { email: true, phone: true },
    });
    const email = user?.email?.trim() || null;
    const phone = phoneKey(user?.phone);
    const or: Prisma.applicationsWhereInput[] = [];
    if (email) or.push({ email });
    if (phone) or.push({ phone: { endsWith: phone } });
    if (or.length === 0) return null;

    const rows = await this.prisma.applications.findMany({
      where: { deleted_at: null, is_converted: 1, OR: or },
      select: APPLICATION_SELECT,
      take: 3,
    });
    const exact = rows.filter(
      (r) =>
        (email != null && r.email?.trim().toLowerCase() === email.toLowerCase()) ||
        (phone != null && phoneKey(r.phone) === phone),
    );
    // Only an unambiguous match counts as a link.
    return exact.length === 1
      ? { row: exact[0] as ApplicationPick, basis: 'contact' as const }
      : null;
  }

  /* ------------------------------------------------------------------ *
   * Documents
   * ------------------------------------------------------------------ */

  /**
   * The student's documents: rows stamped with their users id, plus rows of
   * their linked application that were never stamped (uploaded before
   * conversion). Each row keeps every student_document column and adds
   * `uploaded_by_name` and `source`.
   */
  async documents(student: students, linked?: LinkedApplication | null) {
    const application =
      linked === undefined ? await this.linkedApplication(student) : linked;
    const or: Prisma.student_documentWhereInput[] = [
      { student_id: student.student_id },
    ];
    // Rows uploaded with the application before it was converted carry only its
    // application_id. Followed only for a hard link: a contact-details match is
    // good enough to show the application, not to attach its files.
    if (application && application.link_basis !== 'contact') {
      or.push({ application_id: application.application_id });
    }

    const rows = await this.prisma.student_document.findMany({
      where: { deleted_at: null, OR: or },
      orderBy: { student_document_id: 'desc' },
    });
    const names = await this.userNames(rows.map((r) => r.created_by));
    return rows.map((r) => ({
      ...r,
      uploaded_by_name:
        r.created_by != null ? (names.get(r.created_by) ?? null) : null,
      source:
        r.student_id === student.student_id
          ? ('student' as const)
          : ('application' as const),
    }));
  }

  /* ------------------------------------------------------------------ *
   * Finance
   * ------------------------------------------------------------------ */

  /**
   * The student's money, from every store that holds a piece of it:
   *
   *   installments  <- student_payments (the legacy CRM's fee ledger, and where
   *                    the convert step records the Registration Fee)
   *   course_fee    <- student_special_fees (a negotiated fee for the student's
   *                    specialisation), else specialisations.total_amount
   *   invoices      <- invoice + payment
   *
   * total   = ONE basis, never a sum of two: invoices bill the same course the
   *           course fee prices (the lead convert and the finance screen both
   *           raise them for it), so adding them double-counted. In order:
   *           invoice payables when any invoice exists, else the course fee
   *           when known, else the sum of scheduled installments.
   *           `total_basis` says which; `course_fee` is still reported alone.
   * paid    = installments marked Paid + payments against invoices.
   * outstanding = max(total - paid, 0).
   *
   * The original keys (total, paid, outstanding, invoice_count, payment_count,
   * invoices, payments) keep their names and types.
   */
  async finance(student: students) {
    const userId = student.student_id;
    const [invoiceBlock, installments, courseFee] = await Promise.all([
      this.invoiceFinance(userId),
      this.prisma.student_payments.findMany({
        where: { student_id: userId, deleted_at: null },
        orderBy: [{ due_date: 'asc' }, { student_payment_id: 'asc' }],
      }),
      this.courseFee(student),
    ]);

    let installmentsPaid = 0;
    let installmentsScheduled = 0;
    for (const row of installments) {
      const amount = toMoney(row.amount);
      installmentsScheduled += amount;
      if (isPaidStatus(row.status)) installmentsPaid += amount;
    }

    const feeBasis: FinanceBasis =
      invoiceBlock.invoices.length > 0
        ? 'invoices'
        : courseFee.amount != null
          ? 'course_fee'
          : installments.length > 0
            ? 'installments'
            : 'none';
    const total = TOTAL_BY_BASIS[feeBasis]({
      invoices: invoiceBlock.total,
      courseFee: courseFee.amount ?? 0,
      installments: installmentsScheduled,
    });
    const paid = installmentsPaid + invoiceBlock.paid;

    return {
      ...invoiceBlock,
      total,
      paid,
      outstanding: Math.max(total - paid, 0),
      total_basis: feeBasis,
      course_fee: courseFee,
      installment_count: installments.length,
      installments_paid: installmentsPaid,
      installments_pending: Math.max(installmentsScheduled - installmentsPaid, 0),
      installments: installments.map((row) => ({
        ...row,
        is_paid: isPaidStatus(row.status),
      })),
    };
  }

  /** The agreed fee for the student's specialisation, or nulls when none is on file. */
  private async courseFee(student: students) {
    const specialisationId = student.specialisation_id;
    if (specialisationId == null) {
      return {
        amount: null as number | null,
        standard_amount: null as number | null,
        special_fee: null as number | null,
        special_reason: null as string | null,
      };
    }
    const [spec, special] = await Promise.all([
      this.prisma.specialisations.findFirst({
        where: { id: specialisationId, deleted_at: null },
        select: { total_amount: true },
      }),
      this.prisma.student_special_fees.findFirst({
        where: {
          student_id: student.student_id,
          specialisation_id: specialisationId,
          deleted_at: null,
        },
        select: { special_fee: true, reason: true },
      }),
    ]);
    const standard =
      spec?.total_amount != null && spec.total_amount > 0
        ? spec.total_amount
        : null;
    const specialFee = special ? toMoney(special.special_fee) : null;
    return {
      amount: specialFee ?? standard,
      standard_amount: standard,
      special_fee: specialFee,
      special_reason: special?.reason ?? null,
    };
  }

  /** invoice + payment roll-up (unchanged semantics from the original block). */
  private async invoiceFinance(userId: number) {
    const invoices = await this.prisma.invoice.findMany({
      where: { student_id: userId, deleted_at: null },
      orderBy: { id: 'desc' },
    });
    const invoiceIds = invoices.map((inv) => inv.id);
    const payments = invoiceIds.length
      ? await this.prisma.payment.findMany({
          where: { invoice_id: { in: invoiceIds }, deleted_at: null },
          orderBy: [{ payment_date: 'desc' }, { id: 'desc' }],
        })
      : [];

    const paidByInvoice = new Map<number, number>();
    let paid = 0;
    for (const pay of payments) {
      const amount = toMoney(pay.paid_amount);
      paid += amount;
      if (pay.invoice_id != null) {
        paidByInvoice.set(
          pay.invoice_id,
          (paidByInvoice.get(pay.invoice_id) ?? 0) + amount,
        );
      }
    }

    let total = 0;
    const invoiceRows = invoices.map((inv) => {
      const payable = toMoney(inv.payable_amount);
      total += payable;
      const invPaid = paidByInvoice.get(inv.id) ?? 0;
      return {
        ...inv,
        paid_amount_total: invPaid,
        outstanding_amount: Math.max(payable - invPaid, 0),
      };
    });

    return {
      total,
      paid,
      invoice_count: invoices.length,
      payment_count: payments.length,
      invoices: invoiceRows,
      payments,
    };
  }

  /* ------------------------------------------------------------------ *
   * Timeline
   * ------------------------------------------------------------------ */

  /**
   * What happened to this student, newest first, built only from timestamps the
   * data really holds: the application's creation and conversion, the student
   * record, the enrolment date, course enrolments, fee installments, invoices
   * and their payments, document uploads, a dropout, and the last profile edit.
   *
   * The legacy `student_activity` table is NOT read: nothing in either CRM has
   * ever written it, so it would add no events.
   */
  async timeline(student: students) {
    const userId = student.student_id;
    const linked = await this.linkedApplication(student);
    const [user, enrolments, installments, invoices, docs] = await Promise.all([
      this.prisma.users.findFirst({
        where: { id: userId },
        select: { drop_out_at: true },
      }),
      this.prisma.enrol.findMany({
        where: { user_id: userId, deleted_at: null },
        select: { id: true, course_id: true, created_at: true, created_by: true },
      }),
      this.prisma.student_payments.findMany({
        where: { student_id: userId, deleted_at: null },
      }),
      this.prisma.invoice.findMany({
        where: { student_id: userId, deleted_at: null },
        select: { id: true, payable_amount: true, date: true, created_at: true, created_by: true },
      }),
      this.documents(student, linked),
    ]);
    const invoicePayments = invoices.length
      ? await this.prisma.payment.findMany({
          where: { invoice_id: { in: invoices.map((i) => i.id) }, deleted_at: null },
          select: { id: true, invoice_id: true, paid_amount: true, payment_date: true, payment_type: true, created_on: true, created_by: true },
        })
      : [];

    const courseIds = [
      ...new Set(
        enrolments.map((e) => e.course_id).filter((c): c is number => c != null),
      ),
    ];
    const [courses, names] = await Promise.all([
      courseIds.length
        ? this.prisma.course.findMany({
            where: { id: { in: courseIds } },
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
      this.userNames([
        student.created_by,
        student.updated_by,
        ...enrolments.map((e) => e.created_by),
        ...installments.map((p) => p.created_by),
        ...invoices.map((i) => i.created_by),
        ...invoicePayments.map((p) => p.created_by),
      ]),
    ]);
    const courseTitle = new Map(courses.map((c) => [c.id, c.title ?? null]));
    const nameOf = (id: number | null | undefined) =>
      id != null ? (names.get(id) ?? null) : null;

    const events: TimelineEvent[] = [];
    const push = (e: Omit<TimelineEvent, 'at'> & { at: Date | null | undefined }) => {
      if (e.at && !Number.isNaN(new Date(e.at).getTime())) {
        events.push({ ...e, at: e.at });
      }
    };

    if (linked) {
      push({
        key: `app-created-${linked.application_id}`,
        type: 'application_created',
        at: linked.created_at,
        title: `Application ${linked.display_id} created`,
        detail: null,
        actor_name: linked.created_by_name,
      });
      push({
        key: `app-converted-${linked.application_id}`,
        type: 'application_converted',
        at: linked.converted_at,
        title: 'Application converted to a student',
        detail: linked.display_id,
        actor_name: linked.converted_by_name,
      });
    }
    push({
      key: `student-created-${student.id}`,
      type: 'student_created',
      at: student.created_at,
      title: 'Student record created',
      detail: null,
      actor_name: nameOf(student.created_by),
    });
    push({
      key: `enrolled-${student.id}`,
      type: 'enrolled',
      at: student.enrollment_date,
      title: 'Enrolment date',
      detail: student.enrollment_id?.trim() ? student.enrollment_id : null,
      actor_name: null,
    });
    for (const e of enrolments) {
      push({
        key: `enrol-${e.id}`,
        type: 'course_enrolment',
        at: e.created_at,
        title: 'Enrolled in a course',
        detail: e.course_id != null ? (courseTitle.get(e.course_id) ?? null) : null,
        actor_name: nameOf(e.created_by),
      });
    }
    for (const p of installments) {
      const label = p.installment_details?.trim() || 'Fee installment';
      const paid = isPaidStatus(p.status);
      push({
        key: `installment-${p.student_payment_id}`,
        type: paid ? 'payment_received' : 'installment_scheduled',
        at: paid ? (p.paid_date ?? p.created_at) : p.created_at,
        title: paid
          ? `${label} paid — ${formatRupees(p.amount)}`
          : `${label} scheduled — ${formatRupees(p.amount)}`,
        detail: [
          p.payment_mode?.trim() || null,
          !paid && p.due_date ? `due ${p.due_date.toISOString().slice(0, 10)}` : null,
          p.status?.trim() || null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
        actor_name: nameOf(p.created_by),
      });
    }
    for (const inv of invoices) {
      push({
        key: `invoice-${inv.id}`,
        type: 'invoice_issued',
        at: inv.date ?? inv.created_at,
        title: `Invoice #${inv.id} issued — ${formatRupees(inv.payable_amount)}`,
        detail: null,
        actor_name: nameOf(inv.created_by),
      });
    }
    for (const pay of invoicePayments) {
      push({
        key: `invoice-payment-${pay.id}`,
        type: 'invoice_payment',
        at: pay.payment_date ?? pay.created_on,
        title: `Payment of ${formatRupees(pay.paid_amount)} against invoice #${pay.invoice_id}`,
        detail: pay.payment_type ?? null,
        actor_name: nameOf(pay.created_by),
      });
    }
    for (const d of docs) {
      push({
        key: `document-${d.student_document_id}`,
        type: 'document_uploaded',
        at: d.created_at,
        title: `Document uploaded: ${d.label?.trim() || 'Untitled'}`,
        detail: d.source === 'application' ? 'Uploaded with the application' : null,
        actor_name: d.uploaded_by_name,
      });
    }
    push({
      key: `dropout-${student.id}`,
      type: 'dropout',
      at: user?.drop_out_at,
      title: 'Marked as dropout',
      detail: null,
      actor_name: null,
    });
    // An edit after creation; the created/updated stamps are equal on a fresh row.
    if (
      student.updated_at &&
      (!student.created_at ||
        student.updated_at.getTime() - student.created_at.getTime() > 1000)
    ) {
      push({
        key: `updated-${student.id}`,
        type: 'profile_updated',
        at: student.updated_at,
        title: 'Profile last updated',
        detail: null,
        actor_name: nameOf(student.updated_by),
      });
    }

    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return { items: events, total: events.length };
  }
}
