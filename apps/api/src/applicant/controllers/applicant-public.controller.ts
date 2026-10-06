import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import type { UploadedFileType } from '../../files/uploaded-file.type';
import { contentDisposition } from '../../files/content-disposition';
import { ApplicantSessionGuard } from '../applicant-session.guard';
import { ApplicantThrottlerGuard } from '../throttler/applicant-throttler.guard';
import {
  THROTTLE_READ,
  THROTTLE_REFRESH,
  THROTTLE_SUBMIT,
  THROTTLE_UPLOAD,
  THROTTLE_WRITE,
} from '../throttler/applicant-throttle';
import { CurrentApplicant, ApplicantContext } from '../applicant-context';
import { PublicSessionService } from '../public-session.service';
import { ApplicationFormService } from '../application-form.service';
import { ApplicationDocumentsService } from '../application-documents.service';
import { ApplicantLookupsService } from '../applicant-lookups.service';
import {
  ProgramConfirmDto,
  SaveSectionDto,
  SubmitApplicationDto,
  UploadDocumentDto,
} from '../dto/public-form.dto';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Route-local pipe: STRICTER than the global one (rejects unknown envelope keys). */
const strictPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

/**
 * The authenticated public applicant surface. Guard order is
 * [ApplicantSessionGuard, ApplicantThrottlerGuard]: the session is re-validated
 * (link re-read) on EVERY request, then throttled PER SESSION. No application id
 * is ever accepted from the URL — it comes only from the validated session.
 */
@Public()
@Controller('public/application')
@UseGuards(ApplicantSessionGuard, ApplicantThrottlerGuard)
export class ApplicantPublicController {
  constructor(
    private readonly sessions: PublicSessionService,
    private readonly form: ApplicationFormService,
    private readonly documents: ApplicationDocumentsService,
    private readonly lookups: ApplicantLookupsService,
  ) {}

  @Post('session/refresh')
  @HttpCode(200)
  @Throttle(THROTTLE_REFRESH)
  @ResponseMessage('Session refreshed')
  refresh(@CurrentApplicant() applicant: ApplicantContext) {
    return this.sessions.refresh(applicant);
  }

  @Get()
  @Throttle(THROTTLE_READ)
  @ResponseMessage('Application fetched')
  read(@CurrentApplicant() applicant: ApplicantContext) {
    return this.form.publicRead(applicant);
  }

  @Get('lookups')
  @Throttle(THROTTLE_READ)
  @ResponseMessage('Lookups fetched')
  getLookups() {
    return this.lookups.getAll();
  }

  @Put('sections/:section')
  @Throttle(THROTTLE_WRITE)
  @UsePipes(strictPipe)
  @ResponseMessage('Section saved')
  saveSection(
    @CurrentApplicant() applicant: ApplicantContext,
    @Param('section') section: string,
    @Body() dto: SaveSectionDto,
    @Ip() ip: string,
  ) {
    this.assertNoHoneypot(dto.website);
    return this.form.saveSectionPublic(
      applicant,
      section,
      { data: dto.data, complete: dto.complete, row_version: dto.row_version },
      ip ?? null,
    );
  }

  @Post('program/confirm')
  @Throttle(THROTTLE_WRITE)
  @UsePipes(strictPipe)
  @ResponseMessage('Program confirmed')
  confirmProgram(
    @CurrentApplicant() applicant: ApplicantContext,
    @Body() dto: ProgramConfirmDto,
    @Ip() ip: string,
  ) {
    this.assertNoHoneypot(dto.website);
    return this.form.confirmProgram(applicant, dto, ip ?? null);
  }

  @Post('documents')
  @Throttle(THROTTLE_UPLOAD)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 6 } }),
  )
  @UsePipes(strictPipe)
  @ResponseMessage('Document uploaded')
  uploadDocument(
    @CurrentApplicant() applicant: ApplicantContext,
    @UploadedFile() file: UploadedFileType,
    @Body() dto: UploadDocumentDto,
    @Ip() ip: string,
  ) {
    this.assertNoHoneypot(dto.website);
    return this.documents.upload(applicant, file, dto.requirement_id, ip ?? null);
  }

  @Delete('documents/:docId')
  @Throttle(THROTTLE_WRITE)
  @ResponseMessage('Document removed')
  deleteDocument(
    @CurrentApplicant() applicant: ApplicantContext,
    @Param('docId', ParseIntPipe) docId: number,
  ) {
    return this.documents.remove(applicant, docId);
  }

  @Get('documents/:docId/file')
  @Throttle(THROTTLE_READ)
  async downloadOwnDocument(
    @CurrentApplicant() applicant: ApplicantContext,
    @Param('docId', ParseIntPipe) docId: number,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, mime, filename } = await this.documents.streamOwn(applicant, docId);
    this.sendFile(res, stream, mime, filename);
  }

  @Post('submit')
  @Throttle(THROTTLE_SUBMIT)
  @UsePipes(strictPipe)
  @ResponseMessage('Application submitted')
  submit(
    @CurrentApplicant() applicant: ApplicantContext,
    @Body() dto: SubmitApplicationDto,
    @Ip() ip: string,
  ) {
    this.assertNoHoneypot(dto.website);
    return this.form.submit(applicant, dto, ip ?? null);
  }

  // ---- helpers -------------------------------------------------------------

  private assertNoHoneypot(website: string | undefined): void {
    if (website != null && website !== '') {
      // Silently reject a bot without revealing the honeypot.
      throw new BadRequestException('Your request could not be processed.');
    }
  }

  private sendFile(
    res: Response,
    stream: NodeJS.ReadableStream,
    mime: string,
    filename: string,
  ): void {
    res.set({
      'Content-Type': mime,
      // SECURITY LOW 6: header-safe disposition for a student-supplied filename.
      'Content-Disposition': contentDisposition(filename, 'inline'),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox',
      'Cache-Control': 'no-store',
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
}
