import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Port of Demo_sessions::share_link() inputs. The legacy flow could share a demo
 * session's meeting link by email and/or WhatsApp. Here:
 *   - if EmailService is configured and an email is present, we send the invite;
 *   - we always return a wa.me deeplink string the client can open.
 *
 * The meeting link itself is resolved server-side from the teacher's user row
 * (users.meeting_link), exactly like the legacy share_link().
 */
export class ShareDemoSessionDto {
  /** Recipient email (optional — only used when EmailService is configured). */
  @IsOptional()
  @IsEmail()
  email?: string;

  /** Recipient display name for the email greeting. */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  lead_name?: string;

  /** WhatsApp country/dial code, e.g. '91'. Digits only. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  whatsapp_code?: string;

  /** WhatsApp number (without code). Digits only. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsapp?: string;
}
