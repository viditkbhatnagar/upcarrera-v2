import type { Prisma } from '@prisma/client';

/**
 * The application workflow stages (migration 002). The spec's numbers 1-7 are
 * derived here, never stored. `converted` is 7 and the terminal `rejected` is 0
 * (shown with a "legacy" badge for rows archived outside the CRM). "On Hold" is
 * NOT a stage: `applications.hold_at` is set and the stage is kept, so Resume
 * returns the application to the same stage and owner.
 */
export const STAGES = [
  'lead_added',
  'form_pending',
  'counsellor_review',
  'fee_pending',
  'fee_verification',
  'sa_verification',
  'converted',
  'rejected',
] as const;

export type Stage = (typeof STAGES)[number];

/** The derived stage number the UI shows. `rejected` is terminal (0). */
export const STAGE_NO: Readonly<Record<Stage, number>> = {
  lead_added: 1,
  form_pending: 2,
  counsellor_review: 3,
  fee_pending: 4,
  fee_verification: 5,
  sa_verification: 6,
  converted: 7,
  rejected: 0,
};

/** Stages on which a hold is allowed (spec: stages 2-6). */
export const HOLDABLE_STAGES: ReadonlySet<Stage> = new Set<Stage>([
  'form_pending',
  'counsellor_review',
  'fee_pending',
  'fee_verification',
  'sa_verification',
]);

/** Stage owner role_key — who acts on an application while it sits at a stage. */
export const STAGE_OWNER: Readonly<Record<Stage, string | null>> = {
  lead_added: 'counsellor',
  form_pending: 'counsellor',
  counsellor_review: 'counsellor',
  fee_pending: 'counsellor',
  fee_verification: 'accounts',
  sa_verification: 'student_affairs',
  converted: null,
  rejected: null,
};

/** The minimal application shape the stage derivation reads. */
export interface StageRow {
  stage: string | null;
  is_converted: number | null;
  is_archived: boolean | null;
  status: boolean | null;
}

/**
 * The effective stage of an application, in strict precedence order (CRITIQUE
 * #11 — `status` is NULL on every legacy row and NULL means ACTIVE, so it is
 * NEVER treated as rejected):
 *   1. is_converted = 1      -> converted   (an LMS conversion always wins)
 *   2. is_archived  = true   -> rejected    (the legacy archive/draft flag)
 *   3. stage is set          -> that stage  (the workflow value)
 *   4. status = false (0)    -> rejected    (an LMS deactivation)
 *   5. otherwise             -> counsellor_review
 */
export function effectiveStage(row: StageRow): Stage {
  if (row.is_converted === 1) return 'converted';
  // OPEN PRODUCT DECISION (002 header): is_archived = 1 is the LMS "Save to
  // Archive" DRAFT flag, rewritten by every LMS save — it is NOT necessarily a
  // CRM rejection. The authoritative CRM rejection is stage = 'rejected'. We map
  // a non-converted archived row to `rejected` ONLY so the QA-reconciled legacy
  // counts match today; do NOT "fix" this without re-reconciling those counts and
  // deciding product-side how an LMS archived draft should surface in the CRM.
  if (row.is_archived === true) return 'rejected';
  if (row.stage) return row.stage as Stage;
  if (row.status === false) return 'rejected';
  return 'counsellor_review';
}

export function stageNo(stage: Stage): number {
  return STAGE_NO[stage] ?? 0;
}

/**
 * A NULL-safe Prisma predicate selecting the rows whose EFFECTIVE stage equals
 * `stage`. It mirrors effectiveStage() exactly so the list filter, the counts
 * and the stage-engine guard can never drift from the derivation.
 *
 * NULL handling (CRITIQUE #11): `is_converted <> 1` and `status <> false` are
 * both FALSE for NULL in SQL, so "not converted" / "active" must be spelled as
 * an explicit `IS NULL OR <>` OR-clause, never a bare `not`.
 */
