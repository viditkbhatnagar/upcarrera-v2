import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

export interface BootedApp {
  app: INestApplication;
  http: Server;
}

/**
 * Boots a full Nest application backed by the real AppModule (and therefore the
 * real MySQL on 127.0.0.1:3307) for end-to-end testing.
 *
 * It REPLICATES src/main.ts's global setup EXACTLY so specs exercise the same
 * request pipeline as production:
 *   - setGlobalPrefix('api')            -> all routes live under /api
 *   - ValidationPipe({ whitelist, transform, forbidNonWhitelisted: false })
 *   - global ResponseInterceptor        -> envelope { status, message, data }
 *   - global AllExceptionsFilter        -> errors as { status:false, message, data:null }
 *
 * Note: enableCors() is intentionally omitted — it has no effect on supertest's
 * in-process requests and is not part of the contract under test.
 */
export async function bootApp(): Promise<BootedApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );

  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new ResponseInterceptor(reflector));
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.init();

  return { app, http: app.getHttpServer() as Server };
}

/**
 * Logs in via POST /api/auth/login and returns the JWT (body.data.auth_token).
 * Throws if the login did not succeed so callers fail fast instead of carrying
 * an undefined token into downstream requests.
 */
export async function loginAs(
  http: Server,
  username: string,
  password: string,
): Promise<string> {
  const res = await request(http)
    .post('/api/auth/login')
    .send({ username, password });

  const token: string | undefined = res.body?.data?.auth_token;
  if (!token) {
    throw new Error(
      `loginAs(${username}) failed: status=${res.status} body=${JSON.stringify(res.body)}`,
    );
  }
  return token;
}

/** Builds the Authorization header object for an authenticated supertest call. */
export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/** Admin (super_admin, role_id 1) credentials for the disposable seed DB. */
export const ADMIN_CREDENTIALS = {
  username: 'upcarrera.superadmin',
  password: 'upcarrera@2024',
} as const;
