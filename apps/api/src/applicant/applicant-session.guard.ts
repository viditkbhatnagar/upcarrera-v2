import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { effectiveStage } from '../workflow/stages';
import { ApplicantRequest } from './applicant-context';
import { ApplicantSessionService } from './applicant-session.service';

export const APPLICANT_SESSION_HEADER = 'x-applicant-session';

/**
 * CRITIQUE #1 — the revocable applicant session.
 *
 * The session JWT is only a short-lived bearer. This guard runs on EVERY
 * protected public request and RE-READS the application_magic_link row, so a
 * session is rejected the instant its link is no longer usable — never trusting
 * the JWT alone. A 401 ends any already-issued session when:
 *   - the link was revoked (staff Revoke, or a Resend/Reopen that replaced it),
 *   - the link was consumed (the student already submitted),
 *   - email_status is not 'sent' (a pending/failed send),
 *   - the link has passed MAGIC_LINK_TTL_HOURS,
 *   - the application is gone/archived/converted, or no longer at form_pending.
 *
 * It sets req.applicant (applicationId + linkId) and DELIBERATELY never sets
 * req.user, so an applicant can never be seen by a staff decorator/guard, and
 * no application id is ever accepted from the URL — only from the session.
 */
@Injectable()
export class ApplicantSessionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly session: ApplicantSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ApplicantRequest>();
    const header = req.headers?.[APPLICANT_SESSION_HEADER];
    const token = Array.isArray(header) ? header[0] : (header as string | undefined);

    const claims = this.session.verify(token);
    if (!claims) throw new UnauthorizedException('Your session has ended. Please reopen the link from your email.');

    const link = await this.prisma.application_magic_link.findUnique({
      where: { id: claims.lid },
      select: {
        id: true,
        application_id: true,
        revoked_at: true,
        consumed_at: true,
        email_status: true,
        expires_at: true,
      },
    });

    const now = new Date();
    const linkLive =
      link != null &&
      link.application_id === claims.aid &&
      link.revoked_at == null &&
      link.consumed_at == null &&
      link.email_status === 'sent' &&
      link.expires_at.getTime() > now.getTime();
    if (!linkLive) {
      throw new UnauthorizedException('Your session has ended. Please reopen the link from your email.');
    }

    const application = await this.prisma.applications.findFirst({
      where: { application_id: claims.aid, deleted_at: null },
      select: { application_id: true, stage: true, is_converted: true, is_archived: true, status: true },
    });
    const usable =
      application != null &&
      application.is_converted !== 1 &&
      application.is_archived !== true &&
      effectiveStage(application) === 'form_pending';
    if (!usable) {
      throw new UnauthorizedException('Your session has ended. Please reopen the link from your email.');
    }

    req.applicant = { applicationId: claims.aid, linkId: claims.lid };
    return true;
  }
}
