import {
  effectiveStage,
  allowedActions,
  STAGE_NO,
  stageNo,
  normalizeTxnRef,
  lmsPaidTo,
  lmsPaymentMode,
  ActorContext,
} from '../src/workflow/stages';

/**
 * Pure unit tests for the stage derivation (CRITIQUE #11) and the per-role action
 * matrix. No app/DB — the logic is a pure function of the legacy flags.
 */
describe('stages.effectiveStage (unit)', () => {
  const row = (
    stage: string | null,
    is_converted: number | null,
    is_archived: boolean | null,
    status: boolean | null,
  ) => ({ stage, is_converted, is_archived, status });

  it('is_converted = 1 wins over everything', () => {
    expect(effectiveStage(row('fee_pending', 1, true, false))).toBe('converted');
    expect(effectiveStage(row(null, 1, false, null))).toBe('converted');
    expect(effectiveStage(row('rejected', 1, true, true))).toBe('converted');
  });

  it('is_archived = true (not converted) is rejected, outranking the stage column', () => {
    expect(effectiveStage(row(null, null, true, null))).toBe('rejected');
    expect(effectiveStage(row('fee_pending', 0, true, true))).toBe('rejected');
    expect(effectiveStage(row(null, 0, true, false))).toBe('rejected');
  });

  it('an explicit stage is used when not converted or archived', () => {
    expect(effectiveStage(row('fee_pending', null, false, null))).toBe('fee_pending');
    expect(effectiveStage(row('sa_verification', 0, false, true))).toBe('sa_verification');
    // the stage column wins over status = false
    expect(effectiveStage(row('fee_pending', 0, false, false))).toBe('fee_pending');
  });

  it('a NULL-stage row with status = false is rejected (an LMS deactivation)', () => {
    expect(effectiveStage(row(null, null, false, false))).toBe('rejected');
    expect(effectiveStage(row(null, 0, false, false))).toBe('rejected');
  });

  it('CRITIQUE #11: NULL status means ACTIVE -> counsellor_review, never rejected', () => {
    expect(effectiveStage(row(null, null, false, null))).toBe('counsellor_review');
    expect(effectiveStage(row(null, 0, false, null))).toBe('counsellor_review');
    expect(effectiveStage(row(null, null, false, true))).toBe('counsellor_review');
  });

  it('covers every legacy-flag combination deterministically', () => {
    const stages = [null, 'fee_pending'] as const;
    const conv = [1, 0, null] as const;
    const arch = [true, false] as const;
    const stat = [true, false, null] as const;
    for (const s of stages) {
      for (const c of conv) {
        for (const a of arch) {
          for (const st of stat) {
            const eff = effectiveStage(row(s, c, a, st));
            // Re-derive expected via the documented precedence.
            let expected: string;
            if (c === 1) expected = 'converted';
            else if (a === true) expected = 'rejected';
            else if (s) expected = s;
            else if (st === false) expected = 'rejected';
            else expected = 'counsellor_review';
            expect(eff).toBe(expected);
          }
        }
      }
    }
  });

  it('stage numbers: 1-7 for the pipeline, 0 for terminal rejected', () => {
    expect(STAGE_NO.lead_added).toBe(1);
    expect(STAGE_NO.converted).toBe(7);
    expect(STAGE_NO.rejected).toBe(0);
    expect(stageNo('fee_pending')).toBe(4);
  });
});

describe('stages.allowedActions (unit)', () => {
  const hold = (hold_at: Date | null) => ({
    stage: null as string | null,
    is_converted: null as number | null,
    is_archived: false as boolean | null,
    status: null as boolean | null,
    hold_at,
  });
  const ctx = (over: Partial<ActorContext>): ActorContext => ({
    roleKey: null,
    isAdmin: false,
    isOwner: false,
    isTeamViewer: false,
    isSuperAdmin: false,
    ...over,
  });

  it('a counsellor owner at counsellor_review may accept, correct, reopen and hold', () => {
    const actions = allowedActions(hold(null), ctx({ roleKey: 'counsellor', isOwner: true }));
    expect(actions.sort()).toEqual(['accept', 'correct', 'hold', 'reopen']);
  });

  it('a non-owner counsellor at counsellor_review may do nothing', () => {
    expect(allowedActions(hold(null), ctx({ roleKey: 'counsellor', isOwner: false }))).toEqual([]);
  });

  it('accounts at fee_verification may verify, mismatch and hold', () => {
    const row = { stage: 'fee_verification', is_converted: null, is_archived: false, status: null, hold_at: null };
    const actions = allowedActions(row, ctx({ roleKey: 'accounts' }));
    expect(actions.sort()).toEqual(['hold', 'mismatch', 'verify']);
  });

  it('student affairs at sa_verification may approve, send_back, reject and hold', () => {
    const row = { stage: 'sa_verification', is_converted: null, is_archived: false, status: null, hold_at: null };
    const actions = allowedActions(row, ctx({ roleKey: 'student_affairs' }));
    expect(actions.sort()).toEqual(['approve', 'hold', 'reject', 'send_back']);
  });

  it('a team leader may only hold/resume on a counsellor stage, never act', () => {
    const open = allowedActions(hold(null), ctx({ roleKey: 'team_leader', isTeamViewer: true }));
    expect(open).toEqual(['hold']);
    const held = allowedActions(hold(new Date()), ctx({ roleKey: 'team_leader', isTeamViewer: true }));
    expect(held).toEqual(['resume']);
  });

  it('a held application offers only resume (to an eligible actor)', () => {
    expect(allowedActions(hold(new Date()), ctx({ roleKey: 'counsellor', isOwner: true }))).toEqual(['resume']);
  });

  it('terminal stages offer no actions', () => {
    const converted = { stage: null, is_converted: 1, is_archived: false, status: null, hold_at: null };
    const rejected = { stage: null, is_converted: null, is_archived: true, status: null, hold_at: null };
    expect(allowedActions(converted, ctx({ isAdmin: true }))).toEqual([]);
    expect(allowedActions(rejected, ctx({ isAdmin: true }))).toEqual([]);
  });

  it('admin may act on a stage-owner action (on behalf)', () => {
    const row = { stage: 'fee_verification', is_converted: null, is_archived: false, status: null, hold_at: null };
    const actions = allowedActions(row, ctx({ roleKey: 'admin', isAdmin: true }));
    expect(actions).toContain('verify');
    expect(actions).toContain('mismatch');
  });
});

describe('stages mappers (unit)', () => {
  it('normalizeTxnRef upper-cases and strips whitespace / - / / / \\', () => {
    expect(normalizeTxnRef(' ab-12/34\\5 ')).toBe('AB12345');
    expect(normalizeTxnRef('utr001')).toBe('UTR001');
  });

  it('maps CRM codes to the LMS vocabulary', () => {
    expect(lmsPaidTo('upcarrera')).toBe('upCarrera');
    expect(lmsPaidTo('university')).toBe('University');
    expect(lmsPaymentMode('cash')).toBe('Cash');
    expect(lmsPaymentMode('cheque')).toBe('Cheque');
    expect(lmsPaymentMode('dd')).toBe('Cheque');
    expect(lmsPaymentMode('upi')).toBe('Online');
  });
});
