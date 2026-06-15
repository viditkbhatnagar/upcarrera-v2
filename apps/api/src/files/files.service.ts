import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import { CreateStudentDocumentDto } from './dto/create-student-document.dto';
import { UploadedFileType } from './uploaded-file.type';

/** Subdir under uploads/ for ad-hoc uploads and student docs respectively. */
const GENERIC_SUBDIR = 'files';
const STUDENT_DOCS_SUBDIR = 'student_documents';

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
}
