import { describe, it, expect } from 'vitest';
import { summaryInvestments, isRealEstate } from './realEstate';
import type { Asset } from '@/types';

const a = (id: string, type: string, balance: number): Asset =>
  ({ id, type, balance, owner: 'Shi', provider: 'p', product_name: id, asset_class: 'נכס/השקעה' } as Asset);

const assets = [a('apt', 'נדל"ן', 2_000_000), a('land', 'קרקע', 500_000), a('gemel', 'קופת גמל להשקעה', 300_000), a('rsu', 'מניות RSU', 200_000)];
const total = (xs: Asset[]) => xs.reduce((s, x) => s + (x.balance ?? 0), 0);

describe('summaryInvestments', () => {
  it('both real estate and land count as real estate', () => {
    expect(assets.filter(isRealEstate).map((x) => x.id)).toEqual(['apt', 'land']);
  });

  it('with the toggle off, everything is in the whole', () => {
    expect(total(summaryInvestments(assets, false))).toBe(3_000_000);
  });

  it('with the toggle on, the whole is the financial assets alone', () => {
    const fin = summaryInvestments(assets, true);
    expect(fin.map((x) => x.id)).toEqual(['gemel', 'rsu']);
    expect(total(fin)).toBe(500_000);
    // ...so their shares are 60% / 40%, not 10% / 6.7% of everything
    expect(fin.map((x) => Math.round(((x.balance ?? 0) / total(fin)) * 100))).toEqual([60, 40]);
  });
});
