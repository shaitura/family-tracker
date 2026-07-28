import { describe, it, expect } from 'vitest';
import { toggleIndex } from './InsightDrilldownList';

describe('toggleIndex', () => {
  it('adds an index that is not in the set', () => {
    const out = toggleIndex(new Set([1, 3]), 2);
    expect(out).toEqual(new Set([1, 2, 3]));
  });

  it('removes an index that is already in the set', () => {
    const out = toggleIndex(new Set([1, 2, 3]), 2);
    expect(out).toEqual(new Set([1, 3]));
  });

  it('does not mutate the input set', () => {
    const input = new Set([1]);
    toggleIndex(input, 5);
    expect(input).toEqual(new Set([1]));
  });
});
