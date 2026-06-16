import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { ADMIN_CREDENTIALS, authHeader, bootApp, loginAs } from './app.factory';

/**
 * File upload (e2e).
 *
 * Exercises the real request pipeline (setGlobalPrefix('api') + ValidationPipe +
 * ResponseInterceptor + AllExceptionsFilter) against the booted AppModule.
 *
 * POST /api/files/upload is behind the global JwtAuthGuard (no @Public), so it
 * is the authenticated replacement for the legacy CI4 FileController::serveFile.
 * We log in as the seed super_admin (role_id 1) and carry the bearer token.
 *
 * Contract under test (src/files/files.controller.ts + files.service.ts):
 *   POST /api/files/upload  (multipart, field name 'file')
 *     -> @ResponseMessage('File uploaded successfully!')
 *     -> data = { path, original_name, size }  (FilesService.upload)
 *
 * The multipart field MUST be 'file' — FileInterceptor('file') in the controller.
 * Multer's default memoryStorage puts the bytes on file.buffer, so the upload
 * has no disk dependency on a pre-existing path; StorageService.save() creates
 * <api>/uploads/files/ on demand.
 *
 * Every success is wrapped by ResponseInterceptor as { status:true, message, data }
 * and every error by AllExceptionsFilter as { status:false, message, data:null }.
 */
describe('Files (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let token: string;

  // A fixed, deterministic payload so reruns are stable (no timestamps/randoms).
  const FILE_FIELD = 'file';
  const FILE_NAME = 'e2e.txt';
  const FILE_CONTENTS = 'e2e file contents';

  beforeAll(async () => {
    ({ app, http } = await bootApp());
    token = await loginAs(
      http,
      ADMIN_CREDENTIALS.username,
      ADMIN_CREDENTIALS.password,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/files/upload', () => {
    it('returns 401 without a token (global JwtAuthGuard)', async () => {
      // The SAME multipart upload, but with no Authorization header, must be
      // rejected before it ever reaches the controller/storage layer.
      const res = await request(http)
        .post('/api/files/upload')
        .attach(FILE_FIELD, Buffer.from(FILE_CONTENTS), FILE_NAME);

      expect(res.status).toBe(401);
      expect(res.body.status).toBe(false);
      expect(res.body.data).toBeNull();
    });

    it('stores an authenticated multipart upload and returns its metadata', async () => {
      const res = await request(http)
        .post('/api/files/upload')
        .set(authHeader(token))
        .attach(FILE_FIELD, Buffer.from(FILE_CONTENTS), FILE_NAME);

      // Nest answers POST with 201 by default; accept 200 too for robustness.
      expect([200, 201]).toContain(res.status);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe('File uploaded successfully!');

      const { data } = res.body;
      expect(data).toBeDefined();

      // FilesService.upload() returns { path, original_name, size }.
      expect(typeof data.path).toBe('string');
      expect(data.path.length).toBeGreaterThan(0);
      // StorageService stores under the generic 'files' subdir as a POSIX path
      // of the form "files/<uuid>-<safeName>", preserving the original name.
      expect(data.path).toContain('files/');
      expect(data.path).toContain('e2e.txt');

      expect(data.original_name).toBe(FILE_NAME);

      expect(typeof data.size).toBe('number');
      expect(data.size).toBe(Buffer.byteLength(FILE_CONTENTS));
    });
  });
});
