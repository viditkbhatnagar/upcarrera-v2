import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Port of the legacy Document_type form. The legacy controller only wrote
 * `title` (plus created_by/at). title is VarChar(160) and nullable in the
 * schema, so it is optional here.
 */
export class CreateDocumentTypeDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;
}
