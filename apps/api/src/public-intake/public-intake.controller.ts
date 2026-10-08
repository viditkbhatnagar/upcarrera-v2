import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { Public } from '../common/decorators/public.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import type { UploadedFileType } from '../files/uploaded-file.type';
import { PublicIntakeService } from './public-intake.service';
import { PublicApplicationDto } from './dto/public-application.dto';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB per file (service re-checks per-file + total)

/**
 * Unauthenticated self-serve application intake. Lives under /api/public/* so the
 * nginx `applicant` limiter applies; the service adds a honeypot + duplicate guard
 * and re-validates the programme offering. GET catalogue is read-only.
 */
@Public()
@Controller('public/intake')
export class PublicIntakeController {
  constructor(private readonly service: PublicIntakeService) {}

  @Get('catalogue')
  @ResponseMessage('Catalogue loaded')
  catalogue() {
    return this.service.catalogue();
  }

  @Post('applications')
  @HttpCode(201)
  @ResponseMessage('Application submitted')
  @UseInterceptors(
    AnyFilesInterceptor({
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 12, fields: 60, fieldSize: 100 * 1024 },
    }),
  )
  submit(
    @Body() dto: PublicApplicationDto,
    @UploadedFiles() files: UploadedFileType[],
    @Ip() ip: string,
  ): Promise<{ application_no: string }> {
    return this.service.createApplication(dto, files ?? [], ip ?? null);
  }
}
