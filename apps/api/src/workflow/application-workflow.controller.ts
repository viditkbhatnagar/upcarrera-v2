import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import type { UploadedFileType } from '../files/uploaded-file.type';
import { ApplicationAccessGuard } from './application-access.guard';
import { ApplicationWorkflowService } from './application-workflow.service';
import { ApplicationPaymentsService } from './application-payments.service';
import { SaReviewService } from './sa-review.service';
import type { AccessUser } from './record-access.service';
import {
  AcceptApplicationDto,
  ReopenApplicationDto,
  HoldApplicationDto,
  ResumeApplicationDto,
  ReviewDocumentDto,
  SaReviewDto,
} from './dto/workflow-action.dto';
import { CorrectApplicationDto } from './dto/correct-application.dto';
import { RecordPaymentDto } from './dto/application-payment.dto';

/**
 * The Phase 1 workflow actions and detail reads on an application. Every :id route
 * carries the ApplicationAccessGuard (404 missing / 403 out of scope) plus the
 * crm: permission the stage owner needs. Lives alongside the existing
 * ApplicationsController; the paths never collide (all are 2+ segments after :id).
 */
@Controller('applications')
@UseGuards(ApplicationAccessGuard)
export class ApplicationWorkflowController {
  constructor(
    private readonly workflow: ApplicationWorkflowService,
    private readonly payments: ApplicationPaymentsService,
    private readonly saReview: SaReviewService,
  ) {}

  // ---- detail reads --------------------------------------------------------

  @Get(':id/timeline')
  @RequirePermission('crm:applications.view')
  @ResponseMessage('Application timeline fetched')
  timeline(@Param('id', ParseIntPipe) id: number) {
    return this.workflow.timeline(id);
  }

  @Get(':id/documents')
  @RequirePermission('crm:applications.view')
  @ResponseMessage('Application documents fetched')
  documents(@Param('id', ParseIntPipe) id: number) {
    return this.workflow.documents(id);
  }

  @Get(':id/payments')
  @RequirePermission('crm:applications.view')
  @ResponseMessage('Application payments fetched')
  paymentsList(@Param('id', ParseIntPipe) id: number) {
    return this.workflow.payments(id);
  }

  // ---- counsellor stage actions --------------------------------------------

  // Early funnel (interim, owner/admin until the magic link lands): make stages
  // 1-2 reachable by hand. lead_added -> form_pending -> counsellor_review.
  @Post(':id/send-form')
  @RequirePermission('crm:applications.edit')
  @ResponseMessage('Form marked as sent')
  sendForm(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AccessUser,
  ) {
    return this.workflow.sendForm(id, user);
  }

  @Post(':id/mark-form-received')
  @RequirePermission('crm:applications.edit')
  @ResponseMessage('Form marked as received')
  markFormReceived(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AccessUser,
  ) {
    return this.workflow.markFormReceived(id, user);
  }

  @Post(':id/accept')
  @RequirePermission('crm:applications.edit')
  @ResponseMessage('Application accepted')
  accept(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AcceptApplicationDto,
    @CurrentUser() user: AccessUser,
  ) {
    return this.workflow.accept(id, dto, user);
  }

  @Post(':id/reopen')
  @RequirePermission('crm:applications.edit')
  @ResponseMessage('Application reopened')
  reopen(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReopenApplicationDto,
    @CurrentUser() user: AccessUser,
  ) {
    return this.workflow.reopen(id, dto, user);
  }

  @Patch(':id/corrections')
  @RequirePermission('crm:applications.review')
  @ResponseMessage('Application corrected')
  correct(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CorrectApplicationDto,
    @CurrentUser() user: AccessUser,
  ) {
    return this.workflow.correct(id, dto, user);
  }

  @Post(':id/hold')
  @RequirePermission('crm:applications.hold')
  @ResponseMessage('Application put on hold')
  hold(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: HoldApplicationDto,
    @CurrentUser() user: AccessUser,
  ) {
    return this.workflow.hold(id, dto, user);
  }

  @Post(':id/resume')
  @RequirePermission('crm:applications.hold')
  @ResponseMessage('Application resumed')
  resume(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResumeApplicationDto,
    @CurrentUser() user: AccessUser,
  ) {
    return this.workflow.resume(id, dto, user);
  }

  // ---- registration fee (counsellor records) -------------------------------

  @Post(':id/payments')
  @RequirePermission('crm:application-payments.create')
  @UseInterceptors(FileInterceptor('proof'))
  @ResponseMessage('Registration fee recorded')
  recordPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordPaymentDto,
    @UploadedFile() file: UploadedFileType,
    @CurrentUser() user: AccessUser,
  ) {
    return this.payments.record(id, dto, file, user);
  }

  // ---- Student Affairs -----------------------------------------------------

  @Post(':id/documents/:documentId/review')
  @RequirePermission('crm:application-documents.review')
  @ResponseMessage('Document reviewed')
  reviewDocument(
    @Param('id', ParseIntPipe) id: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Body() dto: ReviewDocumentDto,
    @CurrentUser() user: AccessUser,
  ) {
    return this.saReview.reviewDocument(id, documentId, dto, user);
  }

  @Post(':id/sa-review')
  @RequirePermission('crm:applications.approve')
  @ResponseMessage('Student Affairs review recorded')
  saReviewDecide(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaReviewDto,
    @CurrentUser() user: AccessUser,
  ) {
    return this.saReview.decide(id, dto, user);
  }
}
