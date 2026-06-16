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

  @Patch('documents/:id')
  @ResponseMessage('Document Updated Successfully!')
  @UseInterceptors(FileInterceptor('file'))
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCandidateDocumentDto,
    @UploadedFile() file: UploadedFileType,
    @CurrentUser('id') userId: number,
  ) {
    return this.files.updateCandidateDocument(id, dto, userId, file);
  }

  @Delete('documents/:id')
  @ResponseMessage('Document Deleted Successfully!')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.files.deleteCandidateDocument(id, userId);
  }

  // --- candidate-scoped `:id/documents` routes ---

  @Get(':id/documents')
  @ResponseMessage('Candidate documents fetched')
  list(@Param('id', ParseIntPipe) id: number) {
    return this.files.listCandidateDocuments(id);
  }

  @Post(':id/documents')
  @ResponseMessage('Document Added Successfully!')
  @UseInterceptors(FileInterceptor('file'))
  create(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCandidateDocumentDto,
    @UploadedFile() file: UploadedFileType,
    @CurrentUser('id') userId: number,
  ) {
    return this.files.createCandidateDocument(id, dto, userId, file);
  }
}
