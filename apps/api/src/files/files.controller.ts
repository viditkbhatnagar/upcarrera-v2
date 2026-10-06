import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { FilesService } from './files.service';
import { contentDisposition } from './content-disposition';
import { CreateStudentDocumentDto } from './dto/create-student-document.dto';
import { UploadedFileType } from './uploaded-file.type';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import type { AccessUser } from '../workflow/record-access.service';

/**
 * File upload + secure download.
 *
 * Protected by the global JwtAuthGuard (no @Public) — this is the authenticated
 * replacement for the legacy CI4 FileController::serveFile, which served any
 * file under WRITEPATH by name with the auth check commented out.
 *
 * FileInterceptor uses multer's default memory handling so the buffer reaches
 * StorageService; no multer install or config is required (it ships with
 * @nestjs/platform-express).
 */
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload')
  @ResponseMessage('File uploaded successfully!')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: UploadedFileType) {
    return this.files.upload(file);
  }

  /** Set the current user's profile photo (uploads + persists users.profile_picture). */
  @Post('avatar')
  @ResponseMessage('Profile photo updated')
  @UseInterceptors(FileInterceptor('file'))
  setAvatar(
    @UploadedFile() file: UploadedFileType,
    @CurrentUser('id') userId: number,
  ) {
    return this.files.setAvatar(userId, file);
  }

  @Post('student-document')
  @RequirePermission('crm:applications.edit')
  @ResponseMessage('Document uploaded successfully!')
  @UseInterceptors(FileInterceptor('file'))
  createStudentDocument(
    @Body() dto: CreateStudentDocumentDto,
    @UploadedFile() file: UploadedFileType,
    @CurrentUser() user: AccessUser,
  ) {
    return this.files.createStudentDocument(dto, user, file);
  }

  /**
   * Secure replacement for the legacy open file serve
   * (CI4 FileController::serveFile). `?item=<base64>` is the same base64 path
   * reference the legacy used, but here the route is behind the global
   * JwtAuthGuard AND the decoded path is sanitised so it can only resolve inside
   * the uploads directory (see FilesService.serveEncoded).
   *
   * This route is intentionally UNSCOPED (no @RequirePermission, no per-record
   * check), so serveEncoded restricts it to public-by-design subdirs only
   * (avatars/, files/ — used for profile photos). Sensitive documents
   * (student_documents/, candidate_documents/, payment proofs, KYC) are refused
   * here and served ONLY through GET /files/student-document/:id/download and the
   * candidate twin, which carry a slug + record-access check.
   *
   * Like the download routes, this takes full control of the response with a
   * non-passthrough @Res() and pipes the stream, deliberately bypassing the
   * global ResponseInterceptor (which would otherwise wrap the binary body in
   * the {status,message,data} JSON envelope). Lookup / traversal / not-found
   * errors are thrown BEFORE any byte is written, so they still flow through
   * AllExceptionsFilter and return the normal JSON error envelope.
   *
   * `serve` is a literal sub-path and never collides with
   * `student-document/:id/download` (a different literal prefix).
   */
  @Get('serve')
  async serve(
    @Query('item') item: string,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, filename, contentType } =
      await this.files.serveEncoded(item);

    res.set({
      'Content-Type': contentType,
      // inline so browsers can preview images/PDFs; the filename is still
      // suggested for an explicit "save as". SECURITY LOW 6: header-safe value.
      'Content-Disposition': contentDisposition(filename, 'inline'),
    });

    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({
          status: false,
          message: 'Failed to read file',
          data: null,
        });
      } else {
        res.destroy();
      }
    });

    stream.pipe(res);
  }

  /**
   * Stream the stored file for a student_document.
   *
   * We take full control of the response with a non-passthrough `@Res()` and
   * pipe the stream directly. This deliberately bypasses the global
   * ResponseInterceptor, which would otherwise wrap the binary body in the
   * {status,message,data} JSON envelope and corrupt the download. Lookup /
   * not-found errors are thrown BEFORE any bytes are written, so they still flow
   * through AllExceptionsFilter and return the normal JSON error envelope.
   */
  @Get('student-document/:id/download')
  @RequirePermission('crm:applications.view')
  async downloadStudentDocument(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
    @CurrentUser() user: AccessUser,
  ): Promise<void> {
    // The service resolves the owning application/lead and refuses (403) before a
    // single byte is streamed when the caller is out of scope, so a document id can
    // no longer be guessed to pull another student's Aadhaar/marksheet.
    const { stream, filename } = await this.files.getStudentDocumentForDownload(
      id,
      user,
    );

    res.set({
      'Content-Type': 'application/octet-stream',
      // SECURITY LOW 6: header-safe disposition for a (possibly user-supplied) filename.
      'Content-Disposition': contentDisposition(filename, 'attachment'),
    });

    // If the stream errors mid-flight (e.g. disk read fault after headers were
    // sent), destroy the response so the client sees a broken connection rather
    // than a silently truncated file.
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({
          status: false,
          message: 'Failed to read file',
          data: null,
        });
      } else {
        res.destroy();
      }
    });

    stream.pipe(res);
  }

  /**
   * Stream the stored file for an application_document (the pre-conversion
   * admissions document the detail page lists via GET /applications/:id/documents).
   *
   * DELIBERATE API ADDITION (WS1 frontend QA, HIGH 1): the committed
   * GET /files/student-document/:id/download keys on
   * student_document.student_document_id — a DIFFERENT table and id-space from
   * application_document.id (what the documents list exposes) — so it genuinely
   * cannot serve these rows. This is its record-access-scoped twin for application
   * documents: it carries the SAME @RequirePermission('crm:applications.view') and
   * delegates to FilesService.getApplicationDocumentForDownload, which runs the
   * SAME RecordAccessService.assertCanView used across the workflow and 403s an
   * out-of-scope caller BEFORE a single byte is streamed.
   *
   * Same non-passthrough @Res() + pipe pattern as the student-document twin, so it
   * bypasses the global ResponseInterceptor (which would wrap the binary body in the
   * {status,message,data} JSON envelope). Lookup / not-found / 403 errors are thrown
   * BEFORE any byte is written, so they still flow through AllExceptionsFilter as the
   * normal JSON error envelope.
   */
  @Get('application-document/:id/download')
  @RequirePermission('crm:applications.view')
  async downloadApplicationDocument(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
    @CurrentUser() user: AccessUser,
  ): Promise<void> {
    const { stream, filename } =
      await this.files.getApplicationDocumentForDownload(id, user);

    res.set({
      'Content-Type': 'application/octet-stream',
      // SECURITY LOW 6: header-safe disposition for a (possibly user-supplied) filename.
      'Content-Disposition': contentDisposition(filename, 'attachment'),
    });

    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({
          status: false,
          message: 'Failed to read file',
          data: null,
        });
      } else {
        res.destroy();
      }
    });

    stream.pipe(res);
  }
}
