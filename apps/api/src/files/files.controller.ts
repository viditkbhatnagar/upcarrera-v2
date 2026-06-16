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
import { CreateStudentDocumentDto } from './dto/create-student-document.dto';
import { UploadedFileType } from './uploaded-file.type';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

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

  @Post('student-document')
  @ResponseMessage('Document uploaded successfully!')
  @UseInterceptors(FileInterceptor('file'))
  createStudentDocument(
    @Body() dto: CreateStudentDocumentDto,
    @UploadedFile() file: UploadedFileType,
    @CurrentUser('id') userId: number,
  ) {
    return this.files.createStudentDocument(dto, userId, file);
  }

  /**
   * Secure replacement for the legacy open file serve
   * (CI4 FileController::serveFile). `?item=<base64>` is the same base64 path
   * reference the legacy used, but here the route is behind the global
   * JwtAuthGuard AND the decoded path is sanitised so it can only resolve inside
   * the uploads directory (see FilesService.serveEncoded).
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
      // suggested for an explicit "save as".
      'Content-Disposition': `inline; filename="${filename}"`,
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
  async downloadStudentDocument(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, filename } = await this.files.getStudentDocumentForDownload(
      id,
    );

    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
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
}
