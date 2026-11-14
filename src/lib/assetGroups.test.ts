import { describe, it, expect } from 'vitest';
import { groupAssetsByType } from './assetGroups';
import type { Asset } from '@/types';

const a = (id: string, type: string, balance?: number): Asset =>
  ({ id, type, balance, owner: 'Shi', provider: 'p', product_name: id } as Asset);

describe('groupAssetsByType', () => {
  it('puts every asset of a type in one group', () => {
    const groups = groupAssetsByType([
      a('h1', 'קרן השתלמות', 100), a('s1', 'ניירות ערך', 50), a('h2', 'קרן השתלמות', 300),
    ]);
    expect(groups.map((g) => g.type)).toEqual(['קרן השתלמות', 'ניירות ערך']);
    expect(groups[0].assets.map((x) => x.id)).toEqual(['h2', 'h1']);
  });

  it('orders groups by total, not by their largest single asset', () => {
    const groups = groupAssetsByType([
      a('big', 'ניירות ערך', 500),
      a('g1', 'קופת גמל להשקעה', 300), a('g2', 'קופת גמל להשקעה', 300),
    ]);
    expect(groups.map((g) => [g.type, g.total])).toEqual([['קופת גמל להשקעה', 600], ['ניירות ערך', 500]]);
  });

  it('a missing balance counts as 0 and sorts last in its group', () => {
    const groups = groupAssetsByType([a('none', 'עו"ש'), a('some', 'עו"ש', 10)]);
    expect(groups[0].assets.map((x) => x.id)).toEqual(['some', 'none']);
    expect(groups[0].total).toBe(10);
  });

  it('does not reorder the input array', () => {
    const input = [a('x', 'אחר', 1), a('y', 'אחר', 2)];
    groupAssetsByType(input);
    expect(input.map((x) => x.id)).toEqual(['x', 'y']);
  });
});
