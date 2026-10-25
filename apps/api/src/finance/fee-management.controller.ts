import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { FinanceService } from './finance.service';
import {
  CreateInstallmentDto,
  UpdateInstallmentDto,
  CreateSpecialFeeDto,
} from './dto/installment.dto';
import {
  FeeManagementListQueryDto,
  PaymentStatusQueryDto,
} from './dto/list.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Fee installment management (CI4 App/Fee_management). Tracks student_payments
 * installments and student_special_fees against the effective course total.
 * Global JwtAuthGuard applies (no @Public). The literal 'installments' list path
 * is declared before 'installments/:id'.
 */
@Controller('fee-management')
export class FeeManagementController {
  constructor(private readonly finance: FinanceService) {}

  // ---- installment status listings -----------------------------------------

  @RequirePermission('crm:finance.view')
  @Get('installments')
  @ResponseMessage('Installments fetched')
  installments(@Query() query: FeeManagementListQueryDto) {
    return this.finance.feeManagementStudents(query);
  }

  @RequirePermission('crm:finance.view')
  @Get('course-fee')
  @ResponseMessage('Course fee status fetched')
  courseFee(@Query() query: FeeManagementListQueryDto) {
    return this.finance.feeManagementStudents(query);
  }

  @RequirePermission('crm:finance.view')
  @Get('payment-status')
  @ResponseMessage('Payment status fetched')
  paymentStatus(@Query() query: PaymentStatusQueryDto) {
    return this.finance.paymentStatus(query);
  }

  // ---- per-student installments --------------------------------------------

  @RequirePermission('crm:finance.view')
  @Get('students/:id/installments')
  @ResponseMessage('Student installments fetched')
  studentInstallments(@Param('id', ParseIntPipe) studentId: number) {
    return this.finance.studentInstallments(studentId);
  }

  @RequirePermission('crm:finance.manage')
  @Post('students/:id/installments')
  @ResponseMessage('Installment added')
  createInstallment(
    @Param('id', ParseIntPipe) studentId: number,
    @Body() dto: CreateInstallmentDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.finance.createInstallment(studentId, dto, userId);
  }

  @RequirePermission('crm:finance.manage')
  @Post('students/:id/special-fee')
  @ResponseMessage('Special fee saved')
  upsertSpecialFee(
    @Param('id', ParseIntPipe) studentId: number,
    @Body() dto: CreateSpecialFeeDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.finance.upsertSpecialFee(studentId, dto, userId);
  }

  // ---- installment row update ----------------------------------------------

  @RequirePermission('crm:finance.manage')
  @Patch('installments/:id')
  @ResponseMessage('Installment updated')
  updateInstallment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInstallmentDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.finance.updateInstallment(id, dto, userId);
  }
}
