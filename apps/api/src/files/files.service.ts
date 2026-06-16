import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import { CreateStudentDocumentDto } from './dto/create-student-document.dto';
import { CreateCandidateDocumentDto } from './dto/create-candidate-document.dto';
import { UpdateCandidateDocumentDto } from './dto/update-candidate-document.dto';
import { UploadedFileType } from './uploaded-file.type';
import { contentTypeFor } from './content-type';

/** Subdir under uploads/ for ad-hoc uploads, student docs and candidate docs. */
const GENERIC_SUBDIR = 'files';
const STUDENT_DOCS_SUBDIR = 'student_documents';
/** Mirrors the legacy 'canditates/documents' upload path (App/Upload_document). */
const CANDIDATE_DOCS_SUBDIR = 'candidate_documents';

/**
 * File upload + secure download service.
 *
 * Replaces the legacy CI4 FileController::serveFile (an unauthenticated open
 * file serve keyed on a client-supplied filename). Reads/writes go through
 * StorageService so storage can later move to S3 without changing this layer.
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Generic upload: store the file and return its metadata. The returned `path`
   * is the relative storage key the caller persists/references later.
   */
  async upload(file?: UploadedFileType) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file uploaded');
    }

    const path = await this.storage.save(
      file.buffer,
      GENERIC_SUBDIR,
      file.originalname,
    );

    return {
      path,
      original_name: file.originalname,
      size: file.size,
    };
  }

  /**
   * Store a file AND record a student_document row atomically.
   *
   * Real columns (see prisma student_document model): student_document_id (PK),
   * label, file, student_id, application_id, created_by, created_at, ...
   * There is no document_type_id column, so we resolve the document_type title
   * into `label` and keep the path in `file`.
   *
   * The disk write happens first (it cannot participate in the DB transaction),
   * then the row insert runs inside $transaction. If the insert throws, the
   * exception propagates and the request fails — the orphaned file is a
   * tolerable artifact (TODO: background sweep), but the DB never gets a row
   * pointing at a half-written file.
   */
  async createStudentDocument(
    dto: CreateStudentDocumentDto,
    userId: number,
    file?: UploadedFileType,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate FK targets up-front so we fail before writing anything to disk.
    const [student, docType] = await Promise.all([
      this.prisma.users.findFirst({
        where: { id: dto.student_id, deleted_at: null },
        select: { id: true },
      }),
      this.prisma.document_type.findFirst({
        where: { id: dto.document_type_id, deleted_at: null },
        select: { id: true, title: true },
      }),
    ]);

    if (!student) {
      throw new NotFoundException('Student not found');
    }
    if (!docType) {
      throw new NotFoundException('Document type not found');
    }

    const path = await this.storage.save(
      file.buffer,
      STUDENT_DOCS_SUBDIR,
      file.originalname,
    );

    const now = new Date();

    const document = await this.prisma.$transaction(async (tx) => {
      return tx.student_document.create({
        data: {
          label: docType.title ?? null,
          file: path,
          student_id: dto.student_id,
          application_id: dto.application_id ?? null,
          created_by: userId,
          created_at: now,
          updated_by: userId,
          updated_at: now,
        },
      });
    });

    return {
      document,
      path,
      original_name: file.originalname,
      size: file.size,
    };
  }

  /**
   * Look up a student_document row and return the row plus an open read stream
   * for its stored file. AUTHENTICATED via the global JwtAuthGuard — unlike the
   * legacy open serve.
   *
   * TODO(ownership): scope access by the acting user's role/relationship to the
   * student (telecaller/institution/admin) once the RBAC port lands. For now any
   * authenticated user may download; this is still strictly tighter than the
   * legacy unauthenticated FileController::serveFile.
   */
  async getStudentDocumentForDownload(id: number) {
    const document = await this.prisma.student_document.findFirst({
      where: { student_document_id: id, deleted_at: null },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (!document.file) {
      throw new NotFoundException('Document has no stored file');
    }

    const stream = await this.storage.streamPath(document.file);
    const filename = this.storage.basename(document.file);

    return { document, stream, filename };
  }

  /**
   * SECURE port of the legacy CI4 FileController::serveFile.
   *
   * Legacy behaviour: `?item=<base64>` was base64-decoded to a path RELATIVE to
   * WRITEPATH, then served with mime_content_type + readfile — with the auth
   * check commented out and NO traversal guard, so any client could read any
   * file the PHP process could reach (e.g. item=base64('../../etc/passwd')).
   *
   * This version keeps the same capability (decode `item`, stream the file with
   * the right Content-Type) but fixes the vulnerability on two axes:
   *   1. AUTH — the route lives behind the global JwtAuthGuard (no @Public), so
   *      every request is authenticated.
   *   2. TRAVERSAL — the decoded path is rejected if it is empty, contains a
   *      `..` segment, or is absolute; StorageService.resolveAbsolute then does
   *      the authoritative check (resolve + uploads-root prefix), so the file
   *      can ONLY resolve inside the uploads directory. Anything outside 404s.
   *
   * Returns the open stream, a download filename, and the resolved Content-Type;
   * the controller sets headers and pipes the stream.
   */
  async serveEncoded(item?: string): Promise<{
    stream: ReturnType<StorageService['streamPath']> extends Promise<infer R>
      ? R
      : never;
    filename: string;
    contentType: string;
  }> {
    if (!item) {
      throw new BadRequestException('Missing file reference');
    }

    // Decode the legacy base64 reference back to a relative path.
    let decoded: string;
    try {
      decoded = Buffer.from(item, 'base64').toString('utf8');
    } catch {
      throw new BadRequestException('Invalid file reference');
    }

    const relativePath = decoded.trim();

    // Defence-in-depth: reject obvious escapes BEFORE touching the filesystem.
    // StorageService.resolveAbsolute is the authoritative guard, but failing
    // fast here keeps traversal attempts out of any logs/IO. A leading slash or
    // a drive prefix (absolute path) and any `..` segment are refused outright.
    if (
      relativePath.length === 0 ||
      relativePath.startsWith('/') ||
      relativePath.startsWith('\\') ||
      /^[a-zA-Z]:[\\/]/.test(relativePath) ||
      relativePath.split(/[\\/]/).includes('..')
    ) {
      throw new NotFoundException('File not found');
    }

    // streamPath -> resolveAbsolute enforces the uploads-root prefix check and
    // throws NotFound for anything that escapes the root or does not exist.
    const stream = await this.storage.streamPath(relativePath);
    const filename = this.storage.basename(relativePath);
    const contentType = contentTypeFor(relativePath);

    return { stream, filename, contentType };
  }

  // ---- candidate (lead) documents ------------------------------------------
  //
  // Port of CI4 App/Controllers/App/Upload_document (candidate/applicant docs).
  // A "candidate" is a leads row; legacy keyed each document row on
  // `candidate_id`. This migration's `student_document` model has no
  // `candidate_id` column — the linkage column that exists is `application_id`
  // (the same column convertApplication stamps documents through). We therefore
  // store candidate documents with application_id = candidate id, label =
  // document_type.title, and file = stored path, faithfully against the real
  // columns. (See create/update DTOs for the full schema-mapping note.)

  /**
   * GET /candidates/:id/documents — list a candidate's (lead's) documents.
   * Legacy: Upload_document::index() -> get(['candidate_id' => $id]).
   */
  async listCandidateDocuments(candidateId: number) {
    await this.assertCandidateExists(candidateId);

    return this.prisma.student_document.findMany({
      where: { application_id: candidateId, deleted_at: null },
      orderBy: { student_document_id: 'desc' },
    });
  }

  /**
   * POST /candidates/:id/documents — store a file and record a student_document
   * row keyed on the candidate (application_id). Legacy: Upload_document::add().
   *
   * As with createStudentDocument, the disk write happens before the row insert;
   * the insert runs inside $transaction so the DB never references a half-written
   * file. An orphaned file on insert failure is a tolerable artifact.
   */
  async createCandidateDocument(
    candidateId: number,
    dto: CreateCandidateDocumentDto,
    userId: number,
    file?: UploadedFileType,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate FK targets up-front so we fail before writing anything to disk.
    const [, docType] = await Promise.all([
      this.assertCandidateExists(candidateId),
      this.findDocumentType(dto.document_type_id),
    ]);

    const path = await this.storage.save(
      file.buffer,
      CANDIDATE_DOCS_SUBDIR,
      file.originalname,
    );

    const now = new Date();

    const document = await this.prisma.$transaction(async (tx) => {
      return tx.student_document.create({
        data: {
          // The legacy free-text `title` and `document_type` both collapse into
          // the single `label` column that exists; the resolved type title wins.
          label: docType.title ?? dto.title ?? null,
          file: path,
          application_id: candidateId,
          created_by: userId,
          created_at: now,
          updated_by: userId,
          updated_at: now,
        },
      });
    });

    return {
      document,
      path,
      original_name: file.originalname,
      size: file.size,
    };
  }

  /**
   * PATCH /candidates/documents/:id — update title/type, optionally replacing
   * the file. Legacy: Upload_document::edit() only updated supplied fields and
   * replaced the file only when a new one was attached.
   */
  async updateCandidateDocument(
    documentId: number,
    dto: UpdateCandidateDocumentDto,
    userId: number,
    file?: UploadedFileType,
  ) {
    const existing = await this.findCandidateDocument(documentId);

    const data: {
      label?: string | null;
      file?: string;
      updated_by: number;
      updated_at: Date;
    } = {
      updated_by: userId,
      updated_at: new Date(),
    };

    // When a document_type is supplied, re-resolve its title into `label`;
    // otherwise fall back to a supplied free-text title (legacy `title`).
    if (dto.document_type_id !== undefined) {
      const docType = await this.findDocumentType(dto.document_type_id);
      data.label = docType.title ?? dto.title ?? existing.label;
    } else if (dto.title !== undefined) {
      data.label = dto.title;
    }

    // Replace the stored file only when a new one was actually attached.
    if (file?.buffer?.length) {
      data.file = await this.storage.save(
        file.buffer,
        CANDIDATE_DOCS_SUBDIR,
        file.originalname,
      );
    }

    return this.prisma.student_document.update({
      where: { student_document_id: documentId },
      data,
    });
  }

  /**
   * DELETE /candidates/documents/:id — soft delete (set deleted_at = now).
   * Legacy: Upload_document::delete() hard-deleted; we soft-delete to match the
   * rest of this migration (deleted_at convention).
   */
  async deleteCandidateDocument(documentId: number, userId: number) {
    await this.findCandidateDocument(documentId);

    await this.prisma.student_document.update({
      where: { student_document_id: documentId },
      data: { deleted_at: new Date(), deleted_by: userId },
    });

    return { id: documentId };
  }

  // ---- internal lookups ----------------------------------------------------

  /** Resolve a non-deleted document_type or 404. */
  private async findDocumentType(documentTypeId: number) {
    const docType = await this.prisma.document_type.findFirst({
      where: { id: documentTypeId, deleted_at: null },
      select: { id: true, title: true },
    });
    if (!docType) {
      throw new NotFoundException('Document type not found');
    }
    return docType;
  }

  /** Ensure the candidate (lead) exists and is not soft-deleted, else 404. */
  private async assertCandidateExists(candidateId: number) {
    const candidate = await this.prisma.leads.findFirst({
      where: { id: candidateId, deleted_at: null },
      select: { id: true },
    });
    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }
    return candidate;
  }

  /** Resolve a non-deleted candidate document row or 404. */
  private async findCandidateDocument(documentId: number) {
    const document = await this.prisma.student_document.findFirst({
      where: { student_document_id: documentId, deleted_at: null },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    return document;
  }
}
