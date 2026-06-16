import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { FinanceService } from './finance.service';
import {
  FeeStatusQueryDto,
  StudentCommissionQueryDto,
  UniversityCommissionReportQueryDto,
  FinanceStudentsQueryDto,
} from './dto/list.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

/**
 * Finance reporting surface (CI4 App/Finance + App/Fee read screens):
 *   - fee-status, student-commission, university-commission rollups
 *   - finance students list + single student view
 * Global JwtAuthGuard applies (no @Public). Literal sub-paths are declared
 * before 'students/:id' to keep route resolution unambiguous.
 */
@Controller('finance')
export class FinanceReportController {
  constructor(private readonly finance: FinanceService) {}

  @Get('fee-status')
  @ResponseMessage('Fee status fetched')
  feeStatus(@Query() query: FeeStatusQueryDto) {
    return this.finance.feeStatus(query);
  }

  @Get('student-commission')
  @ResponseMessage('Student commission fetched')
  studentCommission(@Query() query: StudentCommissionQueryDto) {
    return this.finance.studentCommission(query);
  }

  @Get('university-commission')
  @ResponseMessage('University commission fetched')
  universityCommission(@Query() query: UniversityCommissionReportQueryDto) {
    return this.finance.universityCommissionReport(query);
  }

  // Literal list path — declared above 'students/:id'.
  @Get('students')
  @ResponseMessage('Finance students fetched')
  financeStudents(@Query() query: FinanceStudentsQueryDto) {
    return this.finance.financeStudents(query);
  }

  @Get('students/:id')
  @ResponseMessage('Finance student fetched')
  financeStudent(@Param('id', ParseIntPipe) id: number) {
    return this.finance.financeStudent(id);
  }
}
