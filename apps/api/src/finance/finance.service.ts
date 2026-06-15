import {
  BadRequestException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { Prisma, invoice_payment_status } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto, UpdateInvoiceDto } from './dto/invoice.dto';
import { CreatePaymentDto } from './dto/payment.dto';
import { CreateFeeTypeDto } from './dto/fee-type.dto';
import {
  CreateRazorpayOrderDto,
  VerifyRazorpayPaymentDto,
} from './dto/razorpay.dto';
import { RazorpayProvider } from './razorpay.provider';

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

  // ---- invoices ------------------------------------------------------------

  async listInvoices(params: {
    page?: number;
    limit?: number;
    student_id?: number;
    payment_status?: string;
  }) {
    const { page, limit, skip } = this.resolvePage(params);

    const where: Prisma.invoiceWhereInput = { deleted_at: null };
    if (params.student_id !== undefined) where.student_id = params.student_id;
    if (params.payment_status !== undefined) {
      where.payment_status = params.payment_status as Prisma.invoiceWhereInput['payment_status'];
    }

    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { items, total, page, limit };
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
          refferal_commision_individual: dto.refferal_commision_individual,
          refferal_commision_institution: dto.refferal_commision_institution,
          university_commision_amount: dto.university_commision_amount,
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
