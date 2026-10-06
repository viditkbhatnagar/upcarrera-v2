import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApplicationAccessGuard } from '../../workflow/application-access.guard';
import type { AccessUser } from '../../workflow/record-access.service';
import { MagicLinkService } from '../magic-link.service';
import { ApplicationFormService } from '../application-form.service';
import { ApplicationDocumentsService } from '../application-documents.service';
import { contentDisposition } from '../../files/content-disposition';
import { IssueMagicLinkDto, ReopenFormDto, StaffSectionPatchDto } from '../dto/staff-form.dto';

/**
 * Staff endpoints for the magic link and the application form. Every :id route
 * carries the record-level ApplicationAccessGuard (404 missing / 403 out of scope)
 * plus a crm: permission. Lives alongside ApplicationsController /
 * ApplicationWorkflowController under the same /applications prefix; the paths
 * never collide (magic-link / form / documents/:docId/file are all distinct).
 */
@Controller('applications')
@UseGuards(ApplicationAccessGuard)
export class ApplicationsFormController {
  constructor(
    private readonly magicLinks: MagicLinkService,
    private readonly form: ApplicationFormService,
    private readonly documents: ApplicationDocumentsService,
  ) {}

  // ---- magic link ----------------------------------------------------------

  @Post(':id/magic-link')
  @RequirePermission('crm:applications.magic-link')
  @ResponseMessage('Magic link sent')
  issueLink(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IssueMagicLinkDto,
    @CurrentUser() user: AccessUser,
  ) {
    return this.magicLinks.issueFromStaff(id, dto, user);
  }

  @Get(':id/magic-link')
  @RequirePermission('crm:applications.view')
  @ResponseMessage('Magic link status fetched')
  linkStatus(@Param('id', ParseIntPipe) id: number) {
    return this.magicLinks.status(id);
  }

  @Delete(':id/magic-link')
  @RequirePermission('crm:applications.magic-link')
  @ResponseMessage('Magic link revoked')
  revokeLink(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AccessUser) {
    return this.magicLinks.revoke(id, user);
  }

  // ---- form read / correct / reopen ---------------------------------------

  @Get(':id/form')
  @RequirePermission('crm:applications.view')
  @ResponseMessage('Application form fetched')
  getForm(@Param('id', ParseIntPipe) id: number) {
    return this.form.staffRead(id);
  }

  @Patch(':id/form/:section')
  @RequirePermission('crm:applications.review')
  @ResponseMessage('Application form updated')
  patchSection(
    @Param('id', ParseIntPipe) id: number,
    @Param('section') section: string,
    @Body() dto: StaffSectionPatchDto,
    @CurrentUser() user: AccessUser,
  ) {
    return this.form.staffPatchSection(
      id,
      section,
      { data: dto.data, row_version: dto.row_version },
      user,
    );
  }

  @Post(':id/form/reopen')
  @RequirePermission('crm:applications.review')
  @ResponseMessage('Form reopened for the student')
  reopen(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReopenFormDto,
    @CurrentUser() user: AccessUser,
  ) {
    return this.form.reopen(id, dto.reason, user);
  }

  // ---- scoped document stream ---------------------------------------------

  @Get(':id/documents/:docId/file')
  @RequirePermission('crm:applications.view')
  async downloadDocument(
    @Param('id', ParseIntPipe) id: number,
    @Param('docId', ParseIntPipe) docId: number,
    @CurrentUser() user: AccessUser,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, mime, filename } = await this.documents.streamForStaff(id, docId, user);
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
