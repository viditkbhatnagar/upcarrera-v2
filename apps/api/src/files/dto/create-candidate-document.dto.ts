import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Body for POST /candidates/:id/documents (multipart). The file itself arrives
 * via FileInterceptor (@UploadedFile), so only the scalar fields live here.
 *
 * Legacy: App/Controllers/App/Upload_document::add() persisted
 * { candidate_id, title, document_type, document } onto the legacy
 * `student_document` table (columns: candidate_id/title/document_type/document).
 *
 * Schema note: this migration's `student_document` model (prisma schema) has NO
 * `candidate_id`, `title`, or `document_type` columns. The columns that exist
 * are `application_id` (the lead/candidate linkage — see convertApplication,
 * which stamps documents by application_id), `label` (free-text type/title), and
 * `file` (stored path). We therefore key candidate documents on `application_id`
 * and resolve `document_type.title` into `label`, mirroring the existing
 * createStudentDocument behaviour against the real columns.
 *
 * The candidate id comes from the route param, not the body. Multipart values
 * arrive as strings, so @Type coerces `document_type_id` to a number before
 * @IsInt runs.
 */
export class CreateCandidateDocumentDto {
  /** Human-readable document title (legacy `title`); kept alongside the type. */
  @IsString()
  @IsNotEmpty()
  title!: string;

  /** document_type FK; its `title` is resolved into the stored `label`. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  document_type_id!: number;
}
