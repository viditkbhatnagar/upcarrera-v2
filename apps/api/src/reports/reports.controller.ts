import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService, ReportResult } from './reports.service';
import {
  FollowupReportQueryDto,
  ReportQueryDto,
} from './dto/report-query.dto';
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
  constructor(private readonly reports: ReportsService) {}

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
}
