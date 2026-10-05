/**
 * PURE-FUNCTION unit spec for WS2 (Fee Structure master). No app boot, no DB —
 * it drives computeTotals / canActivate / the money + period helpers directly.
 * It lives under the e2e jest config only because that is the project's single
 * configured runner (testRegex .e2e-spec.ts$); nothing here is end-to-end.
 */
import {
  toPaise,
  paiseToDecimalString,
  formatMoney,
  periodContextFor,
  basisMultiplier,
  deriveIntakeStatus,
  pickNextIntakeId,
} from '../src/finance/fee-structures/fee-structure.money';
import {
  computeTotals,
  canActivate,
} from '../src/finance/fee-structures/fee-structure.compute';

describe('fee-structure money helpers (pure)', () => {
  it('parses money into integer paise without float drift', () => {
    expect(toPaise(0.1 + 0.2)).toBe(30); // 0.30000000000000004 -> 30
    expect(toPaise('15000.50')).toBe(1500050);
    expect(toPaise(12.005)).toBe(1201); // half-up at the paise
    expect(toPaise(null)).toBe(0);
    expect(toPaise(undefined)).toBe(0);
    expect(toPaise('')).toBe(0);
    expect(toPaise('not-a-number')).toBe(0);
    expect(toPaise({ toString: () => '2500.00' })).toBe(250000); // Prisma Decimal-like
  });

  it('renders paise back to a fixed 2-decimal string', () => {
    expect(paiseToDecimalString(1500050)).toBe('15000.50');
    expect(paiseToDecimalString(0)).toBe('0.00');
    expect(paiseToDecimalString(5)).toBe('0.05');
    expect(paiseToDecimalString(100)).toBe('1.00');
  });

  it('formats paise as grouped INR for reasons', () => {
    expect(formatMoney(0)).toBe('₹0.00');
    expect(formatMoney(150000)).toBe('₹1,500.00');
    expect(formatMoney(12345678)).toBe('₹1,23,456.78'); // Indian grouping
  });
});

describe('period context (pure)', () => {
  it('derives years/semesters from the course-fee basis', () => {
    expect(periodContextFor('per_year', 2)).toEqual({ years: 2, semesters: 4 });
    expect(periodContextFor('per_semester', 6)).toEqual({ years: 3, semesters: 6 });
    expect(periodContextFor('total', 1)).toEqual({ years: 1, semesters: 1 });
    expect(periodContextFor(null, null)).toEqual({ years: 1, semesters: 1 });
  });

  it('maps a basis to its multiplier against the context', () => {
    const ctx = { years: 2, semesters: 4 };
    expect(basisMultiplier('one_time', ctx)).toBe(1);
    expect(basisMultiplier('per_year', ctx)).toBe(2);
    expect(basisMultiplier('per_semester', ctx)).toBe(4);
  });
});

describe('computeTotals (pure)', () => {
  it('expands a per-year course fee and sums exam + other fees', () => {
    const r = computeTotals({
      registrationFee: 5000,
      courseFeeBasis: 'per_year',
      courseFeeAmount: 100000,
      courseFeePeriods: 2, // 2 years -> 4 semesters
      examFee: 2000,
      examFeeBasis: 'per_semester', // 4 semesters
      items: [
        { label: 'Alumni', amount: 1000, basis: 'one_time' },
        { label: 'Lab', amount: 500, basis: 'per_year' },
      ],
    });
    expect(r.courseFeeTotalPaise).toBe(100000 * 2 * 100); // 20,000,000
    expect(r.examFeeTotalPaise).toBe(2000 * 4 * 100); // 800,000
    expect(r.otherFeesTotalPaise).toBe((1000 + 500 * 2) * 100); // 200,000
    expect(r.totalFeePaise).toBe(r.courseFeeTotalPaise + r.examFeeTotalPaise + r.otherFeesTotalPaise);
    expect(r.registrationFeePaise).toBe(500000);
    // total_fee EXCLUDES registration.
    expect(r.columns.total_fee).toBe('210000.00');
    expect(r.columns.course_fee_total).toBe('200000.00');
  });

  it('treats a total-basis course fee as a flat amount (multiplier 1)', () => {
    const r = computeTotals({
      courseFeeBasis: 'total',
      courseFeeAmount: 180000,
      courseFeePeriods: 3, // ignored for a flat total
    });
    expect(r.courseFeeTotalPaise).toBe(18000000);
    expect(r.totalFeePaise).toBe(18000000);
  });

  it('computes the max-discount view without touching total_fee', () => {
    const r = computeTotals({
      courseFeeBasis: 'total',
      courseFeeAmount: 100000,
      discountAllowed: true,
      discountMaxPct: 10,
    });
    expect(r.totalFeePaise).toBe(10000000); // discount NOT subtracted
    expect(r.maxDiscountPaise).toBe(1000000);
    expect(r.netAfterMaxDiscountPaise).toBe(9000000);
  });
});

