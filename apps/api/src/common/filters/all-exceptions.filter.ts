import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/** Renders every error in the legacy envelope `{ status:false, message, data:null }`. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'Internal server error';
    // Optional machine-readable fields some endpoints attach to an HttpException
    // response object (e.g. the public applicant session: a `code` the SPA maps to
    // the right status screen, and `data` such as the submitted-at time). Absent on
    // every existing exception, so the legacy envelope is unchanged for them.
    let code: string | undefined;
    let data: unknown = null;
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const obj = body as Record<string, unknown>;
        const raw = obj.message;
        message = Array.isArray(raw) ? String(raw[0]) : String(raw ?? exception.message);
        if (typeof obj.code === 'string') code = obj.code;
        if (obj.data !== undefined) data = obj.data;
      } else {
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    // If the response has already been sent (e.g. a controller wrote a file
    // download directly), writing again throws ERR_HTTP_HEADERS_SENT and would
    // escape the filter, crashing the process. Bail out instead.
    if (response.headersSent) {
      return;
    }

    response.status(status).json({ status: false, message, data, ...(code ? { code } : {}) });
  }
}
