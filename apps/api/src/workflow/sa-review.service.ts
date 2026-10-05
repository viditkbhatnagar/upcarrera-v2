import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { applications } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StudentsService } from '../students/students.service';
import { EmailService } from '../integrations/email.service';
import { EmailTemplatesService } from '../integrations/email-templates.service';
import { AuditService } from './audit.service';
import { RecordAccessService, AccessUser } from './record-access.service';
import { StageEngineService, StageActor } from './stage-engine.service';
import { canonicalCourseLevel, effectiveStage, effectiveStageWhere } from './stages';
import { ReviewDocumentDto, SaReviewDto } from './dto/workflow-action.dto';

const BCRYPT_ROUNDS = 10;

/**
 * Student Affairs (stages 6-7): per-document verify/reject, then the application
 * decision — approve (runs the race-safe conversion saga), send back to the
 * counsellor, or reject (archives the application).
 */
@Injectable()
export class SaReviewService {
  private readonly logger = new Logger(SaReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly students: StudentsService,
    private readonly stageEngine: StageEngineService,
    private readonly audit: AuditService,
    private readonly access: RecordAccessService,
    private readonly email: EmailService,
    private readonly templates: EmailTemplatesService,
  ) {}

  // ---- per-document verdict -------------------------------------------------

