import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { FinanceService } from './finance.service';
import { CreateInvoiceDto, UpdateInvoiceDto } from './dto/invoice.dto';
import { CreatePaymentDto } from './dto/payment.dto';
import { CreateFeeTypeDto } from './dto/fee-type.dto';
import {
  ListInvoicesDto,
  ListPaymentsDto,
  ListFeeTypesDto,
  ListCommissionPlansDto,
} from './dto/list.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

/**
 * Staff finance endpoints — invoices, payments, fee types, commission plans.
 * All routes are protected by the global JwtAuthGuard (no @Public here).
 * The {status,message,data} envelope is applied automatically by ResponseInterceptor.
 */
@Controller()
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  // ---- invoices ------------------------------------------------------------

  @Get('invoices')
  @ResponseMessage('Invoices fetched')
  listInvoices(@Query() query: ListInvoicesDto) {
    return this.finance.listInvoices(query);
  }

  @Get('invoices/:id')
  @ResponseMessage('Invoice fetched')
  getInvoice(@Param('id', ParseIntPipe) id: number) {
    return this.finance.getInvoice(id);
  }

  @Post('invoices')
  @ResponseMessage('Invoice created')
  createInvoice(@Body() dto: CreateInvoiceDto) {
    return this.finance.createInvoice(dto);
  }

  @Patch('invoices/:id')
  @ResponseMessage('Invoice updated')
  updateInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.finance.updateInvoice(id, dto);
  }

  @Delete('invoices/:id')
  @ResponseMessage('Invoice deleted')
  deleteInvoice(@Param('id', ParseIntPipe) id: number) {
    return this.finance.deleteInvoice(id);
  }

  // ---- payments ------------------------------------------------------------

  @Get('payments')
  @ResponseMessage('Payments fetched')
  listPayments(@Query() query: ListPaymentsDto) {
    return this.finance.listPayments(query);
  }

  @Get('payments/:id')
  @ResponseMessage('Payment fetched')
  getPayment(@Param('id', ParseIntPipe) id: number) {
    return this.finance.getPayment(id);
  }

  // Records a manual payment row (cash/cheque/bank). Does NOT call Razorpay.
  @Post('payments')
  @ResponseMessage('Payment recorded')
  createPayment(@Body() dto: CreatePaymentDto) {
    return this.finance.createPayment(dto);
  }

  // ---- fee types -----------------------------------------------------------

  @Get('fee-types')
  @ResponseMessage('Fee types fetched')
  listFeeTypes(@Query() query: ListFeeTypesDto) {
    return this.finance.listFeeTypes(query);
  }

  @Post('fee-types')
  @ResponseMessage('Fee type created')
  createFeeType(@Body() dto: CreateFeeTypeDto) {
    return this.finance.createFeeType(dto);
  }

  // ---- commission plans ----------------------------------------------------

  @Get('commission-plans')
  @ResponseMessage('Commission plans fetched')
  listCommissionPlans(@Query() query: ListCommissionPlansDto) {
    return this.finance.listCommissionPlans(query);
  }
}
