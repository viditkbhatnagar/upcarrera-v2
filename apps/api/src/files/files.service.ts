import {
  BadRequestException,
  ForbiddenException,
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
import {
  AccessUser,
  RecordAccessService,
} from '../workflow/record-access.service';
import {
  CANDIDATE_DOCS_SUBDIR,
  candidateDocFileWhereOr,
  isCandidateDocFile,
} from '../common/candidate-doc';

/** Subdir under uploads/ for ad-hoc uploads, student docs and candidate docs. */
const GENERIC_SUBDIR = 'files';
const STUDENT_DOCS_SUBDIR = 'student_documents';
const AVATAR_SUBDIR = 'avatars';
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
// CANDIDATE_DOCS_SUBDIR (where candidate docs are written) and the candidate-doc
// discriminator live in common/candidate-doc.ts — the ONE source of truth shared
// with RecordAccessService (the document-row authorizer) and StudentProfileService
// (the profile read), so no route can drift on what counts as a candidate doc.

/**
 * Upload subdirs that the unscoped GET /files/serve may stream. These are
 * public-by-design: avatars (POST /files/avatar) and the generic upload dir
 * (POST /files/upload, which the counsellor-create screen uses for profile
 * photos — see use-avatar-url.ts). SENSITIVE document dirs (student_documents/,
 * candidate_documents/, application_payments/ proofs, KYC) are deliberately NOT
 * in this allow-list: they are served ONLY through the record-access-scoped
 * download routes (GET /files/student-document/:id/download and the candidate
 * twin), so a client-supplied path can no longer pull another owner's
 * Aadhaar/marksheet/payment proof. Allow-list (fail-closed) rather than deny-list
 * so any future subdir is refused until it is explicitly declared public.
 */
const PUBLIC_SERVE_SUBDIRS: ReadonlySet<string> = new Set([
  AVATAR_SUBDIR,
  GENERIC_SUBDIR,
]);

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
    private readonly access: RecordAccessService,
  ) {}

  // Record-access for a student_document acted on BY ITS ROW id (download, and the
  // candidate update/delete routes whose :id is the document id) is the SHARED,
  // discriminator-aware RecordAccessService.assertCanAccessDocumentRow — the SAME
  // method the students/applications document routes call — so the overloaded
  // application_id column (a leads.id for candidate docs, a real
  // applications.application_id for application/student docs) is resolved identically
  // on every route and a candidate doc can never be reached as an application doc.
  // The candidate-doc discriminator itself lives in common/candidate-doc.ts.

  /**
   * Generic upload: store the file and return its metadata. The returned `path`
   * is the relative storage key the caller persists/references later.
   *
   * ACCEPTED FOLLOW-UP (not fixed here): POST /files/upload carries no permission
   * slug and its GENERIC_SUBDIR (files/) is on the /files/serve public allow-list.
   * This is the pre-existing generic-upload pattern and the counsellor-create
   * profile-photo source (see use-avatar-url.ts): it is authenticated-only (global
   * JwtAuthGuard), writes nothing to the student_document table and touches no
   * sensitive document dir, so it is not part of this document-integrity fix.
   * Worth a later dedicated pass (add an explicit slug / tighten the generic dir).
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
   * Store an uploaded image AND set it as the current user's avatar
   * (users.profile_picture = the relative storage key). The key is later served
   * via GET /files/serve?item=base64(key). Images only, <= 5MB.
   */
  async setAvatar(userId: number, file?: UploadedFileType) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No image uploaded');
    }
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Profile photo must be an image');
    }
    if (file.size > MAX_AVATAR_BYTES) {
      throw new BadRequestException('Profile photo must be 5MB or smaller');
    }

    const path = await this.storage.save(
      file.buffer,
      AVATAR_SUBDIR,
      file.originalname,
    );
    await this.prisma.users.update({
      where: { id: userId },
      data: { profile_picture: path },
    });

    return { profile_picture: path };
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
    user: AccessUser,
    file?: UploadedFileType,
  ) {
    const userId = Number(user.userId ?? user.id);
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

    // Scope the write BEFORE touching disk: never blindly trust the client-supplied
    // student_id / application_id. When an application_id is supplied the caller
    // must be able to view THAT application; otherwise resolve the student's owning
    // application and scope to it. Fail closed (403) when nothing resolves, so a
    // counsellor cannot attach a document to another owner's applicant.
    let effectiveStudentId: number | null = dto.student_id;
    if (dto.application_id != null) {
      // The caller must be able to view THAT application (403 out of scope)...
      await this.access.assertCanView(user, dto.application_id);
      // ...AND the supplied student_id must be consistent with it. A converted
      // application owns exactly one student, so an owner of application X can no
      // longer stamp another owner's student onto {application_id: X, student_id:
      // victim} — a mismatch is rejected (400). A not-yet-converted application has
      // no student to attribute to, so the doc is stored UNATTRIBUTED (student_id =
      // null) and the convert step stamps the real id later (see convertApplication
      // student_document.updateMany), rather than trusting the client value.
      const linkedStudentId = await this.access.resolveApplicationStudentId(
        dto.application_id,
      );
      if (linkedStudentId != null && linkedStudentId !== dto.student_id) {
        throw new BadRequestException(
          'student_id does not belong to the supplied application',
        );
      }
      effectiveStudentId = linkedStudentId;
    } else {
      const applicationId = await this.access.resolveDocumentApplicationId({
        application_id: null,
        student_id: dto.student_id,
      });
      if (applicationId == null) {
        throw new ForbiddenException('Access denied');
      }
      await this.access.assertCanView(user, applicationId);
    }

    const path = await this.storage.save(
      file.buffer,
      STUDENT_DOCS_SUBDIR,
      file.originalname,
    );

    const now = new Date();

    // The disk write cannot join the DB transaction, so if the insert throws, roll
    // the orphaned file back off disk (storage.delete is a best-effort no-op when it
    // is already gone) — a rejected write must leave no stored proof behind.
    const document = await this.prisma
      .$transaction((tx) =>
        tx.student_document.create({
          data: {
            label: docType.title ?? null,
            file: path,
            student_id: effectiveStudentId,
            application_id: dto.application_id ?? null,
            created_by: userId,
            created_at: now,
            updated_by: userId,
            updated_at: now,
          },
        }),
      )
      .catch(async (err) => {
        await this.storage.delete(path);
        throw err;
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
   * for its stored file. AUTHENTICATED via the global JwtAuthGuard AND scoped:
   * the caller must be able to VIEW the owning application/lead, so leaking a
   * student's Aadhaar/marksheet by guessing a document id is no longer possible
   * (the controller carries @RequirePermission('crm:applications.view')). The
   * scope check runs BEFORE any byte is streamed, so a 403/404 still flows through
   * AllExceptionsFilter as the normal JSON error envelope.
   */
  async getStudentDocumentForDownload(id: number, user: AccessUser) {
    const document = await this.prisma.student_document.findFirst({
      where: { student_document_id: id, deleted_at: null },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Record-access: 403 unless the caller may view the owning application/lead.
    await this.access.assertCanAccessDocumentRow(user, document);

    if (!document.file) {
      throw new NotFoundException('Document has no stored file');
    }

    const stream = await this.storage.streamPath(document.file);
    const filename = this.storage.basename(document.file);

    return { document, stream, filename };
  }

  /**
   * Look up an application_document row and return it plus an open read stream for
   * its stored file. This is the APPLICATION-document twin of
   * getStudentDocumentForDownload: the two live in SEPARATE tables with SEPARATE
   * id-spaces (student_document.student_document_id vs application_document.id), so
   * one route cannot serve the other — the documents list the detail page renders
   * (GET /applications/:id/documents) is application_document rows, keyed by their
   * own id.
   *
   * AUTHENTICATED (global JwtAuthGuard) AND record-access scoped: unlike the
   * overloaded student_document.application_id, application_document.application_id
   * is ALWAYS a real applications.application_id, so the caller must be able to VIEW
   * that application — RecordAccessService.assertCanView (the SAME authorizer
   * assertCanAccessDocumentRow applies to application/student docs) 403s out-of-scope
   * BEFORE any byte is streamed, so a document id can no longer be guessed to pull
   * another applicant's Aadhaar/marksheet. The controller additionally carries
   * @RequirePermission('crm:applications.view').
   */
  async getApplicationDocumentForDownload(id: number, user: AccessUser) {
    const document = await this.prisma.application_document.findFirst({
      where: { id, deleted_at: null },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Record-access: 403 unless the caller may view the owning application.
    await this.access.assertCanView(user, document.application_id);

    if (!document.file_path) {
      throw new NotFoundException('Document has no stored file');
    }

    const stream = await this.storage.streamPath(document.file_path);
    const filename =
      document.original_name ?? this.storage.basename(document.file_path);

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

    // RECORD-ACCESS BOUNDARY: this route is unscoped (no slug, no owner check), so
    // it may ONLY stream public-by-design subdirs. The first path segment must be
    // allow-listed; anything else — notably the sensitive document dirs
    // (student_documents/, candidate_documents/, application_payments/, KYC) — is
    // refused with a 404 (same shape as a missing file, so existence is not
    // revealed). Those documents are served only via the record-access-scoped
    // download routes, so a client-supplied path can no longer leak another owner's
    // Aadhaar/marksheet/payment proof even though such paths are exposed elsewhere.
    const [subdir] = relativePath.split(/[\\/]/);
    if (!PUBLIC_SERVE_SUBDIRS.has(subdir)) {
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
  async listCandidateDocuments(candidateId: number, user: AccessUser) {
    const candidate = await this.assertCandidateExists(candidateId);

    // Record-access: the candidate docs expose stored file paths + labels, so the
    // caller must be able to access this lead (403 otherwise). 'leaking marksheets
    // is as bad as editing them' — the controller carries crm:applications.view.
    await this.access.assertCanViewLead(user, candidate);

    // COLLISION GUARD (see the ID-SPACE note below): student_document.application_id
    // is overloaded — a candidate doc holds a leads.id, an application/student doc
    // holds a real applications.application_id — and the two id-spaces can collide.
    // So this list is restricted to rows genuinely created via the candidate path
    // (stored under candidate_documents/, or the legacy canditates/ dir); an
    // application document whose application_id merely EQUALS this lead id can no
    // longer leak here with only a lead-ownership check. (Limitation: a legacy
    // candidate doc stored under neither prefix is not listed — fail closed; no
    // application document is ever exposed, which is the property that matters.)
    return this.prisma.student_document.findMany({
      where: {
        application_id: candidateId,
        deleted_at: null,
        // Shared candidate-doc discriminator (common/candidate-doc.ts): restrict to
        // rows genuinely created via the candidate path, so an application document
        // whose application_id merely equals this lead id cannot leak here.
        OR: candidateDocFileWhereOr(),
      },
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
    user: AccessUser,
    file?: UploadedFileType,
  ) {
    const userId = Number(user.userId ?? user.id);
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate FK targets up-front so we fail before writing anything to disk.
    const [candidate, docType] = await Promise.all([
      this.assertCandidateExists(candidateId),
      this.findDocumentType(dto.document_type_id),
    ]);

    // Scope the write to a lead the caller may access (403 otherwise). The row is
    // keyed on the LEAD id via the application_id column (see the ID-SPACE note
    // below), so we scope through lead ownership, not applications.
    await this.access.assertCanViewLead(user, candidate);

    const path = await this.storage.save(
      file.buffer,
      CANDIDATE_DOCS_SUBDIR,
      file.originalname,
    );

    const now = new Date();

    // As in createStudentDocument, the disk write cannot join the DB transaction,
    // so roll the orphaned file back off disk if the insert throws.
    const document = await this.prisma
      .$transaction((tx) =>
        tx.student_document.create({
          data: {
            // The legacy free-text `title` and `document_type` both collapse into
            // the single `label` column that exists; the resolved type title wins.
            label: docType.title ?? dto.title ?? null,
            file: path,
            // ID-SPACE MISMATCH (deliberately preserved — see notFixed): the real
            // application flow stores a real applications.application_id here, but a
            // candidate doc stores a leads.id (there is NO candidate_id column, and
            // listCandidateDocuments reads this column back as the lead id). Changing
            // the column now would silently detach every existing candidate doc, so
            // the legacy behaviour is kept and the row is scoped through the lead
            // above instead. The candidate_documents/ file prefix is the
            // discriminator that stops this overloaded id from colliding with a real
            // application (see isCandidateDocFile / listCandidateDocuments).
            application_id: candidateId,
            created_by: userId,
            created_at: now,
            updated_by: userId,
            updated_at: now,
          },
        }),
      )
      .catch(async (err) => {
        await this.storage.delete(path);
        throw err;
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
    user: AccessUser,
    file?: UploadedFileType,
  ) {
    const userId = Number(user.userId ?? user.id);
    const existing = await this.findCandidateDocument(documentId);

    // Record-access: 403 unless the caller may access the owning application/lead.
    // The :id is the DOCUMENT id, so this route can target ANY student_document
    // row (a real applicant's / converted student's doc, not just a candidate's);
    // assertCanAccessDocumentRow resolves whichever it is and scopes to it. The
    // stored file is only ever replaced from freshly uploaded bytes below (a
    // server-generated path via StorageService) — no client-supplied path is honoured.
    await this.access.assertCanAccessDocumentRow(user, existing);

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

    // Replace the stored file only when a new one was actually attached. This route
    // can target ANY student_document by its id, so PRESERVE the row's class: write
    // the replacement under the SAME prefix the row already has — candidate rows stay
    // under candidate_documents/, application/student rows stay under
    // student_documents/. Saving every replacement under candidate_documents/ would
    // flip a non-candidate row into looking like a candidate doc and corrupt the
    // overloaded-id discriminator (common/candidate-doc.ts), so the class cannot be
    // changed by an edit.
    if (file?.buffer?.length) {
      const subdir = isCandidateDocFile(existing.file)
        ? CANDIDATE_DOCS_SUBDIR
        : STUDENT_DOCS_SUBDIR;
      data.file = await this.storage.save(file.buffer, subdir, file.originalname);
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
  async deleteCandidateDocument(documentId: number, user: AccessUser) {
    const userId = Number(user.userId ?? user.id);
    const existing = await this.findCandidateDocument(documentId);

    // Record-access: 403 unless the caller may access the owning application/lead
    // (same resolution as updateCandidateDocument — this route also acts on any
    // student_document row by its id, so it must be scoped before the soft delete).
    await this.access.assertCanAccessDocumentRow(user, existing);

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

  /**
   * Ensure the candidate (lead) exists and is not soft-deleted, else 404. Returns
   * the lead's ownership columns (created_by / telecaller_id) so the caller can run
   * the lead record-access check (assertCanViewLead).
   */
  private async assertCandidateExists(candidateId: number) {
    const candidate = await this.prisma.leads.findFirst({
      where: { id: candidateId, deleted_at: null },
      select: { id: true, created_by: true, telecaller_id: true },
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
