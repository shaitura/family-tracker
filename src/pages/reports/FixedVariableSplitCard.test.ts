import { describe, it, expect } from 'vitest';
import { splitPercent, splitPercents } from './FixedVariableSplitCard';
import { FixedVariableSplit } from '@/lib/reportAggregates';

const split = (fixedTotal: number, varTotal: number): FixedVariableSplit => ({
  fixedTotal, varTotal, splitTotal: fixedTotal + varTotal, fixedCats: [], varCats: [],
});

describe('splitPercent', () => {
  it('is the share of the classified total', () => {
    expect(splitPercent(2500, 10000)).toBe(25);
  });

  it('returns null rather than NaN when nothing is classified', () => {
    expect(splitPercent(0, 0)).toBeNull();
  });
});

describe('splitPercents', () => {
  it('splits an even breakdown', () => {
    expect(splitPercents(split(5000, 5000))).toEqual({ fixed: 50, variable: 50 });
  });

  it('always totals 100, even where independent rounding would give 101', () => {
    // 50.5 / 49.5 rounds to 51 and 50 independently.
    const p = splitPercents(split(1010, 990))!;
    expect(p.fixed + p.variable).toBe(100);
    expect(p.fixed).toBe(51);
    expect(p.variable).toBe(49);
  });

  it('totals 100 across a spread of awkward ratios', () => {
    for (const [f, v] of [[1, 2], [1, 3], [7, 13], [333, 667], [1, 999], [12345, 54321]]) {
      const p = splitPercents(split(f, v))!;
      expect(p.fixed + p.variable).toBe(100);
    }
  });

  it('handles an all-fixed and an all-variable period', () => {
    expect(splitPercents(split(4000, 0))).toEqual({ fixed: 100, variable: 0 });
    expect(splitPercents(split(0, 4000))).toEqual({ fixed: 0, variable: 100 });
  });

  it('returns null when the period has no classified rows', () => {
    expect(splitPercents(split(0, 0))).toBeNull();
  });
});
