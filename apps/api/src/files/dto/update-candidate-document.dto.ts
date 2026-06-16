import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Body for PATCH /candidates/documents/:id (multipart). All fields are optional
 * — the legacy App/Controllers/App/Upload_document::edit() only updated the
 * fields supplied and replaced the file only when a new one was attached.
 *
 * The replacement file (if any) arrives via FileInterceptor (@UploadedFile).
 * When `document_type_id` is supplied we re-resolve document_type.title into the
 * stored `label` (see CreateCandidateDocumentDto for the schema mapping notes).
 */
export class UpdateCandidateDocumentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  document_type_id?: number;
}
