import {
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../workflow/audit.service';
import { effectiveStage } from '../workflow/stages';
import { ApplicantSessionService } from './applicant-session.service';
import { ApplicantContext } from './applicant-context';

/** The raw token is 32 random bytes base64url-encoded => exactly 43 chars. */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export interface SessionResult {
  session: string;
  expires_at: Date;
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Exchanges a raw magic-link token for an applicant session, and slides it on
 * refresh. Failure codes are deliberate so the SPA shows the right screen, and
 * nothing leaks to an attacker: reaching any 410 branch already required a valid
 * 256-bit token (an unknown token is an indistinguishable 404 LINK_INVALID).
 */
@Injectable()
export class PublicSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly session: ApplicantSessionService,
  ) {}

  async exchange(rawToken: string | undefined, ip: string | null): Promise<SessionResult> {
    // Validate the shape BEFORE any DB hit; a malformed token is simply invalid.
    if (!rawToken || !TOKEN_RE.test(rawToken)) {
      throw new NotFoundException({ message: 'This link is not valid.', code: 'LINK_INVALID' });
    }

    const link = await this.prisma.application_magic_link.findUnique({
      where: { token_hash: hashToken(rawToken) },
    });
    if (!link) {
      throw new NotFoundException({ message: 'This link is not valid.', code: 'LINK_INVALID' });
    }

    const now = new Date();

    if (link.consumed_at != null) {
      throw this.alreadySubmitted(link.application_id, link.consumed_at);
    }
    if (link.revoked_at != null) {
      const replaced = link.revoke_reason === 'resend' || link.revoke_reason === 'reopen';
      throw new GoneException({
        message: replaced
          ? 'A newer link was sent to your email. Please open the most recent one.'
          : 'This link is no longer active. Please ask your counsellor for a new one.',
        code: replaced ? 'LINK_REPLACED' : 'LINK_EXPIRED',
      });
    }
    if (link.email_status !== 'sent') {
      throw new NotFoundException({ message: 'This link is not valid.', code: 'LINK_INVALID' });
    }
    if (link.expires_at.getTime() <= now.getTime()) {
      throw new GoneException({
        message: 'This link has expired. Please ask your counsellor for a new one.',
        code: 'LINK_EXPIRED',
      });
    }

    const application = await this.prisma.applications.findFirst({
      where: { application_id: link.application_id, deleted_at: null },
      select: {
        application_id: true,
        custom_application_id: true,
        stage: true,
        is_converted: true,
        is_archived: true,
        status: true,
      },
    });
    if (!application) {
      throw new GoneException({
        message: 'This application is no longer available.',
        code: 'LINK_EXPIRED',
      });
    }
    if (application.is_converted === 1) {
      throw this.alreadySubmitted(application.application_id, link.consumed_at ?? now);
    }
    if (application.is_archived === true || effectiveStage(application) !== 'form_pending') {
      throw new GoneException({
        message: 'This application is not accepting form changes right now. Please contact your counsellor.',
        code: 'LINK_EXPIRED',
      });
    }

    // Success: record the open, then mint a session capped at the link expiry.
    await this.prisma.application_magic_link.update({
      where: { id: link.id },
      data: {
        open_count: { increment: 1 },
        first_opened_at: link.first_opened_at ?? now,
        last_opened_at: now,
        last_ip: ip ?? undefined,
      },
    });
    await this.audit.record(this.prisma, {
      action: 'applicant_link_opened',
      entity: 'application_magic_link',
      entityId: link.id,
      applicationId: link.application_id,
      actorType: 'applicant',
      ip,
    });

    const { token, expiresAt } = this.session.sign(link.application_id, link.id, link.expires_at, now);
    return { session: token, expires_at: expiresAt };
  }

  /** Slide the session for an already-validated context (the guard re-checked the link). */
  async refresh(applicant: ApplicantContext): Promise<SessionResult> {
    const link = await this.prisma.application_magic_link.findUnique({
      where: { id: applicant.linkId },
      select: { id: true, application_id: true, expires_at: true },
    });
    if (!link) {
      throw new GoneException({ message: 'Your session has ended.', code: 'LINK_EXPIRED' });
    }
    const { token, expiresAt } = this.session.sign(link.application_id, link.id, link.expires_at);
    return { session: token, expires_at: expiresAt };
  }

  private alreadySubmitted(applicationId: number, submittedAt: Date): GoneException {
    return new GoneException({
      message: 'This application has already been submitted. Thank you!',
      code: 'ALREADY_SUBMITTED',
      data: { submitted_at: submittedAt },
    });
  }
}
