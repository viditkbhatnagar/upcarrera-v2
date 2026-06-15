import { Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Generates branded PDF documents (invoice + payment receipt) for the finance
 * module. Replaces the legacy mPDF templates.
 *
 * Design notes:
 * - pdfkit streams directly to the Express response. The caller passes
 *   `@Res({ passthrough: false }) res`, sets the headers, then hands the
 *   response to the build method which pipes the document and calls `doc.end()`.
 *   Because the document streams (headers are flushed immediately), both the
 *   ResponseInterceptor and AllExceptionsFilter bail on `headersSent`.
 * - Every monetary / nullable field is coerced defensively: money -> number,
 *   missing student -> a placeholder block. A malformed row must never crash
 *   PDF generation.
 */
@Injectable()
export class PdfService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- brand constants -----------------------------------------------------

  private static readonly BRAND_NAME = 'upCarrera';
  private static readonly BRAND_TAGLINE = 'Education & Career Solutions';
  private static readonly ACCENT = '#1d4ed8'; // indigo-700
  private static readonly MUTED = '#6b7280'; // gray-500
  private static readonly INK = '#111827'; // gray-900
  private static readonly CURRENCY = 'INR';
  private static readonly PAGE_MARGIN = 50;

  // ---- money / value helpers ----------------------------------------------

  /**
   * Coerces anything (Prisma Decimal, number, numeric string, null) to a finite
   * number. Decimals arrive as objects with a toString(); null/garbage -> 0.
   */
  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = Number(
      typeof value === 'object' ? (value as { toString(): string }).toString() : value,
    );
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /** Formats a number as a currency-prefixed amount, e.g. "INR 1,250.00". */
  private money(value: unknown): string {
    const amount = this.toNumber(value);
    const formatted = amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${PdfService.CURRENCY} ${formatted}`;
  }

  /** Formats a Date / date-string as DD MMM YYYY; falls back to a dash. */
  private formatDate(value: Date | string | null | undefined): string {
    if (!value) return '-';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  /** Coerces a possibly-null string to a trimmed display value or a dash. */
  private text(value: unknown): string {
    if (value === null || value === undefined) return '-';
    const str = String(value).trim();
    return str.length > 0 ? str : '-';
  }

  // ---- data loading --------------------------------------------------------

  /**
   * Loads a live invoice with its student (looked up via `users` by the
   * invoice.student_id FK — there is no Prisma relation) and its live payments.
   */
  private async loadInvoiceBundle(invoiceId: number) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, deleted_at: null },
    });
    if (!invoice) throw new NotFoundException('Invoice not found!');

    const [student, payments] = await Promise.all([
      invoice.student_id
        ? this.prisma.users.findFirst({ where: { id: invoice.student_id } })
        : Promise.resolve(null),
      this.prisma.payment.findMany({
        where: { invoice_id: invoiceId, deleted_at: null },
        orderBy: { id: 'asc' },
      }),
    ]);

    return { invoice, student, payments };
  }

  /**
   * Loads a live payment, its parent invoice (if any, even soft-deleted is
   * tolerated for receipts), and the paying user.
   */
  private async loadReceiptBundle(paymentId: number) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, deleted_at: null },
    });
    if (!payment) throw new NotFoundException('Payment not found!');

    const [invoice, user] = await Promise.all([
      payment.invoice_id
        ? this.prisma.invoice.findFirst({ where: { id: payment.invoice_id } })
        : Promise.resolve(null),
      payment.user_id
        ? this.prisma.users.findFirst({ where: { id: payment.user_id } })
        : Promise.resolve(null),
    ]);

    return { payment, invoice, user };
  }

  // ---- shared layout pieces ------------------------------------------------

  /** Draws the upCarrera header band + a title on the right. */
  private drawHeader(doc: PDFKit.PDFDocument, title: string): void {
    doc
      .fillColor(PdfService.ACCENT)
      .font('Helvetica-Bold')
      .fontSize(24)
      .text(PdfService.BRAND_NAME, PdfService.PAGE_MARGIN, 50);

    doc
      .fillColor(PdfService.MUTED)
      .font('Helvetica')
      .fontSize(10)
      .text(PdfService.BRAND_TAGLINE, PdfService.PAGE_MARGIN, 80);

    doc
      .fillColor(PdfService.INK)
      .font('Helvetica-Bold')
      .fontSize(20)
      .text(title.toUpperCase(), 0, 55, { align: 'right' });

    // accent rule under the header
    doc
      .moveTo(PdfService.PAGE_MARGIN, 110)
      .lineTo(doc.page.width - PdfService.PAGE_MARGIN, 110)
      .lineWidth(2)
      .strokeColor(PdfService.ACCENT)
      .stroke();

    doc.moveDown(2);
  }

  /** Renders a "Bill To" / party block with name, email, phone. */
  private drawParty(
    doc: PDFKit.PDFDocument,
    label: string,
    party: { name?: string | null; email?: string | null; phone?: string | null } | null,
    x: number,
    y: number,
  ): void {
    doc
      .fillColor(PdfService.MUTED)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(label.toUpperCase(), x, y);

    doc.fillColor(PdfService.INK).font('Helvetica').fontSize(11);

    if (!party) {
      doc.text('Unknown / unassigned', x, y + 14);
      return;
    }

    doc.font('Helvetica-Bold').text(this.text(party.name), x, y + 14);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(PdfService.MUTED)
      .text(this.text(party.email), x, y + 30)
      .text(this.text(party.phone), x, y + 44);
  }

  /** Draws a single label/value meta row (right-aligned label column). */
  private drawMetaRow(
    doc: PDFKit.PDFDocument,
    label: string,
    value: string,
    x: number,
    y: number,
  ): void {
    doc
      .fillColor(PdfService.MUTED)
      .font('Helvetica')
      .fontSize(10)
      .text(label, x, y);
    doc
      .fillColor(PdfService.INK)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(value, x + 90, y);
  }

  /** Draws a horizontal divider line at the current Y. */
  private divider(doc: PDFKit.PDFDocument, y: number): void {
    doc
      .moveTo(PdfService.PAGE_MARGIN, y)
      .lineTo(doc.page.width - PdfService.PAGE_MARGIN, y)
      .lineWidth(0.5)
      .strokeColor('#d1d5db')
      .stroke();
  }

  /** Footer note centered near the bottom of the page. */
  private drawFooter(doc: PDFKit.PDFDocument, note: string): void {
    const y = doc.page.height - 60;
    doc
      .fillColor(PdfService.MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text(note, PdfService.PAGE_MARGIN, y, {
        align: 'center',
        width: doc.page.width - PdfService.PAGE_MARGIN * 2,
      });
  }

  // ---- invoice PDF ---------------------------------------------------------

  /**
   * Builds the invoice PDF for `invoiceId`, pipes it to `res`, and ends the
   * document. The caller is responsible for setting Content-Type /
   * Content-Disposition before invoking this (headers must precede the pipe).
   */
  async streamInvoice(invoiceId: number, res: Response): Promise<void> {
    const { invoice, student, payments } = await this.loadInvoiceBundle(invoiceId);

    const doc = new PDFDocument({ size: 'A4', margin: PdfService.PAGE_MARGIN });
    // If pdfkit faults mid-stream (after headers are flushed) the JSON error
    // path is no longer available, so destroy the socket to surface a broken
    // download rather than hanging the client.
    doc.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({
          status: false,
          message: 'Failed to generate PDF',
          data: null,
        });
      } else {
        res.destroy();
      }
    });
    doc.pipe(res);

    this.drawHeader(doc, 'Invoice');

    // meta + bill-to block
    const top = 130;
    this.drawParty(doc, 'Bill To', student, PdfService.PAGE_MARGIN, top);

    const metaX = 330;
    this.drawMetaRow(doc, 'Invoice No', `#${invoice.id}`, metaX, top);
    this.drawMetaRow(doc, 'Date', this.formatDate(invoice.date), metaX, top + 18);
    this.drawMetaRow(doc, 'Due Date', this.formatDate(invoice.due_date), metaX, top + 36);
    this.drawMetaRow(
      doc,
      'Status',
      this.text(invoice.payment_status).toUpperCase(),
      metaX,
      top + 54,
    );

    // ---- amounts table -----------------------------------------------------
    let y = top + 100;
    this.divider(doc, y);
    y += 12;

    const total = this.toNumber(invoice.total_amount);
    const discount = this.toNumber(invoice.discount_amount);
    const payable = this.toNumber(invoice.payable_amount);

    const lineItems: Array<[string, string]> = [
      ['Total Amount', this.money(total)],
      ['Discount', `- ${this.money(discount)}`],
      ['Payable Amount', this.money(payable)],
    ];

    doc.font('Helvetica').fontSize(11);
    for (const [label, value] of lineItems) {
      const isPayable = label === 'Payable Amount';
      doc
        .fillColor(isPayable ? PdfService.INK : PdfService.MUTED)
        .font(isPayable ? 'Helvetica-Bold' : 'Helvetica')
        .text(label, PdfService.PAGE_MARGIN, y)
        .text(value, 0, y, { align: 'right' });
      y += 20;
    }

    y += 4;
    this.divider(doc, y);
    y += 16;

    // ---- payments list -----------------------------------------------------
    doc
      .fillColor(PdfService.INK)
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Payments', PdfService.PAGE_MARGIN, y);
    y += 20;

    let totalPaid = 0;
    if (payments.length === 0) {
      doc
        .fillColor(PdfService.MUTED)
        .font('Helvetica')
        .fontSize(10)
        .text('No payments recorded yet.', PdfService.PAGE_MARGIN, y);
      y += 18;
    } else {
      // column header
      doc.fillColor(PdfService.MUTED).font('Helvetica-Bold').fontSize(9);
      doc.text('DATE', PdfService.PAGE_MARGIN, y);
      doc.text('TYPE', 160, y);
      doc.text('REFERENCE', 260, y);
      doc.text('AMOUNT', 0, y, { align: 'right' });
      y += 14;

      doc.font('Helvetica').fontSize(10).fillColor(PdfService.INK);
      for (const payment of payments) {
        const amount = this.toNumber(payment.paid_amount);
        totalPaid += amount;

        // page-break guard
        if (y > doc.page.height - 120) {
          doc.addPage();
          y = PdfService.PAGE_MARGIN;
        }

        doc.text(this.formatDate(payment.payment_date), PdfService.PAGE_MARGIN, y);
        doc.text(this.text(payment.payment_type), 160, y);
        doc.text(this.text(payment.reference_no), 260, y, { width: 180 });
        doc.text(this.money(amount), 0, y, { align: 'right' });
        y += 18;
      }
    }

    y += 6;
    this.divider(doc, y);
    y += 16;

    // ---- amount due summary ------------------------------------------------
    const amountDue = Math.max(payable - totalPaid, 0);
    this.drawMetaRow(doc, 'Total Paid', this.money(totalPaid), 330, y);
    y += 18;
    doc
      .fillColor(PdfService.ACCENT)
      .font('Helvetica-Bold')
      .fontSize(13)
      .text('Amount Due', 330, y)
      .text(this.money(amountDue), 0, y, { align: 'right' });

    this.drawFooter(
      doc,
      `This is a computer-generated invoice from ${PdfService.BRAND_NAME} and does not require a signature.`,
    );

    doc.end();
  }

  // ---- payment receipt PDF -------------------------------------------------

  /**
   * Builds a payment receipt PDF for `paymentId`, pipes it to `res`, and ends
   * the document. Caller sets the response headers first.
   */
  async streamReceipt(paymentId: number, res: Response): Promise<void> {
    const { payment, invoice, user } = await this.loadReceiptBundle(paymentId);

    const doc = new PDFDocument({ size: 'A4', margin: PdfService.PAGE_MARGIN });
    doc.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({
          status: false,
          message: 'Failed to generate PDF',
          data: null,
        });
      } else {
        res.destroy();
      }
    });
    doc.pipe(res);

    this.drawHeader(doc, 'Receipt');

    const top = 130;
    this.drawParty(doc, 'Received From', user, PdfService.PAGE_MARGIN, top);

    const metaX = 330;
    this.drawMetaRow(doc, 'Receipt No', `#${payment.id}`, metaX, top);
    this.drawMetaRow(doc, 'Date', this.formatDate(payment.payment_date), metaX, top + 18);
    this.drawMetaRow(
      doc,
      'Invoice',
      invoice ? `#${invoice.id}` : 'N/A',
      metaX,
      top + 36,
    );
    this.drawMetaRow(doc, 'Method', this.text(payment.payment_type), metaX, top + 54);

    let y = top + 100;
    this.divider(doc, y);
    y += 16;

    // reference / remark rows
    this.drawMetaRow(doc, 'Reference', this.text(payment.reference_no), PdfService.PAGE_MARGIN, y);
    y += 18;
    this.drawMetaRow(doc, 'Remark', this.text(payment.remark), PdfService.PAGE_MARGIN, y);
    y += 28;

    this.divider(doc, y);
    y += 18;

    // amount paid — the headline of a receipt
    const amount = this.toNumber(payment.paid_amount);
    doc
      .fillColor(PdfService.MUTED)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('AMOUNT PAID', PdfService.PAGE_MARGIN, y);
    doc
      .fillColor(PdfService.ACCENT)
      .font('Helvetica-Bold')
      .fontSize(22)
      .text(this.money(amount), PdfService.PAGE_MARGIN, y + 14);

    // contextual invoice payable, when present
    if (invoice) {
      doc
        .fillColor(PdfService.MUTED)
        .font('Helvetica')
        .fontSize(10)
        .text(
          `Applied to invoice #${invoice.id} (payable ${this.money(invoice.payable_amount)})`,
          PdfService.PAGE_MARGIN,
          y + 48,
        );
    }

    this.drawFooter(
      doc,
      `This is a computer-generated receipt from ${PdfService.BRAND_NAME} and does not require a signature.`,
    );

    doc.end();
  }
}
