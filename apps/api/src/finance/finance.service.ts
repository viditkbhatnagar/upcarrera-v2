import {
  BadRequestException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import {
  Prisma,
  invoice_payment_status,
  invoice_crone_job_type,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../integrations/email.service';
import { CreateInvoiceDto, UpdateInvoiceDto } from './dto/invoice.dto';
import { CreatePaymentDto } from './dto/payment.dto';
import { CreateFeeTypeDto } from './dto/fee-type.dto';
import { UpdateDueDateDto } from './dto/due-date.dto';
import {
  CreateCommissionPlanDto,
  UpdateCommissionPlanDto,
  UpdateAmountReceivedDto,
  UpdateUpcarreraCommissionDto,
} from './dto/commission-plan.dto';
import {
  CreateInstallmentDto,
  UpdateInstallmentDto,
  CreateSpecialFeeDto,
} from './dto/installment.dto';
import { CollectUniversityCommissionDto } from './dto/university-commission.dto';
import {
  CreateRazorpayOrderDto,
  VerifyRazorpayPaymentDto,
} from './dto/razorpay.dto';
import { RazorpayProvider } from './razorpay.provider';

const STUDENT_ROLE_ID = 4;
const ROLE_TEACHER = 3;
const ROLE_INSTITUTE = 5;
const REMINDER_DAYS_BEFORE_DUE = 3;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

interface PageParams {
  page?: number;
  limit?: number;
}

/**
 * Port of CI4 App/Invoice, App/Payment, App/Fee_type controllers and their models.
 * The legacy schema uses MANUAL timestamps (auto-timestamps off), so every
 * create/update sets created_at/updated_at explicitly with a JS Date.
 * Soft-delete: reads filter deleted_at IS NULL; delete stamps deleted_at = now.
 */
@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayProvider,
    private readonly email: EmailService,
  ) {}

  // ---- helpers -------------------------------------------------------------

  private resolvePage({ page, limit }: PageParams) {
    const safePage = page && page > 0 ? page : DEFAULT_PAGE;
    const safeLimit = limit && limit > 0 ? limit : DEFAULT_LIMIT;
    return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
  }

  /** Converts an ISO date string to a Date for @db.Date columns; passes through null/undefined. */
  private toDate(value?: string | null): Date | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    return new Date(value);
  }

  /**
   * Coerces a mixed Decimal/Int/VarChar money value to a finite number.
   * Returns 0 for null/blank/NaN so aggregation stays safe (matches the legacy
   * "+= $pay['paid_amount']" arithmetic on string columns).
   */
  private toMoney(value: unknown): number {
    if (value === null || value === undefined || value === '') return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  // ---- invoices ------------------------------------------------------------

  async listInvoices(params: {
    page?: number;
    limit?: number;
    student_id?: number;
    payment_status?: string;
    course_id?: number;
    from_date?: string;
    to_date?: string;
  }) {
    const { page, limit, skip } = this.resolvePage(params);

    const where: Prisma.invoiceWhereInput = { deleted_at: null };
    if (params.student_id !== undefined) where.student_id = params.student_id;
    if (params.payment_status !== undefined) {
      where.payment_status = params.payment_status as Prisma.invoiceWhereInput['payment_status'];
    }
    if (params.course_id !== undefined) where.course_id = params.course_id;

    // Legacy filters on invoice.date only when BOTH bounds are present.
    if (params.from_date && params.to_date) {
      where.date = {
        gte: this.toDate(params.from_date),
        lte: this.toDate(params.to_date),
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    // Per-invoice payment_count + total_paid (ported from Invoice::index).
    // Additive enrichment — existing fields are untouched.
    const items = await Promise.all(
      rows.map(async (inv) => {
        const agg = await this.prisma.payment.aggregate({
          where: { invoice_id: inv.id, deleted_at: null },
          _sum: { paid_amount: true },
          _count: { _all: true },
        });
        return {
          ...inv,
          payment_count: agg._count._all,
          total_paid: this.toMoney(agg._sum.paid_amount),
        };
      }),
    );

    return { items, total, page, limit };
  }

  /**
   * GET /invoices/students-by-course?course_id= — converted leads on a course,
   * plus the course's total amount. Ported from Invoice::getStudentsbycourse
   * (legacy keyed on leads.is_converted=1 & course_id, returning course amount).
   */
  async studentsByCourse(courseId: number) {
    const [users, course] = await Promise.all([
      this.prisma.leads.findMany({
        where: { is_converted: 1, course_id: courseId, deleted_at: null },
        orderBy: { id: 'desc' },
      }),
      this.prisma.course.findFirst({ where: { id: courseId } }),
    ]);

    return {
      users,
      // Legacy returned $course['amount']; this schema's course has total_amount.
      amount: course?.total_amount ?? 0,
    };
  }

  /**
   * PATCH /invoices/:id/due-date — sets due_date and (re)builds the two
   * invoice_crone_job rows. Ported from Invoice::update_due + addInvoiceCroneJob:
   *   reminder = due_date - 3 days, due = due_date.
   * Existing cron rows for this invoice are updated in place; otherwise inserted.
   */
  async updateInvoiceDueDate(id: number, dto: UpdateDueDateDto, actingUserId?: number) {
    await this.getInvoice(id);
    const now = new Date();
    const dueDate = this.toDate(dto.due_date);
    if (!dueDate) throw new BadRequestException('due_date is required');

    const reminderDate = new Date(dueDate);
    reminderDate.setDate(reminderDate.getDate() - REMINDER_DAYS_BEFORE_DUE);

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.update({
        where: { id },
        data: { due_date: dueDate, updated_by: actingUserId, updated_at: now },
      });

      await this.upsertCroneJob(
        tx,
        id,
        invoice_crone_job_type.reminder,
        reminderDate,
        now,
        actingUserId,
      );
      await this.upsertCroneJob(
        tx,
        id,
        invoice_crone_job_type.due,
        dueDate,
        now,
        actingUserId,
      );

      return invoice;
    });
  }

  /** Upserts a single invoice_crone_job row for (invoice_id, type). */
  private async upsertCroneJob(
    tx: Prisma.TransactionClient,
    invoiceId: number,
    type: invoice_crone_job_type,
    dueDate: Date,
    now: Date,
    actingUserId?: number,
  ) {
    const existing = await tx.invoice_crone_job.findFirst({
      where: { invoice_id: invoiceId, type, deleted_at: null },
    });
    if (existing) {
      await tx.invoice_crone_job.update({
        where: { id: existing.id },
        data: { due_date: dueDate, updated_by: actingUserId, updated_at: now },
      });
    } else {
      await tx.invoice_crone_job.create({
        data: {
          invoice_id: invoiceId,
          type,
          due_date: dueDate,
          created_by: actingUserId,
          created_at: now,
        },
      });
    }
  }

  /**
   * Cron-triggered: process today's invoice_crone_job rows. Port of
   * Invoice::process_invoice_crone_jobs() + send_reminder_email():
   *   - select every live cron row whose due_date is today;
   *   - for each, load its (live) invoice + student contact + paid total;
   *   - send the reminder/due email via EmailService (when configured);
   *   - soft-delete the processed cron row so it never fires twice.
   *
   * EmailService is env-gated: when Brevo creds are absent it throws, which we
   * catch per-row so a missing email config does NOT block the cron run — the
   * row is still marked processed and the failure is reported in the summary.
   */
  async processDueReminders() {
    const now = new Date();
    const today = new Date(`${this.toDateString(now)}T00:00:00.000Z`);

    const jobs = await this.prisma.invoice_crone_job.findMany({
      where: { due_date: today, deleted_at: null },
      orderBy: { id: 'asc' },
    });

    let processed = 0;
    let emailsSent = 0;
    let emailsFailed = 0;

    for (const job of jobs) {
      if (job.invoice_id == null) {
        // Orphaned cron row — nothing to remind on; retire it.
        await this.prisma.invoice_crone_job.update({
          where: { id: job.id },
          data: { deleted_at: now },
        });
        processed += 1;
        continue;
      }

      const invoice = await this.prisma.invoice.findFirst({
        where: { id: job.invoice_id, deleted_at: null },
      });

      // Invoice gone/deleted — retire the cron row without emailing.
      if (invoice) {
        const sent = await this.sendReminderEmail(invoice, job.type);
        if (sent === true) emailsSent += 1;
        else if (sent === false) emailsFailed += 1;
      }

      // Retire the cron row (matches the legacy permanent delete) so it never
      // double-fires. Soft-delete keeps an audit trail.
      await this.prisma.invoice_crone_job.update({
        where: { id: job.id },
        data: { deleted_at: now },
      });
      processed += 1;
    }

    return {
      date: this.toDateString(now),
      jobs_found: jobs.length,
      processed,
      emails_sent: emailsSent,
      emails_failed: emailsFailed,
    };
  }

  /**
   * Sends a single payment reminder/due email for an invoice. Returns:
   *   true  -> email sent,
   *   false -> send attempted but failed (e.g. Email not configured),
   *   null  -> skipped (no recipient email on the student).
   * Never throws — the caller catches nothing.
   */
  private async sendReminderEmail(
    invoice: { id: number; student_id: number | null; payable_amount: number | null; due_date: Date | null },
    type: invoice_crone_job_type | null,
  ): Promise<boolean | null> {
    let recipientEmail: string | null = null;
    let recipientName = '';
    if (invoice.student_id != null) {
      const student = await this.prisma.users.findFirst({
        where: { id: invoice.student_id },
        select: { name: true, email: true },
      });
      recipientEmail = student?.email ?? null;
      recipientName = student?.name ?? '';
    }
    if (!recipientEmail) return null;

    const dueLabel = invoice.due_date
      ? this.toDateString(invoice.due_date)
      : '';
    const isReminder = type !== invoice_crone_job_type.due;
    const subject = isReminder
      ? `Payment Reminder: Due on ${dueLabel}`
      : `Invoice Payment Due Today: ${dueLabel}`;
    const messageType = isReminder
      ? `This is a reminder that your payment is due on <strong>${dueLabel}</strong>. Please make the payment to avoid any late fees.`
      : 'Your payment for the invoice is due today. Please make the payment to avoid any penalties.';

    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f5f5;color:#333;padding:20px;">
  <div style="max-width:600px;margin:0 auto;padding:20px;background:#fff;border-radius:8px;">
    <h1 style="color:#3498db;font-size:24px;">Payment ${isReminder ? 'Reminder' : 'Due'}</h1>
    <p>Dear ${recipientName || 'Student'},</p>
    <p>${messageType}</p>
    <div style="padding:15px;border-radius:5px;margin:20px 0;background:#e9ecef;border-left:4px solid #3498db;">
      <p><strong>Invoice #:</strong> ${invoice.id}</p>
      <p><strong>Payable Amount:</strong> ${invoice.payable_amount ?? 0}</p>
      <p><strong>Due Date:</strong> ${dueLabel}</p>
    </div>
  </div>
</body></html>`;

    try {
      await this.email.sendEmail({
        to: recipientEmail,
        name: recipientName || recipientEmail,
        subject,
        html,
      });
      return true;
    } catch {
      // EmailService throws ServiceUnavailableException when not configured.
      return false;
    }
  }

  /** ISO 'YYYY-MM-DD' for a Date (server-local calendar day). */
  private toDateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  async getInvoice(id: number) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, deleted_at: null },
    });
    if (!invoice) throw new NotFoundException('Invoice not found!');
    return invoice;
  }

  async createInvoice(dto: CreateInvoiceDto) {
    const now = new Date();
    return this.prisma.invoice.create({
      data: {
        university_id: dto.university_id,
        semester_id: dto.semester_id,
        student_id: dto.student_id,
        course_id: dto.course_id,
        payment_status: dto.payment_status,
        total_amount: dto.total_amount,
        discount_amount: dto.discount_amount,
        payable_amount: dto.payable_amount,
        collected_commission_of_university: dto.collected_commission_of_university,
        date: this.toDate(dto.date),
        due_date: this.toDate(dto.due_date),
        remarks: dto.remarks,
        created_at: now,
        updated_at: now,
      },
    });
  }

  async updateInvoice(id: number, dto: UpdateInvoiceDto) {
    await this.getInvoice(id);
    return this.prisma.invoice.update({
      where: { id },
      data: {
        university_id: dto.university_id,
        semester_id: dto.semester_id,
        student_id: dto.student_id,
        course_id: dto.course_id,
        payment_status: dto.payment_status,
        total_amount: dto.total_amount,
        discount_amount: dto.discount_amount,
        payable_amount: dto.payable_amount,
        collected_commission_of_university: dto.collected_commission_of_university,
        date: this.toDate(dto.date),
        due_date: this.toDate(dto.due_date),
        remarks: dto.remarks,
        updated_at: new Date(),
      },
    });
  }

  async deleteInvoice(id: number) {
    await this.getInvoice(id);
    await this.prisma.invoice.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
    return { id };
  }

  // ---- payments ------------------------------------------------------------

  async listPayments(params: { page?: number; limit?: number; invoice_id?: number }) {
    const { page, limit, skip } = this.resolvePage(params);

    // payment.deleted_at is @db.Date — soft-deleted rows carry a date, live rows are null.
    const where: Prisma.paymentWhereInput = { deleted_at: null };
    if (params.invoice_id !== undefined) where.invoice_id = params.invoice_id;

    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getPayment(id: number) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, deleted_at: null },
    });
    if (!payment) throw new NotFoundException('Payment not found!');
    return payment;
  }

  /**
   * Lists every live payment for a single invoice (no pagination — an invoice
   * has only a handful of payments). The invoice itself must exist & be live.
   */
  async listInvoicePayments(invoiceId: number) {
    await this.getInvoice(invoiceId);
    return this.prisma.payment.findMany({
      where: { invoice_id: invoiceId, deleted_at: null },
      orderBy: { id: 'desc' },
    });
  }

  /**
   * Records a payment row AND recomputes the parent invoice's payment_status
   * atomically.
   *
   * Logic ported from the legacy flow (Payment_model::add + invoice settle):
   *   total_paid = SUM(payment.paid_amount for this invoice, live rows) + new
   *   total_paid >= invoice.payable_amount  -> 'paid'
   *   else                                  -> 'pending'
   * The invoice_payment_status enum only has {pending, paid} (no 'partial'),
   * so a partially-covered invoice stays 'pending'.
   *
   * NOTE: the `payment` model uses created_on/updated_on (not created_at/updated_at).
   * Razorpay capture/verify is intentionally NOT done here; see razorpay* below.
   */
  async createPayment(dto: CreatePaymentDto) {
    const now = new Date();

    // Resolve referral / university commission amounts from course+student
    // context (ported from Payment::add). Explicit DTO values always win; the
    // computed values only fill the gaps. NOTE: in this schema the `course`
    // table has NO commission-rate columns (refferal_commision_individual /
    // _institution / university_commision are absent), so the rate-based
    // computation degrades to 0 unless those rates are reintroduced — see notes.
    const commissions = await this.computeCommissions(dto);

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          user_id: dto.user_id,
          invoice_id: dto.invoice_id,
          payment_type: dto.payment_type,
          paid_amount: dto.paid_amount,
          payment_date: this.toDate(dto.payment_date),
          reference_no: dto.reference_no,
          remark: dto.remark,
          refferal_commision_individual:
            dto.refferal_commision_individual ??
            commissions.refferal_commision_individual,
          refferal_commision_institution:
            dto.refferal_commision_institution ??
            commissions.refferal_commision_institution,
          university_commision_amount:
            dto.university_commision_amount ??
            commissions.university_commision_amount,
          created_on: now,
          updated_on: now,
        },
      });

      // Only settle a status when the payment is tied to a live invoice.
      if (dto.invoice_id !== undefined && dto.invoice_id !== null) {
        await this.recomputeInvoiceStatus(tx, dto.invoice_id, now);
      }

      return payment;
    });
  }

  /**
   * Computes referral/university commission amounts for a payment.
   * Mirrors Payment::add:
   *   - resolve the paying user -> their lead -> the lead's creator's role_id.
   *   - role 3 (teacher/individual) -> refferal_commision_individual
   *   - role 5 (institute)          -> refferal_commision_institution
   *   - university_commision_amount is computed for every payment.
   * Each = paid_amount * (course_rate% / 100). Course rate columns are absent in
   * this schema, so rates default to 0 (amounts come out 0) — adapt + note.
   * Returns undefined for the role-specific amount that does not apply.
   */
  private async computeCommissions(dto: CreatePaymentDto): Promise<{
    refferal_commision_individual?: number;
    refferal_commision_institution?: number;
    university_commision_amount?: number;
  }> {
    const amount = this.toMoney(dto.paid_amount);
    if (amount <= 0) return {};

    // course context — invoice.course_id is the source of truth for the rate.
    let course: { id: number } | null = null;
    if (dto.invoice_id !== undefined && dto.invoice_id !== null) {
      const invoice = await this.prisma.invoice.findFirst({
        where: { id: dto.invoice_id },
      });
      if (invoice?.course_id) {
        course = await this.prisma.course.findFirst({
          where: { id: invoice.course_id },
        });
      }
    }

    // The course model in this schema exposes no commission-rate columns; treat
    // every rate as 0 unless a future migration reintroduces them. Reading via a
    // record cast keeps this resilient if/when the columns return.
    const courseRecord = (course ?? {}) as Record<string, unknown>;
    const individualRate = this.toMoney(
      courseRecord['refferal_commision_individual'],
    );
    const institutionRate = this.toMoney(
      courseRecord['refferal_commision_institution'],
    );
    const universityRate = this.toMoney(courseRecord['university_commision']);

    // resolve the lead-creator role to decide which referral bucket applies.
    let creatorRoleId: number | null = null;
    if (dto.user_id !== undefined && dto.user_id !== null) {
      const user = await this.prisma.users.findFirst({
        where: { id: dto.user_id },
      });
      if (user?.lead_id) {
        const lead = await this.prisma.leads.findFirst({
          where: { id: user.lead_id },
        });
        if (lead?.created_by) {
          const creator = await this.prisma.users.findFirst({
            where: { id: lead.created_by },
          });
          creatorRoleId = creator?.role_id ?? null;
        }
      }
    }

    const result: {
      refferal_commision_individual?: number;
      refferal_commision_institution?: number;
      university_commision_amount?: number;
    } = {
      university_commision_amount: amount * (universityRate / 100),
    };

    if (creatorRoleId === ROLE_TEACHER) {
      result.refferal_commision_individual = amount * (individualRate / 100);
    } else if (creatorRoleId === ROLE_INSTITUTE) {
      result.refferal_commision_institution = amount * (institutionRate / 100);
    }

    return result;
  }

  /**
   * DELETE /payments/:id — soft-delete a payment, then resettle the parent
   * invoice's status (so removing a payment can flip 'paid' back to 'pending').
   * payment.deleted_at is @db.Date.
   */
  async deletePayment(id: number) {
    const payment = await this.getPayment(id);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id },
        data: { deleted_at: now },
      });
      if (payment.invoice_id !== null && payment.invoice_id !== undefined) {
        await this.recomputeInvoiceStatus(tx, payment.invoice_id, now);
      }
    });

    return { id };
  }

  /**
   * Recomputes and persists invoice.payment_status from the sum of its live
   * payments. Runs inside the caller's transaction. No-op if the invoice is
   * missing/soft-deleted (the payment still stands — it just has no invoice to
   * settle).
   */
  private async recomputeInvoiceStatus(
    tx: Prisma.TransactionClient,
    invoiceId: number,
    now: Date,
  ) {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, deleted_at: null },
    });
    if (!invoice) return;

    const agg = await tx.payment.aggregate({
      where: { invoice_id: invoiceId, deleted_at: null },
      _sum: { paid_amount: true },
    });

    const totalPaid = agg._sum.paid_amount ?? 0;
    const payable = invoice.payable_amount ?? 0;

    const status: invoice_payment_status =
      payable > 0 && totalPaid >= payable
        ? invoice_payment_status.paid
        : invoice_payment_status.pending;

    if (status !== invoice.payment_status) {
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { payment_status: status, updated_at: now },
      });
    }
  }

  // ---- fee types -----------------------------------------------------------

  async listFeeTypes(params: { page?: number; limit?: number }) {
    const { page, limit, skip } = this.resolvePage(params);
    const where: Prisma.fee_typeWhereInput = { deleted_at: null };

    const [items, total] = await Promise.all([
      this.prisma.fee_type.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.fee_type.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async createFeeType(dto: CreateFeeTypeDto) {
    const now = new Date();
    return this.prisma.fee_type.create({
      data: {
        title: dto.title,
        created_at: now,
        updated_at: now,
      },
    });
  }

  private async getFeeType(id: number) {
    const feeType = await this.prisma.fee_type.findFirst({
      where: { id, deleted_at: null },
    });
    if (!feeType) throw new NotFoundException('Fee type not found!');
    return feeType;
  }

  /** PATCH /fee-types/:id — update a fee type's title. */
  async updateFeeType(id: number, dto: CreateFeeTypeDto) {
    await this.getFeeType(id);
    return this.prisma.fee_type.update({
      where: { id },
      data: { title: dto.title, updated_at: new Date() },
    });
  }

  /** DELETE /fee-types/:id — soft-delete a fee type. */
  async deleteFeeType(id: number) {
    await this.getFeeType(id);
    await this.prisma.fee_type.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
    return { id };
  }

  // ---- commission plans ----------------------------------------------------

  async listCommissionPlans(params: {
    page?: number;
    limit?: number;
    student_id?: number;
  }) {
    const { page, limit, skip } = this.resolvePage(params);

    const where: Prisma.commission_planWhereInput = { deleted_at: null };
    if (params.student_id !== undefined) where.student_id = params.student_id;

    const [items, total] = await Promise.all([
      this.prisma.commission_plan.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.commission_plan.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  private async getCommissionPlan(id: number) {
    const plan = await this.prisma.commission_plan.findFirst({
      where: { id, deleted_at: null },
    });
    if (!plan) throw new NotFoundException('Commission plan not found!');
    return plan;
  }

  /**
   * POST /students/:id/commission-plan — adds a commission_plan row for a student.
   * Ported from Fee::add_commission_plan (expected amount + date).
   */
  async createCommissionPlan(
    studentId: number,
    dto: CreateCommissionPlanDto,
    actingUserId?: number,
  ) {
    const now = new Date();
    return this.prisma.commission_plan.create({
      data: {
        student_id: studentId,
        expected_commission_amount:
          dto.expected_commission_amount !== undefined &&
          dto.expected_commission_amount !== null
            ? String(dto.expected_commission_amount)
            : undefined,
        expected_date: this.toDate(dto.expected_date),
        created_by: actingUserId,
        updated_by: actingUserId,
        created_at: now,
        updated_at: now,
      },
    });
  }

  /** PATCH /students/commission-plan/:id — edit expected amount/date. */
  async updateCommissionPlan(
    id: number,
    dto: UpdateCommissionPlanDto,
    actingUserId?: number,
  ) {
    await this.getCommissionPlan(id);
    return this.prisma.commission_plan.update({
      where: { id },
      data: {
        expected_commission_amount:
          dto.expected_commission_amount !== undefined &&
          dto.expected_commission_amount !== null
            ? String(dto.expected_commission_amount)
            : undefined,
        expected_date: this.toDate(dto.expected_date),
        updated_by: actingUserId,
        updated_at: new Date(),
      },
    });
  }

  /** PATCH /students/commission-plan/:id/amount-received — record a receipt. */
  async updateCommissionAmountReceived(
    id: number,
    dto: UpdateAmountReceivedDto,
    actingUserId?: number,
  ) {
    await this.getCommissionPlan(id);
    return this.prisma.commission_plan.update({
      where: { id },
      data: {
        amount_received:
          dto.amount_received !== undefined && dto.amount_received !== null
            ? String(dto.amount_received)
            : undefined,
        amount_received_date: this.toDate(dto.amount_received_date),
        updated_by: actingUserId,
        updated_at: new Date(),
      },
    });
  }

  /** DELETE /students/commission-plan/:id — soft-delete a commission plan. */
  async deleteCommissionPlan(id: number) {
    await this.getCommissionPlan(id);
    await this.prisma.commission_plan.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
    return { id };
  }

  /**
   * PATCH /students/:id/upcarrera-commission — sets students.upcarrera_commission.
   * Ported from Fee::edit_commission. The legacy keyed on students.id; here the
   * route :id is the user/student_id, so we match students.student_id.
   */
  async updateUpcarreraCommission(
    studentId: number,
    dto: UpdateUpcarreraCommissionDto,
    actingUserId?: number,
  ) {
    const student = await this.prisma.students.findFirst({
      where: { student_id: studentId, deleted_at: null },
    });
    if (!student) throw new NotFoundException('Student not found!');

    return this.prisma.students.update({
      where: { id: student.id },
      data: {
        upcarrera_commission: dto.upcarrera_commission,
        updated_by: actingUserId,
        updated_at: new Date(),
      },
    });
  }

  // ---- razorpay ------------------------------------------------------------

  /**
   * Port of Payment_model::create_order. Creates a Razorpay order via the
   * gateway and persists a `create_order` row for reconciliation. When no
   * gateway credentials are configured the provider throws
   * ServiceUnavailableException('Razorpay not configured') — expected locally.
   */
  async razorpayCreateOrder(dto: CreateRazorpayOrderDto, actingUserId?: number) {
    const currency = dto.currency ?? 'INR';
    const order = await this.razorpay.createOrder(
      dto.amount,
      dto.receipt,
      currency,
    );

    // Mirror the legacy create_order insert (amount stored in major units).
    const now = new Date();
    await this.prisma.create_order.create({
      data: {
        invoice_id: dto.invoice_id,
        order_id: order.id,
        amount: dto.amount / 100,
        student_id: actingUserId,
        order_status: 'pending',
        datetime: now,
        created_at: now,
        updated_at: now,
        created_by: actingUserId,
        updated_by: actingUserId,
      },
    });

    return order;
  }

  /**
   * Port of Payment_model::verify_payment_signature (+ complete_order's order
   * status flip). Verifies the HMAC signature; on success marks the matching
   * create_order row 'completed'. Throws BadRequest on an invalid signature.
   */
  async razorpayVerifyPayment(dto: VerifyRazorpayPaymentDto) {
    const valid = this.razorpay.verifyPaymentSignature(
      dto.razorpay_order_id,
      dto.razorpay_payment_id,
      dto.razorpay_signature,
    );

    if (!valid) {
      // Match the legacy behaviour of rejecting a tampered callback.
      throw new BadRequestException('Invalid payment signature');
    }

    const now = new Date();
    await this.prisma.create_order.updateMany({
      where: { order_id: dto.razorpay_order_id, deleted_at: null },
      data: {
        order_status: 'completed',
        payment_captured: 1,
        updated_at: now,
      },
    });

    return {
      verified: true,
      razorpay_order_id: dto.razorpay_order_id,
      razorpay_payment_id: dto.razorpay_payment_id,
    };
  }

  // ---- finance reports -----------------------------------------------------

  /** Live student users (role_id=4) joined to their `students` row, by user id. */
  private async studentRowsByUserIds(userIds: number[]) {
    if (userIds.length === 0) return new Map<number, Record<string, unknown>>();
    const rows = await this.prisma.students.findMany({
      where: { student_id: { in: userIds }, deleted_at: null },
    });
    const map = new Map<number, Record<string, unknown>>();
    for (const r of rows) map.set(r.student_id, r as Record<string, unknown>);
    return map;
  }

  /** Builds the role_id=4 user where-clause with optional created_at range + university. */
  private studentUserWhere(params: {
    from_date?: string;
    to_date?: string;
    university_id?: number;
  }): Prisma.usersWhereInput {
    const where: Prisma.usersWhereInput = {
      role_id: STUDENT_ROLE_ID,
      deleted_at: null,
    };
    if (params.from_date && params.to_date) {
      where.created_at = {
        gte: this.toDate(`${params.from_date} 00:00:00`),
        lte: this.toDate(`${params.to_date} 23:59:59`),
      };
    }
    if (params.university_id !== undefined) {
      where.university_id = params.university_id;
    }
    return where;
  }

  /**
   * GET /finance/students — role_id=4 users + their students-join fields.
   * Ported from Finance::index (date range on users.created_at).
   */
  async financeStudents(params: { from_date?: string; to_date?: string }) {
    const users = await this.prisma.users.findMany({
      where: this.studentUserWhere(params),
      orderBy: { id: 'desc' },
    });
    const studentMap = await this.studentRowsByUserIds(users.map((u) => u.id));

    const items = users.map((u) => {
      const s = studentMap.get(u.id);
      return {
        ...u,
        student_id: s?.student_id,
        enrollment_id: s?.enrollment_id,
        dob: s?.dob,
        address: s?.address,
        consultant_id: s?.consultant_id,
        admission_status: s?.admission_status,
        course_id: s?.course_id,
        specialisation_id: s?.specialisation_id,
        upcarrera_commission: s?.upcarrera_commission,
      };
    });

    return { items, total: items.length };
  }

  /**
   * GET /finance/students/:id — single role_id=4 user joined to its students row.
   * Ported from Finance::view.
   */
  async financeStudent(id: number) {
    const user = await this.prisma.users.findFirst({
      where: { id, deleted_at: null },
    });
    if (!user) throw new NotFoundException('Student not found!');
    const student = await this.prisma.students.findFirst({
      where: { student_id: id, deleted_at: null },
    });
    return {
      ...user,
      student_id: student?.student_id,
      courses: student?.courses,
      course_status: student?.course_status,
      paymentStatus: student?.paymentStatus,
      course_id: student?.course_id,
      specialisation_id: student?.specialisation_id,
      upcarrera_commission: student?.upcarrera_commission,
    };
  }

  /**
   * GET /finance/fee-status?referred_by=&from_date=&to_date=&university_id=
   * Ported from Fee::fee_status — students referred by a client, joined to their
   * `finance` row. referred_by is required to scope the report (legacy $id).
   */
  async feeStatus(params: {
    referred_by?: number;
    from_date?: string;
    to_date?: string;
    university_id?: number;
  }) {
    const where = this.studentUserWhere(params);
    const users = await this.prisma.users.findMany({
      where,
      orderBy: { id: 'desc' },
    });

    // Inner-join semantics: only users that have a students row referred_by X
    // (when supplied) AND a finance row.
    const userIds = users.map((u) => u.id);
    const [studentRows, financeRows] = await Promise.all([
      this.prisma.students.findMany({
        where: {
          student_id: { in: userIds },
          deleted_at: null,
          ...(params.referred_by !== undefined
            ? { referred_by: params.referred_by }
            : {}),
        },
      }),
      this.prisma.finance.findMany({
        where: { student_id: { in: userIds }, deleted_at: null },
      }),
    ]);

    const referredSet = new Set(studentRows.map((s) => s.student_id));
    const financeMap = new Map(financeRows.map((f) => [f.student_id, f]));

    const items = users
      .filter((u) => referredSet.has(u.id) && financeMap.has(u.id))
      .map((u) => {
        const f = financeMap.get(u.id);
        return {
          ...u,
          finance_id: f?.id,
          tuitionFees: f?.tuitionFees,
          examFees: f?.examFees,
          miscFees: f?.miscFees,
          scholarship_details: f?.scholarship_details,
          payment_status: f?.payment_status,
        };
      });

    return { items, total: items.length };
  }

  /**
   * GET /finance/student-commission?from_date=&to_date=&university_id=&commission_status=
   * Ported from Fee::student_fee_commission. For each role_id=4 student: the sum
   * of received commission (commission_plan.amount_received) and the balance
   * against students.upcarrera_commission. commission_status 0 => unset, >0 => set.
   */
  async studentCommission(params: {
    from_date?: string;
    to_date?: string;
    university_id?: number;
    commission_status?: number;
  }) {
    const where = this.studentUserWhere(params);
    const users = await this.prisma.users.findMany({
      where,
      orderBy: { id: 'desc' },
    });
    const studentMap = await this.studentRowsByUserIds(users.map((u) => u.id));

    let items = await Promise.all(
      users.map(async (u) => {
        const s = studentMap.get(u.id);
        const upcarrera = this.toMoney(s?.upcarrera_commission);
        // amount_received is a VarChar money column — sum in JS, not via Prisma.
        const plans = await this.prisma.commission_plan.findMany({
          where: { student_id: u.id, deleted_at: null },
          select: { amount_received: true },
        });
        const received = plans.reduce(
          (acc, p) => acc + this.toMoney(p.amount_received),
          0,
        );
        return {
          user_id: u.id,
          student_name: u.name,
          university_id: u.university_id,
          student_id: s?.student_id,
          course_id: s?.course_id,
          upcarrera_commission: s?.upcarrera_commission ?? null,
          commission_received: received,
          balance_commission: upcarrera - received,
        };
      }),
    );

    // commission_status filter: 0 => not set (null), >0 => set (not null).
    if (params.commission_status !== undefined) {
      const wantSet = params.commission_status > 0;
      items = items.filter((i) =>
        wantSet
          ? i.upcarrera_commission !== null
          : i.upcarrera_commission === null,
      );
    }

    const added_count = items.filter(
      (i) => i.upcarrera_commission !== null,
    ).length;
    const not_added_count = items.filter(
      (i) => i.upcarrera_commission === null,
    ).length;

    return { items, total: items.length, added_count, not_added_count };
  }

  /**
   * GET /finance/university-commission?from_date=&to_date=&university_id=&commission_status=
   * Per-university rollup of student commission. Ported from
   * Fee::university_fee_commission (grouped totals by university).
   */
  async universityCommissionReport(params: {
    from_date?: string;
    to_date?: string;
    university_id?: number;
    commission_status?: number;
  }) {
    // Reuse the per-student computation, then group by university.
    const perStudent = await this.studentCommission({
      from_date: params.from_date,
      to_date: params.to_date,
      university_id: params.university_id,
    });

    const universities = await this.prisma.university.findMany({
      where: { deleted_at: null },
    });
    const titleById = new Map(universities.map((u) => [u.id, u.title]));

    const grouped = new Map<
      number,
      {
        university_id: number;
        university_title: string | null;
        total_students: number;
        commission_added_students: number;
        commission_pending_students: number;
        total_commission_amount: number;
        total_commission_received: number;
        total_balance_commission: number;
      }
    >();

    for (const s of perStudent.items) {
      const uid = s.university_id ?? 0;
      if (!grouped.has(uid)) {
        grouped.set(uid, {
          university_id: uid,
          university_title: titleById.get(uid) ?? null,
          total_students: 0,
          commission_added_students: 0,
          commission_pending_students: 0,
          total_commission_amount: 0,
          total_commission_received: 0,
          total_balance_commission: 0,
        });
      }
      const g = grouped.get(uid)!;
      g.total_students += 1;
      const added = s.upcarrera_commission !== null;
      if (added) g.commission_added_students += 1;
      else g.commission_pending_students += 1;
      g.total_commission_amount += this.toMoney(s.upcarrera_commission);
      g.total_commission_received += this.toMoney(s.commission_received);
      g.total_balance_commission += this.toMoney(s.balance_commission);
    }

    let items = Array.from(grouped.values());

    if (params.commission_status !== undefined) {
      items =
        params.commission_status > 0
          ? items.filter((u) => u.commission_added_students > 0)
          : items.filter((u) => u.commission_pending_students > 0);
    }

    return {
      items,
      total: items.length,
      total_students: items.reduce((a, u) => a + u.total_students, 0),
      total_commission_added: items.reduce(
        (a, u) => a + u.commission_added_students,
        0,
      ),
      total_commission_pending: items.reduce(
        (a, u) => a + u.commission_pending_students,
        0,
      ),
      grand_total_commission: items.reduce(
        (a, u) => a + u.total_commission_amount,
        0,
      ),
      grand_total_received: items.reduce(
        (a, u) => a + u.total_commission_received,
        0,
      ),
      grand_total_balance: items.reduce(
        (a, u) => a + u.total_balance_commission,
        0,
      ),
    };
  }

  // ---- fee-management ------------------------------------------------------

  /**
   * Resolves the effective course total for a student: the special fee for their
   * specialisation if one exists, else the specialisation's total_amount.
   * Ported from the Fee_management installment/course-fee status math.
   */
  private async studentCourseTotal(
    studentUserId: number,
    specialisationId?: number | null,
  ): Promise<number> {
    if (!specialisationId) return 0;
    const [specialisation, special] = await Promise.all([
      this.prisma.specialisations.findFirst({
        where: { id: specialisationId },
      }),
      this.prisma.student_special_fees.findFirst({
        where: {
          student_id: studentUserId,
          specialisation_id: specialisationId,
          deleted_at: null,
        },
      }),
    ]);
    if (special) return this.toMoney(special.special_fee);
    return this.toMoney(specialisation?.total_amount);
  }

  /**
   * GET /fee-management/installments & /fee-management/course-fee.
   * Lists role_id=4 students with installment status derived from their
   * student_payments total vs effective course total.
   * Ported from Fee_management::installmets / course_fee.
   */
  async feeManagementStudents(params: {
    university_id?: number;
    course_id?: number;
    consultant_id?: number;
    client_id?: number;
    admission_status?: number;
    source?: string;
    list_by?: string;
  }) {
    const userWhere: Prisma.usersWhereInput = {
      role_id: STUDENT_ROLE_ID,
      deleted_at: null,
    };
    if (params.university_id !== undefined) {
      userWhere.university_id = params.university_id;
    }

    const studentWhere: Prisma.studentsWhereInput = { deleted_at: null };
    if (params.course_id !== undefined) studentWhere.course_id = params.course_id;
    if (params.consultant_id !== undefined) {
      studentWhere.consultant_id = params.consultant_id;
    }
    if (params.client_id !== undefined) {
      studentWhere.referred_by = params.client_id;
    }
    if (params.admission_status !== undefined) {
      studentWhere.admission_status = params.admission_status;
    }
    if (params.source !== undefined) studentWhere.source = params.source;

    const users = await this.prisma.users.findMany({
      where: userWhere,
      orderBy: { id: 'desc' },
    });
    const studentRows = await this.prisma.students.findMany({
      where: { ...studentWhere, student_id: { in: users.map((u) => u.id) } },
    });
    const studentMap = new Map(studentRows.map((s) => [s.student_id, s]));

    let items = await Promise.all(
      users
        .filter((u) => studentMap.has(u.id))
        .map(async (u) => {
          const s = studentMap.get(u.id)!;
          const totalCourseAmount = await this.studentCourseTotal(
            u.id,
            s.specialisation_id,
          );
          const agg = await this.prisma.student_payments.aggregate({
            where: { student_id: u.id, deleted_at: null },
            _sum: { amount: true },
          });
          const addedAmount = this.toMoney(agg._sum.amount);

          let installment_status: string;
          if (addedAmount === 0) installment_status = 'not_added';
          else if (addedAmount >= totalCourseAmount)
            installment_status = 'added';
          else installment_status = 'partially_added';

          return {
            ...u,
            student_id: s.id,
            course_id: s.course_id,
            specialisation_id: s.specialisation_id,
            consultant_id: s.consultant_id,
            source: s.source,
            admission_status: s.admission_status,
            total_course_amount: totalCourseAmount,
            added_amount: addedAmount,
            not_added_amount: totalCourseAmount - addedAmount,
            installment_status,
          };
        }),
    );

    const counts = {
      added_count: items.filter((i) => i.installment_status === 'added').length,
      partial_count: items.filter(
        (i) => i.installment_status === 'partially_added',
      ).length,
      not_added_count: items.filter(
        (i) => i.installment_status === 'not_added',
      ).length,
    };

    if (
      params.list_by &&
      ['added', 'partially_added', 'not_added'].includes(params.list_by)
    ) {
      items = items.filter((i) => i.installment_status === params.list_by);
    }

    return { items, total: items.length, ...counts };
  }

  /**
   * GET /fee-management/students/:id/installments — student_payments rows + the
   * effective course total / added / remaining for one student (route :id is the
   * user/student_id). Ported from Fee_management::manage_installmets.
   */
  async studentInstallments(studentUserId: number) {
    const student = await this.prisma.students.findFirst({
      where: { student_id: studentUserId, deleted_at: null },
    });
    if (!student) throw new NotFoundException('Student not found!');

    const items = await this.prisma.student_payments.findMany({
      where: { student_id: studentUserId, deleted_at: null },
      orderBy: { student_payment_id: 'desc' },
    });
    const totalCourseAmount = await this.studentCourseTotal(
      studentUserId,
      student.specialisation_id,
    );
    const addedAmount = items.reduce((a, i) => a + this.toMoney(i.amount), 0);

    return {
      items,
      total: items.length,
      total_course_amount: totalCourseAmount,
      added_amount: addedAmount,
      not_added_amount: totalCourseAmount - addedAmount,
      student_id: studentUserId,
    };
  }

  /**
   * POST /fee-management/students/:id/installments — inserts a student_payments
   * row, capping cumulative paid at the effective course total.
   * Ported from Fee_management::add_installment.
   */
  async createInstallment(
    studentUserId: number,
    dto: CreateInstallmentDto,
    actingUserId?: number,
  ) {
    const student = await this.prisma.students.findFirst({
      where: { student_id: studentUserId, deleted_at: null },
    });
    if (!student) throw new NotFoundException('Student not found!');

    const totalCourseAmount = await this.studentCourseTotal(
      studentUserId,
      student.specialisation_id,
    );
    const agg = await this.prisma.student_payments.aggregate({
      where: { student_id: studentUserId, deleted_at: null },
      _sum: { amount: true },
    });
    const alreadyPaid = this.toMoney(agg._sum.amount);
    const amount = this.toMoney(dto.amount);

    if (totalCourseAmount > 0 && alreadyPaid + amount > totalCourseAmount) {
      throw new BadRequestException(
        `Amount exceeds the total allowed fee (${totalCourseAmount}).`,
      );
    }

    const now = new Date();
    return this.prisma.student_payments.create({
      data: {
        student_id: studentUserId,
        installment_details: dto.installment_details,
        amount: dto.amount,
        due_date: this.toDate(dto.due_date),
        paid_date: this.toDate(dto.paid_date),
        payment_mode: dto.payment_mode,
        payment_to: dto.payment_to,
        status: dto.status,
        created_by: actingUserId,
        updated_by: actingUserId,
        created_at: now,
        updated_at: now,
      },
    });
  }

  /**
   * PATCH /fee-management/installments/:id — partial update of a student_payments
   * row (route :id is the student_payment_id).
   */
  async updateInstallment(
    id: number,
    dto: UpdateInstallmentDto,
    actingUserId?: number,
  ) {
    const existing = await this.prisma.student_payments.findFirst({
      where: { student_payment_id: id, deleted_at: null },
    });
    if (!existing) throw new NotFoundException('Installment not found!');

    return this.prisma.student_payments.update({
      where: { student_payment_id: id },
      data: {
        installment_details: dto.installment_details,
        amount: dto.amount,
        due_date: this.toDate(dto.due_date),
        paid_date: this.toDate(dto.paid_date),
        payment_mode: dto.payment_mode,
        payment_to: dto.payment_to,
        status: dto.status,
        updated_by: actingUserId,
        updated_at: new Date(),
      },
    });
  }

  /**
   * POST /fee-management/students/:id/special-fee — upserts a student_special_fees
   * row keyed on (student_id, specialisation_id). specialisation_id falls back to
   * the student's own specialisation. Ported from Fee_management::add_special_fee.
   */
  async upsertSpecialFee(
    studentUserId: number,
    dto: CreateSpecialFeeDto,
    actingUserId?: number,
  ) {
    let specialisationId = dto.specialisation_id;
    if (specialisationId === undefined) {
      const student = await this.prisma.students.findFirst({
        where: { student_id: studentUserId, deleted_at: null },
      });
      if (!student) throw new NotFoundException('Student not found!');
      specialisationId = student.specialisation_id ?? undefined;
    }
    if (specialisationId === undefined) {
      throw new BadRequestException(
        'specialisation_id could not be resolved for this student',
      );
    }
    if (dto.special_fee === undefined || dto.special_fee === null) {
      throw new BadRequestException('special_fee is required');
    }
    // Narrowed non-null money value — Prisma accepts string|number for Decimal.
    const specialFee: string | number = dto.special_fee;

    const now = new Date();
    const existing = await this.prisma.student_special_fees.findFirst({
      where: {
        student_id: studentUserId,
        specialisation_id: specialisationId,
        deleted_at: null,
      },
    });

    if (existing) {
      return this.prisma.student_special_fees.update({
        where: { id: existing.id },
        data: {
          special_fee: specialFee,
          reason: dto.reason,
          updated_by: actingUserId,
          updated_at: now,
        },
      });
    }

    return this.prisma.student_special_fees.create({
      data: {
        student_id: studentUserId,
        specialisation_id: specialisationId,
        special_fee: specialFee,
        reason: dto.reason,
        created_by: actingUserId,
        updated_by: actingUserId,
        created_at: now,
        updated_at: now,
      },
    });
  }

  /**
   * GET /fee-management/payment-status — student_payments joined to student/
   * course/university with a derived 1..4 status bucket (OVERDUE/DUE/UPCOMING/PAID)
   * and per-bucket totals. Ported from Fee_management::payment_status.
   */
  async paymentStatus(params: {
    from_date?: string;
    to_date?: string;
    university_id?: number;
    course_id?: number;
    list_by?: number;
  }) {
    const where: Prisma.student_paymentsWhereInput = { deleted_at: null };
    if (params.from_date) {
      where.due_date = { ...(where.due_date as object), gte: this.toDate(params.from_date) };
    }
    if (params.to_date) {
      where.due_date = { ...(where.due_date as object), lte: this.toDate(params.to_date) };
    }

    const rows = await this.prisma.student_payments.findMany({
      where,
      orderBy: { student_payment_id: 'desc' },
    });

    // Resolve student -> user/course/university for filtering + labels.
    const studentUserIds = Array.from(new Set(rows.map((r) => r.student_id)));
    const [users, studentRows] = await Promise.all([
      this.prisma.users.findMany({
        where: { id: { in: studentUserIds }, deleted_at: null },
      }),
      this.prisma.students.findMany({
        where: { student_id: { in: studentUserIds }, deleted_at: null },
      }),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    const studentMap = new Map(studentRows.map((s) => [s.student_id, s]));

    const today = new Date();
    const curY = today.getFullYear();
    const curM = today.getMonth();

    const totals: Record<number, { amount: number; count: number }> = {
      1: { amount: 0, count: 0 },
      2: { amount: 0, count: 0 },
      3: { amount: 0, count: 0 },
      4: { amount: 0, count: 0 },
    };

    let items = rows
      .map((r) => {
        const user = userMap.get(r.student_id);
        const student = studentMap.get(r.student_id);

        // university / course filters (applied via the joined user/student).
        if (
          params.university_id !== undefined &&
          user?.university_id !== params.university_id
        ) {
          return null;
        }
        if (
          params.course_id !== undefined &&
          student?.course_id !== params.course_id
        ) {
          return null;
        }

        const amount = this.toMoney(r.amount);
        let bucket: number;
        if ((r.status ?? '').toLowerCase() === 'paid') {
          bucket = 4;
        } else if (r.due_date) {
          const d = new Date(r.due_date);
          const dy = d.getFullYear();
          const dm = d.getMonth();
          if (dy < curY || (dy === curY && dm < curM)) bucket = 1;
          else if (dy === curY && dm === curM) bucket = 2;
          else bucket = 3;
        } else {
          bucket = 2;
        }

        totals[bucket].amount += amount;
        totals[bucket].count += 1;

        return {
          ...r,
          student_name: user?.name,
          university_id: user?.university_id,
          course_id: student?.course_id,
          payment_status: bucket,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (params.list_by && [1, 2, 3, 4].includes(params.list_by)) {
      items = items.filter((i) => i.payment_status === params.list_by);
    }

    return {
      items,
      total: items.length,
      totals,
      count_overdue: totals[1].count,
      count_due: totals[2].count,
      count_upcoming: totals[3].count,
      count_paid: totals[4].count,
      count_all:
        totals[1].count + totals[2].count + totals[3].count + totals[4].count,
    };
  }

  // ---- university commission ------------------------------------------------

  /**
   * GET /university-commission?university_id= — role_id=4 students grouped for
   * the university commission collection screen. Ported from
   * University_commission::index (students + university/course/consultant join).
   */
  async universityCommissionStudents(params: { university_id?: number }) {
    const userWhere: Prisma.usersWhereInput = {
      role_id: STUDENT_ROLE_ID,
      deleted_at: null,
    };
    if (params.university_id !== undefined) {
      userWhere.university_id = params.university_id;
    }

    const users = await this.prisma.users.findMany({
      where: userWhere,
      orderBy: { id: 'desc' },
    });
    const studentMap = await this.studentRowsByUserIds(users.map((u) => u.id));
    const universities = await this.prisma.university.findMany({
      where: { deleted_at: null },
    });
    const uniTitle = new Map(universities.map((u) => [u.id, u.title]));

    const items = users.map((u) => {
      const s = studentMap.get(u.id);
      return {
        ...u,
        student_id: s?.student_id,
        course_id: s?.course_id,
        consultant_id: s?.consultant_id,
        source: s?.source,
        admission_status: s?.admission_status,
        adm_pipeline: s?.adm_pipeline,
        referred_by: s?.referred_by,
        university_name: u.university_id
          ? (uniTitle.get(u.university_id) ?? null)
          : null,
      };
    });

    return { items, total: items.length };
  }

  /**
   * POST /university-commission/collect — accumulates collected commission onto
   * invoice.collected_commission_of_university. Ported from
   * University_commission::collect (null => set; else add to running total).
   */
  async collectUniversityCommission(
    dto: CollectUniversityCommissionDto,
    actingUserId?: number,
  ) {
    const invoice = await this.getInvoice(dto.invoice_id);
    const collecting = this.toMoney(dto.collected_commison);
    const current = this.toMoney(invoice.collected_commission_of_university);
    const newTotal =
      invoice.collected_commission_of_university === null
        ? collecting
        : current + collecting;

    return this.prisma.invoice.update({
      where: { id: dto.invoice_id },
      data: {
        collected_commission_of_university: newTotal,
        updated_by: actingUserId,
        updated_at: new Date(),
      },
    });
  }

  // ---- phase-3 stubs -------------------------------------------------------

  // TODO(phase-3): port invoice_crone_job — scheduled invoice generation.
  runInvoiceCron(): never {
    throw new NotImplementedException(
      'Invoice generation cron — phase 3',
    );
  }

  // TODO(phase-3): auto-compute commission_plan amounts from payments/invoices.
  autoCalculateCommission(): never {
    throw new NotImplementedException(
      'Commission auto-calculation — phase 3',
    );
  }
}
