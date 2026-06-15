import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Port of Sessions_model — the legacy `sessions` table is thin. Per schema.prisma
 * the only business column is `session_title` (timestamps + audit columns are
 * managed by the service). The legacy app performed no validation, so the field
 * is optional; we only enforce type + column length.
 */
export class CreateSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(260)
  session_title?: string;
}
