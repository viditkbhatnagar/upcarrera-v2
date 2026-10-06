import { Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * A honeypot field. Legitimate clients never set it (it is hidden in the UI); a
 * bot that fills it is silently rejected. Present on every public write DTO.
 */
class HoneypotBase {
  @IsOptional() @IsString() @MaxLength(200)
  website?: string;
}

/** POST /public/application/session — exchange the raw token for a session. */
export class ExchangeSessionDto extends HoneypotBase {
  @IsString()
  @MaxLength(64)
  token!: string;
}

/**
 * PUT /public/application/sections/:section — the envelope. `data` is validated
 * per-section in the service (validateStrict) against the matching section DTO,
 * since its shape depends on :section.
 */
export class SaveSectionDto extends HoneypotBase {
  @IsObject()
  data!: Record<string, unknown>;

  @IsOptional() @IsBoolean()
  complete?: boolean;

  @IsInt() @Min(0)
  row_version!: number;
}

/** POST /public/application/program/confirm */
export class ProgramConfirmDto extends HoneypotBase {
  @IsOptional() @IsString() @MaxLength(500)
  change_request?: string;

  @IsOptional() @IsInt() @Min(0)
  row_version?: number;
}

/** POST /public/application/submit — both declaration boxes must be true. */
export class SubmitApplicationDto extends HoneypotBase {
  @IsBoolean()
  @Equals(true, { message: 'You must confirm the information is accurate.' })
  accept_accuracy!: boolean;

  @IsBoolean()
  @Equals(true, { message: 'You must accept the terms to submit.' })
  accept_terms!: boolean;

  @IsInt() @Min(0)
  row_version!: number;
}

/** POST /public/application/documents — multipart text field (string -> number). */
export class UploadDocumentDto extends HoneypotBase {
  @Type(() => Number)
  @IsInt() @Min(1)
  requirement_id!: number;
}
