import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { applications } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../integrations/email.service';
import {
  EmailTemplateKey,
  EmailTemplatesService,
} from '../integrations/email-templates.service';
import { AuditService } from '../workflow/audit.service';
import { RecordAccessService, AccessUser, AccessScope } from '../workflow/record-access.service';
import { StageEngineService } from '../workflow/stage-engine.service';
import { effectiveStage } from '../workflow/stages';
import { ApplicantConfig } from './applicant-config';
import { ProgramReferenceService } from './program-reference.service';
import { ApplicationProgressService } from './application-progress.service';

/** Max magic links an application may be issued in a rolling 24h (anti email-bomb). */
const LINK_CAP_PER_24H = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface IssueLinkResult {
  link_id: number;
  expires_at: Date;
  sent_to: string | null;
  email_status: string;
}

type RevokeReason = 'resend' | 'reopen' | 'email_failed' | 'manual' | 'application_closed';

function generateRawToken(): string {
  return randomBytes(32).toString('base64url'); // 43-char base64url
}
function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex'); // 64-char lower hex
}
function formatExpiry(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

/**
 * Issues, inspects and revokes magic links. SECURITY invariants:
 *  - the raw 256-bit token exists ONLY in the email (URL #fragment); the DB keeps
 *    only its SHA-256 hash.
 *  - CRITIQUE #20: the new link is created 'pending' and the email is sent FIRST;
 *    only after a confirmed send is it marked 'sent' and the previous live link
 *    revoked — so a Graph failure never leaves the student with no working link.
 *  - at most one 'sent' (usable) link at a time, and <= 5 links / 24h (cap).
 *  - emails go with saveToSentItems=false so the token never lands in Sent Items,
 *    and every student/staff-typed value is HTML-escaped (CRITIQUE #14).
 */
@Injectable()
export class MagicLinkService {
  private readonly logger = new Logger(MagicLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ApplicantConfig,
    private readonly email: EmailService,
    private readonly templates: EmailTemplatesService,
    private readonly stageEngine: StageEngineService,
    private readonly audit: AuditService,
    private readonly access: RecordAccessService,
    private readonly programRef: ProgramReferenceService,
    private readonly progress: ApplicationProgressService,
  ) {}

  // ---- staff: POST /applications/:id/magic-link ----------------------------

  async issueFromStaff(
    applicationId: number,
    dto: { resend?: boolean },
    user: AccessUser,
  ): Promise<IssueLinkResult> {
    const application = await this.loadApplication(applicationId);
    const scope = await this.assertOwnerOrAdmin(user, application);
    this.assertIssuable(application);

    const stage = effectiveStage(application);
    if (stage !== 'lead_added' && stage !== 'form_pending') {
      throw new ConflictException(
        'A magic link can only be sent while the application is awaiting its form.',
      );
    }
    const firstSend = stage === 'lead_added';
    const purpose = firstSend ? 'initial' : 'resend';

    return this.createAndSend({
      application,
      purpose,
      actor: this.actor(user, scope),
      emailKey: 'application-magic-link',
      extraVars: {},
      moveStageAction: firstSend ? 'send_form' : null,
      revokeReason: 'resend',
    });
  }

  // ---- staff: reopen (called by ApplicationFormService) --------------------

  /**
   * Issue a 'reopen' link and, on a confirmed send, move the stage 3 -> 2 with the
   * reason (logged on the stage event, which the public read surfaces as the
   * student's banner). On a send failure the stage is NOT moved (clean rollback).
   */
  async issueForReopen(
    application: applications,
    user: AccessUser,
    scope: AccessScope,
    reason: string,
  ): Promise<IssueLinkResult> {
    return this.createAndSend({
      application,
      purpose: 'reopen',
      actor: this.actor(user, scope),
      emailKey: 'application-form-reopened',
      extraVars: { reason },
      moveStageAction: 'reopen',
      moveStageReason: reason,
      revokeReason: 'reopen',
    });
  }

  // ---- staff: GET /applications/:id/magic-link -----------------------------

  async status(applicationId: number) {
    await this.loadApplication(applicationId);
    const now = new Date();
    const links = await this.prisma.application_magic_link.findMany({
      where: { application_id: applicationId },
      orderBy: { id: 'desc' },
    });

    const active = links.find(
      (l) =>
        l.revoked_at == null &&
        l.consumed_at == null &&
        l.email_status === 'sent' &&
        l.expires_at.getTime() > now.getTime(),
    );

    const consumed = links
      .filter((l) => l.consumed_at != null)
      .sort((a, b) => (b.consumed_at!.getTime() ?? 0) - (a.consumed_at!.getTime() ?? 0))[0];

    const [progress, form] = await Promise.all([
      this.progress.compute(applicationId),
      this.prisma.application_form.findUnique({
        where: { application_id: applicationId },
        select: { declaration_accepted_at: true },
      }),
    ]);

    return {
      active: active
        ? {
            link_id: active.id,
            purpose: active.purpose,
            sent_to: active.sent_to_email,
            email_status: active.email_status,
            expires_at: active.expires_at,
            first_opened_at: active.first_opened_at,
            last_opened_at: active.last_opened_at,
            open_count: active.open_count,
          }
        : null,
      history: links.map((l) => ({
        link_id: l.id,
        purpose: l.purpose,
        email_status: l.email_status,
        sent_to: l.sent_to_email,
        created_at: l.created_at,
        expires_at: l.expires_at,
        consumed_at: l.consumed_at,
        revoked_at: l.revoked_at,
        revoke_reason: l.revoke_reason,
        open_count: l.open_count,
        last_opened_at: l.last_opened_at,
      })),
      progress,
      last_submitted_at: consumed?.consumed_at ?? form?.declaration_accepted_at ?? null,
    };
  }

  // ---- staff: DELETE /applications/:id/magic-link --------------------------

  async revoke(applicationId: number, user: AccessUser) {
    const application = await this.loadApplication(applicationId);
    const scope = await this.assertOwnerOrAdmin(user, application);
    const actor = this.actor(user, scope);
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const revoked = await this.revokeLiveLinks(tx, applicationId, 'manual', actor.userId, now);
      await this.audit.record(tx, {
        action: 'magic_link_revoked',
        entity: 'application_magic_link',
        applicationId,
        reason: 'manual',
        actorId: actor.userId,
        actorRoleId: actor.roleId,
        ip: actor.ip,
      });
      return revoked;
    });

    return { revoked: result };
  }

  // ---- the send-first core -------------------------------------------------

  private async createAndSend(args: {
    application: applications;
    purpose: 'initial' | 'resend' | 'reopen';
    actor: { userId: number; roleId: number | null; ip: string | null };
    emailKey: EmailTemplateKey;
    extraVars: Record<string, string>;
    moveStageAction: 'send_form' | 'reopen' | null;
    moveStageReason?: string;
    revokeReason: RevokeReason;
  }): Promise<IssueLinkResult> {
    const { application } = args;
    const applicationId = application.application_id;

    await this.assertUnderCap(applicationId);

    const raw = generateRawToken();
    const tokenHash = hashToken(raw);
    const now = new Date();
    const expiresAt = this.config.expiresAt(now);
    const sentTo = application.email?.trim() || null;

    // tx1: lock the application row, re-check the cap under the lock, create the
    // link as 'pending' (NOT usable yet) and ensure the form row exists. The old
    // link is intentionally left live until the new email is confirmed sent.
    const linkId = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT application_id FROM applications WHERE application_id = ${applicationId} FOR UPDATE`,
      );
      await this.assertUnderCap(applicationId, tx);

      const link = await tx.application_magic_link.create({
        data: {
          application_id: applicationId,
          token_hash: tokenHash,
          purpose: args.purpose,
          sent_to_email: sentTo,
          email_status: 'pending',
          expires_at: expiresAt,
          created_by: args.actor.userId,
          created_at: now,
        },
      });

      await this.ensureFormRow(tx, applicationId, now);
      return link.id;
    });

    // Render + send OUTSIDE any transaction. saveToSentItems=false so the token
    // never reaches the shared Sent Items.
    const magicUrl = this.config.buildMagicLinkUrl(raw);
    try {
      await this.sendLinkEmail(application, args.emailKey, magicUrl, expiresAt, args.extraVars);
    } catch (err) {
      await this.prisma.application_magic_link.update({
        where: { id: linkId },
        data: {
          email_status: 'failed',
          email_error: (err as Error).message.slice(0, 250),
          revoked_at: new Date(),
          revoke_reason: 'email_failed',
        },
      });
      this.logger.error(
        `Magic link ${linkId} email failed for application ${applicationId}: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'We could not send the application email just now. The previous link (if any) is still valid. Please try again.',
      );
    }

    // tx2: mark the new link sent, revoke the previous live link(s), and (only on
    // a confirmed send) move the stage. A concurrent move makes the guarded
    // transition 409 — safe, the email already went.
    const confirmedAt = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        // SECURITY LOW 5: re-check eligibility UNDER the lock — the link must still
        // be the pending one we created, not revoked/consumed by a Revoke that
        // landed while the email was in flight. Exactly one row must flip to 'sent'.
        const activated = await tx.application_magic_link.updateMany({
          where: { id: linkId, email_status: 'pending', revoked_at: null, consumed_at: null },
          data: { email_status: 'sent', email_sent_at: confirmedAt },
        });
        if (activated.count !== 1) {
          throw new ConflictException('This link was revoked before it could be activated.');
        }
        await this.revokeLiveLinks(tx, applicationId, args.revokeReason, args.actor.userId, confirmedAt, linkId);

        if (args.moveStageAction) {
          await this.stageEngine.transition(tx, application, args.moveStageAction, {
            userId: args.actor.userId,
            roleId: args.actor.roleId,
            actorType: 'user',
            ip: args.actor.ip,
          }, { reason: args.moveStageReason ?? null, refTable: 'application_magic_link', refId: linkId });
        }

        await this.audit.record(tx, {
          action: 'magic_link_sent',
          entity: 'application_magic_link',
          entityId: linkId,
          applicationId,
          field: 'email_status',
          newValue: 'sent',
          reason: args.purpose,
          actorId: args.actor.userId,
          actorRoleId: args.actor.roleId,
          ip: args.actor.ip,
        });
      });
    } catch (err) {
      // SECURITY LOW 5: the email went out but we could NOT activate the new link
      // (a concurrent Revoke, or a DB failure in tx2). Mark the pending link failed
      // so it can never become usable, and DELIBERATELY leave the previous link
      // live (tx2 never ran, so it was never revoked) — the applicant is not locked
      // out, and the invariant "do not revoke the old link until the new email is
      // confirmed sent" still holds.
      await this.markLinkFailed(linkId, err as Error);
      this.logger.error(
        `Magic link ${linkId} activation (tx2) failed for application ${applicationId}: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'We could not finish issuing the application link just now. The previous link (if any) is still valid. Please try again.',
      );
    }

    return { link_id: linkId, expires_at: expiresAt, sent_to: sentTo, email_status: 'sent' };
  }

  private async sendLinkEmail(
    application: applications,
    key: EmailTemplateKey,
    magicUrl: string,
    expiresAt: Date,
    extraVars: Record<string, string>,
  ): Promise<void> {
    if (!application.email?.trim()) {
      throw new ServiceUnavailableException('The application has no email address to send the link to.');
    }
    const baseVars = await this.programRef.emailVars(application);
    // Values are passed RAW; EmailTemplatesService.render() HTML-escapes every
    // placeholder centrally (SECURITY MEDIUM 2) and leaves system URL keys
    // (magic_link) raw, so there is no double-escaping here.
    const rendered = this.templates.render(key, {
      ...baseVars,
      ...extraVars,
      magic_link: magicUrl, // system URL — allowlisted raw in render()
      link_expiry_date: formatExpiry(expiresAt),
    });
    await this.email.sendEmail({
      to: application.email.trim(),
      name: application.name ?? 'Applicant',
      subject: rendered.subject,
      html: rendered.html,
      saveToSentItems: false,
    });
  }

  // ---- helpers -------------------------------------------------------------

  private async revokeLiveLinks(
    tx: Prisma.TransactionClient,
    applicationId: number,
    reason: RevokeReason,
    revokedBy: number | null,
    now: Date,
    exceptId?: number,
  ): Promise<number> {
    const res = await tx.application_magic_link.updateMany({
      where: {
        application_id: applicationId,
        revoked_at: null,
        consumed_at: null,
        // SECURITY LOW 5: revoke PENDING links too, not only sent ones. A staff
        // Revoke that lands while a resend/reopen email is in flight must kill the
        // pending link, otherwise tx2 would still activate it after the Revoke.
        email_status: { in: ['sent', 'pending'] },
        ...(exceptId != null ? { id: { not: exceptId } } : {}),
      },
      data: { revoked_at: now, revoke_reason: reason, revoked_by: revokedBy },
    });
    return res.count;
  }

  /**
   * SECURITY LOW 5: best-effort mark a link failed (and revoke it if a concurrent
   * Revoke has not already), so a link whose activation (tx2) failed can never
   * become usable. Never throws — it runs on an error path and must not mask the
   * original failure.
   */
  private async markLinkFailed(linkId: number, err: Error): Promise<void> {
    try {
      await this.prisma.application_magic_link.updateMany({
        where: { id: linkId, revoked_at: null },
        data: { revoked_at: new Date(), revoke_reason: 'email_failed' },
      });
      await this.prisma.application_magic_link.update({
        where: { id: linkId },
        data: { email_status: 'failed', email_error: err.message.slice(0, 250) },
      });
    } catch (e) {
      this.logger.error(`Could not mark magic link ${linkId} failed: ${(e as Error).message}`);
    }
  }

  private async ensureFormRow(tx: Prisma.TransactionClient, applicationId: number, now: Date): Promise<void> {
    const existing = await tx.application_form.findUnique({
      where: { application_id: applicationId },
      select: { id: true },
    });
    if (!existing) {
      await tx.application_form.create({
        data: { application_id: applicationId, created_at: now },
      });
    }
  }

  private async assertUnderCap(applicationId: number, tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.prisma;
    const since = new Date(Date.now() - DAY_MS);
    const count = await db.application_magic_link.count({
      where: { application_id: applicationId, created_at: { gte: since } },
    });
    if (count >= LINK_CAP_PER_24H) {
      throw new ConflictException(
        `This application has reached the limit of ${LINK_CAP_PER_24H} links in 24 hours. Please try again later.`,
      );
    }
  }

  private assertIssuable(application: applications): void {
    if (!application.email?.trim()) {
      throw new BadRequestException('Add an email address to the application before sending a link.');
    }
    if (application.is_converted === 1) {
      throw new ConflictException('This application has already been converted.');
    }
    if (application.is_archived === true) {
      throw new ConflictException('This application is archived.');
    }
  }

  private async assertOwnerOrAdmin(user: AccessUser, application: applications): Promise<AccessScope> {
    const scope = await this.access.scopeFor(user);
    if (scope.scope === 'all') return scope;
    if (
      scope.scope === 'owners' &&
      scope.roleKey === 'counsellor' &&
      this.access.canSee(scope, application)
    ) {
      return scope;
    }
    throw new ForbiddenException('Only the owning counsellor or an administrator can manage this link.');
  }

  private actor(user: AccessUser, scope: AccessScope): { userId: number; roleId: number | null; ip: string | null } {
    return {
      userId: Number(user.userId ?? user.id),
      roleId: scope.roleId,
      ip: null,
    };
  }

  private async loadApplication(applicationId: number): Promise<applications> {
    const application = await this.prisma.applications.findFirst({
      where: { application_id: applicationId, deleted_at: null },
    });
    if (!application) throw new NotFoundException('Application not found!');
    return application;
  }
}
