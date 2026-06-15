import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Optional metadata for POST /leads/bulk-import (multipart).
 *
 * The .xlsx file itself arrives via FileInterceptor (@UploadedFile); these
 * scalar fields mirror the legacy bulk-upload form
 * (App/Controllers/App/Leads.php::bulk_upload_add):
 *   - excel_title  -> lead_upload.title (the batch label)
 *   - lead_source_id, course_id -> stamped onto every imported lead row
 *
 * All optional: a bare file upload still imports. Multipart values arrive as
 * strings, so @Type coerces the numeric fields before validation.
 */
export class BulkImportLeadsDto {
  /** Batch label stored on the lead_upload row (legacy `excel_title`). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  /** Stamped onto every imported lead (legacy leads.lead_source_id). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lead_source_id?: string;

  /** Stamped onto every imported lead (legacy leads.course_id). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  course_id?: number;
}
