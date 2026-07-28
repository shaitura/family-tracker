import { describe, it, expect } from 'vitest';
import {
  findAnomalies, findLeaks, yearOverYear, seasonalPeaks, paymentMethodByMonth, payerCategoryBreakdown, executiveSummary, cashflowForecast, miscDrift,
  categoryTrendInsights, seasonalHeadsUp, yoySameMonthInsight, categoryShareShift, analystInsights,
} from './insights';
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

  it('attaches the top-10 contributing transactions, sorted by amount desc', () => {
    const all = [
      tx({ category: 'רכב', date: '2026-06-01', amount: 500 }),
      tx({ category: 'רכב', date: '2026-07-01', amount: 300 }),
      tx({ category: 'רכב', date: '2026-07-05', amount: 700 }),
    ];
    const out = findAnomalies(all, ['2026-07'], ['2026-06']);
    expect(out[0].transactions.map((t) => t.amount)).toEqual([700, 300]);
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

  it('attaches the underlying transactions for the group, sorted by amount desc', () => {
    const all = [
      tx({ expense_class: 'משתנה', notes: 'נטפליקס', date: '2026-05-01', amount: 40 }),
      tx({ expense_class: 'משתנה', notes: 'נטפליקס', date: '2026-06-01', amount: 60 }),
      tx({ expense_class: 'משתנה', notes: 'נטפליקס', date: '2026-07-01', amount: 50 }),
    ];
    const out = findLeaks(all);
    expect(out[0].transactions.map((t) => t.amount)).toEqual([60, 50, 40]);
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
    const anomalyTx = [tx({ category: 'רכב', amount: 900 })];
    const items = executiveSummary({
      expenses, priorExpenses: [tx({ amount: 500 })], income: 5000,
      anomalies: [{ category: 'רכב', currentAmount: 900, movingAvg: 400, deviation: 125, level: 'bad', transactions: anomalyTx }],
      leaks: [],
    });
    expect(items.length).toBeLessThanOrEqual(5);
    expect(items.some((i) => i.text.includes('רכב'))).toBe(true);
  });

  it('empty expenses returns no items', () => {
    expect(executiveSummary({ expenses: [], priorExpenses: [], income: 0, anomalies: [], leaks: [] })).toEqual([]);
  });

  it('every returned item carries its own supporting transactions', () => {
    const expenses = [tx({ category: 'דיור', amount: 1000 }), tx({ category: 'רכב', amount: 200 })];
    const items = executiveSummary({ expenses, priorExpenses: [], income: 0, anomalies: [], leaks: [] });
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(Array.isArray(item.transactions)).toBe(true);
    const topCatItem = items.find((i) => i.text.startsWith('קטגוריה מובילת'))!;
    expect(topCatItem.transactions.every((t) => t.category === 'דיור')).toBe(true);
  });

  it('the leaks-summary item aggregates transactions across all leak groups', () => {
    const leakA = { name: 'נטפליקס', category: 'פנאי', monthlyAvg: 50, yearlyEstimate: 600, months: 3, occurrences: 3, isSubscription: true, transactions: [tx({ amount: 50 })] };
    const leakB = { name: 'ספוטיפיי', category: 'פנאי', monthlyAvg: 20, yearlyEstimate: 240, months: 3, occurrences: 3, isSubscription: true, transactions: [tx({ amount: 20 })] };
    const items = executiveSummary({ expenses: [tx({ amount: 1000 })], priorExpenses: [], income: 0, anomalies: [], leaks: [leakA, leakB] });
    const leakItem = items.find((i) => i.text.includes('הוצאות קבועות'))!;
    expect(leakItem.transactions.map((t) => t.amount).sort((a, b) => b - a)).toEqual([50, 20]);
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

const NOW = new Date(2026, 6, 15); // 2026-07-15

describe('categoryTrendInsights', () => {
  it('flags a category rising every month over the lookback window', () => {
    const all = [
      tx({ category: 'רכב', date: '2026-04-01', amount: 100 }),
      tx({ category: 'רכב', date: '2026-05-01', amount: 150 }),
      tx({ category: 'רכב', date: '2026-06-01', amount: 200 }),
      tx({ category: 'רכב', date: '2026-07-01', amount: 250 }),
    ];
    const out = categoryTrendInsights(all, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].headline).toContain('רכב');
    expect(out[0].level).toBe('bad'); // 150% rise, >40%
  });

  it('does not flag a category with a sporadic (near-zero) month', () => {
    const all = [
      tx({ category: 'פנאי', date: '2026-04-01', amount: 100 }),
      tx({ category: 'פנאי', date: '2026-05-01', amount: 0 }),
      tx({ category: 'פנאי', date: '2026-06-01', amount: 200 }),
      tx({ category: 'פנאי', date: '2026-07-01', amount: 250 }),
    ];
    expect(categoryTrendInsights(all, NOW)).toEqual([]);
  });

  it('does not flag a flat (non-monotonic) category', () => {
    const all = [
      tx({ category: 'דלק', date: '2026-04-01', amount: 200 }),
      tx({ category: 'דלק', date: '2026-05-01', amount: 180 }),
      tx({ category: 'דלק', date: '2026-06-01', amount: 210 }),
      tx({ category: 'דלק', date: '2026-07-01', amount: 190 }),
    ];
    expect(categoryTrendInsights(all, NOW)).toEqual([]);
  });
});

describe('seasonalHeadsUp', () => {
  it('warns when the current real-world month is a known seasonal peak', () => {
    const out = seasonalHeadsUp([{ month: 'יול', avg: 5000, ratio: 1.3 }], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].headline).toContain('יול');
  });

  it('stays silent when the current month is not a peak', () => {
    expect(seasonalHeadsUp([{ month: 'יול', avg: 5000, ratio: 1.05 }], NOW)).toEqual([]);
  });

  it('stays silent when there is no seasonal data for the current month', () => {
    expect(seasonalHeadsUp([{ month: 'דצמ', avg: 5000, ratio: 1.3 }], NOW)).toEqual([]);
  });
});

describe('yoySameMonthInsight', () => {
  it('flags a significant rise vs. the same month last year', () => {
    const yoy = [{ month: 'יוני', 2025: 700, 2026: 1000 }];
    const out = yoySameMonthInsight(yoy, 2026, NOW); // last complete month before July = June
    expect(out).toHaveLength(1);
    expect(out[0].level).toBe('bad'); // ~43% rise, >25%
  });

  it('stays silent in January (no complete month yet this year)', () => {
    expect(yoySameMonthInsight([{ month: 'דצמ', 2025: 700, 2026: 1000 }], 2026, new Date(2026, 0, 10))).toEqual([]);
  });

  it('stays silent below the noise threshold', () => {
    expect(yoySameMonthInsight([{ month: 'יוני', 2025: 700, 2026: 730 }], 2026, NOW)).toEqual([]);
  });
});

describe('categoryShareShift', () => {
  // With NOW = 2026-07-15: "recent" 6-month window is 2026-02..2026-07 (inclusive of the current month),
  // "older" 6-month window is 2025-08..2026-01 — verified against the function's own monthKey/monthsBack math.
  const RECENT_MONTHS = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'];
  const OLDER_MONTHS = ['2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01'];

  it('flags the category whose budget share shifted the most', () => {
    const all: Transaction[] = [];
    for (const ym of OLDER_MONTHS) all.push(tx({ category: 'דיור', date: `${ym}-01`, amount: 900 }), tx({ category: 'פנאי', date: `${ym}-01`, amount: 100 }));
    for (const ym of RECENT_MONTHS) all.push(tx({ category: 'דיור', date: `${ym}-01`, amount: 500 }), tx({ category: 'פנאי', date: `${ym}-01`, amount: 500 }));
    const out = categoryShareShift(all, NOW);
    expect(out).toHaveLength(1);
    expect(['דיור', 'פנאי']).toContain(out[0].headline.replace('התקציב נוטה יותר ל', ''));
  });

  it('stays silent with no older-window data to compare against', () => {
    expect(categoryShareShift([tx({ date: '2026-07-01' })], NOW)).toEqual([]);
  });
});

describe('analystInsights', () => {
  it('composes results from all four sub-analyses, capped at 6', () => {
    const all = [
      tx({ category: 'רכב', date: '2026-04-01', amount: 100 }),
      tx({ category: 'רכב', date: '2026-05-01', amount: 150 }),
      tx({ category: 'רכב', date: '2026-06-01', amount: 200 }),
      tx({ category: 'רכב', date: '2026-07-01', amount: 250 }),
    ];
    const out = analystInsights({ allExpenses: all, seasonal: [], yoy: [], currentYear: 2026, now: NOW });
    expect(out.length).toBeLessThanOrEqual(6);
    expect(out.length).toBeGreaterThan(0);
  });

  it('returns an empty array gracefully when there is no data at all', () => {
    expect(analystInsights({ allExpenses: [], seasonal: [], yoy: [], currentYear: 2026, now: NOW })).toEqual([]);
  });
});
