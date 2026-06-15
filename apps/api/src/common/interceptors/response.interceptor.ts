import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RESPONSE_MESSAGE } from '../decorators/response-message.decorator';

/**
 * Wraps every successful response in the legacy envelope `{ status, message, data }`
 * so existing mobile clients keep working unchanged.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, unknown> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<unknown> {
    const message =
      this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'Success';

    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        // A controller using @Res({ passthrough: true }) may have already
        // written the response directly (e.g. a CSV/file download). In that
        // case do NOT re-wrap/re-send — Nest would call res.json() on an
        // already-sent response and throw ERR_HTTP_HEADERS_SENT.
        if (response.headersSent) {
          return data;
        }
        return { status: true, message, data: data ?? null };
      }),
    );
  }
}