export function effectiveStageWhere(stage: Stage): Prisma.applicationsWhereInput {
  const notConverted: Prisma.applicationsWhereInput = {
    OR: [{ is_converted: null }, { is_converted: { not: 1 } }],
  };
  const active: Prisma.applicationsWhereInput = {
    OR: [{ status: null }, { status: true }],
  };

  switch (stage) {
    case 'converted':
      return { is_converted: 1 };

    case 'rejected':
      // not converted, AND (archived OR explicit rejected OR a deactivated null-stage row)
      return {
        AND: [
          notConverted,
          {
            OR: [
              { is_archived: true },
              { AND: [{ is_archived: false }, { stage: 'rejected' }] },
              { AND: [{ is_archived: false }, { stage: null }, { status: false }] },
            ],
          },
        ],
      };

    case 'counsellor_review':
      // explicit, OR derived from a NULL-stage active row
      return {
        AND: [
          notConverted,
          { is_archived: false },
          {
            OR: [
              { stage: 'counsellor_review' },
              { AND: [{ stage: null }, active] },
            ],
          },
        ],
      };

    default:
      // lead_added | form_pending | fee_pending | fee_verification | sa_verification:
      // only ever set explicitly; a converted/archived row outranks the column.
      return {
        AND: [notConverted, { is_archived: false }, { stage }],
      };
  }
}

/** A transition the stage engine can apply: action -> (from -> to), with the owner role. */
export interface Transition {
  action: string;
  from: Stage;
  to: Stage;
  event: string;
  owner: string;
}

/**
 * The transition table. `approve` (-> converted) is handled by the conversion
 * saga, not by a plain stage update, so it is not listed here; hold/resume do
 * not change the stage and are handled separately.
 */
export const TRANSITIONS: readonly Transition[] = [
  // Early funnel (interim, owner/admin-only). The magic-link workstream will own
  // the automatic lead_added -> form_pending (form sent) and
  // form_pending -> counsellor_review (form received) moves; until it lands the
  // counsellor/admin advances them by hand so stages 1-2 are reachable.
  { action: 'send_form', from: 'lead_added', to: 'form_pending', event: 'form_sent', owner: 'counsellor' },
  { action: 'accept', from: 'counsellor_review', to: 'fee_pending', event: 'accepted', owner: 'counsellor' },
  { action: 'reopen', from: 'counsellor_review', to: 'form_pending', event: 'reopened', owner: 'counsellor' },
  { action: 'record_payment', from: 'fee_pending', to: 'fee_verification', event: 'payment_recorded', owner: 'counsellor' },
  { action: 'verify', from: 'fee_verification', to: 'sa_verification', event: 'fee_verified', owner: 'accounts' },
  { action: 'mismatch', from: 'fee_verification', to: 'fee_pending', event: 'fee_mismatch', owner: 'accounts' },
  { action: 'send_back', from: 'sa_verification', to: 'counsellor_review', event: 'sent_back', owner: 'student_affairs' },
  { action: 'reject', from: 'sa_verification', to: 'rejected', event: 'rejected', owner: 'student_affairs' },
  { action: 'mark_form_received', from: 'form_pending', to: 'counsellor_review', event: 'form_received', owner: 'counsellor' },
] as const;

export function transitionFor(action: string): Transition | undefined {
  return TRANSITIONS.find((t) => t.action === action);
}

/** Who the acting user is, for action/hold eligibility. */
export interface ActorContext {
  roleKey: string | null;
  /** The acting user is Admin or Super Admin (scope 'all'). */
  isAdmin: boolean;
  /** The acting user is the application's counsellor owner. */
  isOwner: boolean;
  /** The acting user is a Team Leader / Manager who can see this record. */
  isTeamViewer: boolean;
  /** The acting user is Super Admin (role_id 1), for the legacy /convert override. */
  isSuperAdmin: boolean;
}

/** Whether the actor may perform a stage-owner action for the given owner role. */
function canActForOwner(owner: string, ctx: ActorContext): boolean {
  if (ctx.isAdmin) return true;
  if (owner === 'counsellor') return ctx.roleKey === 'counsellor' && ctx.isOwner;
  return ctx.roleKey === owner;
}

