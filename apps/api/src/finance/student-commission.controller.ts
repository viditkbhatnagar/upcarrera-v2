import {
  Body,
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { FinanceService } from './finance.service';
import {
  CreateCommissionPlanDto,
  UpdateCommissionPlanDto,
  UpdateAmountReceivedDto,
  UpdateUpcarreraCommissionDto,
} from './dto/commission-plan.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Student-scoped commission endpoints. Shares the 'students' prefix with the
 * core StudentsController — this is allowed because NO exact method+path
 * duplicates exist:
 *   - the literal 'students/commission-plan/...' paths are 2+ segments and never
 *     collide with the core 'students/:id' (1 segment) routes.
 *   - 'students/:id/commission-plan' and 'students/:id/upcarrera-commission'
 *     are distinct 3-segment paths the core controller does not define.
 *
 * Ported from CI4 App/Fee (commission_plan CRUD + upcarrera commission).
 * Global JwtAuthGuard applies (no @Public).
 */
@Controller('students')
export class StudentCommissionController {
  constructor(private readonly finance: FinanceService) {}

  // ---- literal 'commission-plan' sub-paths (kept above ':id' shapes) --------

  // PATCH /students/commission-plan/:id/amount-received — most specific first.
  @Patch('commission-plan/:id/amount-received')
  @ResponseMessage('Commission amount received updated')
  updateAmountReceived(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAmountReceivedDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.finance.updateCommissionAmountReceived(id, dto, userId);
  }

  @Patch('commission-plan/:id')
  @ResponseMessage('Commission plan updated')
  updateCommissionPlan(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCommissionPlanDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.finance.updateCommissionPlan(id, dto, userId);
  }

  @Delete('commission-plan/:id')
  @ResponseMessage('Commission plan deleted')
  deleteCommissionPlan(@Param('id', ParseIntPipe) id: number) {
    return this.finance.deleteCommissionPlan(id);
  }

  // ---- student-scoped (':id/...') ------------------------------------------

  @Post(':id/commission-plan')
  @ResponseMessage('Commission plan created')
  createCommissionPlan(
    @Param('id', ParseIntPipe) studentId: number,
    @Body() dto: CreateCommissionPlanDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.finance.createCommissionPlan(studentId, dto, userId);
  }

  @Patch(':id/upcarrera-commission')
  @ResponseMessage('Upcarrera commission updated')
  updateUpcarreraCommission(
    @Param('id', ParseIntPipe) studentId: number,
    @Body() dto: UpdateUpcarreraCommissionDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.finance.updateUpcarreraCommission(studentId, dto, userId);
  }
}
