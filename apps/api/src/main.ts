import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Trust the first proxy hop (nginx) so Express derives req.ip from the nearest
  // X-Forwarded-For entry instead of the socket address. The login audit then
  // records the real client IP via req.ip rather than a raw, spoofable header.
  app.set('trust proxy', 1);

  // All routes are served under /api to match the legacy mobile contract.
  app.setGlobalPrefix('api');

  // CORS: lock to an explicit allow-list in production via CORS_ORIGINS
  // (comma-separated, e.g. "https://admin.upcarrera.com,https://admissions.upcarrera.com").
  // When unset, fall back to the permissive default so local/dev is unchanged.
  const corsOrigins = process.env.CORS_ORIGINS?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors(
    corsOrigins && corsOrigins.length > 0
      ? { origin: corsOrigins, credentials: true }
      : undefined,
  );

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );

  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new ResponseInterceptor(reflector));
  app.useGlobalFilters(new AllExceptionsFilter());

  // Clean SIGTERM/SIGINT teardown (PrismaService.onModuleDestroy disconnects).
  app.enableShutdownHooks();

  // Bind 0.0.0.0 by default (unchanged); set HOST=127.0.0.1 in production so the
  // API is only reachable through the nginx reverse proxy, never directly.
  const port = process.env.PORT ?? 3000;
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
  Logger.log(`upcarrera API listening on http://${host}:${port}/api`, 'Bootstrap');
}
bootstrap();
