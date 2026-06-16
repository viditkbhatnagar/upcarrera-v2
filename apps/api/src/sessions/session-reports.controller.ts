import { Controller, Get, Query } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { SessionReportQueryDto } from './dto/session-report-query.dto';

/**
 * Teacher session attendance report. Port of Session_report::index().
 *
 * Shares the /reports prefix with the reports + assessments modules, but only on
 * the distinct `sessions` sub-path, so it does not collide with any existing
 * /reports/* route (leads, students, income, followups, enrollments,
 * assessments, homework).
 */
@Controller('reports')
export class SessionReportsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get('sessions')
  @ResponseMessage('Session report fetched successfully!')
  sessions_report(@Query() query: SessionReportQueryDto) {
    return this.sessions.getSessionReport(query);
  }
}