  async reviewDocument(
    applicationId: number,
    documentId: number,
    dto: ReviewDocumentDto,
    user: AccessUser,
  ) {
    const application = await this.loadApplication(applicationId);
    if (effectiveStage(application) !== 'sa_verification') {
      throw new ConflictException('Documents can only be reviewed during Student Affairs verification.');
    }
    this.assertNotOnHold(application); // CRITIQUE #5: no review on a held application
    // CRITIQUE #5: stage-ownership, not just the review slug. Only Student Affairs
    // (the sa_verification owner) or an Admin may record a document verdict.
    const reviewScope = await this.access.scopeFor(user);
    if (reviewScope.scope !== 'all' && reviewScope.roleKey !== 'student_affairs') {
      throw new ForbiddenException('Only Student Affairs can review documents.');
    }
    if (dto.status === 'rejected' && !dto.reason?.trim()) {
      throw new BadRequestException('A reason is required to reject a document');
    }

    const document = await this.prisma.application_document.findFirst({
      where: { id: documentId, application_id: applicationId, deleted_at: null },
    });
    if (!document) throw new NotFoundException('Document not found');

    const scope = reviewScope;
    const actorUserId = Number(user.userId ?? user.id);
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const d = await tx.application_document.update({
        where: { id: document.id },
        data: {
          verification_status: dto.status,
          reviewed_by: actorUserId,
          reviewed_at: now,
          rejection_reason: dto.status === 'rejected' ? (dto.reason ?? null) : null,
          updated_at: now,
        },
      });
      await this.audit.record(tx, {
        action: 'doc_review',
        entity: 'application_document',
        entityId: document.id,
        applicationId,
        field: 'verification_status',
        oldValue: document.verification_status,
        newValue: dto.status,
        reason: dto.status === 'rejected' ? (dto.reason ?? null) : null,
        actorId: actorUserId,
        actorRoleId: scope.roleId,
      });
      return d;
    });

    return updated;
  }

  // ---- the application decision ---------------------------------------------

  async decide(applicationId: number, dto: SaReviewDto, user: AccessUser) {
    const application = await this.loadApplication(applicationId);
    if (effectiveStage(application) !== 'sa_verification') {
      throw new ConflictException('This application is not awaiting Student Affairs review.');
    }
    this.assertNotOnHold(application); // CRITIQUE #5: no SA decision on a held application

    // CRITIQUE #5: stage-ownership — the action (approve|send_back|reject) must be
    // allowed for this user at sa_verification (SA owner, or Admin on behalf).
    const scope = await this.access.assertAction(user, application, dto.decision);
    const actor: StageActor = {
      userId: Number(user.userId ?? user.id),
      roleId: scope.roleId,
      onBehalf: scope.scope === 'all',
    };

    switch (dto.decision) {
      case 'approve':
        return this.approve(application, dto, actor);
      case 'send_back':
        return this.sendBack(application, dto, actor);
      case 'reject':
        return this.reject(application, dto, actor);
      default:
        throw new BadRequestException('Unknown decision');
    }
  }

  private async approve(application: applications, dto: SaReviewDto, actor: StageActor) {
    if (!dto.identity_ok || !dto.eligibility_ok || !dto.legible_ok || !dto.program_ok) {
      throw new BadRequestException('All four checks must pass before approval');
    }

    // CRITIQUE #6: the required-document checklist must be satisfied — and a
    // zero-document application can never convert.
    await this.assertRequiredDocuments(application);

    // CRITIQUE #10: validate the narrow LMS target widths before the transaction.
    this.students.assertConvertible(application);

    // Hash BEFORE the transaction; source the fee ledger from the verified payment.
    const hashedPassword = await bcrypt.hash(application.phone ?? '', BCRYPT_ROUNDS);
    const payment = await this.prisma.application_payment.findFirst({
      where: { application_id: application.application_id, status: 'verified', deleted_at: null },
      orderBy: { id: 'desc' },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const conversion = await this.students.runConversion(
        tx,
        application,
        { userId: actor.userId, roleId: actor.roleId },
        {
          hashedPassword,
          payment,
          event: 'converted',
          // CRITIQUE #4: only claim while still at sa_verification and not on hold.
          claimStageWhere: effectiveStageWhere('sa_verification'),
        },
      );
      await tx.application_sa_review.create({
        data: {
          application_id: application.application_id,
          identity_ok: true,
          eligibility_ok: true,
          legible_ok: true,
          program_ok: true,
          decision: 'approved',
          reason: dto.reason ?? null,
          student_user_id: conversion.user_id,
          reviewed_by: actor.userId,
          reviewed_at: new Date(),
        },
      });
      return conversion;
    });

    await this.sendEmail('application-approved', application, {
      student_no: result.student_no,
    });

    return {
      decision: 'approved',
      student_user_id: result.user_id,
      student_no: result.student_no,
    };
  }

  private async sendBack(application: applications, dto: SaReviewDto, actor: StageActor) {
    if (!dto.reason?.trim()) {
      throw new BadRequestException('A reason is required to send the application back');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.application_sa_review.create({
        data: {
          application_id: application.application_id,
          identity_ok: dto.identity_ok ?? false,
          eligibility_ok: dto.eligibility_ok ?? false,
          legible_ok: dto.legible_ok ?? false,
          program_ok: dto.program_ok ?? false,
          decision: 'sent_back',
          reason: dto.reason,
          reviewed_by: actor.userId,
          reviewed_at: new Date(),
        },
      });
      await this.stageEngine.transition(tx, application, 'send_back', actor, {
        reason: dto.reason,
      });
    });
    return { decision: 'sent_back' };
  }

  private async reject(application: applications, dto: SaReviewDto, actor: StageActor) {
    if (!dto.reason?.trim()) {
      throw new BadRequestException('A reason is required to reject the application');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.application_sa_review.create({
        data: {
          application_id: application.application_id,
          identity_ok: dto.identity_ok ?? false,
          eligibility_ok: dto.eligibility_ok ?? false,
          legible_ok: dto.legible_ok ?? false,
          program_ok: dto.program_ok ?? false,
          decision: 'rejected',
          reason: dto.reason,
          reviewed_by: actor.userId,
          reviewed_at: new Date(),
        },
      });
      // Also archives the row (is_archived = 1) so the LMS hides it (openQuestion #3).
      await this.stageEngine.transition(tx, application, 'reject', actor, {
        reason: dto.reason,
      });
    });

    await this.sendEmail('application-rejected', application, { reason: dto.reason });
    return { decision: 'rejected' };
  }

  // ---- helpers -------------------------------------------------------------

  private assertNotOnHold(application: applications): void {
    if (application.hold_at != null) {
      throw new ConflictException('Resume the application before acting on it.');
    }
  }

  /**
   * CRITIQUE #6: enforce the document checklist before approval.
   *   1. every uploaded document must be verified (no pending/rejected left);
   *   2. a zero-document application can NEVER convert (safety floor);
   *   3. when the course's canonical level has seeded document_requirement rows,
   *      every REQUIRED requirement that APPLIES to this application (see
   *      applies_when) must have a verified document (matched by requirement_id or
   *      document_type_id);
   *   4. when a course IS set but its level cannot be classified, do NOT silently
   *      weaken to the "one verified document" rule — fail with a clear 400 (and
   *      log) so an Admin classifies the course / its checklist first.
   *
   * document_requirement.applies_when (002 DDL): NULL = always; 'employment' = only
   * when the course requires employment (course_admission_rule.requires_employment).
   */
  private async assertRequiredDocuments(application: applications): Promise<void> {
    const docs = await this.prisma.application_document.findMany({
      where: { application_id: application.application_id, deleted_at: null },
      select: { requirement_id: true, document_type_id: true, verification_status: true },
    });

    if (docs.some((d) => d.verification_status !== 'verified')) {
      throw new BadRequestException('Every uploaded document must be verified before approval');
    }
    const verified = docs.filter((d) => d.verification_status === 'verified');

    // Safety floor: never approve with zero verified documents, whatever the
    // checklist resolves to.
    if (verified.length === 0) {
      throw new BadRequestException('At least one verified document is required before approval');
    }

    // No course -> no checklist applies; the safety floor above is the gate.
    if (application.course_id == null) {
      return;
    }

    // A course IS set: resolve its canonical level. If it cannot be classified we
    // cannot resolve the checklist, so fail closed rather than silently weakening.
    const course = await this.prisma.course.findUnique({
      where: { id: application.course_id },
      select: { level: true },
    });
    const level = canonicalCourseLevel(course?.level ?? null);
    if (level == null) {
      this.logger.error(
        `SA approve blocked: course ${application.course_id} level ` +
          `${JSON.stringify(course?.level ?? null)} could not be classified, so the ` +
          `required-document checklist for application ${application.application_id} ` +
          `cannot be resolved.`,
      );
      throw new BadRequestException(
        'The course level could not be classified, so its required-document checklist ' +
          'cannot be verified. Set the course level (or its document checklist) before approval.',
      );
    }

    const required = await this.prisma.document_requirement.findMany({
      where: { course_level: level, is_required: true, deleted_at: null },
      select: { id: true, document_type_id: true, applies_when: true },
    });
    const applicable = await this.applicableRequirements(application, required);
    if (applicable.length === 0) {
      // No checklist seeded for this level (or none applies) -> floor already met.
      return;
    }

    const haveReq = new Set(
      verified.map((d) => d.requirement_id).filter((x): x is number => x != null),
    );
    const haveType = new Set(
      verified.map((d) => d.document_type_id).filter((x): x is number => x != null),
    );
    const missing = applicable.filter(
      (r) => !haveReq.has(r.id) && !haveType.has(r.document_type_id),
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `A required document is missing or unverified (${missing.length} outstanding). Verify every required document before approval.`,
      );
    }
  }

  /**
   * Narrow the REQUIRED document_requirement rows to those that APPLY to this
   * application. applies_when (002 DDL): NULL = always; 'employment' = only when the
   * course requires employment (course_admission_rule.requires_employment). An
   * unrecognised, non-null code fails CLOSED (kept required) so a new rule is never
   * silently skipped.
   */
  private async applicableRequirements(
    application: applications,
    required: Array<{ id: number; document_type_id: number; applies_when: string | null }>,
  ): Promise<Array<{ id: number; document_type_id: number }>> {
    const needsEmploymentRule = required.some((r) => r.applies_when === 'employment');
    let requiresEmployment = false;
    if (needsEmploymentRule && application.course_id != null) {
      const rule = await this.prisma.course_admission_rule.findFirst({
        where: { course_id: application.course_id, deleted_at: null },
        select: { requires_employment: true },
      });
      requiresEmployment = rule?.requires_employment === true;
    }
    return required.filter((r) => {
      if (r.applies_when == null) return true;
      if (r.applies_when === 'employment') return requiresEmployment;
      return true; // unknown condition -> fail closed, keep it required
    });
  }

  private async loadApplication(applicationId: number) {
    const application = await this.prisma.applications.findFirst({
      where: { application_id: applicationId, deleted_at: null },
    });
    if (!application) throw new NotFoundException('Application not found!');
    return application;
  }

  private async sendEmail(
    key: 'application-approved' | 'application-rejected',
    application: applications,
    extra: Record<string, string | number | null | undefined>,
  ): Promise<void> {
    try {
      if (!this.email.isConfigured || !application.email) return;
      const rendered = this.templates.render(key, {
        name: application.name ?? 'Applicant',
        application_id: application.custom_application_id ?? `APP-${application.application_id}`,
        ...extra,
      });
      await this.email.sendEmail({
        to: application.email,
        name: application.name ?? 'Applicant',
        subject: rendered.subject,
        html: rendered.html,
      });
    } catch (err) {
      this.logger.warn(`Email ${key} skipped: ${(err as Error).message}`);
    }
  }
}
