import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { createReadStream, ReadStream } from 'node:fs';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, basename, resolve, sep } from 'node:path';

/**
 * Storage abstraction for uploaded files.
 *
 * Today it writes to local disk under apps/api/uploads/. The public surface
 * (save / streamPath / resolveAbsolute) is intentionally storage-agnostic so a
 * future S3Service can implement the same contract and be swapped in via DI
 * without touching FilesService.
 *
 * Replaces the legacy CI4 FileController::serveFile, which served any path under
 * WRITEPATH by name with no auth and no traversal guard.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger('Storage');

  /** Absolute root of the upload tree: <api>/uploads. */
  private readonly root = resolve(process.cwd(), 'uploads');

  /**
   * Persist a buffer under <root>/<subdir>/<uuid>-<filename> and return the
   * path RELATIVE to the upload root (this relative path is what we store in
   * the DB — never an absolute one).
   */
  async save(
    buffer: Buffer,
    subdir: string,
    originalName: string,
  ): Promise<string> {
    if (!buffer || buffer.length === 0) {
      throw new InternalServerErrorException('Cannot store an empty file');
    }

    const safeSubdir = this.sanitizeSubdir(subdir);
    const safeName = this.sanitizeFilename(originalName);
    const storedName = `${randomUUID()}-${safeName}`;

    const dir = join(this.root, safeSubdir);
    const absolutePath = join(dir, storedName);

    try {
      await mkdir(dir, { recursive: true });
      await writeFile(absolutePath, buffer);
    } catch (err) {
      this.logger.error(
        `Failed to write upload to ${absolutePath}: ${(err as Error).message}`,
      );
      throw new InternalServerErrorException('Failed to store file');
    }

    // Store a POSIX-style relative path regardless of host OS separators.
    return [safeSubdir, storedName].join('/');
  }

  /**
   * Resolve a stored relative path to an absolute one, guarding against path
   * traversal (e.g. "../../etc/passwd"). Throws NotFound if the resolved path
   * escapes the upload root or the file is missing.
   */
  async resolveAbsolute(relativePath: string): Promise<string> {
    if (!relativePath) {
      throw new NotFoundException('File not found');
    }

    // Normalise and ensure the resolved path stays inside the upload root.
    const absolutePath = resolve(this.root, relativePath);
    const rootWithSep = this.root.endsWith(sep) ? this.root : this.root + sep;
    if (absolutePath !== this.root && !absolutePath.startsWith(rootWithSep)) {
      this.logger.warn(`Blocked path traversal attempt: ${relativePath}`);
      throw new NotFoundException('File not found');
    }

    try {
      const info = await stat(absolutePath);
      if (!info.isFile()) {
        throw new NotFoundException('File not found');
      }
    } catch {
      throw new NotFoundException('File not found');
    }

    return absolutePath;
  }

  /**
   * Open a readable stream for a stored relative path. The caller (controller)
   * pipes this directly into the HTTP response.
   */
  async streamPath(relativePath: string): Promise<ReadStream> {
    const absolutePath = await this.resolveAbsolute(relativePath);
    return createReadStream(absolutePath);
  }

  /** Best-effort download filename derived from a stored relative path. */
  basename(relativePath: string): string {
    return basename(relativePath);
  }

  // ---- internal guards -----------------------------------------------------

  /** Keep subdir to a single safe path segment (no traversal, no separators). */
  private sanitizeSubdir(subdir: string): string {
    const cleaned = (subdir ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
    return cleaned.length > 0 ? cleaned : 'misc';
  }

  /** Strip any directory components and dangerous chars from the client name. */
  private sanitizeFilename(name: string): string {
    const base = basename(name ?? '').replace(/[^a-zA-Z0-9._-]/g, '_');
    return base.length > 0 ? base : 'file';
  }
}
