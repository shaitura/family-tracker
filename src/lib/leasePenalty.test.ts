import { describe, it, expect } from 'vitest';
import {
  computeExcessPenalty,
  PENALTY_FREE_KM,
  TIER_1_KM,
  TIER_1_RATE,
  TIER_2_RATE,
} from './leasePenalty';

describe('computeExcessPenalty — within the allowance', () => {
  it('is free well below the limit', () => {
    const p = computeExcessPenalty(12_345);
    expect(p.excessKm).toBe(0);
    expect(p.total).toBe(0);
    expect(p.tier1Km).toBe(0);
    expect(p.tier2Km).toBe(0);
  });

  it('is still free at exactly the 20,000 allowance', () => {
    const p = computeExcessPenalty(PENALTY_FREE_KM);
    expect(p.excessKm).toBe(0);
    expect(p.total).toBe(0);
  });

  it('charges the first excess km at the low rate', () => {
    const p = computeExcessPenalty(PENALTY_FREE_KM + 1);
    expect(p.excessKm).toBe(1);
    expect(p.total).toBeCloseTo(TIER_1_RATE, 10);
  });

  it('never returns a negative penalty for an unused year', () => {
    const p = computeExcessPenalty(0);
    expect(p.excessKm).toBe(0);
    expect(p.total).toBe(0);
    expect(p.kmUntilTier2).toBe(PENALTY_FREE_KM + TIER_1_KM);
  });
});

describe('computeExcessPenalty — the tier boundary', () => {
  it('bills exactly 2,000 excess km entirely at the low rate', () => {
    const p = computeExcessPenalty(PENALTY_FREE_KM + TIER_1_KM);
    expect(p.excessKm).toBe(2_000);
    expect(p.tier1Km).toBe(2_000);
    expect(p.tier2Km).toBe(0);
    expect(p.total).toBeCloseTo(1_700, 10); // 2000 × 0.85
  });

  it('sends only the 2,001st km into the high tier', () => {
    const p = computeExcessPenalty(PENALTY_FREE_KM + TIER_1_KM + 1);
    expect(p.tier1Km).toBe(2_000);
    expect(p.tier2Km).toBe(1);
    expect(p.total).toBeCloseTo(1_700 + TIER_2_RATE, 10);
  });

  it('makes the marginal km at the boundary jump to the high rate', () => {
    const before = computeExcessPenalty(PENALTY_FREE_KM + TIER_1_KM);
    const after = computeExcessPenalty(PENALTY_FREE_KM + TIER_1_KM + 1);
    expect(after.total - before.total).toBeCloseTo(TIER_2_RATE, 10);
    expect(TIER_2_RATE / TIER_1_RATE).toBeGreaterThan(2); // the jump the "i" popover explains
  });
});

describe('computeExcessPenalty — beyond the boundary', () => {
  it('splits 3,000 excess km across both tiers', () => {
    const p = computeExcessPenalty(23_000);
    expect(p.tier1Km).toBe(2_000);
    expect(p.tier2Km).toBe(1_000);
    expect(p.tier1Cost).toBeCloseTo(1_700, 10);
    expect(p.tier2Cost).toBeCloseTo(1_760, 10);
    expect(p.total).toBeCloseTo(3_460, 10);
  });

  it('keeps tier1 capped no matter how large the excess', () => {
    const p = computeExcessPenalty(50_000);
    expect(p.tier1Km).toBe(TIER_1_KM);
    expect(p.tier2Km).toBe(28_000);
    expect(p.total).toBeCloseTo(1_700 + 28_000 * TIER_2_RATE, 10);
  });

  it('always has the tiers sum to the total and the excess', () => {
    for (const km of [0, 19_999, 20_000, 20_500, 22_000, 22_001, 31_234]) {
      const p = computeExcessPenalty(km);
      expect(p.tier1Km + p.tier2Km).toBe(p.excessKm);
      expect(p.tier1Cost + p.tier2Cost).toBeCloseTo(p.total, 10);
    }
  });
});

describe('kmUntilTier2 — the actionable warning', () => {
  it('counts down to the boundary from within the allowance', () => {
    expect(computeExcessPenalty(19_000).kmUntilTier2).toBe(3_000);
  });

  it('counts down while inside the low tier', () => {
    expect(computeExcessPenalty(21_500).kmUntilTier2).toBe(500);
  });

  it('is 0 once the high tier has been entered', () => {
    expect(computeExcessPenalty(22_000).kmUntilTier2).toBe(0);
    expect(computeExcessPenalty(25_000).kmUntilTier2).toBe(0);
  });
});

describe('computeExcessPenalty — fractional projections', () => {
  it('handles a non-integer projected year-end without rounding surprises', () => {
    const p = computeExcessPenalty(20_500.5);
    expect(p.excessKm).toBeCloseTo(500.5, 10);
    expect(p.total).toBeCloseTo(500.5 * TIER_1_RATE, 10);
  });
});
