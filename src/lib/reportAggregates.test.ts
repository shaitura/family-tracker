import { describe, it, expect } from 'vitest';
import { byCategory, byPayer, byMonth, fixedVariableSplit, categoryMonthMatrix } from './reportAggregates';
import { Transaction } from '@/types';

function tx(over: Partial<Transaction>): Transaction {
  return {
    id: 'x', date: '2026-07-01', type: 'expense', category: 'שונות', amount: 100,
    payer: 'Shi', payment_method: 'אשראי', expense_class: 'משתנה', status: 'paid',
    ...over,
  };
}

describe('byCategory', () => {
  it('sums and sorts descending', () => {
    const out = byCategory([tx({ category: 'דיור', amount: 500 }), tx({ category: 'רכב', amount: 900 }), tx({ category: 'דיור', amount: 100 })]);
    expect(out).toEqual([{ name: 'רכב', value: 900 }, { name: 'דיור', value: 600 }]);
  });
});

describe('byPayer', () => {
  it('maps to Hebrew labels', () => {
    const out = byPayer([tx({ payer: 'Shi', amount: 100 }), tx({ payer: 'Ortal', amount: 50 })]);
    expect(out).toContainEqual({ name: 'שי', value: 100 });
    expect(out).toContainEqual({ name: 'אורטל', value: 50 });
  });
});

describe('byMonth', () => {
  it('one entry per requested month, zero when absent', () => {
    const out = byMonth([tx({ date: '2026-07-05', amount: 200 })], ['2026-06', '2026-07']);
    expect(out).toEqual([{ name: '2026-06', value: 0 }, { name: '2026-07', value: 200 }]);
  });
});

describe('fixedVariableSplit', () => {
  it('separates totals and per-category breakdown', () => {
    const out = fixedVariableSplit([
      tx({ expense_class: 'קבועה', category: 'דיור', amount: 3000 }),
      tx({ expense_class: 'משתנה', category: 'מצרכים', amount: 400 }),
    ]);
    expect(out.fixedTotal).toBe(3000);
    expect(out.varTotal).toBe(400);
    expect(out.splitTotal).toBe(3400);
    expect(out.fixedCats).toEqual([['דיור', 3000]]);
    expect(out.varCats).toEqual([['מצרכים', 400]]);
  });
});

describe('categoryMonthMatrix', () => {
  it('rows per category, totals and averages across the given months', () => {
    const out = categoryMonthMatrix([
      tx({ category: 'דיור', date: '2026-06-01', amount: 3000 }),
      tx({ category: 'דיור', date: '2026-07-01', amount: 3000 }),
      tx({ category: 'רכב', date: '2026-07-01', amount: 600 }),
    ], ['2026-06', '2026-07']);
    const dior = out.find((r) => r.category === 'דיור')!;
    expect(dior.total).toBe(6000);
    expect(dior.avg).toBe(3000);
    expect(dior.byMonth).toEqual({ '2026-06': 3000, '2026-07': 3000 });
    const car = out.find((r) => r.category === 'רכב')!;
    expect(car.total).toBe(600);
    expect(car.avg).toBe(300);
  });

  it('ignores transactions outside the given months', () => {
    const out = categoryMonthMatrix([tx({ category: 'דיור', date: '2025-01-01', amount: 999 })], ['2026-07']);
    expect(out).toEqual([]);
  });
});
