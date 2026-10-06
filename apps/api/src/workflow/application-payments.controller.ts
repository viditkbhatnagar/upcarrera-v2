import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { ApplicationPaymentsService } from './application-payments.service';
import { contentDisposition } from '../files/content-disposition';
import type { AccessUser } from './record-access.service';
import {
  ListApplicationPaymentsDto,
  VerifyPaymentDto,
  MismatchPaymentDto,
} from './dto/application-payment.dto';

/**
 * The Accounts registration-fee queue and verification (stage 5). The queue is
 * permission-gated (crm:application-payments.index) and shows EVERY entry so
 * Accounts keeps its history; the proof stream additionally admits the owning
 * counsellor, via the parent application's scope.
 */
@Controller('application-payments')
export class ApplicationPaymentsController {
  constructor(private readonly payments: ApplicationPaymentsService) {}

  @Get()
  @RequirePermission('crm:application-payments.index')
  @ResponseMessage('Registration fee queue fetched')
  queue(@Query() query: ListApplicationPaymentsDto) {
    return this.payments.queue(query);
  }

  /**
   * Streams the proof file (never a public path). Auth is handled in the service:
   * Accounts / Admin see all; the owning counsellor sees their own. Takes control
   * of the response with a non-passthrough @Res(), bypassing the global
   * ResponseInterceptor; lookup/403 errors are thrown before any byte is written.
   */
  @Get(':id/proof')
  async proof(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AccessUser,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, filename, contentType } = await this.payments.proofStream(id, user);
    res.set({
      'Content-Type': contentType,
      // SECURITY LOW 6: header-safe disposition for a counsellor-supplied filename.
      'Content-Disposition': contentDisposition(filename, 'inline'),
    });
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({ status: false, message: 'Failed to read file', data: null });
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
  }

  @Post(':id/verify')
  @RequirePermission('crm:application-payments.verify')
  @ResponseMessage('Payment verified')
  verify(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VerifyPaymentDto,
    @CurrentUser() user: AccessUser,
  ) {
    return this.payments.verify(id, dto, user);
  }

  @Post(':id/mismatch')
  @RequirePermission('crm:application-payments.verify')
  @ResponseMessage('Payment marked as mismatch')
  mismatch(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MismatchPaymentDto,
    @CurrentUser() user: AccessUser,
  ) {
    return this.payments.mismatch(id, dto, user);
  }
}
