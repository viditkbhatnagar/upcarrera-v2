import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { CreateCandidateDocumentDto } from './dto/create-candidate-document.dto';
import { UpdateCandidateDocumentDto } from './dto/update-candidate-document.dto';
import { UploadedFileType } from './uploaded-file.type';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import type { AccessUser } from '../workflow/record-access.service';

/**
 * Candidate (lead) document management.
 *
 * Port of CI4 App/Controllers/App/Upload_document — a "candidate" is a leads
 * row, and documents live in `student_document` keyed on the linkage column that
 * exists in this migration's schema, `application_id` (see FilesService for the
 * full schema-mapping note). Protected by the global JwtAuthGuard (no @Public).
 *
 * Multipart uploads use FileInterceptor('file') with multer's default memory
 * handling (the same mechanism FilesController already relies on); the scalar
 * fields are validated by the *CandidateDocumentDto. The {status,message,data}
 * envelope is added automatically by ResponseInterceptor.
 *
 * ROUTE ORDER: the literal `documents/:id` mutate routes are declared BEFORE the
 * `:id/documents` param routes so the literal `documents` segment wins routing.
 */
@Controller('candidates')
export class CandidatesDocumentsController {
  constructor(private readonly files: FilesService) {}

  // --- literal `documents/:id` routes first (route-order safety) ---

  // The :id here is the DOCUMENT id, so no per-row guard applies: the service
  // resolves the owning application/lead and runs the SAME record-access check as
  // the students/applications document twins (403 out of scope / 404 missing). The
  // permission slug mirrors those twins.
  @Patch('documents/:id')
  @RequirePermission('crm:applications.edit')
  @ResponseMessage('Document Updated Successfully!')
  @UseInterceptors(FileInterceptor('file'))
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCandidateDocumentDto,
    @UploadedFile() file: UploadedFileType,
    @CurrentUser() user: AccessUser,
  ) {
    return this.files.updateCandidateDocument(id, dto, user, file);
  }

  @Delete('documents/:id')
  @RequirePermission('crm:applications.edit')
  @ResponseMessage('Document Deleted Successfully!')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AccessUser,
  ) {
    return this.files.deleteCandidateDocument(id, user);
  }

  // --- candidate-scoped `:id/documents` routes (the :id is a LEAD id) ---

  @Get(':id/documents')
  @RequirePermission('crm:applications.view')
  @ResponseMessage('Candidate documents fetched')
  list(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AccessUser,
  ) {
    return this.files.listCandidateDocuments(id, user);
  }

  @Post(':id/documents')
  @RequirePermission('crm:applications.edit')
  @ResponseMessage('Document Added Successfully!')
  @UseInterceptors(FileInterceptor('file'))
  create(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCandidateDocumentDto,
    @UploadedFile() file: UploadedFileType,
    @CurrentUser() user: AccessUser,
  ) {
    return this.files.createCandidateDocument(id, dto, user, file);
  }
}
