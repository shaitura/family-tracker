import { describe, it, expect } from 'vitest';
import { summarizeKidsSavings, childOwnedFamilyAssets, isInsurance, isFamilyInvestment, isKidsSavings } from './kidsSavings';
import type { Asset } from '@/types';

const a = (p: Partial<Asset>): Asset =>
  ({ id: p.id ?? Math.random().toString(36), owner: 'Shi', type: 'אחר', provider: 'p', product_name: 'x', ...p } as Asset);

describe('section split', () => {
  it('a children\'s-savings asset is neither insurance nor a family investment', () => {
    const k = a({ asset_class: 'חיסכון ילדים' });
    expect([isKidsSavings(k), isFamilyInvestment(k), isInsurance(k)]).toEqual([true, false, false]);
  });

  it('a record with no asset_class is still insurance, as before', () => {
    expect(isInsurance(a({}))).toBe(true);
  });
});

describe('summarizeKidsSavings', () => {
  const assets = [
    a({ asset_class: 'חיסכון ילדים', owner: 'Yuval', type: 'חיסכון לכל ילד', balance: 1000, monthly_deposit: 57 }),
    a({ asset_class: 'חיסכון ילדים', owner: 'Yuval', type: 'קופת גמל להשקעה', balance: 3000, monthly_deposit: 200 }),
    a({ asset_class: 'חיסכון ילדים', owner: 'Aviv', type: 'חיסכון בבנק', balance: 500 }),
    a({ asset_class: 'נכס/השקעה', owner: 'Shi', balance: 999999 }),          // family: not counted
    a({ asset_class: 'נכס/השקעה', owner: 'Ziv', balance: 777 }),             // family, child-owned: not counted
  ];

  it('totals only children\'s-savings assets', () => {
    const s = summarizeKidsSavings(assets);
    expect(s.total).toBe(4500);
    expect(s.monthly).toBe(257);
  });

  it('lists every child even with nothing saved, and no Joint row when none exists', () => {
    const s = summarizeKidsSavings(assets);
    expect(s.kids.map((k) => [k.owner, k.total])).toEqual([['Yuval', 4000], ['Aviv', 500], ['Ziv', 0]]);
  });

  it('adds a Joint row when a shared asset exists', () => {
    const s = summarizeKidsSavings([...assets, a({ asset_class: 'חיסכון ילדים', owner: 'Joint', balance: 100 })]);
    expect(s.kids[s.kids.length - 1]).toMatchObject({ owner: 'Joint', total: 100 });
    expect(s.total).toBe(4600);
  });

  it('an unexpected owner still shows and still counts', () => {
    const s = summarizeKidsSavings([a({ asset_class: 'חיסכון ילדים', owner: 'Shi', balance: 10 })]);
    expect(s.kids.find((k) => k.owner === 'Shi')?.total).toBe(10);
    expect(s.total).toBe(10);
  });

  it('missing balance and deposit count as 0 (older records lack monthly_deposit)', () => {
    const s = summarizeKidsSavings([a({ asset_class: 'חיסכון ילדים', owner: 'Ziv' })]);
    expect([s.total, s.monthly]).toEqual([0, 0]);
  });

  it('groups each child\'s assets by type', () => {
    const yuval = summarizeKidsSavings(assets).kids[0];
    expect(yuval.byType.map((g) => g.type)).toEqual(['קופת גמל להשקעה', 'חיסכון לכל ילד']);
  });
});

describe('childOwnedFamilyAssets', () => {
  it('finds family investments owned by a child, not insurance or kids savings', () => {
    const list = childOwnedFamilyAssets([
      a({ id: 'fam', asset_class: 'נכס/השקעה', owner: 'Yuval' }),
      a({ id: 'ins', asset_class: 'ביטוח/קרן', owner: 'Yuval' }),
      a({ id: 'kid', asset_class: 'חיסכון ילדים', owner: 'Yuval' }),
      a({ id: 'adult', asset_class: 'נכס/השקעה', owner: 'Ortal' }),
    ]);
    expect(list.map((x) => x.id)).toEqual(['fam']);
  });
});
