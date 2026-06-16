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

  @Get('installments')
  @ResponseMessage('Installments fetched')
  installments(@Query() query: FeeManagementListQueryDto) {
    return this.finance.feeManagementStudents(query);
  }

  @Get('course-fee')
  @ResponseMessage('Course fee status fetched')
  courseFee(@Query() query: FeeManagementListQueryDto) {
    return this.finance.feeManagementStudents(query);
  }

  @Get('payment-status')
  @ResponseMessage('Payment status fetched')
  paymentStatus(@Query() query: PaymentStatusQueryDto) {
    return this.finance.paymentStatus(query);
  }

  // ---- per-student installments --------------------------------------------

  @Get('students/:id/installments')
  @ResponseMessage('Student installments fetched')
  studentInstallments(@Param('id', ParseIntPipe) studentId: number) {
    return this.finance.studentInstallments(studentId);
  }

  @Post('students/:id/installments')
  @ResponseMessage('Installment added')
  createInstallment(
    @Param('id', ParseIntPipe) studentId: number,
    @Body() dto: CreateInstallmentDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.finance.createInstallment(studentId, dto, userId);
  }

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
