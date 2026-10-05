import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { applications } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { RecordAccessService, AccessUser } from './record-access.service';
import { StageEngineService, StageActor } from './stage-engine.service';
import { effectiveStage, HOLDABLE_STAGES } from './stages';
import { istTodayIso, dateOnly } from './ist-date';
import { normalizeIndianMobile } from '../students/indian-mobile';
import {
  ReopenApplicationDto,
  HoldApplicationDto,
  ResumeApplicationDto,
  AcceptApplicationDto,
} from './dto/workflow-action.dto';
import { CorrectApplicationDto, CORRECTABLE_FIELDS } from './dto/correct-application.dto';

/** The stage actions (accept/reopen/corrections/hold/resume) and the detail reads. */
@Injectable()
export class ApplicationWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stageEngine: StageEngineService,
    private readonly audit: AuditService,
    private readonly access: RecordAccessService,
  ) {}

  // ---- counsellor stage actions --------------------------------------------

  async accept(applicationId: number, _dto: AcceptApplicationDto, user: AccessUser) {
    const application = await this.load(applicationId);
    this.assertNotOnHold(application);
    await this.access.assertAction(user, application, 'accept'); // CRITIQUE #5
    const actor = await this.actorFor(user);
    await this.prisma.$transaction((tx) =>
      this.stageEngine.transition(tx, application, 'accept', actor),
    );
    return { application_id: applicationId, stage: 'fee_pending' };
  }

  // ---- early-funnel moves (interim, owner/admin until the magic link lands) --

  /** lead_added -> form_pending. Manual stand-in for "the form link was sent". */
  async sendForm(applicationId: number, user: AccessUser) {
    const application = await this.load(applicationId);
    this.assertNotOnHold(application);
    await this.access.assertAction(user, application, 'send_form'); // CRITIQUE #5
    const actor = await this.actorFor(user);
    await this.prisma.$transaction((tx) =>
      this.stageEngine.transition(tx, application, 'send_form', actor),
    );
    return { application_id: applicationId, stage: 'form_pending' };
  }

  /** form_pending -> counsellor_review. Manual stand-in for "the form was received". */
  async markFormReceived(applicationId: number, user: AccessUser) {
    const application = await this.load(applicationId);
    this.assertNotOnHold(application);
    await this.access.assertAction(user, application, 'mark_form_received'); // CRITIQUE #5
    const actor = await this.actorFor(user);
    await this.prisma.$transaction((tx) =>
      this.stageEngine.transition(tx, application, 'mark_form_received', actor),
    );
    return { application_id: applicationId, stage: 'counsellor_review' };
  }

  async reopen(applicationId: number, dto: ReopenApplicationDto, user: AccessUser) {
    const application = await this.load(applicationId);
    this.assertNotOnHold(application);
    await this.access.assertAction(user, application, 'reopen'); // CRITIQUE #5
    const actor = await this.actorFor(user);
    // NOTE: the magic-link reissue is owned by the (not-yet-built) magic-link
    // feature; when it lands, reopen also cancels the old link and sends a new one.
    await this.prisma.$transaction((tx) =>
      this.stageEngine.transition(tx, application, 'reopen', actor, { reason: dto.reason }),
    );
    return { application_id: applicationId, stage: 'form_pending' };
  }

  async correct(applicationId: number, dto: CorrectApplicationDto, user: AccessUser) {
    const application = await this.load(applicationId);
    this.assertNotOnHold(application);
    if (effectiveStage(application) !== 'counsellor_review') {
      throw new ConflictException('Corrections are only allowed during counsellor review.');
    }
    // CRITIQUE #5 / stage-ownership: only the OWNING counsellor (or an Admin) may
    // correct applicant fields. A Team Leader / Manager who can merely VIEW a team
    // member's row is refused here (403), not just gated by the review slug.
    await this.access.assertAction(user, application, 'correct');
    const actor = await this.actorFor(user);

    const { dob, ...rest } = dto;
    const changes = this.audit.diff(
      application as unknown as Record<string, unknown>,
      dto as Record<string, unknown>,
      CORRECTABLE_FIELDS as unknown as string[],
      ['dob'],
    );
    if (changes.length === 0) {
      return { application_id: applicationId, corrected: 0 };
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.applications.update({
        where: { application_id: applicationId },
        data: {
          ...rest,
          ...(dob !== undefined ? { dob: new Date(dob) } : {}),
          ...(dto.phone !== undefined
            ? { phone_normalized: normalizeIndianMobile(dto.phone) }
            : {}),
          updated_by: actor.userId,
          updated_at: new Date(),
        },
      });
      const changeId = await this.audit.recordFieldChanges(
        tx,
        {
          action: 'correct',
          entity: 'applications',
          entityId: applicationId,
          applicationId,
          actorId: actor.userId,
          actorRoleId: actor.roleId,
        },
        changes,
      );
      return { application_id: applicationId, corrected: changes.length, change_id: changeId };
    });
  }

  // ---- hold / resume (stage kept) ------------------------------------------

  async hold(applicationId: number, dto: HoldApplicationDto, user: AccessUser) {
    const application = await this.load(applicationId);
    if (application.hold_at != null) {
      throw new ConflictException('The application is already on hold.');
    }
    const stage = effectiveStage(application);
    if (!HOLDABLE_STAGES.has(stage)) {
      throw new ConflictException(`An application at ${stage} cannot be put on hold.`);
    }
    // CRITIQUE #5: only the stage owner (or TL/manager/Admin) may hold.
    await this.access.assertAction(user, application, 'hold');
    if (dateOnly(dto.followup_date) < istTodayIso()) {
      throw new BadRequestException('The follow-up date cannot be in the past');
    }
    const actor = await this.actorFor(user);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // CRITIQUE #5: guard on hold_at: null so a concurrent hold can't double-apply.
      const res = await tx.applications.updateMany({
        where: { application_id: applicationId, deleted_at: null, hold_at: null },
        data: {
          hold_at: now,
          hold_followup_date: new Date(dto.followup_date),
          updated_by: actor.userId,
          updated_at: now,
        },
      });
      if (res.count === 0) {
        throw new ConflictException('The application is already on hold.');
      }
      await this.stageEngine.logStageEvent(tx, {
        applicationId,
        event: 'hold',
        fromStage: stage,
        toStage: stage,
        actor,
        reason: dto.reason,
        followupDate: new Date(dto.followup_date),
      });
    });

    return { application_id: applicationId, on_hold: true };
  }

  async resume(applicationId: number, dto: ResumeApplicationDto, user: AccessUser) {
    const application = await this.load(applicationId);
    if (application.hold_at == null) {
      throw new ConflictException('The application is not on hold.');
    }
    const stage = effectiveStage(application);
    // CRITIQUE #5: only an actor who could hold this stage may resume it.
    await this.access.assertAction(user, application, 'resume');
    const actor = await this.actorFor(user);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // CRITIQUE #5: guard on hold_at NOT NULL so a concurrent resume can't double-apply.
      const res = await tx.applications.updateMany({
        where: { application_id: applicationId, deleted_at: null, hold_at: { not: null } },
        data: {
          hold_at: null,
          hold_followup_date: null,
          updated_by: actor.userId,
          updated_at: now,
        },
      });
      if (res.count === 0) {
        throw new ConflictException('The application is not on hold.');
      }
      await this.stageEngine.logStageEvent(tx, {
        applicationId,
        event: 'resume',
        fromStage: stage,
        toStage: stage,
        actor,
        reason: dto.reason ?? null,
      });
    });

    return { application_id: applicationId, on_hold: false };
  }

  // ---- detail reads --------------------------------------------------------

  /** GET /applications/:id/timeline — stage log + field-level audit + legacy, newest first. */
  async timeline(applicationId: number) {
    await this.load(applicationId);
    const [stageLog, auditRows, application] = await Promise.all([
      this.prisma.application_stage_log.findMany({
        where: { application_id: applicationId },
        orderBy: { id: 'desc' },
      }),
      this.prisma.audit_log.findMany({
        where: { application_id: applicationId, action: { not: 'stage_change' } },
        orderBy: { id: 'desc' },
        take: 500,
      }),
      this.prisma.applications.findUnique({ where: { application_id: applicationId } }),
    ]);

    const entries = [
      ...stageLog.map((r) => ({
        source: 'stage_log' as const,
        at: r.created_at,
        event: r.event,
        from_stage: r.from_stage,
        to_stage: r.to_stage,
        actor_id: r.actor_id,
        reason: r.reason,
        ref_table: r.ref_table,
        ref_id: r.ref_id,
      })),
      ...auditRows.map((r) => ({
        source: 'audit' as const,
        at: r.occurred_at,
        event: r.action,
        entity: r.entity,
        field: r.field,
        old_value: r.old_value,
        new_value: r.new_value,
        actor_id: r.actor_id,
        reason: r.reason,
        change_id: r.change_id,
      })),
    ];

    if (application?.created_at) {
      entries.push({
        source: 'legacy' as const,
        at: application.created_at,
        event: 'created',
        actor_id: application.created_by ?? null,
      } as never);
    }

    entries.sort((a, b) => {
      const at = a.at ? new Date(a.at).getTime() : 0;
      const bt = b.at ? new Date(b.at).getTime() : 0;
      return bt - at;
    });

    return { items: entries, total: entries.length };
  }

  /** GET /applications/:id/documents — the application's documents + review state. */
  async documents(applicationId: number) {
    await this.load(applicationId);
    const rows = await this.prisma.application_document.findMany({
      where: { application_id: applicationId, deleted_at: null },
      orderBy: { id: 'desc' },
    });
    const items = rows.map((d) => ({
      id: d.id,
      label: d.label,
      original_name: d.original_name,
      mime_type: d.mime_type,
      size_bytes: d.size_bytes,
      verification_status: d.verification_status,
      reviewed_by: d.reviewed_by,
      reviewed_at: d.reviewed_at,
      rejection_reason: d.rejection_reason,
      download_url: `/api/files/application-document/${d.id}/download`,
      created_at: d.created_at,
    }));
    return { items, total: items.length };
  }

  /** GET /applications/:id/payments — registration-fee entries + the legacy LMS fee block. */
  async payments(applicationId: number) {
    const application = await this.load(applicationId);
    const rows = await this.prisma.application_payment.findMany({
      where: { application_id: applicationId, deleted_at: null },
      orderBy: { id: 'desc' },
    });
    return {
      items: rows.map((p) => ({ ...p, proof_url: `/api/application-payments/${p.id}/proof` })),
      total: rows.length,
      legacy_fee: {
        amount: application.amount,
        paid_date: application.paid_date,
        payment_mode: application.payment_mode,
        payment_to: application.payment_to,
        fee_receipt: application.fee_receipt,
      },
    };
  }

  // ---- helpers -------------------------------------------------------------

  private async load(applicationId: number): Promise<applications> {
    const application = await this.prisma.applications.findFirst({
      where: { application_id: applicationId, deleted_at: null },
    });
    if (!application) throw new NotFoundException('Application not found!');
    return application;
  }

  private assertNotOnHold(application: applications): void {
    if (application.hold_at != null) {
      throw new ConflictException('Resume the application before acting on it.');
    }
  }

  private async actorFor(user: AccessUser): Promise<StageActor> {
    const scope = await this.access.scopeFor(user);
    return {
      userId: Number(user.userId ?? user.id),
      roleId: scope.roleId,
      onBehalf: scope.scope === 'all',
    };
  }
}
