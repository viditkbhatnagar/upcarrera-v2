import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { UniversityCommissionListQueryDto } from './dto/list.dto';
import { CollectUniversityCommissionDto } from './dto/university-commission.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * University commission collection (CI4 App/University_commission).
 * GET lists role_id=4 students for a university; POST /collect accumulates the
 * collected commission onto the invoice. Global JwtAuthGuard applies.
 */
@Controller('university-commission')
export class UniversityCommissionController {
  constructor(private readonly finance: FinanceService) {}

  @Get()
  @ResponseMessage('University commission students fetched')
  list(@Query() query: UniversityCommissionListQueryDto) {
    return this.finance.universityCommissionStudents(query);
  }

  @Post('collect')
  @ResponseMessage('University commission collected')
  collect(
    @Body() dto: CollectUniversityCommissionDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.finance.collectUniversityCommission(dto, userId);
  }
}
