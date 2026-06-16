import { Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService, EnrollmentStatusCounts } from './reports.service';

/**
 * Streams branded enrollment-report PDFs (university-wise / intake-wise).
 *
 * Ports App/Controllers/App/Enrollment.php::print_university_report() and
 * print_intake_report(), which built an HTML table + status-summary block and
 * rendered it with mPDF. Here we draw the same content with pdfkit and pipe it
 * straight to the Express response, mirroring finance/pdf.service.ts:
 *  - caller passes @Res({ passthrough: false }), sets Content-Type /
 *    Content-Disposition, then hands the response over;
 *  - we pipe the document and call doc.end();
 *  - because headers flush immediately, ResponseInterceptor + the exception
 *    filter bail on headersSent.
 *
 * The status tally (6 admission_status buckets) and the per-student table both
 * come from ReportsService so the JSON endpoints and the PDF stay in lockstep.
 */
@Injectable()
export class EnrollmentPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
  ) {}

  // ---- brand constants (kept in step with finance/pdf.service.ts) ----------

  private static readonly BRAND_NAME = 'upCarrera';
  private static readonly BRAND_TAGLINE = 'Education & Career Solutions';
  private static readonly ACCENT = '#1d4ed8';
  private static readonly MUTED = '#6b7280';
  private static readonly INK = '#111827';
  private static readonly PAGE_MARGIN = 50;

  // ---- value helpers -------------------------------------------------------

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

  /** Coerces a possibly-null value to a trimmed display value or a dash. */
  private text(value: unknown): string {
    if (value === null || value === undefined) return '-';
    const str = String(value).trim();
    return str.length > 0 ? str : '-';
  }

  // ---- shared layout pieces ------------------------------------------------

  private drawHeader(doc: PDFKit.PDFDocument, title: string, subtitle: string): void {
    doc
      .fillColor(EnrollmentPdfService.ACCENT)
      .font('Helvetica-Bold')
      .fontSize(24)
      .text(EnrollmentPdfService.BRAND_NAME, EnrollmentPdfService.PAGE_MARGIN, 50);

    doc
      .fillColor(EnrollmentPdfService.MUTED)
      .font('Helvetica')
      .fontSize(10)
      .text(EnrollmentPdfService.BRAND_TAGLINE, EnrollmentPdfService.PAGE_MARGIN, 80);

    doc
      .fillColor(EnrollmentPdfService.INK)
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(title.toUpperCase(), 0, 52, { align: 'right' });

    doc
      .fillColor(EnrollmentPdfService.MUTED)
      .font('Helvetica')
      .fontSize(10)
      .text(subtitle, 0, 74, { align: 'right' })
      .text(`Generated ${this.formatDate(new Date())}`, 0, 88, { align: 'right' });

    doc
      .moveTo(EnrollmentPdfService.PAGE_MARGIN, 110)
      .lineTo(doc.page.width - EnrollmentPdfService.PAGE_MARGIN, 110)
      .lineWidth(2)
      .strokeColor(EnrollmentPdfService.ACCENT)
      .stroke();

    doc.moveDown(2);
  }

  private divider(doc: PDFKit.PDFDocument, y: number): void {
    doc
      .moveTo(EnrollmentPdfService.PAGE_MARGIN, y)
      .lineTo(doc.page.width - EnrollmentPdfService.PAGE_MARGIN, y)
      .lineWidth(0.5)
      .strokeColor('#d1d5db')
      .stroke();
  }

  private drawFooter(doc: PDFKit.PDFDocument, note: string): void {
    const y = doc.page.height - 60;
    doc
      .fillColor(EnrollmentPdfService.MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text(note, EnrollmentPdfService.PAGE_MARGIN, y, {
        align: 'center',
        width: doc.page.width - EnrollmentPdfService.PAGE_MARGIN * 2,
      });
  }

  /** Draws the 7-cell status summary band (total + 6 admission statuses). */
  private drawSummary(
    doc: PDFKit.PDFDocument,
    counts: EnrollmentStatusCounts,
    y: number,
  ): number {
    const cells: Array<[string, number]> = [
      ['Total', counts.total],
      ['Pending', counts.pending],
      ['In Progress', counts.in_progress],
      ['Enrolled', counts.enrolled],
      ['Passout', counts.passout],
      ['Dropout', counts.dropout],
      ['Cancelled', counts.cancelled],
    ];

    const usable = doc.page.width - EnrollmentPdfService.PAGE_MARGIN * 2;
    const colWidth = usable / cells.length;

    cells.forEach(([label, value], i) => {
      const x = EnrollmentPdfService.PAGE_MARGIN + colWidth * i;
      doc
        .fillColor(EnrollmentPdfService.ACCENT)
        .font('Helvetica-Bold')
        .fontSize(16)
        .text(String(value), x, y, { width: colWidth, align: 'center' });
      doc
        .fillColor(EnrollmentPdfService.MUTED)
        .font('Helvetica')
        .fontSize(8)
        .text(label.toUpperCase(), x, y + 20, { width: colWidth, align: 'center' });
    });

    return y + 44;
  }

  /**
   * Draws the per-student rows table. Columns adapt to the report variant:
   * the university report shows the Course column, the intake report shows the
   * University column (mirrors the two legacy mPDF templates).
   */
  private drawTable(
    doc: PDFKit.PDFDocument,
    rows: Array<{
      name: string | null;
      email: string | null;
      university_name: string | null;
      course_name: string | null;
      session_title: string | null;
      consultant_name: string | null;
      enrollment_date: Date | null;
      status_label: string;
    }>,
    midColumn: 'course' | 'university',
    startY: number,
  ): void {
    const left = EnrollmentPdfService.PAGE_MARGIN;
    // Column x-offsets tuned for an A4 page (width ~ 495 usable).
    const cols = {
      name: left,
      email: left + 110,
      mid: left + 230,
      session: left + 330,
      date: left + 410,
    };

    const header = () => {
      doc.fillColor(EnrollmentPdfService.MUTED).font('Helvetica-Bold').fontSize(8);
      doc.text('NAME', cols.name, y);
      doc.text('EMAIL', cols.email, y);
      doc.text(midColumn === 'course' ? 'COURSE' : 'UNIVERSITY', cols.mid, y);
      doc.text('SESSION', cols.session, y);
      doc.text('ENROLLED', cols.date, y);
      y += 14;
      this.divider(doc, y - 2);
    };

    let y = startY;
    header();

    doc.font('Helvetica').fontSize(8).fillColor(EnrollmentPdfService.INK);

    if (rows.length === 0) {
      doc
        .fillColor(EnrollmentPdfService.MUTED)
        .text('No enrollments found for this report.', left, y);
      return;
    }

    for (const row of rows) {
      // page-break guard — restart the column header on the new page
      if (y > doc.page.height - 90) {
        doc.addPage();
        y = EnrollmentPdfService.PAGE_MARGIN;
        header();
        doc.font('Helvetica').fontSize(8).fillColor(EnrollmentPdfService.INK);
      }

      const mid =
        midColumn === 'course' ? row.course_name : row.university_name;

      doc.fillColor(EnrollmentPdfService.INK);
      doc.text(this.text(row.name), cols.name, y, { width: 105 });
      doc.text(this.text(row.email), cols.email, y, { width: 115 });
      doc.text(this.text(mid), cols.mid, y, { width: 95 });
      doc.text(this.text(row.session_title), cols.session, y, { width: 75 });
      doc.text(this.formatDate(row.enrollment_date), cols.date, y, { width: 85 });
      y += 16;
    }
  }

  // ---- university report ---------------------------------------------------

  /**
   * Builds the university enrollment-report PDF for `universityId`, pipes it to
   * `res`, and ends the document. Ports print_university_report().
   */
  async streamUniversityReport(universityId: number, res: Response): Promise<void> {
    const university = await this.prisma.university.findFirst({
      where: { id: universityId, deleted_at: null },
    });
    if (!university) throw new NotFoundException('University not found!');

    const { counts, rows } = await this.reports.enrollmentRowsForUniversity(
      universityId,
    );

    const doc = new PDFDocument({
      size: 'A4',
      margin: EnrollmentPdfService.PAGE_MARGIN,
    });
    doc.on('error', () => {
      if (!res.headersSent) {
        res
          .status(500)
          .json({ status: false, message: 'Failed to generate PDF', data: null });
      } else {
        res.destroy();
      }
    });
    doc.pipe(res);

    this.drawHeader(
      doc,
      'University Enrollment Report',
      this.text(university.title),
    );

    let y = this.drawSummary(doc, counts, 130);
    y += 8;
    this.divider(doc, y);
    y += 14;

    this.drawTable(doc, rows, 'course', y);

    this.drawFooter(
      doc,
      `This report was generated automatically by ${EnrollmentPdfService.BRAND_NAME}.`,
    );

    doc.end();
  }

  // ---- intake report -------------------------------------------------------

  /**
   * Builds the intake/session enrollment-report PDF for `sessionId`, pipes it to
   * `res`, and ends the document. Ports print_intake_report().
   */
  async streamIntakeReport(sessionId: number, res: Response): Promise<void> {
    const session = await this.prisma.sessions.findFirst({
      where: { session_id: sessionId, deleted_at: null },
    });
    if (!session) throw new NotFoundException('Session not found!');

    const { counts, rows } =
      await this.reports.enrollmentRowsForSession(sessionId);

    const doc = new PDFDocument({
      size: 'A4',
      margin: EnrollmentPdfService.PAGE_MARGIN,
    });
    doc.on('error', () => {
      if (!res.headersSent) {
        res
          .status(500)
          .json({ status: false, message: 'Failed to generate PDF', data: null });
      } else {
        res.destroy();
      }
    });
    doc.pipe(res);

    this.drawHeader(
      doc,
      'Intake Enrollment Report',
      this.text(session.session_title),
    );

    let y = this.drawSummary(doc, counts, 130);
    y += 8;
    this.divider(doc, y);
    y += 14;

    this.drawTable(doc, rows, 'university', y);

    this.drawFooter(
      doc,
      `This report was generated automatically by ${EnrollmentPdfService.BRAND_NAME}.`,
    );

    doc.end();
  }
}
