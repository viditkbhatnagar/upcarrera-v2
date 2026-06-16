import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FinanceService } from './finance.service';
import { PdfService } from './pdf.service';
import { CreateInvoiceDto, UpdateInvoiceDto } from './dto/invoice.dto';
import { CreatePaymentDto } from './dto/payment.dto';
import { CreateFeeTypeDto } from './dto/fee-type.dto';
import { UpdateDueDateDto } from './dto/due-date.dto';
import {
  CreateRazorpayOrderDto,
  VerifyRazorpayPaymentDto,
} from './dto/razorpay.dto';
import {
  ListInvoicesDto,
  ListPaymentsDto,
  ListFeeTypesDto,
  ListCommissionPlansDto,
} from './dto/list.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Staff finance endpoints — invoices, payments, fee types, commission plans.
 * All routes are protected by the global JwtAuthGuard (no @Public here).
 * The {status,message,data} envelope is applied automatically by ResponseInterceptor.
 */
@Controller()
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly pdf: PdfService,
  ) {}

  // ---- pdf -----------------------------------------------------------------
  // These stream a binary PDF directly to the response. They use
  // @Res({ passthrough: false }) so Nest does NOT try to serialise/wrap the
  // return value — the PdfService pipes the document and calls doc.end().
  // ResponseInterceptor + AllExceptionsFilter both bail on headersSent, so the
  // streaming download is left untouched. NOTE: a NotFound thrown BEFORE any
  // bytes are written still renders the normal JSON error envelope.

  @Get('invoices/:id/pdf')
  async invoicePdf(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="invoice-${id}.pdf"`,
    );
    await this.pdf.streamInvoice(id, res);
  }

  @Get('payments/receipt/:id/pdf')
  async paymentReceiptPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="receipt-${id}.pdf"`,
    );
    await this.pdf.streamReceipt(id, res);
  }

  // ---- invoices ------------------------------------------------------------

  @Get('invoices')
  @ResponseMessage('Invoices fetched')
  listInvoices(@Query() query: ListInvoicesDto) {
    return this.finance.listInvoices(query);
  }

  // Literal sub-path — MUST stay above 'invoices/:id'.
  @Get('invoices/students-by-course')
  @ResponseMessage('Students fetched')
  studentsByCourse(@Query('course_id', ParseIntPipe) courseId: number) {
    return this.finance.studentsByCourse(courseId);
  }

  @Get('invoices/:id')
  @ResponseMessage('Invoice fetched')
  getInvoice(@Param('id', ParseIntPipe) id: number) {
    return this.finance.getInvoice(id);
  }

  @Post('invoices')
  @ResponseMessage('Invoice created')
  createInvoice(@Body() dto: CreateInvoiceDto) {
    return this.finance.createInvoice(dto);
  }

  /**
   * Cron-triggered: process today's invoice_crone_job rows (send reminder/due
   * emails via EmailService when configured, then retire each processed row).
   * Port of Invoice::process_invoice_crone_jobs(). Literal path — there is no
   * `@Post('invoices/:id')`, so it stays unambiguous. Behind the global
   * JwtAuthGuard like the rest (a scheduler calls it with a service token).
   */
  @Post('invoices/process-due-reminders')
  @ResponseMessage('Invoice due reminders processed')
  processDueReminders() {
    return this.finance.processDueReminders();
  }

  @Patch('invoices/:id')
  @ResponseMessage('Invoice updated')
  updateInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.finance.updateInvoice(id, dto);
  }

  @Delete('invoices/:id')
  @ResponseMessage('Invoice deleted')
  deleteInvoice(@Param('id', ParseIntPipe) id: number) {
    return this.finance.deleteInvoice(id);
  }

  // Sets due_date and (re)builds the invoice_crone_job reminder/due rows.
  @Patch('invoices/:id/due-date')
  @ResponseMessage('Invoice due date updated')
  updateInvoiceDueDate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDueDateDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.finance.updateInvoiceDueDate(id, dto, userId);
  }

  // Lists all payments recorded against a single invoice.
  @Get('invoices/:id/payments')
  @ResponseMessage('Invoice payments fetched')
  listInvoicePayments(@Param('id', ParseIntPipe) id: number) {
    return this.finance.listInvoicePayments(id);
  }

  // ---- payments ------------------------------------------------------------

  @Get('payments')
  @ResponseMessage('Payments fetched')
  listPayments(@Query() query: ListPaymentsDto) {
    return this.finance.listPayments(query);
  }

  @Get('payments/:id')
  @ResponseMessage('Payment fetched')
  getPayment(@Param('id', ParseIntPipe) id: number) {
    return this.finance.getPayment(id);
  }

  // Records a manual payment row (cash/cheque/bank). Does NOT call Razorpay.
  // Also computes referral/university commission amounts from course context.
  @Post('payments')
  @ResponseMessage('Payment recorded')
  createPayment(@Body() dto: CreatePaymentDto) {
    return this.finance.createPayment(dto);
  }

  @Delete('payments/:id')
  @ResponseMessage('Payment deleted')
  deletePayment(@Param('id', ParseIntPipe) id: number) {
    return this.finance.deletePayment(id);
  }

  // ---- razorpay ------------------------------------------------------------
  // These require RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET; without them the
  // provider returns a 503 'Razorpay not configured' (expected locally).

  @Post('payments/razorpay/order')
  @ResponseMessage('Razorpay order created')
  razorpayOrder(
    @Body() dto: CreateRazorpayOrderDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.finance.razorpayCreateOrder(dto, userId);
  }

  @Post('payments/razorpay/verify')
  @ResponseMessage('Razorpay payment verified')
  razorpayVerify(@Body() dto: VerifyRazorpayPaymentDto) {
    return this.finance.razorpayVerifyPayment(dto);
  }

  // ---- fee types -----------------------------------------------------------

  @Get('fee-types')
  @ResponseMessage('Fee types fetched')
  listFeeTypes(@Query() query: ListFeeTypesDto) {
    return this.finance.listFeeTypes(query);
  }

  @Post('fee-types')
  @ResponseMessage('Fee type created')
  createFeeType(@Body() dto: CreateFeeTypeDto) {
    return this.finance.createFeeType(dto);
  }

  @Patch('fee-types/:id')
  @ResponseMessage('Fee type updated')
  updateFeeType(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateFeeTypeDto,
  ) {
    return this.finance.updateFeeType(id, dto);
  }

  @Delete('fee-types/:id')
  @ResponseMessage('Fee type deleted')
  deleteFeeType(@Param('id', ParseIntPipe) id: number) {
    return this.finance.deleteFeeType(id);
  }

  // ---- commission plans ----------------------------------------------------

  @Get('commission-plans')
  @ResponseMessage('Commission plans fetched')
  listCommissionPlans(@Query() query: ListCommissionPlansDto) {
    return this.finance.listCommissionPlans(query);
  }
}
