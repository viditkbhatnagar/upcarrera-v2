import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import type { AccessUser } from '../workflow/record-access.service';
import { ListPaymentsDto } from './dto/list-payments.dto';
import { PaymentsService } from './payments.service';

/**
 * Counsellor Payments. Scoped server-side to the caller's own students (see
 * PaymentsService); the slug is granted to the counsellor and admin roles.
 */
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermission('crm:payments.index')
  @ResponseMessage('Payments fetched')
  list(@CurrentUser() user: AccessUser, @Query() query: ListPaymentsDto) {
    return this.payments.list(user, query);
  }

  @Get(':id')
  @RequirePermission('crm:payments.index')
  @ResponseMessage('Payment record fetched')
  detail(@CurrentUser() user: AccessUser, @Param('id', ParseIntPipe) id: number) {
    return this.payments.detail(user, id);
  }
}
