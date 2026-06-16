import { Controller, Get, Param, ParseIntPipe, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService, ReportResult } from './reports.service';
import {
  FollowupReportQueryDto,
  ReportQueryDto,
} from './dto/report-query.dto';
import { EnrollmentReportQueryDto } from './dto/enrollment-report-query.dto';
import { TeacherSalaryReportQueryDto } from './dto/teacher-salary-report-query.dto';
import { InvoiceReportQueryDto } from './dto/invoice-report-query.dto';
import { FeePaymentReportQueryDto } from './dto/fee-payment-report-query.dto';
import { CourseReportQueryDto } from './dto/course-report-query.dto';
import { ConsultantPerformanceReportQueryDto } from './dto/consultant-performance-report-query.dto';
import { EnrollmentPdfService } from './enrollment-pdf.service';
import { toCsv } from './reports.csv';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

/**
 * Reporting endpoints. Protected by the global JwtAuthGuard (no @Public).
 *
 * Ports App/Controllers/App/{Lead_report,Students_report,Income_report,
 * Followup_report}.php. Each endpoint returns the standard {status,message,data}
 * envelope as JSON, or a text/csv download when called with ?format=csv.
 */
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly enrollmentPdf: EnrollmentPdfService,
  ) {}

  @Get('leads')
  @ResponseMessage('Lead report')
  leads(@Query() query: ReportQueryDto, @Res({ passthrough: true }) res: Response) {
    return this.respond(query, res, 'leads-report', () =>
      this.reports.leads(query),
    );
  }

  // Declared before any `/leads/:something` param routes (there are none today,
  // but the literal path keeps it unambiguous).
  @Get('leads/by-country')
  @ResponseMessage('Leads by country report')
  leadsByCountry(
    @Query() query: FollowupReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(query, res, 'leads-by-country-report', () =>
      this.reports.leadsByCountry(query),
    );
  }

  @Get('students')
  @ResponseMessage('Student report')
  students(
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(query, res, 'students-report', () =>
      this.reports.students(query),
    );
  }

  @Get('income')
  @ResponseMessage('Income report')
  income(@Query() query: ReportQueryDto, @Res({ passthrough: true }) res: Response) {
    return this.respond(query, res, 'income-report', () =>
      this.reports.income(query),
    );
  }

  @Get('followups')
  @ResponseMessage('Followup report')
  followups(
    @Query() query: FollowupReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(query, res, 'followups-report', () =>
      this.reports.followups(query),
    );
  }

  /**
   * Invoice report — invoice rows in the date window with paid totals + grand
   * totals. Ports Invoice.php::index() (the Invoice_report view's row set).
   * `?from_date=&to_date=&course_id=&student_id=` filter; `?format=csv` downloads.
   * Literal path; no `/reports/:id` catch-all, so it stays unambiguous.
   */
  @Get('invoices')
  @ResponseMessage('Invoice report')
  invoices(
    @Query() query: InvoiceReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respondFormat(query.format, res, 'invoices-report', () =>
      this.reports.invoices(query),
    );
  }

  /**
   * Fee-payment report — student-role users joined to their finance row.
   * Ports Fee_payment_report.php::fee_report(). Filters:
   * `?from_date=&to_date=&university_id=&payment_status=`; `?format=csv` downloads.
   */
  @Get('fee-payment')
  @ResponseMessage('Fee payment report')
  feePayment(
    @Query() query: FeePaymentReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respondFormat(query.format, res, 'fee-payment-report', () =>
      this.reports.feePayment(query),
    );
  }

  /**
   * Fee report — variant of fee-payment with the same filters/shape. Ports
   * Reports.php::fee_report() (an identical body to Fee_payment_report's). Kept
   * as a distinct literal path so both legacy report URLs map cleanly.
   */
  @Get('fee')
  @ResponseMessage('Fee report')
  fee(
    @Query() query: FeePaymentReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respondFormat(query.format, res, 'fee-report', () =>
      this.reports.feePayment(query),
    );
  }

  /**
   * Course report — courses in the created_at window with active/inactive
   * counts. Ports Fee_payment_report.php::course_wise_report(). Filters:
   * `?from_date=&to_date=&level=`; `?format=csv` downloads.
   */
  @Get('courses')
  @ResponseMessage('Course report')
  courses(
    @Query() query: CourseReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respondFormat(query.format, res, 'courses-report', () =>
      this.reports.courses(query),
    );
  }

  /**
   * Consultant performance report — consultants with student counts + revenue.
   * Ports Reports.php::consultant_performance_report(). Filters:
   * `?search_key=&status=&university=`; `?format=csv` downloads.
   */
  @Get('consultant-performance')
  @ResponseMessage('Consultant performance report')
  consultantPerformance(
    @Query() query: ConsultantPerformanceReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respondFormat(
      query.format,
      res,
      'consultant-performance-report',
      () => this.reports.consultantPerformance(query),
    );
  }

  /**
   * Per-teacher salary report for a calendar month (port of
   * Teacher_salary_report.php). `?month=YYYY-MM` selects the window (defaults to
   * the current month); `?format=csv` downloads. Declared before the enrollment
   * block; there is no `/reports/:id` catch-all, so this literal stays
   * unambiguous.
   */
  @Get('teacher-salary')
  @ResponseMessage('Teacher salary report')
  teacherSalary(
    @Query() query: TeacherSalaryReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respondEnrollment(res, 'teacher-salary-report', () =>
      this.reports.teacherSalary(query),
    );
  }

  // ---- enrollment reports --------------------------------------------------
  //
  // ROUTE ORDER: the literal multi-segment enrollment routes
  // (university-wise / intake-wise / university/:id/pdf / intake/:id/pdf) are
  // declared BEFORE the base `enrollments` route so the literal segments are
  // never swallowed by a sibling param route. There is no `/reports/:id`
  // catch-all in this controller, so they stay unambiguous.

  @Get('enrollments/university-wise')
  @ResponseMessage('University-wise enrollment report')
  enrollmentsUniversityWise(
    @Query() query: EnrollmentReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respondEnrollment(
      res,
      'enrollments-university-wise-report',
      () => this.reports.enrollmentsUniversityWise(query),
    );
  }

  @Get('enrollments/intake-wise')
  @ResponseMessage('Intake-wise enrollment report')
  enrollmentsIntakeWise(
    @Query() query: EnrollmentReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respondEnrollment(
      res,
      'enrollments-intake-wise-report',
      () => this.reports.enrollmentsIntakeWise(query),
    );
  }

  /**
   * Streams the university enrollment report as a PDF. Mirrors the finance PDF
   * endpoints: passthrough:false, headers set here, the service pipes the doc.
   * Ports Enrollment.php::print_university_report().
   */
  @Get('enrollments/university/:id/pdf')
  async enrollmentUniversityPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="enrollment-university-${id}.pdf"`,
    );
    await this.enrollmentPdf.streamUniversityReport(id, res);
  }

  /**
   * Streams the intake/session enrollment report as a PDF. Ports
   * Enrollment.php::print_intake_report().
   */
  @Get('enrollments/intake/:id/pdf')
  async enrollmentIntakePdf(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="enrollment-intake-${id}.pdf"`,
    );
    await this.enrollmentPdf.streamIntakeReport(id, res);
  }

  @Get('enrollments')
  @ResponseMessage('Enrollment report')
  enrollments(
    @Query() query: EnrollmentReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respondEnrollment(res, 'enrollments-report', () =>
      this.reports.enrollments(query),
    );
  }

  /**
   * Shared response shaper. For `?format=csv` it writes a text/csv attachment
   * directly to the Express response (bypassing the {status,message,data}
   * envelope) and returns undefined. Otherwise it returns the structured `data`
   * which the global ResponseInterceptor wraps in the legacy envelope.
   */
  private async respond<T>(
    query: ReportQueryDto,
    res: Response,
    filename: string,
    run: () => Promise<ReportResult<T>>,
  ): Promise<T | undefined> {
    const result = await run();

    if (query.format === 'csv') {
      const csv = toCsv(result.csv.rows, result.csv.headers);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}.csv"`,
      );
      res.send(csv);
      return undefined;
    }

    return result.data;
  }

  /**
   * Response shaper for the new report endpoints whose DTOs each declare their
   * own `format` field (invoices / fee-payment / fee / courses /
   * consultant-performance). Identical contract to `respond` but takes the
   * format value directly so it works across the differently-typed DTOs without
   * widening any of them. `csv` writes a text/csv attachment and returns
   * undefined; otherwise the structured `data` flows to the ResponseInterceptor.
   */
  private async respondFormat<T>(
    format: 'json' | 'csv' | undefined,
    res: Response,
    filename: string,
    run: () => Promise<ReportResult<T>>,
  ): Promise<T | undefined> {
    const result = await run();

    if (format === 'csv') {
      const csv = toCsv(result.csv.rows, result.csv.headers);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}.csv"`,
      );
      res.send(csv);
      return undefined;
    }

    return result.data;
  }

  /**
   * Response shaper for the enrollment endpoints. EnrollmentReportQueryDto has
   * no `format` field of its own, but the underlying ReportResult still carries
   * flattened CSV rows, so a `?format=csv` query (parsed loosely from the raw
   * request) yields a CSV download; otherwise the structured `data` is returned
   * for the global ResponseInterceptor to wrap in the legacy envelope.
   */
  private async respondEnrollment<T>(
    res: Response,
    filename: string,
    run: () => Promise<ReportResult<T>>,
  ): Promise<T | undefined> {
    const result = await run();

    // `format` isn't a typed DTO field here; read it off the live request so the
    // CSV affordance still works without widening EnrollmentReportQueryDto.
    const format = res.req?.query?.format;
    if (format === 'csv') {
      const csv = toCsv(result.csv.rows, result.csv.headers);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}.csv"`,
      );
      res.send(csv);
      return undefined;
    }

    return result.data;
  }
}
