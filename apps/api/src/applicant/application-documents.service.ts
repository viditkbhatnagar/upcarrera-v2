import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { ReadStream } from 'node:fs';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../files/storage.service';
import { AuditService } from '../workflow/audit.service';
import { RecordAccessService, AccessUser } from '../workflow/record-access.service';
import type { UploadedFileType } from '../files/uploaded-file.type';
import { ApplicantContext } from './applicant-context';
import { DocumentChecklistService } from './document-checklist.service';
import { ApplicationProgressService } from './application-progress.service';
import { extensionMatchesMime, sniffMime } from './magic-bytes';

const UPLOAD_SUBDIR = 'application_documents';
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_LIVE_DOCS = 30;
const MAX_TOTAL_BYTES = 75 * 1024 * 1024; // 75 MB

export interface StreamedFile {
  stream: ReadStream;
  mime: string;
  filename: string;
}

/**
 * Applicant document uploads. Every file is validated by MAGIC BYTES (PDF/JPG/PNG
 * only) — never the client header — kept <= 5 MB, stored under a non-public dir
 * via StorageService, and subject to a 30-document / 75 MB per-application quota.
 * Files are served only through the scoped download endpoints; the stored path is
 * never returned to any client.
 */
@Injectable()
export class ApplicationDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly checklist: DocumentChecklistService,
    private readonly progress: ApplicationProgressService,
    private readonly audit: AuditService,
    private readonly access: RecordAccessService,
  ) {}

  async upload(
    applicant: ApplicantContext,
    file: UploadedFileType | undefined,
    requirementId: number,
    ip: string | null,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file was uploaded.');
    }
    if (file.buffer.length > MAX_FILE_BYTES) {
      throw new BadRequestException('Each file must be 5 MB or smaller.');
    }

    // Trust the bytes, not the header/extension.
    const mime = sniffMime(file.buffer);
    if (!mime || !extensionMatchesMime(file.originalname ?? '', mime)) {
      throw new UnsupportedMediaTypeException('Only PDF, JPG or PNG files are accepted.');
    }

    const application = await this.loadApplication(applicant.applicationId);

    // requirement_id must belong to THIS application's resolved checklist.
    const checklist = await this.checklist.resolve(application);
    const requirement = checklist.find((c) => c.requirement_id === requirementId);
    if (!requirement) {
      throw new BadRequestException('That document is not part of your checklist.');
    }

    await this.assertUnderQuota(applicant.applicationId, file.buffer.length);

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const filePath = await this.storage.save(file.buffer, UPLOAD_SUBDIR, file.originalname ?? 'upload');
    const now = new Date();

    // SECURITY MEDIUM 3: when a single-file requirement replaces older uploads we
    // soft-delete those rows (kept for history) but must also unlink their bytes,
    // else a link holder could loop upload+replace to fill the disk unbounded. The
    // paths are captured inside the tx and unlinked only AFTER it commits.
    let replacedPaths: string[] = [];
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        // Replace semantics: a single-file requirement keeps only the latest.
        if (requirement.max_files <= 1) {
          const olds = await tx.application_document.findMany({
            where: {
              application_id: applicant.applicationId,
              requirement_id: requirementId,
              deleted_at: null,
            },
            select: { file_path: true },
          });
          replacedPaths = olds.map((o) => o.file_path).filter((p): p is string => !!p);
          await tx.application_document.updateMany({
            where: {
              application_id: applicant.applicationId,
              requirement_id: requirementId,
              deleted_at: null,
            },
            data: { deleted_at: now },
          });
        }

        const doc = await tx.application_document.create({
          data: {
            application_id: applicant.applicationId,
            requirement_id: requirementId,
            document_type_id: requirement.document_type_id,
            label: requirement.label,
            file_path: filePath,
            original_name: file.originalname ?? null,
            mime_type: mime,
            size_bytes: file.buffer.length,
            sha256,
            uploaded_via: 'applicant',
            magic_link_id: applicant.linkId,
            verification_status: 'pending',
            created_at: now,
          },
        });

        await this.audit.record(tx, {
          action: 'document_uploaded',
          entity: 'application_document',
          entityId: doc.id,
          applicationId: applicant.applicationId,
          actorType: 'applicant',
          newValue: requirement.label,
          ip,
        });
        return doc;
      });

      // Committed: drop the replaced files' bytes (best-effort; never throws).
      for (const p of replacedPaths) await this.storage.delete(p);

      await this.recomputeCompleted(applicant.applicationId, application.course_id);
      const progress = await this.progress.compute(applicant.applicationId);

      return {
        document: {
          id: created.id,
          requirement_id: created.requirement_id,
          label: created.label,
          original_name: created.original_name,
          size_bytes: created.size_bytes,
          uploaded_at: created.created_at,
        },
        progress,
      };
    } catch (err) {
      // The file was written before the row; roll it back on failure.
      await this.storage.delete(filePath);
      throw err;
    }
  }

  async remove(applicant: ApplicantContext, docId: number) {
    const doc = await this.prisma.application_document.findFirst({
      where: { id: docId, application_id: applicant.applicationId, deleted_at: null },
      select: { id: true, file_path: true },
    });
    if (!doc) throw new NotFoundException('Document not found.');

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.application_document.update({
        where: { id: doc.id },
        data: { deleted_at: now },
      });
      await this.audit.record(tx, {
        action: 'document_deleted',
        entity: 'application_document',
        entityId: doc.id,
        applicationId: applicant.applicationId,
        actorType: 'applicant',
      });
    });

    // SECURITY MEDIUM 3: keep the row (soft-deleted) for history, but unlink the
    // bytes so a link holder cannot loop upload+delete to fill the disk unbounded.
    // Best-effort and post-commit (never throws, no-op if already gone).
    await this.storage.delete(doc.file_path);

    const application = await this.loadApplication(applicant.applicationId);
    await this.recomputeCompleted(applicant.applicationId, application.course_id);
    const progress = await this.progress.compute(applicant.applicationId);
    return { deleted: true, progress };
  }

  /** Applicant streams THEIR OWN document. Any miss returns the same 404. */
  async streamOwn(applicant: ApplicantContext, docId: number): Promise<StreamedFile> {
    const doc = await this.prisma.application_document.findFirst({
      where: { id: docId, application_id: applicant.applicationId, deleted_at: null },
      select: { file_path: true, mime_type: true, original_name: true },
    });
    if (!doc) throw new NotFoundException('Document not found.');
    return this.toStream(doc);
  }

  /** Staff (record-access already enforced by the guard) streams a doc of :id. */
  async streamForStaff(applicationId: number, docId: number, user: AccessUser): Promise<StreamedFile> {
    await this.access.assertCanView(user, applicationId);
    const doc = await this.prisma.application_document.findFirst({
      where: { id: docId, application_id: applicationId, deleted_at: null },
      select: { file_path: true, mime_type: true, original_name: true },
    });
    if (!doc) throw new NotFoundException('Document not found.');
    return this.toStream(doc);
  }

  // ---- helpers -------------------------------------------------------------

  private async toStream(doc: {
    file_path: string;
    mime_type: string | null;
    original_name: string | null;
  }): Promise<StreamedFile> {
    const stream = await this.storage.streamPath(doc.file_path);
    return {
      stream,
      mime: doc.mime_type ?? 'application/octet-stream',
      filename: doc.original_name ?? this.storage.basename(doc.file_path),
    };
  }

  private async assertUnderQuota(applicationId: number, incomingBytes: number): Promise<void> {
    const agg = await this.prisma.application_document.aggregate({
      where: { application_id: applicationId, deleted_at: null },
      _count: { _all: true },
      _sum: { size_bytes: true },
    });
    const count = agg._count._all;
    const total = agg._sum.size_bytes ?? 0;
    if (count >= MAX_LIVE_DOCS) {
      throw new ConflictException(`You can keep at most ${MAX_LIVE_DOCS} documents on this application.`);
    }
    if (total + incomingBytes > MAX_TOTAL_BYTES) {
      throw new ConflictException('Your documents exceed the 75 MB total limit. Please remove some first.');
    }
  }

  private async recomputeCompleted(applicationId: number, courseId: number | null): Promise<void> {
    const coverage = await this.checklist.requiredCoverage(applicationId, courseId);
    await this.prisma.application_form.updateMany({
      where: { application_id: applicationId },
      data: { documents_completed_at: coverage.complete ? new Date() : null },
    });
  }

  private async loadApplication(applicationId: number) {
    const application = await this.prisma.applications.findFirst({
      where: { application_id: applicationId, deleted_at: null },
      select: { application_id: true, course_id: true },
    });
    if (!application) throw new NotFoundException('Application not found!');
    return application;
  }
}
