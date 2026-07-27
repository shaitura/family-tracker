import { describe, it, expect } from 'vitest';
import { findAnomalies, findLeaks, yearOverYear, seasonalPeaks, paymentMethodByMonth, payerCategoryBreakdown, executiveSummary, cashflowForecast, miscDrift } from './insights';
import { Transaction } from '@/types';

function tx(over: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(), date: '2026-07-01', type: 'expense', category: 'שונות', amount: 100,
    payer: 'Shi', payment_method: 'אשראי', expense_class: 'משתנה', status: 'paid',
    ...over,
  };
}

describe('findAnomalies', () => {
  it('flags a category that rose >=30% vs the prior equal-length window', () => {
    const all = [
      tx({ category: 'רכב', date: '2026-06-01', amount: 500 }),
      tx({ category: 'רכב', date: '2026-07-01', amount: 1000 }),
    ];
    const out = findAnomalies(all, ['2026-07'], ['2026-06']);
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe('רכב');
    expect(out[0].deviation).toBe(100);
    expect(out[0].level).toBe('bad'); // >=60%
  });

  it('ignores categories below the minimum-amount noise floor', () => {
    const all = [tx({ category: 'דלק', date: '2026-06-01', amount: 50 }), tx({ category: 'דלק', date: '2026-07-01', amount: 90 })];
    expect(findAnomalies(all, ['2026-07'], ['2026-06'])).toEqual([]);
  });

  it('empty months returns no anomalies', () => {
    expect(findAnomalies([tx({})], [], [])).toEqual([]);
  });
});

describe('findLeaks', () => {
  it('detects a description recurring in >=3 months, ignores <3', () => {
    const all = [
      tx({ expense_class: 'משתנה', notes: 'נטפליקס', date: '2026-05-01', amount: 50 }),
      tx({ expense_class: 'משתנה', notes: 'נטפליקס', date: '2026-06-01', amount: 50 }),
      tx({ expense_class: 'משתנה', notes: 'נטפליקס', date: '2026-07-01', amount: 50 }),
      tx({ expense_class: 'משתנה', notes: 'חד פעמי', date: '2026-07-01', amount: 999 }),
    ];
    const out = findLeaks(all);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('נטפליקס');
    expect(out[0].monthlyAvg).toBe(50);
    expect(out[0].yearlyEstimate).toBe(600);
    expect(out[0].isSubscription).toBe(true);
  });

  it('ignores fixed-class expenses (they are already declared, not "leaks")', () => {
    const all = Array.from({ length: 4 }, (_, i) => tx({ expense_class: 'קבועה', notes: 'שכירות', date: `2026-0${i + 4}-01`, amount: 3000 }));
    expect(findLeaks(all)).toEqual([]);
  });
});

describe('yearOverYear', () => {
  it('sums each calendar month across 3 years', () => {
    const all = [tx({ date: '2024-07-01', amount: 100 }), tx({ date: '2025-07-01', amount: 200 }), tx({ date: '2026-07-01', amount: 300 })];
    const out = yearOverYear(all, 2026);
    const julRow = out.find((r) => r.month === 'יול')!;
    expect(julRow[2024]).toBe(100);
    expect(julRow[2025]).toBe(200);
    expect(julRow[2026]).toBe(300);
  });
});

describe('seasonalPeaks', () => {
  it('requires at least 2 years of data for a month to be scored', () => {
    const all = [tx({ date: '2026-12-01', amount: 5000 })]; // only 1 year of December data
    expect(seasonalPeaks(all, 2026)).toEqual([]);
  });

  it('flags a month with ratio > 1 when it is above the overall average', () => {
    const all = [
      tx({ date: '2024-12-01', amount: 5000 }), tx({ date: '2025-12-01', amount: 5000 }),
      tx({ date: '2026-01-01', amount: 500 }), tx({ date: '2025-01-01', amount: 500 }),
    ];
    const out = seasonalPeaks(all, 2026);
    const dec = out.find((r) => r.month === 'דצמ');
    expect(dec).toBeDefined();
    expect(dec!.ratio).toBeGreaterThan(1);
  });
});

