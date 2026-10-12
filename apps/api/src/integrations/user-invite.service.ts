import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { EmailTemplatesService } from './email-templates.service';

/**
 * Provisioning helper shared by every "create a staff login" path (admin Add User,
 * Add Counsellor). It generates the temporary password and sends the invite email
 * that carries it, so the password lives in the email body and never on the
 * creator's screen (ops decision, 2026-10). Keeping it in one place means both
 * flows stay identical (template, expiry copy, failure handling).
 */
@Injectable()
export class UserInviteService {
  private readonly logger = new Logger(UserInviteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly templates: EmailTemplatesService,
  ) {}

  /**
   * A strong temporary password: base64url of 12 random bytes (16 chars,
   * clipboard/URL-safe) plus a digit+symbol, so it always clears the min-8 policy
   * and any mixed-class rule a stricter policy might add later.
   */
  generateTempPassword(): string {
    return crypto.randomBytes(12).toString('base64url') + '7#';
  }

  /**
   * Best-effort welcome email carrying the temporary password. Returns true on a
   * successful send, false otherwise (no email address, mailer not configured, or
   * a send error) — callers must never let a failed invite undo the user create.
   */
  async sendInvite(
    user: { name: string | null; email: string | null; role_id: number | null },
    tempPassword: string,
  ): Promise<boolean> {
    if (!user.email || !this.email.isConfigured) return false;
    try {
      const roleTitle = user.role_id
        ? ((await this.prisma.user_role.findFirst({ where: { id: user.role_id } }))?.title ?? 'Staff')
        : 'Staff';
      const first = (user.name ?? '').trim().split(/\s+/)[0] || 'there';
      const rendered = this.templates.render('user-invite', {
        invited_by: 'Your upCarrera administrator',
        first_name: first,
        email: user.email,
        role: roleTitle,
        temp_password: tempPassword,
        login_url: process.env.MAIL_LOGIN_URL ?? 'https://admin.upcarrera.com/login',
      });
      await this.email.sendEmail({
        to: user.email,
        name: user.name ?? 'there',
        subject: rendered.subject,
        html: rendered.html,
        saveToSentItems: false,
      });
      return true;
    } catch (err) {
      this.logger.error(`User invite email to ${user.email} failed: ${(err as Error).message}`);
      return false;
    }
  }
}
