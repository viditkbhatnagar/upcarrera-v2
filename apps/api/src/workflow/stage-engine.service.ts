import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, AuditDb } from './audit.service';
import {
  effectiveStage,
  effectiveStageWhere,
  Stage,
  StageRow,
  transitionFor,
} from './stages';

/** The acting user for a stage move. */
export interface StageActor {
  /** NULL when the actor is the student on a magic link (actorType 'applicant'). */
  userId: number | null;
  roleId: number | null;
  /** 1 when an Admin / Super Admin performed a stage owner's action. */
  onBehalf?: boolean;
  actorType?: string;
  ip?: string | null;
  userAgent?: string | null;
}

export interface TransitionOptions {
  reason?: string | null;
  followupDate?: Date | null;
  refTable?: string | null;
  refId?: number | null;
  /** Extra columns merged into the applications update (e.g. is_archived on reject). */
  extraData?: Prisma.applicationsUpdateManyMutationInput;
}

/** The row the engine needs to know the current (pre-move) state. */
export type EngineRow = StageRow & { application_id: number };

/**
 * Applies a stage transition atomically: an OPTIMISTIC updateMany guarded by the
 * current effective stage (0 rows -> 409, so a concurrent move or a stale client
 * can never double-apply), then the domain stage-log row and the audit row — all
 * in the caller's transaction. The first move of a NULL-stage legacy row writes
 * its stage for the first time (the guard matches the derived stage).
 */
@Injectable()
export class StageEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async transition(
    tx: Prisma.TransactionClient,
    row: EngineRow,
    action: string,
    actor: StageActor,
    opts: TransitionOptions = {},
  ): Promise<{ from: Stage; to: Stage; event: string }> {
    const t = transitionFor(action);
    if (!t) {
      throw new ConflictException(`Unknown stage action: ${action}`);
    }

    const fromStage = effectiveStage(row);
    const now = new Date();

    const data: Prisma.applicationsUpdateManyMutationInput = {
      stage: t.to,
      stage_entered_at: now,
      updated_at: now,
      updated_by: actor.userId,
      ...(t.to === 'rejected' ? { is_archived: true } : {}),
      ...(opts.extraData ?? {}),
    };

    const res = await tx.applications.updateMany({
      where: {
        AND: [
          { application_id: row.application_id, deleted_at: null },
          effectiveStageWhere(t.from),
        ],
      },
      data,
    });

    if (res.count === 0) {
      throw new ConflictException(
        `Cannot ${action}: the application is no longer at ${t.from} (now ${fromStage}).`,
      );
    }

    await this.logStageEvent(tx, {
      applicationId: row.application_id,
      event: t.event,
      fromStage: t.from,
      toStage: t.to,
      actor,
      reason: opts.reason ?? null,
      followupDate: opts.followupDate ?? null,
      refTable: opts.refTable ?? null,
      refId: opts.refId ?? null,
    });

    return { from: t.from, to: t.to, event: t.event };
  }

  /**
   * Write a stage-log row + a matching audit row WITHOUT changing the stage.
   * Used for hold / resume (stage kept) and for the conversion events
   * (converted / legacy_convert), where the stage was set by the saga claim.
   */
  async logStageEvent(
    tx: AuditDb,
    entry: {
      applicationId: number;
      event: string;
      fromStage: Stage | null;
      toStage: Stage | null;
      actor: StageActor;
      reason?: string | null;
      followupDate?: Date | null;
      refTable?: string | null;
      refId?: number | null;
    },
  ): Promise<void> {
    const now = new Date();
    await tx.application_stage_log.create({
      data: {
        application_id: entry.applicationId,
        event: entry.event,
        from_stage: entry.fromStage ?? null,
        to_stage: entry.toStage ?? null,
        reason: entry.reason ?? null,
        followup_date: entry.followupDate ?? null,
        actor_id: entry.actor.userId ?? null,
        actor_role_id: entry.actor.roleId ?? null,
        actor_type: entry.actor.actorType ?? 'user',
        on_behalf: entry.actor.onBehalf ?? false,
        ref_table: entry.refTable ?? null,
        ref_id: entry.refId ?? null,
        created_at: now,
      },
    });

    await this.audit.record(tx, {
      action: 'stage_change',
      entity: 'applications',
      entityId: entry.applicationId,
      applicationId: entry.applicationId,
      field: 'stage',
      oldValue: entry.fromStage,
      newValue: entry.toStage,
      reason: entry.reason ?? null,
      actorId: entry.actor.userId ?? null,
      actorRoleId: entry.actor.roleId ?? null,
      actorType: entry.actor.actorType ?? 'user',
      ip: entry.actor.ip ?? null,
      userAgent: entry.actor.userAgent ?? null,
      context: { event: entry.event, on_behalf: entry.actor.onBehalf ?? false },
    });
  }
}