describe('paymentMethodByMonth', () => {
  it('one row per month with a column per method', () => {
    const out = paymentMethodByMonth([tx({ payment_method: 'ביט', date: '2026-07-01', amount: 40 })], ['2026-07']);
    expect(out).toHaveLength(1);
    expect(out[0]['ביט']).toBe(40);
    expect(out[0]['אשראי']).toBe(0);
  });
});

describe('payerCategoryBreakdown', () => {
  it('breaks down category totals per payer and produces a pie total', () => {
    const out = payerCategoryBreakdown([tx({ payer: 'Shi', category: 'רכב', amount: 300 }), tx({ payer: 'Ortal', category: 'רכב', amount: 100 })]);
    const row = out.byCat.find((r) => r.category === 'רכב')!;
    expect(row['שי']).toBe(300);
    expect(row['אורטל']).toBe(100);
    expect(out.pieData).toContainEqual({ name: 'שי', value: 300 });
  });

  it('legacy Hebrew payer values still count (old Firestore rows)', () => {
    const out = payerCategoryBreakdown([tx({ payer: 'שי' as Transaction['payer'], category: 'רכב', amount: 77 })]);
    expect(out.pieData).toContainEqual({ name: 'שי', value: 77 });
  });
});

describe('executiveSummary', () => {
  it('returns at most 5 items and includes an anomaly line when one exists', () => {
    const expenses = [tx({ amount: 1000 })];
    const items = executiveSummary({
      expenses, priorExpenses: [tx({ amount: 500 })], income: 5000,
      anomalies: [{ category: 'רכב', currentAmount: 900, movingAvg: 400, deviation: 125, level: 'bad' }],
      leaks: [],
    });
    expect(items.length).toBeLessThanOrEqual(5);
    expect(items.some((i) => i.text.includes('רכב'))).toBe(true);
  });

  it('empty expenses returns no items', () => {
    expect(executiveSummary({ expenses: [], priorExpenses: [], income: 0, anomalies: [], leaks: [] })).toEqual([]);
  });
});

describe('cashflowForecast', () => {
  it('combines known future recurring amounts with an estimated variable average', () => {
    const future = [tx({ status: 'future', date: '2026-08-01', amount: 3000 })]; // known fixed
    const recentVariable = [tx({ amount: 600 }), tx({ amount: 900 })]; // 2 months of variable history
    const out = cashflowForecast(future, recentVariable, ['2026-08', '2026-09'], 3);
    expect(out[0].knownFixed).toBe(3000);
    expect(out[0].estimatedVariable).toBe(500); // (600+900)/3
    expect(out[0].total).toBe(3500);
    expect(out[1].knownFixed).toBe(0); // no known recurring for Sept in this fixture
  });

  it('zero variable history yields a zero estimate, not NaN', () => {
    const out = cashflowForecast([], [], ['2026-08'], 3);
    expect(out[0].estimatedVariable).toBe(0);
  });
});

describe('miscDrift', () => {
  it('flags a month where שונות exceeds the threshold share', () => {
    const expenses = [
      tx({ category: 'שונות', date: '2026-07-01', amount: 200 }),
      tx({ category: 'דיור', date: '2026-07-01', amount: 800 }),
    ];
    const out = miscDrift(expenses, ['2026-07']);
    expect(out[0].sharePct).toBe(20);
    expect(out[0].flagged).toBe(true); // >15% threshold
  });

  it('does not flag a low-share month', () => {
    const expenses = [tx({ category: 'שונות', date: '2026-07-01', amount: 50 }), tx({ category: 'דיור', date: '2026-07-01', amount: 950 })];
    expect(miscDrift(expenses, ['2026-07'])[0].flagged).toBe(false);
  });

  it('handles a month with no expenses at all', () => {
    expect(miscDrift([], ['2026-07'])).toEqual([{ month: '2026-07', miscTotal: 0, totalExpense: 0, sharePct: 0, flagged: false }]);
  });
});
