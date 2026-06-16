import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for PATCH /students/documents/:id.
 * Ports App/Students::document_edit — updates a student_document row's label
 * (and optionally its stored file path). File upload itself is out of scope here;
 * the `file` path may be set directly by an upstream upload step.
 */
export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string;

  @IsOptional()
  @IsString()
  file?: string;
}