describe('canActivate (pure)', () => {
  const base = {
    courseFeeTotal: 100000,
    registrationFee: 5000,
    totalFee: 100000,
    feeCollectionModel: 'upcarrera_collects',
    allowFull: true,
    allowPerYear: false,
    allowPerSemester: false,
    allowCustom: false,
    discountAllowed: false,
  };

  it('passes a fully-formed structure', () => {
    expect(canActivate(base)).toEqual({ ok: true, reasons: [] });
  });

  it('blocks a ₹0 course fee (the spec Rs0 rule)', () => {
    const r = canActivate({ ...base, courseFeeTotal: 0 });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/Course fee is ₹0/);
  });

  it('ALLOWS a ₹0 registration fee (some programs have none — FS06)', () => {
    const r = canActivate({ ...base, registrationFee: 0 });
    expect(r.ok).toBe(true);
    expect(r.reasons.join(' ')).not.toMatch(/registration/i);
  });

  it('blocks a missing collection model', () => {
    const r = canActivate({ ...base, feeCollectionModel: null });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/collection model is not set/i);
  });

  it('requires at least one instalment plan', () => {
    const r = canActivate({ ...base, allowFull: false });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/at least one instalment/i);
  });

  it('requires a custom plan to sum to total_fee, naming both amounts', () => {
    const r = canActivate({
      ...base,
      allowFull: false,
      allowCustom: true,
      totalFee: 100000,
      customInstalments: [{ amount: 40000 }, { amount: 50000 }], // ₹90,000 of ₹100,000
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/Custom plan sums to ₹90,000.00, expected ₹1,00,000.00/);
  });

  it('accepts a custom plan that sums exactly', () => {
    const r = canActivate({
      ...base,
      allowFull: false,
      allowCustom: true,
      totalFee: 100000,
      customInstalments: [{ amount: 40000 }, { amount: 60000 }],
    });
    expect(r.ok).toBe(true);
  });

  it('requires a valid max % when discount is enabled', () => {
    expect(canActivate({ ...base, discountAllowed: true, discountMaxPct: 0 }).ok).toBe(false);
    expect(canActivate({ ...base, discountAllowed: true, discountMaxPct: 150 }).ok).toBe(false);
    expect(canActivate({ ...base, discountAllowed: true, discountMaxPct: 15 }).ok).toBe(true);
  });
});

describe('intake helpers (pure)', () => {
  it('derives Upcoming / Open / Closed from start/closing dates', () => {
    const now = new Date('2026-06-15T00:00:00Z');
    expect(deriveIntakeStatus('2026-08-01', '2026-09-01', now)).toBe('Upcoming');
    expect(deriveIntakeStatus('2026-06-01', '2026-07-01', now)).toBe('Open');
    expect(deriveIntakeStatus('2026-01-01', '2026-02-01', now)).toBe('Closed');
    expect(deriveIntakeStatus('2026-06-01', null, now)).toBe('Open'); // no closing date
  });

  it('falls back to (year, month) when there is no start_date (MEDIUM-3)', () => {
    const now = new Date('2026-06-15T00:00:00Z');
    // Nothing at all to reason from -> a clearly-labelled Unknown.
    expect(deriveIntakeStatus(null, null, now)).toBe('Unknown');
    // A dateless intake reads its status from the (year, month) pair.
    expect(deriveIntakeStatus(null, null, now, { year: 2026, month: 'August' })).toBe('Upcoming');
    expect(deriveIntakeStatus(null, null, now, { year: 2026, month: 'June' })).toBe('Open');
    expect(deriveIntakeStatus(null, null, now, { year: 2026, month: 'March' })).toBe('Closed');
    expect(deriveIntakeStatus(null, null, now, { year: 2027, month: null })).toBe('Upcoming');
  });

  it('picks the next intake by start_date, locating the current one by id', () => {
    const intakes = [
      { id: 1, start_date: '2025-01-01' },
      { id: 2, start_date: '2025-07-01' },
      { id: 3, start_date: '2026-01-01' },
      { id: 4, start_date: null }, // dateless -> ordered after the dated ones (by id)
    ];
    expect(pickNextIntakeId(intakes, 1)).toBe(2);
    expect(pickNextIntakeId(intakes, 2)).toBe(3);
    expect(pickNextIntakeId(intakes, 3)).toBe(4);
    expect(pickNextIntakeId(intakes, 4)).toBeNull(); // last in the order
    expect(pickNextIntakeId(intakes, 999)).toBeNull(); // current absent
  });

  it('orders dateless intakes by (year, month) then id — the production shape (MEDIUM-3)', () => {
    // Every intake has a NULL start_date, exactly like the 57+ seed intakes.
    const intakes = [
      { id: 10, start_date: null, year: 2027, month: 'July' },
      { id: 11, start_date: null, year: 2026, month: 'March' },
      { id: 12, start_date: null, year: 2026, month: 'August' },
      { id: 13, start_date: null, year: null, month: null }, // no anchor -> tier 1, by id
    ];
    // 11 (2026-03) < 12 (2026-08) < 10 (2027-07) < 13 (yearless).
    expect(pickNextIntakeId(intakes, 11)).toBe(12);
    expect(pickNextIntakeId(intakes, 12)).toBe(10);
    expect(pickNextIntakeId(intakes, 10)).toBe(13);
    expect(pickNextIntakeId(intakes, 13)).toBeNull();
  });
});