/** Whether the actor may hold/resume at the current stage (owner role / TL+manager / Admin). */
function canHold(stage: Stage, ctx: ActorContext): boolean {
  if (ctx.isAdmin) return true;
  const owner = STAGE_OWNER[stage];
  if (owner === 'counsellor') {
    return (ctx.roleKey === 'counsellor' && ctx.isOwner) || ctx.isTeamViewer;
  }
  return owner != null && ctx.roleKey === owner;
}

/**
 * The actions the given user may take on an application in its current effective
 * stage. Drives the detail page's buttons; the server still enforces every one.
 */
export function allowedActions(row: StageRow & { hold_at: Date | null }, ctx: ActorContext): string[] {
  const stage = effectiveStage(row);
  const actions: string[] = [];

  // Terminal stages: nothing (a rejected application is not reopened — a new one is made).
  if (stage === 'converted' || stage === 'rejected') return actions;

  const onHold = row.hold_at != null;
  if (onHold) {
    if (canHold(stage, ctx)) actions.push('resume');
    return actions;
  }

  // Plain stage transitions.
  for (const t of TRANSITIONS) {
    if (t.from !== stage) continue;
    if (canActForOwner(t.owner, ctx)) actions.push(t.action);
  }

  // Corrections to applicant fields during counsellor review (CRITIQUE #5 /
  // stage-ownership): the OWNING counsellor or an Admin only. A Team Leader /
  // Manager who can merely VIEW a team member's row must not edit it.
  if (stage === 'counsellor_review' && canActForOwner('counsellor', ctx)) {
    actions.push('correct');
  }

  // Student Affairs decision at stage 6 (approve runs the conversion saga).
  if (stage === 'sa_verification' && (ctx.isAdmin || ctx.roleKey === 'student_affairs')) {
    actions.push('approve');
  }

  // Hold (stages 2-6).
  if (HOLDABLE_STAGES.has(stage) && canHold(stage, ctx)) actions.push('hold');

  // Legacy Super-Admin-only direct conversion: a NULL-stage row (derived
  // counsellor_review) or one sitting at sa_verification.
  if (ctx.isSuperAdmin && (row.stage == null || stage === 'sa_verification')) {
    if (!actions.includes('convert')) actions.push('convert');
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Registration-fee value mappers: CRM codes -> the LMS vocabulary that must be
// mirrored into the legacy applications / student_payments columns (002 header).
// ---------------------------------------------------------------------------

/** paid_to: upcarrera -> 'upCarrera', university -> 'University'. */
export function lmsPaidTo(code: string): string {
  return code === 'university' ? 'University' : 'upCarrera';
}

/** payment_mode: cash -> 'Cash', cheque|dd -> 'Cheque', anything else -> 'Online'. */
export function lmsPaymentMode(code: string): string {
  if (code === 'cash') return 'Cash';
  if (code === 'cheque' || code === 'dd') return 'Cheque';
  return 'Online';
}

/** Normalise a transaction reference: upper-cased, whitespace / - / / / \ removed. */
export function normalizeTxnRef(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-/\\]/g, '');
}

/** The canonical document_requirement.course_level vocabulary. */
export type CourseLevel = 'certification' | 'diploma' | 'ug' | 'pg' | 'doctorate';

/**
 * Map the free-text `course.level` onto the canonical document_requirement
 * .course_level vocabulary. Returns null when it cannot be classified, so the SA
 * approve gate falls back to the "at least one verified document" rule rather than
 * to a wrongly-empty required-checklist set.
 */
export function canonicalCourseLevel(level: string | null | undefined): CourseLevel | null {
  if (!level) return null;
  const l = level.toLowerCase();
  if (/doctor|phd|ph\.?d|d\.?phil/.test(l)) return 'doctorate';
  if (/post.?grad|masters?|\bpg\b|\bpgd\b|m\.?tech|m\.?sc|m\.?a\b|m\.?com|mba|mca/.test(l)) return 'pg';
  if (/under.?grad|bachelors?|\bug\b|b\.?tech|b\.?sc|b\.?a\b|b\.?com|bba|bca/.test(l)) return 'ug';
  if (/diploma/.test(l)) return 'diploma';
  if (/certific/.test(l)) return 'certification';
  return null;
}
