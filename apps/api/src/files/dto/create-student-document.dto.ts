import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Body for POST /files/student-document (multipart). The file itself arrives
 * via FileInterceptor (@UploadedFile), so only the scalar fields are here.
 *
 * Schema note: the real `student_document` table has NO `document_type_id`
 * column — it stores a free-text `label` (e.g. "Aadhar Card") and the path in
 * `file` (see prisma schema + legacy Application.php $doc_data). We accept the
 * task's `document_type_id`, look up document_type.title, and persist it into
 * `label`, so the human-readable type is preserved against the real columns.
 *
 * Values come as multipart strings, so @Type coerces them to numbers before
 * @IsInt runs.
 */
export class CreateStudentDocumentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  student_id!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  document_type_id!: number;

  /** Optional application linkage — the table supports application_id too. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  application_id?: number;
}
