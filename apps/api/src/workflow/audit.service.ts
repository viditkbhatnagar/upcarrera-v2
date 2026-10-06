import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** A Prisma client or an interactive-transaction client — both expose audit_log. */
export type AuditDb = PrismaService | Prisma.TransactionClient;

/** Columns that must NEVER be written to old_value / new_value (mirrors user-secrets). */
export const AUDIT_DENYLIST: ReadonlySet<string> = new Set([
  'password',
  'prev_password',
  'otp',
  'zoom_password',
]);

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string | number | null;
  applicationId?: number | null;
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  changeId?: string | null;
  actorId?: number | null;
  actorRoleId?: number | null;
  actorType?: string;
  ip?: string | null;
  userAgent?: string | null;
  context?: Record<string, unknown> | string | null;
}

export interface FieldDiff {
  field: string;
  old_value: string | null;
  new_value: string | null;
}

/** Render any value as the audit_log TEXT representation (JSON for objects). */
function toAuditValue(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Render a calendar-date field as 'YYYY-MM-DD' on BOTH sides of a diff, so an
 * unchanged date never reports a spurious change (the stored value is a JS Date
 * while the DTO value is a 'YYYY-MM-DD' string — CRITIQUE #11). A stored Date and
 * a date-only string that denote the same civil date compare equal.
 */
function toDateOnly(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toISOString().slice(0, 10);
  }
  return String(value);
}

/**
 * Spec 1.5 audit trail. Append-only: one row per changed field, grouped by a
 * shared change_id for one save. The denylist guarantees a credential column can
 * never be captured, even if a caller passes a whole row through diff().
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The field-level changes between two rows, skipping unchanged and denied
   * fields. `dateFields` are compared as calendar dates ('YYYY-MM-DD' on both
   * sides) so an unchanged date — stored as a JS Date, submitted as a string —
   * never logs a spurious change (CRITIQUE #11).
   */
  diff(
    before: Record<string, unknown> | null | undefined,
    after: Record<string, unknown> | null | undefined,
    fields: readonly string[],
    dateFields: readonly string[] = [],
  ): FieldDiff[] {
    const dateSet = new Set(dateFields);
    const out: FieldDiff[] = [];
    for (const field of fields) {
      if (AUDIT_DENYLIST.has(field)) continue;
      const oldRaw = before?.[field];
      const newRaw = after?.[field];
      const render = dateSet.has(field) ? toDateOnly : toAuditValue;
      const oldVal = render(oldRaw);
      const newVal = render(newRaw);
      if (oldVal === newVal) continue;
      out.push({ field, old_value: oldVal, new_value: newVal });
    }
    return out;
  }

  /** Write ONE audit row. Pass the transaction client to keep it atomic with the change. */
  async record(db: AuditDb, entry: AuditEntry): Promise<void> {
    if (entry.field && AUDIT_DENYLIST.has(entry.field)) return;
    await db.audit_log.create({
      data: this.toRow(entry),
    });
  }

  /**
   * Write one row per changed field under a single change_id. Used for 'correct'
   * / 'update' saves so the Timeline can group a multi-field edit.
   */
  async recordFieldChanges(
    db: AuditDb,
    base: Omit<AuditEntry, 'field' | 'oldValue' | 'newValue' | 'changeId'>,
    changes: readonly FieldDiff[],
  ): Promise<string | null> {
    if (changes.length === 0) return null;
    const changeId = randomUUID();
    await db.audit_log.createMany({
      data: changes.map((c) =>
        this.toRow({
          ...base,
          field: c.field,
          oldValue: c.old_value,
          newValue: c.new_value,
          changeId,
        }),
      ),
    });
    return changeId;
  }

  private toRow(entry: AuditEntry): Prisma.audit_logCreateManyInput {
    const context =
      entry.context == null
        ? null
        : typeof entry.context === 'string'
          ? entry.context
          : JSON.stringify(entry.context);
    return {
      occurred_at: new Date(),
      actor_id: entry.actorId ?? null,
      actor_role_id: entry.actorRoleId ?? null,
      actor_type: entry.actorType ?? 'user',
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId != null ? String(entry.entityId) : null,
      application_id: entry.applicationId ?? null,
      field: entry.field ?? null,
      old_value: toAuditValue(entry.oldValue),
      new_value: toAuditValue(entry.newValue),
      reason: entry.reason ?? null,
      change_id: entry.changeId ?? null,
      ip: entry.ip ?? null,
      user_agent: entry.userAgent ?? null,
      context,
    };
  }
}
