# Unified Reports Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `src/pages/Reports.tsx`, `src/pages/AnnualAnalysis.tsx`, and `src/pages/Trends.tsx` into one unified `/reports` ("דוחות") page with a custom-date-range period model, per the approved design spec at `docs/superpowers/specs/2026-07-27-unified-reports-page-design.md`.

**Architecture:** Extract all business logic (period math, aggregation, insight heuristics) into pure, unit-tested `src/lib/*.ts` modules first. Then build 4 tab components (`ExpensesTab`, `IncomeTab`, `BalanceTab`, `InsightsTab`) under `src/pages/reports/` that consume those modules and the existing `useTransactions()` hook. Finally rewrite `src/pages/Reports.tsx` as a thin composition shell (type + period state → renders the active tab), wire routes/nav, verify live, then delete the two superseded pages.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind + Firebase/Firestore + @tanstack/react-query + recharts + react-router-dom (HashRouter) + xlsx (SheetJS CDN build). Adds `vitest` as a new dev dependency for the pure-logic layer only.

## Global Constraints

- No JS test runner exists in this repo today. This plan adds `vitest` scoped to the pure-logic modules (`reportPeriod.ts`, `reportAggregates.ts`, `insights.ts`) only. UI/composition tasks are verified via `npx tsc --noEmit`, `npm run build`, and a live-browser check on the deployed app — per this repo's established verify-by-run convention (no local `.env`, so `npm run dev` cannot reach Firestore; every UI change ships via `git push origin main` → GitHub Actions, ~2–4 min).
- Never invent new Hebrew labels — reuse `CATEGORIES` / `INCOME_CATEGORIES` from `src/types/index.ts` and `PAYER_LABELS` / `CHILD_LABELS` from `src/utils/index.ts` exactly as they exist today.
- Currency formatting always via the existing `formatCurrency()` in `src/utils/index.ts` — never hand-roll `₪` formatting in new code (the ported `insights.ts` heuristics are the one intentional exception — they use compact `fmt`/`fmtK` helpers copied verbatim from `Trends.tsx`, matching that tab's existing look).
- `dir="rtl"` on every new top-level container, matching every existing page.
- All new files use the `@/` path alias (see `tsconfig.json` `paths`), matching every existing import in this repo.
- Every task must leave `npx tsc --noEmit` clean and `npm run build` green before its commit.

---

## File Structure

**New (pure logic, unit-tested):**
- `src/lib/reportPeriod.ts` — the unified `{startMonth, endMonth}` period model + quick-pick builders.
- `src/lib/reportPeriod.test.ts`
- `src/lib/reportAggregates.ts` — shared by-category / by-month / by-payer / fixed-variable / category×month-matrix aggregation, used by both הוצאות and הכנסות tabs.
- `src/lib/reportAggregates.test.ts`
- `src/lib/insights.ts` — the תובנות logic: anomalies, leaks, year-over-year, seasonal peaks, payment-method-by-month, payer×category breakdown, executive summary (all ported near-verbatim from `Trends.tsx`), plus two new functions: `cashflowForecast` and `miscDrift`.
- `src/lib/insights.test.ts`

**New (UI, composed from the lib layer):**
- `src/pages/reports/PeriodSelector.tsx`
- `src/pages/reports/ExpensesTab.tsx`
- `src/pages/reports/IncomeTab.tsx`
- `src/pages/reports/BalanceTab.tsx`
- `src/pages/reports/InsightsTab.tsx`
- `src/pages/reports/exportReport.ts` — Excel/PDF export, extracted from `Reports.tsx` and generalized to an arbitrary period range.

**Modified:**
- `src/pages/Reports.tsx` — rewritten as the top-level composition shell.
- `src/components/Layout.tsx` — `NAV_ITEMS` drops שנתי / מגמות.
- `src/App.tsx` — drops the `/annual-analysis` and `/trends` routes/imports.
- `package.json`, new `vitest.config.ts` — test runner setup.

**Deleted (final task, after live verification):**
- `src/pages/AnnualAnalysis.tsx`
- `src/pages/Trends.tsx`

---

### Task 1: Add vitest for the pure-logic layer

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `npm test` script; `vitest` available for Tasks 2–4's test files.

- [ ] **Step 1: Install vitest**

Run: `cd /c/Users/shai/family-tracker && npm install -D vitest`
Expected: adds `vitest` to `devDependencies` in `package.json`, no errors.

- [ ] **Step 2: Add the `test` script**

Edit `package.json` — the `"scripts"` block currently reads:
```json
  "scripts": {
    "dev": "vite",
    "build": "cp template.html index.html && tsc && vite build",
    "preview": "vite preview"
  },
```
Change to:
```json
  "scripts": {
    "dev": "vite",
    "build": "cp template.html index.html && tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 4: Verify the runner works with a throwaway test**

Create a temporary file `src/lib/__vitest_smoke.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
describe('smoke', () => { it('runs', () => expect(1 + 1).toBe(2)); });
```
Run: `npm test`
Expected: `1 passed`. Then delete `src/lib/__vitest_smoke.test.ts` — it was only to confirm the runner works.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for pure-logic unit tests"
```

---

### Task 2: `reportPeriod.ts` — unified period model

**Files:**
- Create: `src/lib/reportPeriod.ts`
- Test: `src/lib/reportPeriod.test.ts`

**Interfaces:**
- Consumes: `monthsInRange`, `currentMonthKey` from `src/lib/recurrence.ts` (existing, signatures verified: `monthsInRange(start: string, end: string): string[]`, `currentMonthKey(now?: Date): string`).
- Produces: `type PeriodQuickPick`, `interface ReportPeriod { quickPick, startMonth, endMonth, year, isAllTime }`, `buildPeriod(quickPick, opts?): ReportPeriod`, `periodMonths(period): string[]`, `inPeriod(dateStr, period): boolean`, `priorPeriod(period): ReportPeriod`, `periodLabel(period): string` — used by every tab component and by `insights.ts`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/reportPeriod.test.ts
import { describe, it, expect } from 'vitest';
import { buildPeriod, periodMonths, inPeriod, priorPeriod, periodLabel } from './reportPeriod';

const NOW = new Date(2026, 6, 15); // 2026-07-15

describe('buildPeriod', () => {
  it('currentMonth', () => {
    const p = buildPeriod('currentMonth', { now: NOW });
    expect(p.startMonth).toBe('2026-07');
    expect(p.endMonth).toBe('2026-07');
    expect(p.isAllTime).toBe(false);
  });

  it('selectedYear', () => {
    const p = buildPeriod('selectedYear', { now: NOW, year: '2025' });
    expect(p.startMonth).toBe('2025-01');
    expect(p.endMonth).toBe('2025-12');
  });

  it('lastQuarter is 3 months ending this month', () => {
    const p = buildPeriod('lastQuarter', { now: NOW });
    expect(p.startMonth).toBe('2026-05');
    expect(p.endMonth).toBe('2026-07');
  });

  it('last12 spans a year boundary correctly', () => {
    const p = buildPeriod('last12', { now: new Date(2026, 1, 10) }); // 2026-02
    expect(p.startMonth).toBe('2025-03');
    expect(p.endMonth).toBe('2026-02');
  });

  it('last18', () => {
    const p = buildPeriod('last18', { now: NOW });
    expect(p.startMonth).toBe('2025-02');
    expect(p.endMonth).toBe('2026-07');
  });

  it('allTime has no start/end', () => {
    const p = buildPeriod('allTime', { now: NOW });
    expect(p.isAllTime).toBe(true);
  });

  it('custom range normalizes reversed input', () => {
    const p = buildPeriod('custom', { customStart: '2026-09', customEnd: '2025-11' });
    expect(p.startMonth).toBe('2025-11');
    expect(p.endMonth).toBe('2026-09');
  });
});

describe('periodMonths', () => {
  it('cross-year custom range', () => {
    const p = buildPeriod('custom', { customStart: '2025-11', customEnd: '2026-02' });
    expect(periodMonths(p)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('allTime returns empty (caller skips date filtering)', () => {
    const p = buildPeriod('allTime', { now: NOW });
    expect(periodMonths(p)).toEqual([]);
  });
});

describe('inPeriod', () => {
  it('matches inside range', () => {
    const p = buildPeriod('selectedYear', { now: NOW, year: '2026' });
    expect(inPeriod('2026-03-15', p)).toBe(true);
    expect(inPeriod('2025-12-31', p)).toBe(false);
  });

  it('allTime always matches', () => {
    const p = buildPeriod('allTime', { now: NOW });
    expect(inPeriod('2019-01-01', p)).toBe(true);
  });
});

describe('priorPeriod', () => {
  it('equal-length window immediately before', () => {
    const p = buildPeriod('custom', { customStart: '2026-05', customEnd: '2026-07' }); // 3 months
    const prior = priorPeriod(p);
    expect(prior.startMonth).toBe('2026-02');
    expect(prior.endMonth).toBe('2026-04');
  });

  it('single month prior is the month before', () => {
    const p = buildPeriod('currentMonth', { now: NOW });
    const prior = priorPeriod(p);
    expect(prior.startMonth).toBe('2026-06');
    expect(prior.endMonth).toBe('2026-06');
  });
});

describe('periodLabel', () => {
  it('selectedYear shows the year', () => {
    expect(periodLabel(buildPeriod('selectedYear', { now: NOW, year: '2025' }))).toBe('2025');
  });
  it('single month shows the month', () => {
    expect(periodLabel(buildPeriod('currentMonth', { now: NOW }))).toBe('2026-07');
  });
  it('range shows an arrow', () => {
    const p = buildPeriod('custom', { customStart: '2025-11', customEnd: '2026-02' });
    expect(periodLabel(p)).toBe('2025-11 → 2026-02');
  });
  it('allTime', () => {
    expect(periodLabel(buildPeriod('allTime', { now: NOW }))).toBe('כל הזמן');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- reportPeriod`
Expected: FAIL — `Cannot find module './reportPeriod'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/reportPeriod.ts
import { monthsInRange, currentMonthKey } from './recurrence';

export type PeriodQuickPick =
  | 'currentMonth' | 'selectedYear' | 'lastQuarter' | 'last12' | 'last18' | 'allTime' | 'custom';

export interface ReportPeriod {
  quickPick: PeriodQuickPick;
  startMonth: string;   // 'YYYY-MM', ignored when isAllTime
  endMonth: string;     // 'YYYY-MM', ignored when isAllTime
  year: string;         // the year shown by the "שנה נבחרת" year-picker
  isAllTime: boolean;
}

function subtractMonths(ym: string, count: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 - count, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function buildPeriod(
  quickPick: PeriodQuickPick,
  opts: { year?: string; customStart?: string; customEnd?: string; now?: Date } = {},
): ReportPeriod {
  const now = opts.now ?? new Date();
  const nowMonth = currentMonthKey(now);
  const year = opts.year ?? String(now.getFullYear());

  if (quickPick === 'currentMonth') {
    return { quickPick, startMonth: nowMonth, endMonth: nowMonth, year, isAllTime: false };
  }
  if (quickPick === 'selectedYear') {
    return { quickPick, startMonth: `${year}-01`, endMonth: `${year}-12`, year, isAllTime: false };
  }
  if (quickPick === 'lastQuarter') {
    return { quickPick, startMonth: subtractMonths(nowMonth, 2), endMonth: nowMonth, year, isAllTime: false };
  }
  if (quickPick === 'last12') {
    return { quickPick, startMonth: subtractMonths(nowMonth, 11), endMonth: nowMonth, year, isAllTime: false };
  }
  if (quickPick === 'last18') {
    return { quickPick, startMonth: subtractMonths(nowMonth, 17), endMonth: nowMonth, year, isAllTime: false };
  }
  if (quickPick === 'allTime') {
    return { quickPick, startMonth: '', endMonth: '', year, isAllTime: true };
  }
  // custom
  const s = opts.customStart || nowMonth;
  const e = opts.customEnd || nowMonth;
  const [startMonth, endMonth] = s <= e ? [s, e] : [e, s];
  return { quickPick, startMonth, endMonth, year, isAllTime: false };
}

/** Months covered by a period. Empty for allTime — caller should skip date filtering instead. */
export function periodMonths(period: ReportPeriod): string[] {
  if (period.isAllTime) return [];
  return monthsInRange(period.startMonth, period.endMonth);
}

/** True if a transaction date falls within the period (allTime always matches). */
export function inPeriod(dateStr: string, period: ReportPeriod): boolean {
  if (period.isAllTime) return true;
  const ym = dateStr.slice(0, 7);
  return ym >= period.startMonth && ym <= period.endMonth;
}

/** The equal-length period immediately preceding this one — used for anomaly comparisons. */
export function priorPeriod(period: ReportPeriod): ReportPeriod {
  if (period.isAllTime) return { ...period, startMonth: '', endMonth: '' };
  const len = periodMonths(period).length;
  const priorEnd = subtractMonths(period.startMonth, 1);
  const priorStart = subtractMonths(priorEnd, len - 1);
  return { ...period, quickPick: 'custom', startMonth: priorStart, endMonth: priorEnd };
}

export function periodLabel(period: ReportPeriod): string {
  if (period.isAllTime) return 'כל הזמן';
  if (period.quickPick === 'selectedYear') return period.year;
  if (period.startMonth === period.endMonth) return period.startMonth;
  return `${period.startMonth} → ${period.endMonth}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- reportPeriod`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reportPeriod.ts src/lib/reportPeriod.test.ts
git commit -m "feat(reports): unified period model with custom-range support"
```

---

### Task 3: `reportAggregates.ts` — shared by-category/month/payer/matrix/fixed-variable helpers

**Files:**
- Create: `src/lib/reportAggregates.ts`
- Test: `src/lib/reportAggregates.test.ts`

**Interfaces:**
- Consumes: `Transaction` from `@/types`; `PAYER_LABELS` from `@/utils` (existing `Record<string,string>`).
- Produces: `interface NamedAmount { name: string; value: number }`, `byCategory(txs): NamedAmount[]`, `byPayer(txs): NamedAmount[]`, `byMonth(txs, months): NamedAmount[]`, `interface FixedVariableSplit {...}`, `fixedVariableSplit(txs): FixedVariableSplit`, `interface CategoryMonthMatrixRow {...}`, `categoryMonthMatrix(txs, months): CategoryMonthMatrixRow[]` — used by `ExpensesTab.tsx`, `IncomeTab.tsx`, `BalanceTab.tsx`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/reportAggregates.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- reportAggregates`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/reportAggregates.ts
import { Transaction } from '@/types';
import { PAYER_LABELS } from '@/utils';

export interface NamedAmount { name: string; value: number }

export function byCategory(txs: Transaction[]): NamedAmount[] {
  const acc: Record<string, number> = {};
  for (const t of txs) acc[t.category] = (acc[t.category] || 0) + t.amount;
  return Object.entries(acc).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
}

export function byPayer(txs: Transaction[]): NamedAmount[] {
  const acc: Record<string, number> = {};
  for (const t of txs) acc[t.payer] = (acc[t.payer] || 0) + t.amount;
  return Object.entries(acc).map(([payer, value]) => ({ name: PAYER_LABELS[payer] || payer, value }));
}

export function byMonth(txs: Transaction[], months: string[]): NamedAmount[] {
  return months.map((m) => ({
    name: m,
    value: txs.filter((t) => t.date.startsWith(m)).reduce((s, t) => s + t.amount, 0),
  }));
}

export interface FixedVariableSplit {
  fixedTotal: number;
  varTotal: number;
  splitTotal: number;
  fixedCats: [string, number][];
  varCats: [string, number][];
}

export function fixedVariableSplit(txs: Transaction[]): FixedVariableSplit {
  const fixedByCat: Record<string, number> = {};
  const varByCat: Record<string, number> = {};
  let fixedTotal = 0, varTotal = 0;
  for (const t of txs) {
    if (t.expense_class === 'קבועה') { fixedByCat[t.category] = (fixedByCat[t.category] || 0) + t.amount; fixedTotal += t.amount; }
    if (t.expense_class === 'משתנה') { varByCat[t.category] = (varByCat[t.category] || 0) + t.amount; varTotal += t.amount; }
  }
  return {
    fixedTotal, varTotal, splitTotal: fixedTotal + varTotal,
    fixedCats: Object.entries(fixedByCat).sort((a, b) => b[1] - a[1]),
    varCats: Object.entries(varByCat).sort((a, b) => b[1] - a[1]),
  };
}

export interface CategoryMonthMatrixRow {
  category: string;
  byMonth: Record<string, number>;
  total: number;
  avg: number;
}

/** Rows = categories present in `txs` within `months`; columns implied by `months`. */
export function categoryMonthMatrix(txs: Transaction[], months: string[]): CategoryMonthMatrixRow[] {
  const monthSet = new Set(months);
  const byCatMonth: Record<string, Record<string, number>> = {};
  for (const t of txs) {
    const m = t.date.slice(0, 7);
    if (!monthSet.has(m)) continue;
    if (!byCatMonth[t.category]) byCatMonth[t.category] = {};
    byCatMonth[t.category][m] = (byCatMonth[t.category][m] || 0) + t.amount;
  }
  return Object.entries(byCatMonth).map(([category, monthMap]) => {
    const total = months.reduce((s, m) => s + (monthMap[m] || 0), 0);
    return { category, byMonth: monthMap, total, avg: months.length ? total / months.length : 0 };
  }).sort((a, b) => b.total - a.total);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- reportAggregates`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reportAggregates.ts src/lib/reportAggregates.test.ts
git commit -m "feat(reports): shared category/month/payer/matrix aggregation helpers"
```

---

### Task 4: `insights.ts` — port Trends.tsx heuristics (anomalies, leaks, YoY, seasonal, payment-method, payer breakdown, executive summary)

**Files:**
- Create: `src/lib/insights.ts`
- Test: `src/lib/insights.test.ts`

**Interfaces:**
- Consumes: `Transaction` from `@/types`.
- Produces: `interface Anomaly`, `findAnomalies(allExpenses, months, priorMonths): Anomaly[]`; `interface Leak`, `findLeaks(allExpenses): Leak[]`; `interface YoyRow`, `yearOverYear(allExpenses, currentYear): YoyRow[]`; `interface SeasonalPeak`, `seasonalPeaks(allExpenses, currentYear): SeasonalPeak[]`; `PAYMENT_METHODS_LIST: string[]`, `interface PaymentMethodByMonth`, `paymentMethodByMonth(expensesInWindow, months): PaymentMethodByMonth[]`; `interface PayerBreakdown`, `payerCategoryBreakdown(expensesInWindow): PayerBreakdown`; `interface ExecItem`, `executiveSummary(params): ExecItem[]` — all consumed by `InsightsTab.tsx` (Task 6).

This is a faithful port of the logic already live in `src/pages/Trends.tsx` (lines 222–397 as of this plan) — same formulas, extracted to pure functions that take explicit inputs instead of reading component state, so they generalize to the unified period model instead of Trends' rolling-window-only period.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/insights.test.ts
import { describe, it, expect } from 'vitest';
import { findAnomalies, findLeaks, yearOverYear, seasonalPeaks, paymentMethodByMonth, payerCategoryBreakdown, executiveSummary } from './insights';
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- insights`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/insights.ts
import { Transaction, Payer } from '@/types';

const SHORT_MONTHS = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

function fmt(n: number): string { return `₪${Math.round(n).toLocaleString('he')}`; }
function fmtK(n: number): string { return `₪${Math.round(n).toLocaleString('en-US')}`; }

// ── Anomalies ────────────────────────────────────────────────────────────────
export interface Anomaly { category: string; currentAmount: number; movingAvg: number; deviation: number; level: 'warn' | 'bad' }

/** Categories whose average-per-month over `months` deviates >=30% from the equal-length `priorMonths` window. */
export function findAnomalies(allExpenses: Transaction[], months: string[], priorMonths: string[]): Anomaly[] {
  if (months.length === 0) return [];
  const inMonths = allExpenses.filter((t) => months.includes(t.date.slice(0, 7)));
  const results: Anomaly[] = [];
  const categories = new Set(allExpenses.map((t) => t.category));
  for (const cat of categories) {
    const curMonthly = inMonths.filter((t) => t.category === cat).reduce((s, t) => s + t.amount, 0) / months.length;
    const priorMonthly = priorMonths.length > 0
      ? allExpenses.filter((t) => priorMonths.includes(t.date.slice(0, 7)) && t.category === cat).reduce((s, t) => s + t.amount, 0) / priorMonths.length
      : 0;
    if (priorMonthly < 200 || curMonthly < 100) continue;
    const dev = Math.round(((curMonthly - priorMonthly) / priorMonthly) * 100);
    if (dev >= 30) {
      results.push({
        category: cat,
        currentAmount: Math.round(curMonthly * months.length),
        movingAvg: Math.round(priorMonthly * months.length),
        deviation: dev,
        level: dev >= 60 ? 'bad' : 'warn',
      });
    }
  }
  return results.sort((a, b) => b.deviation - a.deviation);
}

// ── Leaks ────────────────────────────────────────────────────────────────────
export interface Leak {
  name: string; category: string; monthlyAvg: number; yearlyEstimate: number;
  months: number; occurrences: number; isSubscription: boolean;
}

/** Recurring-looking "משתנה" expenses (same description in >=3 distinct months) — period-independent by design. */
export function findLeaks(allExpenses: Transaction[]): Leak[] {
  const groups: Record<string, { amounts: number[]; months: Set<string>; category: string }> = {};
  for (const t of allExpenses.filter((t) => t.expense_class === 'משתנה')) {
    const key = (t.sub_category || t.notes || '').trim().toLowerCase();
    if (!key || key.length < 3) continue;
    if (!groups[key]) groups[key] = { amounts: [], months: new Set(), category: t.category };
    groups[key].amounts.push(t.amount);
    groups[key].months.add(t.date.slice(0, 7));
  }
  return Object.entries(groups)
    .filter(([, g]) => g.months.size >= 3)
    .map(([name, g]) => {
      const total = g.amounts.reduce((s, a) => s + a, 0);
      const monthlyAvg = Math.round(total / g.months.size);
      return {
        name, category: g.category, monthlyAvg, yearlyEstimate: monthlyAvg * 12,
        months: g.months.size, occurrences: g.amounts.length,
        isSubscription: g.amounts.length >= 3 && g.amounts.every((a) => Math.abs(a - g.amounts[0]) < 5),
      };
    })
    .sort((a, b) => b.yearlyEstimate - a.yearlyEstimate)
    .slice(0, 20);
}

// ── Year-over-year & seasonal ─────────────────────────────────────────────────
export type YoyRow = { month: string } & Record<number, number>;

export function yearOverYear(allExpenses: Transaction[], currentYear: number): YoyRow[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    const sum = (y: number) => allExpenses.filter((t) => t.date.startsWith(`${y}-${m}`)).reduce((s, t) => s + t.amount, 0);
    const row = { month: SHORT_MONTHS[i] } as YoyRow;
    row[currentYear - 2] = Math.round(sum(currentYear - 2));
    row[currentYear - 1] = Math.round(sum(currentYear - 1));
    row[currentYear] = Math.round(sum(currentYear));
    return row;
  }).reverse();
}

export interface SeasonalPeak { month: string; avg: number; ratio: number }

/** Calendar months whose historical average (across all available years, >=2 required) exceeds the overall monthly average. */
export function seasonalPeaks(allExpenses: Transaction[], currentYear: number): SeasonalPeak[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    const yt: number[] = [];
    for (let y = 2022; y <= currentYear; y++) {
      const total = allExpenses.filter((t) => t.date.startsWith(`${y}-${m}`)).reduce((s, t) => s + t.amount, 0);
      if (total > 0) yt.push(total);
    }
    if (yt.length < 2) return null;
    const avg = yt.reduce((s, v) => s + v, 0) / yt.length;
    const totalMonths = new Set(allExpenses.map((t) => t.date.slice(0, 7))).size;
    const overallAvg = allExpenses.reduce((s, t) => s + t.amount, 0) / Math.max(1, totalMonths);
    return { month: SHORT_MONTHS[i], avg: Math.round(avg), ratio: Math.round((avg / Math.max(1, overallAvg)) * 100) / 100 };
  }).filter((x): x is SeasonalPeak => x !== null).sort((a, b) => b.ratio - a.ratio);
}

// ── Payment method ─────────────────────────────────────────────────────────────
export const PAYMENT_METHODS_LIST = ['אשראי', 'מזומן', 'ביט', 'העברה', 'הוראת קבע', "צ'ק"];

export type PaymentMethodByMonth = { month: string } & Record<string, number | string>;

export function paymentMethodByMonth(expensesInWindow: Transaction[], months: string[]): PaymentMethodByMonth[] {
  return months.slice(-12).map((m) => {
    const row: PaymentMethodByMonth = { month: m };
    for (const method of PAYMENT_METHODS_LIST) {
      row[method] = expensesInWindow.filter((t) => t.date.startsWith(m) && t.payment_method === method).reduce((s, t) => s + t.amount, 0);
    }
    return row;
  }).reverse();
}

// ── Payer × category breakdown ("משלמים" tab) ──────────────────────────────────
export interface NamedAmount { name: string; value: number }
export type PayerCategoryRow = { category: string } & Record<string, number | string>;
export interface PayerBreakdown { byCat: PayerCategoryRow[]; pieData: NamedAmount[] }

const PAYER_HE: Record<string, string> = { Shi: 'שי', Ortal: 'אורטל', Joint: 'משותף' };

/** Matches both the current Payer enum and legacy Hebrew-string values from old Firestore rows. */
function matchPayer(t: Transaction, p: string): boolean {
  if (p === 'Shi')   return t.payer === 'Shi'   || (t.payer as string) === 'שי';
  if (p === 'Ortal') return t.payer === 'Ortal' || (t.payer as string) === 'אורטל';
  if (p === 'Joint') return t.payer === 'Joint' || (t.payer as string) === 'משותף';
  return false;
}

export function payerCategoryBreakdown(expensesInWindow: Transaction[]): PayerBreakdown {
  const payers: Payer[] = ['Shi', 'Ortal', 'Joint'];
  const byCat = Array.from(new Set(expensesInWindow.map((t) => t.category)))
    .map((cat) => {
      const row: PayerCategoryRow = { category: cat };
      for (const p of payers) row[PAYER_HE[p]] = expensesInWindow.filter((t) => t.category === cat && matchPayer(t, p)).reduce((s, t) => s + t.amount, 0);
      return row;
    })
    .sort((a, b) => {
      const totalA = payers.reduce((s, p) => s + (a[PAYER_HE[p]] as number), 0);
      const totalB = payers.reduce((s, p) => s + (b[PAYER_HE[p]] as number), 0);
      return totalB - totalA;
    })
    .slice(0, 10);
  const totals: Record<string, number> = { Shi: 0, Ortal: 0, Joint: 0 };
  for (const t of expensesInWindow) {
    for (const p of payers) if (matchPayer(t, p)) { totals[p] = (totals[p] || 0) + t.amount; break; }
  }
  const pieData = payers.map((p) => ({ name: PAYER_HE[p], value: Math.round(totals[p] || 0) })).filter((x) => x.value > 0);
  return { byCat, pieData };
}

// ── Executive summary ───────────────────────────────────────────────────────────
export interface ExecItem { icon: string; text: string; level: 'ok' | 'warn' | 'bad' | 'info'; saving?: number }

/** Ordered rule-based sentences — NOT an LLM call (see design spec §7: all client-side heuristics). */
export function executiveSummary(params: {
  expenses: Transaction[]; priorExpenses: Transaction[]; income: number;
  anomalies: Anomaly[]; leaks: Leak[];
}): ExecItem[] {
  const { expenses, priorExpenses, income, anomalies, leaks } = params;
  const items: ExecItem[] = [];
  if (!expenses.length) return items;
  const curTotal = expenses.reduce((s, t) => s + t.amount, 0);
  const priorTotal = priorExpenses.reduce((s, t) => s + t.amount, 0);
  if (priorTotal > 0) {
    const pct = Math.round(((curTotal - priorTotal) / priorTotal) * 100);
    items.push(pct > 10
      ? { icon: '📈', level: 'bad', text: `הוצאות בתקופה גבוהות ב-${pct}% לעומת התקופה הקודמת (${fmt(curTotal)} לעומת ${fmt(priorTotal)})` }
      : pct < -10
      ? { icon: '📉', level: 'ok', text: `הוצאות בתקופה נמוכות ב-${Math.abs(pct)}% לעומת התקופה הקודמת (${fmt(curTotal)})` }
      : { icon: '⚖️', level: 'info', text: `הוצאות יציבות: ${fmt(curTotal)} (שינוי של ${pct > 0 ? '+' : ''}${pct}%)` });
  }
  if (anomalies.length > 0) {
    const top = anomalies[0];
    items.push({ icon: '⚠️', level: top.level, text: `חריגה בקטגוריית ${top.category}: ${fmt(top.currentAmount)} לעומת ${fmt(top.movingAvg)} בתקופה הקודמת (+${top.deviation}%)` });
  }
  const topCat = Object.entries(
    expenses.reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + t.amount; return acc; }, {} as Record<string, number>),
  ).sort((a, b) => b[1] - a[1])[0];
  if (topCat) items.push({ icon: '🎯', level: 'info', text: `קטגוריה מובילת: ${topCat[0]} — ${fmt(topCat[1])}` });
  if (leaks.length > 0) {
    const totalLeak = leaks.reduce((s, l) => s + l.yearlyEstimate, 0);
    items.push({ icon: '💸', level: 'warn', text: `זוהו ${leaks.length} הוצאות קבועות בסך ${fmtK(totalLeak)} ש"ח/שנה` });
  }
  if (income > 0 && curTotal > 0) {
    const ratio = Math.round((curTotal / income) * 100);
    items.push(ratio > 90
      ? { icon: '🚨', level: 'bad', text: `הוצאות מהוות ${ratio}% מההכנסה — סכנת גירעון!` }
      : ratio > 70
      ? { icon: '⚠️', level: 'warn', text: `הוצאות מהוות ${ratio}% מההכנסה` }
      : { icon: '✅', level: 'ok', text: `יחס הוצאות/הכנסה תקין: ${ratio}%` });
    const saved = income - curTotal;
    const savePct = Math.round((saved / income) * 100);
    if (savePct > 20) items.push({ icon: '🏦', level: 'ok', text: `חיסכון בתקופה: ${fmt(saved)} (${savePct}% מההכנסה)` });
    else if (savePct < 0) items.push({ icon: '🔴', level: 'bad', text: `גירעון בתקופה: ${fmt(Math.abs(saved))} — ההוצאות עולות על ההכנסה` });
  }
  const fixedAmt = expenses.filter((t) => t.expense_class === 'קבועה').reduce((s, t) => s + t.amount, 0);
  if (curTotal > 0 && fixedAmt > 0) {
    const fixedPct = Math.round((fixedAmt / curTotal) * 100);
    items.push({ icon: '📋', level: 'info', text: `${fixedPct}% מהוצאות הן קבועות (${fmt(fixedAmt)})` });
  }
  return items.slice(0, 5);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- insights`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights.ts src/lib/insights.test.ts
git commit -m "feat(reports): port Trends heuristics to pure, period-agnostic functions"
```

---

### Task 5: `insights.ts` — add the 2 new analyses (`cashflowForecast`, `miscDrift`)

**Files:**
- Modify: `src/lib/insights.ts`
- Modify: `src/lib/insights.test.ts`

**Interfaces:**
- Consumes: `Transaction` from `@/types` (already imported).
- Produces: `interface ForecastMonth`, `cashflowForecast(futureExpenses, recentVariableExpenses, monthsAhead, lookbackMonths): ForecastMonth[]`; `interface MiscDriftMonth`, `miscDrift(expenses, months): MiscDriftMonth[]` — consumed by `InsightsTab.tsx` (Task 6).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/insights.test.ts`:
```typescript
import { cashflowForecast, miscDrift } from './insights';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- insights`
Expected: FAIL — `cashflowForecast`/`miscDrift` not exported.

- [ ] **Step 3: Append the implementation to `src/lib/insights.ts`**

```typescript
// ── Cashflow forecast ────────────────────────────────────────────────────────
export interface ForecastMonth { month: string; knownFixed: number; estimatedVariable: number; total: number }

/**
 * `futureExpenses` = transactions already flagged status:'future' by useTransactions()
 * (i.e. RecurringRule instances projected into upcoming months). `recentVariableExpenses`
 * = actual "משתנה" expenses from the last `lookbackMonths` — their average estimates
 * the variable spend not covered by any declared recurring rule.
 */
export function cashflowForecast(
  futureExpenses: Transaction[],
  recentVariableExpenses: Transaction[],
  monthsAhead: string[],
  lookbackMonths: number,
): ForecastMonth[] {
  const avgVariable = recentVariableExpenses.length > 0 && lookbackMonths > 0
    ? recentVariableExpenses.reduce((s, t) => s + t.amount, 0) / lookbackMonths
    : 0;
  return monthsAhead.map((m) => {
    const knownFixed = futureExpenses.filter((t) => t.date.startsWith(m)).reduce((s, t) => s + t.amount, 0);
    const estimatedVariable = Math.round(avgVariable);
    return { month: m, knownFixed, estimatedVariable, total: knownFixed + estimatedVariable };
  });
}

// ── "שונות" drift indicator ──────────────────────────────────────────────────
export interface MiscDriftMonth { month: string; miscTotal: number; totalExpense: number; sharePct: number; flagged: boolean }

const MISC_DRIFT_THRESHOLD_PCT = 15;

export function miscDrift(expenses: Transaction[], months: string[]): MiscDriftMonth[] {
  return months.map((m) => {
    const inMonth = expenses.filter((t) => t.date.startsWith(m));
    const totalExpense = inMonth.reduce((s, t) => s + t.amount, 0);
    const miscTotal = inMonth.filter((t) => t.category === 'שונות').reduce((s, t) => s + t.amount, 0);
    const sharePct = totalExpense > 0 ? Math.round((miscTotal / totalExpense) * 100) : 0;
    return { month: m, miscTotal, totalExpense, sharePct, flagged: sharePct > MISC_DRIFT_THRESHOLD_PCT };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- insights`
Expected: all tests PASS (both the Task 4 and Task 5 tests in this file).

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights.ts src/lib/insights.test.ts
git commit -m "feat(reports): add cashflow-forecast and misc-drift analyses"
```

---

### Task 6: `PeriodSelector.tsx` — the period-picker UI component

**Files:**
- Create: `src/pages/reports/PeriodSelector.tsx`

**Interfaces:**
- Consumes: `ReportPeriod`, `PeriodQuickPick`, `buildPeriod` from `@/lib/reportPeriod` (Task 2).
- Produces: `<PeriodSelector period={ReportPeriod} onChange={(p: ReportPeriod) => void} />` — used by `Reports.tsx` (Task 12) and passed down to every tab.

- [ ] **Step 1: Write the component**

```tsx
// src/pages/reports/PeriodSelector.tsx
import { PeriodQuickPick, ReportPeriod, buildPeriod } from '@/lib/reportPeriod';

const QUICK_PICKS: { key: PeriodQuickPick; label: string }[] = [
  { key: 'currentMonth', label: 'החודש הנוכחי' },
  { key: 'selectedYear', label: 'שנה נבחרת' },
  { key: 'lastQuarter', label: 'רבעון אחרון' },
  { key: 'last12', label: '12 חודשים אחרונים' },
  { key: 'last18', label: '18 חודשים אחרונים' },
  { key: 'allTime', label: 'כל הזמן' },
  { key: 'custom', label: 'טווח מותאם' },
];

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: currentYear - 2021 }, (_, i) => String(2022 + i)).reverse();

export function PeriodSelector({ period, onChange }: { period: ReportPeriod; onChange: (p: ReportPeriod) => void }) {
  const pick = (key: PeriodQuickPick) => onChange(buildPeriod(key, { year: period.year, customStart: period.startMonth, customEnd: period.endMonth }));

  return (
    <div className="space-y-2" dir="rtl">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {QUICK_PICKS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => pick(key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              period.quickPick === key ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-white/5 border border-white/10 text-white/50 hover:text-white/70'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {period.quickPick === 'selectedYear' && (
        <select
          value={period.year}
          onChange={(e) => onChange(buildPeriod('selectedYear', { year: e.target.value }))}
          className="w-full h-9 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none"
        >
          {YEAR_OPTIONS.map((y) => <option key={y} value={y} className="bg-slate-800">{y}</option>)}
        </select>
      )}

      {period.quickPick === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-0.5 block text-[10px] text-white/40">מחודש</label>
            <input
              type="month"
              value={period.startMonth}
              onChange={(e) => onChange(buildPeriod('custom', { customStart: e.target.value, customEnd: period.endMonth }))}
              className="w-full h-9 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-white/40">עד חודש</label>
            <input
              type="month"
              value={period.endMonth}
              min={period.startMonth || undefined}
              onChange={(e) => onChange(buildPeriod('custom', { customStart: period.startMonth, customEnd: e.target.value }))}
              className="w-full h-9 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (this file isn't imported anywhere yet, but must be self-consistent).

- [ ] **Step 3: Commit**

```bash
git add src/pages/reports/PeriodSelector.tsx
git commit -m "feat(reports): period-selector UI component"
```

---

### Task 7: `ExpensesTab.tsx`

**Files:**
- Create: `src/pages/reports/ExpensesTab.tsx`

**Interfaces:**
- Consumes: `Transaction`, `ChildTag`, `CHILD_TAGS` from `@/types`; `formatCurrency`, `categoryColor`, `PAYER_LABELS`, `CHILD_LABELS` from `@/utils`; `ReportPeriod`, `periodMonths` from `@/lib/reportPeriod`; `byCategory`, `byPayer`, `byMonth`, `fixedVariableSplit`, `categoryMonthMatrix` from `@/lib/reportAggregates`.
- Produces: `<ExpensesTab transactions={Transaction[]} period={ReportPeriod} category={string} />` — mounted by `Reports.tsx` (Task 12) when the top-level type is "הוצאות".

Visual style (cards, pill sub-tabs, pie/bar/table layout, per-child card) matches the existing `src/pages/Reports.tsx` (current lines 30–56, 362–828, as read this session — the "category" and "split" `TabsContent` blocks and the bottom per-child card) and `src/pages/AnnualAnalysis.tsx`'s `FixedVariableTab` (lines 31–275) for the category×month matrix table specifically. Copy the exact Tailwind classes and `recharts` config from those blocks — only the data-wiring below is new.

- [ ] **Step 1: Write the component**

```tsx
// src/pages/reports/ExpensesTab.tsx
import { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Transaction, CHILD_TAGS } from '@/types';
import { formatCurrency, categoryColor, PAYER_LABELS, CHILD_LABELS } from '@/utils';
import { ReportPeriod, periodMonths } from '@/lib/reportPeriod';
import { byCategory, byPayer, byMonth, fixedVariableSplit, categoryMonthMatrix } from '@/lib/reportAggregates';

const COLORS = ['#22d3ee', '#a855f7', '#ec4899', '#f97316', '#eab308', '#84cc16', '#10b981', '#f43f5e', '#06b6d4', '#8b5cf6'];
const CHILD_COLORS: Record<string, string> = { Yuval: '#a855f7', Aviv: '#10b981', Ziv: '#f59e0b', Shared: '#6366f1', none: '#64748b' };

type SubTab = 'category' | 'month' | 'payer' | 'split';

export function ExpensesTab({ transactions, period, category }: { transactions: Transaction[]; period: ReportPeriod; category: string }) {
  const [subTab, setSubTab] = useState<SubTab>('category');
  const months = useMemo(() => periodMonths(period), [period]);
  const isMultiMonth = months.length > 1 || period.isAllTime;

  const filtered = useMemo(
    () => transactions.filter((t) => t.type === 'expense' && (!category || t.category === category)),
    [transactions, category],
  );

  const total = filtered.reduce((s, t) => s + t.amount, 0);
  const catData = useMemo(() => byCategory(filtered), [filtered]);
  const payerData = useMemo(() => byPayer(filtered), [filtered]);
  const monthData = useMemo(() => byMonth(filtered, months), [filtered, months]);
  const split = useMemo(() => fixedVariableSplit(filtered), [filtered]);
  const matrix = useMemo(() => (isMultiMonth ? categoryMonthMatrix(filtered, months) : []), [filtered, months, isMultiMonth]);

  // Per-child breakdown — always shown when the active category filter is "ילדים" or unset
  const showChild = !category || category === 'ילדים';
  const kidsExpenses = useMemo(() => filtered.filter((t) => t.category === 'ילדים'), [filtered]);
  const childTotals = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const t of kidsExpenses) { const k = t.child || 'none'; acc[k] = (acc[k] || 0) + t.amount; }
    const order: string[] = [...CHILD_TAGS, 'none'];
    return order.filter((k) => acc[k]).map((k) => ({ key: k, label: k === 'none' ? 'ללא שיוך' : (CHILD_LABELS[k] ?? k), value: acc[k] }));
  }, [kidsExpenses]);
  const childTotal = childTotals.reduce((s, d) => s + d.value, 0);
  const childByMonth = useMemo(() => {
    if (!isMultiMonth) return [];
    return months.map((m) => {
      const row: Record<string, number | string> = { month: m };
      for (const child of [...CHILD_TAGS, 'none']) {
        row[child] = kidsExpenses.filter((t) => t.date.startsWith(m) && (t.child || 'none') === child).reduce((s, t) => s + t.amount, 0);
      }
      return row;
    });
  }, [kidsExpenses, months, isMultiMonth]);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="text-center">
        <p className="text-xs text-white/50">סה"כ הוצאות</p>
        <p className="text-3xl font-black text-rose-400">{formatCurrency(total)}</p>
        <p className="text-xs text-white/40">{filtered.length} עסקאות</p>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {([['category', 'לפי קטגוריה'], ['month', 'לפי חודש'], ['payer', 'לפי משלם'], ['split', 'קבועה / משתנה']] as [SubTab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setSubTab(key)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${subTab === key ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-white/5 border border-white/10 text-white/50'}`}>
            {label}
          </button>
        ))}
      </div>

      {subTab === 'category' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={catData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" nameKey="name" paddingAngle={2}>
                    {catData.map((entry) => <Cell key={entry.name} fill={categoryColor(entry.name)} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 space-y-2">
              {catData.map(({ name, value }) => (
                <div key={name} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: categoryColor(name) }} />
                  <span className="text-sm text-white flex-1">{name}</span>
                  <span className="text-sm font-bold text-white">{formatCurrency(value)}</span>
                  <span className="text-xs text-white/40 w-10 text-left">{total ? Math.round(value / total * 100) : 0}%</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {isMultiMonth && matrix.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">קטגוריה × חודש</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto -mx-4 px-1">
                  <table dir="rtl" className="text-[11px] min-w-[780px] w-full border-collapse">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-right py-2 pr-2 pl-1 text-white/50 font-medium sticky right-0 bg-slate-900 min-w-[70px]">קטגוריה</th>
                        {months.map((m) => <th key={m} className="text-center py-2 px-0.5 text-white/40 font-medium w-12">{m.slice(5)}</th>)}
                        <th className="text-center py-2 px-1 text-cyan-400/80 font-bold w-16">סה"כ</th>
                        <th className="text-center py-2 px-1 text-white/40 font-medium w-16">ממוצע</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.map((row) => (
                        <tr key={row.category} className="border-b border-white/5">
                          <td className="py-2 pr-2 pl-1 font-medium sticky right-0 bg-slate-900" style={{ color: categoryColor(row.category) }}>{row.category}</td>
                          {months.map((m) => (
                            <td key={m} className={`text-center py-2 px-0.5 ${row.byMonth[m] ? 'text-white' : 'text-white/15'}`}>
                              {row.byMonth[m] ? Math.round(row.byMonth[m]).toLocaleString('he') : '—'}
                            </td>
                          ))}
                          <td className="text-center py-2 px-1 text-white font-bold">{formatCurrency(row.total)}</td>
                          <td className="text-center py-2 px-1 text-white/50">{formatCurrency(row.avg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {subTab === 'month' && (
        <Card>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={[...monthData].reverse()} barSize={24}>
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {monthData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {subTab === 'payer' && (
        <Card>
          <CardContent className="pt-4">
            {isMultiMonth ? (
              <div className="space-y-1">
                {months.map((m) => {
                  const inMonth = filtered.filter((t) => t.date.startsWith(m));
                  const monthTotal = inMonth.reduce((s, t) => s + t.amount, 0);
                  if (monthTotal === 0) return null;
                  return (
                    <div key={m} className="flex justify-between py-1.5 border-b border-white/5 text-xs">
                      <span className="text-white/70">{m}</span>
                      <span className="text-white font-bold">{formatCurrency(monthTotal)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              payerData.map(({ name, value }) => (
                <div key={name} className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-sm text-white">{name}</span>
                  <span className="text-sm font-bold text-white">{formatCurrency(value)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {subTab === 'split' && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-cyan-500/10 border border-cyan-500/25 p-3 text-center">
                <p className="text-[10px] text-cyan-400 mb-1">קבועה</p>
                <p className="text-lg font-black text-white">{formatCurrency(split.fixedTotal)}</p>
              </div>
              <div className="rounded-2xl bg-purple-500/10 border border-purple-500/25 p-3 text-center">
                <p className="text-[10px] text-purple-400 mb-1">משתנה</p>
                <p className="text-lg font-black text-white">{formatCurrency(split.varTotal)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {showChild && childTotals.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">👨‍👩‍👧‍👦 הוצאות ילדים לפי ילד/ה</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-2">
            {childTotals.map(({ key, label, value }) => {
              const color = CHILD_COLORS[key] ?? '#64748b';
              const pct = childTotal ? Math.round(value / childTotal * 100) : 0;
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-sm text-white flex-1">{label}</span>
                    <span className="text-sm font-bold text-white">{formatCurrency(value)}</span>
                    <span className="text-xs text-white/40 w-10 text-left">{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} /></div>
                </div>
              );
            })}
            {isMultiMonth && childByMonth.length > 0 && (
              <div className="pt-3">
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={childByMonth} barSize={10}>
                    <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip formatter={(v: number) => formatCurrency(v as number)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
                    {[...CHILD_TAGS, 'none'].map((child) => (
                      <Bar key={child} dataKey={child} stackId="a" fill={CHILD_COLORS[child] ?? '#64748b'} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/pages/reports/ExpensesTab.tsx
git commit -m "feat(reports): הוצאות tab — category/month/payer/split + per-child card"
```

---

### Task 8: `IncomeTab.tsx`

**Files:**
- Create: `src/pages/reports/IncomeTab.tsx`

**Interfaces:**
- Consumes: same as Task 7 minus the child-related pieces (per spec §3, income has no per-child card).
- Produces: `<IncomeTab transactions={Transaction[]} period={ReportPeriod} category={string} />` — mounted by `Reports.tsx` when type is "הכנסות".

- [ ] **Step 1: Write the component**

```tsx
// src/pages/reports/IncomeTab.tsx
import { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Transaction } from '@/types';
import { formatCurrency, categoryColor } from '@/utils';
import { ReportPeriod, periodMonths } from '@/lib/reportPeriod';
import { byCategory, byMonth, categoryMonthMatrix } from '@/lib/reportAggregates';

const COLORS = ['#22d3ee', '#a855f7', '#ec4899', '#f97316', '#eab308', '#84cc16', '#10b981', '#f43f5e', '#06b6d4', '#8b5cf6'];
const PAYER_HE: Record<string, string> = { Shi: 'שי', Ortal: 'אורטל', Joint: 'משותף' };

type SubTab = 'category' | 'month' | 'payer';

export function IncomeTab({ transactions, period, category }: { transactions: Transaction[]; period: ReportPeriod; category: string }) {
  const [subTab, setSubTab] = useState<SubTab>('category');
  const months = useMemo(() => periodMonths(period), [period]);
  const isMultiMonth = months.length > 1 || period.isAllTime;

  const filtered = useMemo(
    () => transactions.filter((t) => t.type === 'income' && (!category || t.category === category)),
    [transactions, category],
  );

  const total = filtered.reduce((s, t) => s + t.amount, 0);
  const catData = useMemo(() => byCategory(filtered), [filtered]);
  const monthData = useMemo(() => byMonth(filtered, months), [filtered, months]);
  const matrix = useMemo(() => (isMultiMonth ? categoryMonthMatrix(filtered, months) : []), [filtered, months, isMultiMonth]);

  // "לפי משלם" — monthly-granular whenever the range spans >1 month (spec §3, applies to both types)
  const payerByMonth = useMemo(() => {
    if (!isMultiMonth) return [];
    return months.map((m) => {
      const row: Record<string, number | string> = { month: m };
      for (const p of ['Shi', 'Ortal', 'Joint']) {
        row[PAYER_HE[p]] = filtered.filter((t) => t.date.startsWith(m) && t.payer === p).reduce((s, t) => s + t.amount, 0);
      }
      return row;
    });
  }, [filtered, months, isMultiMonth]);
  const payerTotals = useMemo(() => {
    const acc: Record<string, number> = { Shi: 0, Ortal: 0, Joint: 0 };
    for (const t of filtered) acc[t.payer] = (acc[t.payer] || 0) + t.amount;
    return ['Shi', 'Ortal', 'Joint'].map((p) => ({ name: PAYER_HE[p], value: acc[p] }));
  }, [filtered]);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="text-center">
        <p className="text-xs text-white/50">סה"כ הכנסות</p>
        <p className="text-3xl font-black text-emerald-400">{formatCurrency(total)}</p>
        <p className="text-xs text-white/40">{filtered.length} עסקאות</p>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {([['category', 'לפי קטגוריה'], ['month', 'לפי חודש'], ['payer', 'לפי משלם']] as [SubTab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setSubTab(key)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${subTab === key ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-white/5 border border-white/10 text-white/50'}`}>
            {label}
          </button>
        ))}
      </div>

      {subTab === 'category' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={catData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" nameKey="name" paddingAngle={2}>
                    {catData.map((entry) => <Cell key={entry.name} fill={categoryColor(entry.name)} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          {isMultiMonth && matrix.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">קטגוריה × חודש</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto -mx-4 px-1">
                  <table dir="rtl" className="text-[11px] min-w-[780px] w-full border-collapse">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-right py-2 pr-2 pl-1 text-white/50 font-medium sticky right-0 bg-slate-900 min-w-[70px]">קטגוריה</th>
                        {months.map((m) => <th key={m} className="text-center py-2 px-0.5 text-white/40 font-medium w-12">{m.slice(5)}</th>)}
                        <th className="text-center py-2 px-1 text-emerald-400/80 font-bold w-16">סה"כ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.map((row) => (
                        <tr key={row.category} className="border-b border-white/5">
                          <td className="py-2 pr-2 pl-1 font-medium sticky right-0 bg-slate-900" style={{ color: categoryColor(row.category) }}>{row.category}</td>
                          {months.map((m) => <td key={m} className="text-center py-2 px-0.5 text-white">{row.byMonth[m] ? Math.round(row.byMonth[m]).toLocaleString('he') : '—'}</td>)}
                          <td className="text-center py-2 px-1 text-white font-bold">{formatCurrency(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {subTab === 'month' && (
        <Card>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={[...monthData].reverse()} barSize={24}>
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {monthData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {subTab === 'payer' && (
        <Card>
          <CardContent className="pt-4">
            {isMultiMonth ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={payerByMonth} barSize={20}>
                  <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={(v: number) => formatCurrency(v as number)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
                  <Bar dataKey="שי" stackId="a" fill="#22d3ee" />
                  <Bar dataKey="אורטל" stackId="a" fill="#ec4899" />
                  <Bar dataKey="משותף" stackId="a" fill="#a855f7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              payerTotals.map(({ name, value }) => (
                <div key={name} className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-sm text-white">{name}</span>
                  <span className="text-sm font-bold text-white">{formatCurrency(value)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/pages/reports/IncomeTab.tsx
git commit -m "feat(reports): הכנסות tab — category/month/payer with monthly-granular payer breakdown"
```

---

### Task 9: `BalanceTab.tsx`

**Files:**
- Create: `src/pages/reports/BalanceTab.tsx`

**Interfaces:**
- Consumes: `Transaction` from `@/types`; `formatCurrency` from `@/utils`; `ReportPeriod`, `periodMonths` from `@/lib/reportPeriod`.
- Produces: `<BalanceTab transactions={Transaction[]} period={ReportPeriod} category={string} />` — mounted by `Reports.tsx` when type is "מאזן".

Ports the existing balance-mode JSX from `src/pages/Reports.tsx` (current lines 442–572, the `txType === 'balance'` block) and adds the new שיעור-התחייבות-קבועה KPI card from design spec §3/§4.

- [ ] **Step 1: Write the component**

```tsx
// src/pages/reports/BalanceTab.tsx
import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Transaction } from '@/types';
import { formatCurrency } from '@/utils';
import { ReportPeriod, periodMonths, currentMonthKey } from '@/lib/reportPeriod';
import { fixedVariableSplit } from '@/lib/reportAggregates';

const INVESTMENT_CATS = ['חסכון', 'חיסכון', 'השקעות', 'השקעה', 'קרן השתלמות', 'פנסיה', 'קופת גמל', 'גמל'];
const isInvCat = (cat: string) => INVESTMENT_CATS.some((k) => cat.includes(k));

export function BalanceTab({ transactions, period, category }: { transactions: Transaction[]; period: ReportPeriod; category: string }) {
  const months = useMemo(() => periodMonths(period), [period]);
  const isMultiMonth = months.length > 1 || period.isAllTime;

  const filtered = useMemo(() => transactions.filter((t) => !category || t.category === category), [transactions, category]);
  const incomeTxs = useMemo(() => filtered.filter((t) => t.type === 'income'), [filtered]);
  const expenseTxs = useMemo(() => filtered.filter((t) => t.type === 'expense'), [filtered]);

  const incomeTotal = incomeTxs.reduce((s, t) => s + t.amount, 0);
  const expenseTotal = expenseTxs.reduce((s, t) => s + t.amount, 0);
  const investmentTotal = expenseTxs.filter((t) => isInvCat(t.category)).reduce((s, t) => s + t.amount, 0);
  const { fixedTotal } = fixedVariableSplit(expenseTxs);
  const commitRatio = incomeTotal > 0 ? Math.round((fixedTotal / incomeTotal) * 100) : null;
  const expRatio = incomeTotal > 0 ? Math.round((expenseTotal / incomeTotal) * 100) : null;
  const invRatio = incomeTotal > 0 ? Math.round((investmentTotal / incomeTotal) * 100) : null;

  const byMonthChart = useMemo(() => months.map((m) => ({
    name: m,
    isCurrent: m === currentMonthKey(),
    'הכנסות': incomeTxs.filter((t) => t.date.startsWith(m)).reduce((s, t) => s + t.amount, 0),
    'הוצאות': expenseTxs.filter((t) => t.date.startsWith(m)).reduce((s, t) => s + t.amount, 0),
  })), [months, incomeTxs, expenseTxs]);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/25 p-4 text-center">
          <p className="text-xs text-emerald-400 mb-1">💰 הכנסות</p>
          <p className="text-2xl font-black text-white">{formatCurrency(incomeTotal)}</p>
        </div>
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/25 p-4 text-center">
          <p className="text-xs text-rose-400 mb-1">💸 הוצאות</p>
          <p className="text-2xl font-black text-white">{formatCurrency(expenseTotal)}</p>
        </div>
        <div className={`rounded-2xl p-4 text-center border ${incomeTotal - expenseTotal >= 0 ? 'bg-cyan-500/10 border-cyan-500/25' : 'bg-orange-500/10 border-orange-500/25'}`}>
          <p className="text-xs text-white/50 mb-1">📊 מאזן</p>
          <p className={`text-2xl font-black ${incomeTotal - expenseTotal >= 0 ? 'text-cyan-400' : 'text-orange-400'}`}>{formatCurrency(incomeTotal - expenseTotal)}</p>
        </div>
        <div className="rounded-2xl bg-violet-500/10 border border-violet-500/25 p-4 text-center">
          <p className="text-xs text-violet-400 mb-1">🏦 שיעור חיסכון</p>
          <p className="text-2xl font-black text-white">{incomeTotal > 0 ? Math.round((incomeTotal - expenseTotal) / incomeTotal * 100) : 0}%</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-center">
          <p className="text-[10px] text-white/50 mb-1">📊 יחס הוצאה/הכנסה</p>
          <p className={`text-lg font-black ${expRatio == null ? 'text-white/40' : expRatio > 90 ? 'text-red-400' : expRatio > 70 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {expRatio != null ? `${expRatio}%` : '—'}
          </p>
        </div>
        <div className="rounded-2xl bg-purple-500/10 border border-purple-500/25 p-3 text-center">
          <p className="text-[10px] text-purple-400 mb-1">📈 לאפיקי השקעה</p>
          <p className="text-lg font-black text-purple-300">{invRatio != null ? `${invRatio}%` : '—'}</p>
        </div>
        <div className="rounded-2xl bg-cyan-500/10 border border-cyan-500/25 p-3 text-center">
          <p className="text-[10px] text-cyan-400 mb-1">🔒 התחייבות קבועה</p>
          <p className="text-lg font-black text-cyan-300">{commitRatio != null ? `${commitRatio}%` : '—'}</p>
        </div>
      </div>

      {isMultiMonth && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-sm">הכנסות מול הוצאות לפי חודש</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={[...byMonthChart].reverse()} barSize={14} barGap={2}>
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
                  <Legend formatter={(v) => <span style={{ color: '#cbd5e1', fontSize: 12 }}>{v}</span>} />
                  <Bar dataKey="הכנסות" fill="#10b981" radius={[6, 6, 0, 0]}>
                    {[...byMonthChart].reverse().map((m, i) => <Cell key={i} fill="#10b981" fillOpacity={m.isCurrent ? 1 : 0.5} stroke={m.isCurrent ? '#fff' : 'none'} strokeWidth={1.5} />)}
                  </Bar>
                  <Bar dataKey="הוצאות" fill="#f43f5e" radius={[6, 6, 0, 0]}>
                    {[...byMonthChart].reverse().map((m, i) => <Cell key={i} fill="#f43f5e" fillOpacity={m.isCurrent ? 1 : 0.5} stroke={m.isCurrent ? '#fff' : 'none'} strokeWidth={1.5} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 space-y-1">
              {byMonthChart.filter((m) => m['הכנסות'] > 0 || m['הוצאות'] > 0).map((m) => {
                const bal = m['הכנסות'] - m['הוצאות'];
                return (
                  <div key={m.name} className={`grid grid-cols-4 gap-1 items-center py-1.5 border-b text-xs ${m.isCurrent ? 'bg-cyan-500/10 rounded-lg px-2 -mx-2 border-cyan-500/30 font-semibold' : 'border-white/5'}`}>
                    <span className={m.isCurrent ? 'text-cyan-300' : 'text-white/70'}>{m.name}{m.isCurrent ? ' ◀' : ''}</span>
                    <span className="text-emerald-400 text-right tabular-nums">{formatCurrency(m['הכנסות'])}</span>
                    <span className="text-rose-400 text-right tabular-nums">{formatCurrency(m['הוצאות'])}</span>
                    <span className={`font-bold text-right tabular-nums ${bal >= 0 ? 'text-cyan-400' : 'text-orange-400'}`}>{formatCurrency(bal)}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/pages/reports/BalanceTab.tsx
git commit -m "feat(reports): מאזן tab with new שיעור-התחייבות-קבועה KPI"
```

---

### Task 10: `InsightsTab.tsx`

**Files:**
- Create: `src/pages/reports/InsightsTab.tsx`

**Interfaces:**
- Consumes: everything from `src/lib/insights.ts` (Tasks 4–5); `ReportPeriod`, `periodMonths`, `priorPeriod`, `inPeriod` from `@/lib/reportPeriod`; `formatCurrency` from `@/utils`.
- Produces: `<InsightsTab transactions={Transaction[]} period={ReportPeriod} category={string} />` — mounted by `Reports.tsx` when type is "תובנות". This is the largest tab: 7 sub-tabs.

- [ ] **Step 1: Write the component**

```tsx
// src/pages/reports/InsightsTab.tsx
import { useState, useMemo } from 'react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Transaction } from '@/types';
import { formatCurrency } from '@/utils';
import { ReportPeriod, periodMonths, priorPeriod, inPeriod, periodLabel } from '@/lib/reportPeriod';
import {
  findAnomalies, findLeaks, yearOverYear, seasonalPeaks, paymentMethodByMonth, PAYMENT_METHODS_LIST,
  payerCategoryBreakdown, executiveSummary, cashflowForecast, miscDrift,
} from '@/lib/insights';

const COLORS = ['#22d3ee', '#a855f7', '#ec4899', '#f97316', '#eab308', '#10b981'];
const PAYER_COLORS = ['#22d3ee', '#ec4899', '#a855f7'];
const METHOD_COLORS = ['#22d3ee', '#f97316', '#a855f7', '#10b981', '#eab308', '#94a3b8'];
const TT = { background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 };

type SubTab = 'trends' | 'compare' | 'anomalies' | 'payers' | 'leaks' | 'forecast' | 'misc';

const LEVEL_STYLE: Record<string, string> = {
  ok: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300',
  warn: 'border-amber-500/30 bg-amber-500/5 text-amber-300',
  bad: 'border-rose-500/30 bg-rose-500/5 text-rose-300',
  info: 'border-white/10 bg-white/5 text-white/70',
};

export function InsightsTab({ transactions, period, category }: { transactions: Transaction[]; period: ReportPeriod; category: string }) {
  const [subTab, setSubTab] = useState<SubTab>('trends');
  const now = new Date();
  const currentYear = now.getFullYear();

  const allExpenses = useMemo(() => transactions.filter((t) => t.type === 'expense' && (!category || t.category === category)), [transactions, category]);
  const months = useMemo(() => periodMonths(period), [period]);
  const prior = useMemo(() => priorPeriod(period), [period]);
  const priorMonths = useMemo(() => periodMonths(prior), [prior]);

  const expensesInWindow = useMemo(() => allExpenses.filter((t) => inPeriod(t.date, period)), [allExpenses, period]);
  const incomeInWindow = useMemo(
    () => transactions.filter((t) => t.type === 'income' && (!category || t.category === category) && inPeriod(t.date, period)).reduce((s, t) => s + t.amount, 0),
    [transactions, category, period],
  );
  const priorExpenses = useMemo(() => allExpenses.filter((t) => inPeriod(t.date, prior)), [allExpenses, prior]);

  const anomalies = useMemo(() => findAnomalies(allExpenses, months, priorMonths), [allExpenses, months, priorMonths]);
  const leaks = useMemo(() => findLeaks(allExpenses), [allExpenses]); // period-independent by design
  const execItems = useMemo(
    () => executiveSummary({ expenses: expensesInWindow, priorExpenses, income: incomeInWindow, anomalies, leaks }),
    [expensesInWindow, priorExpenses, incomeInWindow, anomalies, leaks],
  );

  const yoy = useMemo(() => yearOverYear(allExpenses, currentYear), [allExpenses, currentYear]);
  const seasonal = useMemo(() => seasonalPeaks(allExpenses, currentYear), [allExpenses, currentYear]);
  const paymentMethods = useMemo(() => paymentMethodByMonth(expensesInWindow, months), [expensesInWindow, months]);

  const payer = useMemo(() => payerCategoryBreakdown(expensesInWindow), [expensesInWindow]);

  // תזרים חזוי — next 3 months from today, using already-future-projected transactions + a 3-month variable lookback.
  const forecastMonths = useMemo(() => {
    const nowM = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return Array.from({ length: 3 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }).filter((m) => m > nowM);
  }, [now, currentYear]);
  const futureExpenses = useMemo(() => transactions.filter((t) => t.type === 'expense' && t.status === 'future'), [transactions]);
  const recentVariable = useMemo(() => {
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;
    return transactions.filter((t) => t.type === 'expense' && t.expense_class === 'משתנה' && t.date.slice(0, 7) >= cutoffKey);
  }, [transactions, now]);
  const forecast = useMemo(() => cashflowForecast(futureExpenses, recentVariable, forecastMonths, 3), [futureExpenses, recentVariable, forecastMonths]);

  const misc = useMemo(() => miscDrift(expensesInWindow, months), [expensesInWindow, months]);

  const TABS: [SubTab, string][] = [
    ['trends', 'מגמות'], ['compare', 'השוואה'], ['anomalies', 'חריגות'], ['payers', 'משלמים'], ['leaks', 'דליפות'], ['forecast', 'תזרים חזוי'], ['misc', 'שונות'],
  ];

  return (
    <div className="space-y-4" dir="rtl">
      <Card className="border-cyan-500/20 bg-gradient-to-br from-cyan-950/40 to-slate-900/60">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-bold text-white">סיכום — {periodLabel(period)}</span>
          </div>
          {execItems.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-3">אין מספיק נתונים</p>
          ) : (
            <div className="space-y-2">
              {execItems.map((item, i) => (
                <div key={i} className={`flex gap-2.5 items-start text-sm leading-relaxed p-3 rounded-xl border ${LEVEL_STYLE[item.level]}`}>
                  <span className="text-base leading-none mt-0.5 shrink-0">{item.icon}</span>
                  <span className="flex-1">{item.text}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setSubTab(key)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${subTab === key ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-white/50 hover:text-white/70 border border-transparent'}`}>
            {label}
            {key === 'anomalies' && anomalies.length > 0 && <span className="mr-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] bg-red-500 text-white rounded-full">{anomalies.length}</span>}
          </button>
        ))}
      </div>

      {subTab === 'trends' && (
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-4">
            <div className="text-sm text-white/60 mb-3">סה"כ הוצאות חודשי</div>
            <div dir="ltr"><ResponsiveContainer width="100%" height={220}>
              <BarChart data={months.map((m) => ({ month: m, total: expensesInWindow.filter((t) => t.date.startsWith(m)).reduce((s, t) => s + t.amount, 0) }))} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#ffffff50' }} />
                <YAxis tick={{ fontSize: 10, fill: '#ffffff50' }} />
                <Tooltip contentStyle={TT} formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="total" fill="#06b6d4" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer></div>
          </CardContent>
        </Card>
      )}

      {subTab === 'compare' && (
        <div className="space-y-4">
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-4">
              <div className="text-sm text-white/60 mb-3">השוואה שנה-על-שנה</div>
              <div dir="ltr"><ResponsiveContainer width="100%" height={260}>
                <BarChart data={yoy} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#ffffff50' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#ffffff50' }} />
                  <Tooltip contentStyle={TT} formatter={(v: number) => formatCurrency(v)} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#ffffff80' }} />
                  <Bar dataKey={currentYear - 2} fill="#6366f1" radius={[2, 2, 0, 0]} />
                  <Bar dataKey={currentYear - 1} fill="#22d3ee" radius={[2, 2, 0, 0]} />
                  <Bar dataKey={currentYear} fill="#10b981" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer></div>
            </CardContent>
          </Card>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-4">
              <div className="text-sm text-white/60 mb-3">שיאים עונתיים</div>
              <div dir="ltr"><ResponsiveContainer width="100%" height={200}>
                <BarChart data={seasonal} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#ffffff50' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#ffffff50' }} />
                  <Tooltip contentStyle={TT} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="avg" fill="#f59e0b" radius={[3, 3, 0, 0]}>
                    {seasonal.map((e, i) => <Cell key={i} fill={e.ratio > 1.2 ? '#ef4444' : e.ratio > 1.05 ? '#f59e0b' : '#10b981'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer></div>
            </CardContent>
          </Card>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-4">
              <div className="text-sm text-white/60 mb-3">אמצעי תשלום לאורך זמן</div>
              <div dir="ltr"><ResponsiveContainer width="100%" height={200}>
                <BarChart data={paymentMethods} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#ffffff50' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#ffffff50' }} />
                  <Tooltip contentStyle={TT} formatter={(v: number) => formatCurrency(v as number)} />
                  {PAYMENT_METHODS_LIST.map((m, i) => <Bar key={m} dataKey={m} stackId="a" fill={METHOD_COLORS[i % METHOD_COLORS.length]} />)}
                </BarChart>
              </ResponsiveContainer></div>
            </CardContent>
          </Card>
        </div>
      )}

      {subTab === 'anomalies' && (
        <div className="space-y-3">
          {anomalies.length === 0 ? (
            <Card className="bg-white/5 border-white/10"><CardContent className="py-8 text-center text-white/40">✅ לא נמצאו חריגות משמעותיות בתקופה זו</CardContent></Card>
          ) : anomalies.map((a) => (
            <Card key={a.category} className={`border ${a.level === 'bad' ? 'bg-red-500/10 border-red-500/30' : 'bg-yellow-500/10 border-yellow-500/30'}`}>
              <CardContent className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-sm text-white">{a.category}</div>
                  <div className="text-xs text-white/50 mt-0.5">התקופה: {formatCurrency(a.currentAmount)} | קודם: {formatCurrency(a.movingAvg)}</div>
                </div>
                <div className={`text-lg font-bold shrink-0 ${a.level === 'bad' ? 'text-red-400' : 'text-yellow-400'}`}>+{a.deviation}%</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {subTab === 'payers' && (
        <div className="space-y-4">
          <div className="flex gap-4 flex-wrap">
            {payer.pieData.map((d, i) => (
              <div key={d.name} className="flex-1 min-w-[80px] p-3 rounded-xl bg-white/5 border border-white/8 text-center">
                <div className="text-xs text-white/40">{d.name}</div>
                <div className="text-base font-bold mt-1" style={{ color: PAYER_COLORS[i] }}>{formatCurrency(d.value)}</div>
              </div>
            ))}
          </div>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={payer.pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                    {payer.pieData.map((_, i) => <Cell key={i} fill={PAYER_COLORS[i]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), String(name)]} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#ffffff80' }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {subTab === 'leaks' && (
        <div className="space-y-4">
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-4 flex justify-between items-center">
              <div className="text-sm text-white/60">סיכום דליפות שנתי (כל ההיסטוריה)</div>
              <div className="text-xl font-bold text-amber-400">{formatCurrency(leaks.reduce((s, l) => s + l.yearlyEstimate, 0))} /שנה</div>
            </CardContent>
          </Card>
          {leaks.length === 0 ? (
            <div className="text-center text-white/40 py-8">✅ לא זוהו הוצאות חוזרות חשודות</div>
          ) : leaks.map((l) => (
            <Card key={l.name} className="bg-white/5 border-white/10">
              <CardContent className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">{l.name}</span>
                    {l.isSubscription && <span className="shrink-0 text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded-full">מנוי</span>}
                  </div>
                  <div className="text-xs text-white/40 mt-0.5">{l.category} · {l.months} חודשים · {l.occurrences} פעמים</div>
                </div>
                <div className="text-left shrink-0">
                  <div className="text-sm font-bold text-amber-400">{formatCurrency(l.monthlyAvg)}/חודש</div>
                  <div className="text-xs text-white/40">{formatCurrency(l.yearlyEstimate)}/שנה</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {subTab === 'forecast' && (
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-4 space-y-3">
            <div className="text-sm text-white/60">תזרים חזוי — 3 החודשים הבאים</div>
            {forecast.length === 0 ? (
              <p className="text-sm text-white/40 text-center py-4">אין חודשים עתידיים להצגה</p>
            ) : forecast.map((f) => (
              <div key={f.month} className="flex items-center justify-between py-2 border-b border-white/5 text-sm">
                <span className="text-white/70">{f.month}</span>
                <div className="text-left">
                  <span className="text-cyan-400">{formatCurrency(f.knownFixed)} ידוע</span>
                  <span className="text-white/30 mx-1">+</span>
                  <span className="text-white/50">{formatCurrency(f.estimatedVariable)} משוער</span>
                  <span className="block text-white font-bold">{formatCurrency(f.total)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {subTab === 'misc' && (
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-4 space-y-2">
            <div className="text-sm text-white/60 mb-2">"שונות" כאחוז מסך ההוצאות, לפי חודש</div>
            {misc.map((m) => (
              <div key={m.month} className={`flex items-center justify-between py-2 px-2 rounded-lg text-sm ${m.flagged ? 'bg-amber-500/10 border border-amber-500/30' : ''}`}>
                <span className="text-white/70">{m.month}</span>
                <span className={m.flagged ? 'text-amber-400 font-bold' : 'text-white/50'}>{formatCurrency(m.miscTotal)} ({m.sharePct}%){m.flagged ? ' ⚠️' : ''}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/pages/reports/InsightsTab.tsx
git commit -m "feat(reports): תובנות tab — all Trends sub-tabs ported + תזרים-חזוי + שונות-drift"
```

---

### Task 11: `exportReport.ts` — Excel/PDF export generalized to any period range

**Files:**
- Create: `src/pages/reports/exportReport.ts`

**Interfaces:**
- Consumes: `Transaction` from `@/types`; `formatCurrency`, `PAYER_LABELS` from `@/utils`; `ReportPeriod`, `periodMonths`, `periodLabel` from `@/lib/reportPeriod`; `byCategory`, `byMonth`, `byPayer`, `fixedVariableSplit` from `@/lib/reportAggregates`.
- Produces: `exportExcel(transactions: Transaction[], period: ReportPeriod, txType: 'expense'|'income'): Promise<void>`, `exportPdf(transactions: Transaction[], period: ReportPeriod): void` — consumed by `Reports.tsx` (Task 12).

Adapted from `src/pages/Reports.tsx`'s existing `exportExcel`/`exportPDF` (current lines 120–360) — same sheet/section structure, only the period source changes (from `{year, month, fullYear}` state to a `ReportPeriod`).

- [ ] **Step 1: Write the module**

```typescript
// src/pages/reports/exportReport.ts
import { Transaction } from '@/types';
import { formatCurrency, PAYER_LABELS } from '@/utils';
import { ReportPeriod, periodMonths, periodLabel } from '@/lib/reportPeriod';
import { byCategory, byMonth, byPayer, fixedVariableSplit } from '@/lib/reportAggregates';

function inRange(t: Transaction, period: ReportPeriod): boolean {
  if (period.isAllTime) return true;
  const ym = t.date.slice(0, 7);
  return ym >= period.startMonth && ym <= period.endMonth;
}

export async function exportExcel(transactions: Transaction[], period: ReportPeriod, txType: 'expense' | 'income') {
  const { utils, writeFile } = await import('xlsx');
  const wb = utils.book_new();
  const filtered = transactions.filter((t) => t.type === txType && inRange(t, period));
  const total = filtered.reduce((s, t) => s + t.amount, 0);
  const months = periodMonths(period);

  const rtl = (ws: ReturnType<typeof utils.json_to_sheet>) => { ws['!views'] = [{ rightToLeft: true }]; return ws; };
  const ILS = '"₪"#,##0';
  const PCT = '0.0"%"';
  const applyFormats = (ws: ReturnType<typeof utils.json_to_sheet>, colFormats: { col: number; fmt: string }[]) => {
    const range = utils.decode_range(ws['!ref'] || 'A1');
    colFormats.forEach(({ col, fmt }) => { for (let row = range.s.r + 1; row <= range.e.r; row++) { const addr = utils.encode_cell({ r: row, c: col }); if (ws[addr]) ws[addr].z = fmt; } });
  };

  const txRows = filtered.map((t) => ({ תאריך: t.date, קטגוריה: t.category, סכום: t.amount, משלם: PAYER_LABELS[t.payer] || t.payer, אמצעי_תשלום: t.payment_method, סוג: t.expense_class, הערות: t.notes || '' }));
  const txSheet = rtl(utils.json_to_sheet(txRows));
  applyFormats(txSheet, [{ col: 2, fmt: ILS }]);
  utils.book_append_sheet(wb, txSheet, 'עסקאות');

  const catData = byCategory(filtered);
  const catRows = catData.map(({ name, value }) => ({ קטגוריה: name, סכום: value, אחוז: total > 0 ? +(value / total * 100).toFixed(1) : 0 }));
  catRows.push({ קטגוריה: 'סה"כ', סכום: total, אחוז: 100 });
  const catSheet = rtl(utils.json_to_sheet(catRows));
  applyFormats(catSheet, [{ col: 1, fmt: ILS }, { col: 2, fmt: PCT }]);
  utils.book_append_sheet(wb, catSheet, 'לפי קטגוריה');

  const monthRows = byMonth(filtered, months).map(({ name, value }) => ({ חודש: name, סכום: value, אחוז: total > 0 ? +(value / total * 100).toFixed(1) : 0 }));
  const monthSheet = rtl(utils.json_to_sheet(monthRows));
  applyFormats(monthSheet, [{ col: 1, fmt: ILS }, { col: 2, fmt: PCT }]);
  utils.book_append_sheet(wb, monthSheet, 'לפי חודש');

  const payerRows = byPayer(filtered).map(({ name, value }) => ({ משלם: name, סכום: value, אחוז: total > 0 ? +(value / total * 100).toFixed(1) : 0 }));
  const payerSheet = rtl(utils.json_to_sheet(payerRows));
  applyFormats(payerSheet, [{ col: 1, fmt: ILS }, { col: 2, fmt: PCT }]);
  utils.book_append_sheet(wb, payerSheet, 'לפי משלם');

  if (txType === 'expense') {
    const split = fixedVariableSplit(filtered);
    const splitRows = [
      { סוג: 'קבועה', סכום: split.fixedTotal, אחוז: split.splitTotal > 0 ? +(split.fixedTotal / split.splitTotal * 100).toFixed(1) : 0 },
      { סוג: 'משתנה', סכום: split.varTotal, אחוז: split.splitTotal > 0 ? +(split.varTotal / split.splitTotal * 100).toFixed(1) : 0 },
      { סוג: 'סה"כ', סכום: split.splitTotal, אחוז: 100 },
    ];
    const splitSheet = rtl(utils.json_to_sheet(splitRows));
    applyFormats(splitSheet, [{ col: 1, fmt: ILS }, { col: 2, fmt: PCT }]);
    utils.book_append_sheet(wb, splitSheet, 'קבועה vs משתנה');
  }

  writeFile(wb, `family-report-${periodLabel(period).replace(/[/\\?%*:|"<>]/g, '-')}.xlsx`);
}

export function exportPdf(transactions: Transaction[], period: ReportPeriod) {
  const label = periodLabel(period);
  const fmtILS = (n: number) => formatCurrency(n);
  const section = (title: string, txType: 'expense' | 'income') => {
    const txs = transactions.filter((t) => t.type === txType && inRange(t, period));
    const total = txs.reduce((s, t) => s + t.amount, 0);
    if (total === 0) return '';
    const cats = byCategory(txs);
    const rows = cats.map(({ name, value }) => `<div class="lrow"><span class="lname">${name}</span><span class="lamt">${fmtILS(value)}</span></div>`).join('');
    return `<div class="section"><h2>${title}<span>${fmtILS(total)}</span></h2><h3>לפי קטגוריה</h3><div class="legend">${rows}</div></div>`;
  };
  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>דוח משפחתי — ${label}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:24px;color:#1e293b;direction:rtl}
  h1{font-size:20px;font-weight:800}.period{color:#64748b;font-size:13px;margin-bottom:22px}
  h2{font-size:15px;font-weight:700;background:#1e293b;color:#fff;padding:8px 14px;border-radius:8px;margin:16px 0;display:flex;justify-content:space-between}
  h3{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin:12px 0 6px}
  .lrow{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f1f5f9;font-size:12px}
  @media print{body{padding:0}}</style></head><body>
  <h1>דוח משפחתי</h1><p class="period">${label}</p>
  ${section('הוצאות', 'expense')}${section('הכנסות', 'income')}
  </body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); w.addEventListener('load', () => { w.focus(); w.print(); }); }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/pages/reports/exportReport.ts
git commit -m "feat(reports): Excel/PDF export generalized to any period range"
```

---

### Task 12: Rewrite `Reports.tsx`, wire routes and nav

**Files:**
- Modify: `src/pages/Reports.tsx` (full rewrite — replaces all 829 current lines)
- Modify: `src/App.tsx` (remove `/annual-analysis` and `/trends` routes + their imports)
- Modify: `src/components/Layout.tsx` (remove שנתי / מגמות from `NAV_ITEMS`)

**Interfaces:**
- Consumes: `useTransactions` from `@/hooks/useTransactions` (existing, unchanged); `ReportPeriod`, `buildPeriod` from `@/lib/reportPeriod`; `PeriodSelector` (Task 6); `ExpensesTab`/`IncomeTab`/`BalanceTab`/`InsightsTab` (Tasks 7–10); `exportExcel`/`exportPdf` (Task 11); `CATEGORIES`, `INCOME_CATEGORIES` from `@/types`.
- Produces: the `/reports` route's default export, replacing the current `Reports.tsx`.

- [ ] **Step 1: Replace the full contents of `src/pages/Reports.tsx`**

```tsx
// src/pages/Reports.tsx
import { useState } from 'react';
import { Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTransactions } from '@/hooks/useTransactions';
import { CATEGORIES, INCOME_CATEGORIES } from '@/types';
import { ReportPeriod, buildPeriod } from '@/lib/reportPeriod';
import { PeriodSelector } from './reports/PeriodSelector';
import { ExpensesTab } from './reports/ExpensesTab';
import { IncomeTab } from './reports/IncomeTab';
import { BalanceTab } from './reports/BalanceTab';
import { InsightsTab } from './reports/InsightsTab';
import { exportExcel, exportPdf } from './reports/exportReport';

type ReportType = 'expense' | 'income' | 'balance' | 'insights';
const TYPES: { key: ReportType; label: string }[] = [
  { key: 'expense', label: '💸 הוצאות' },
  { key: 'income', label: '💰 הכנסות' },
  { key: 'balance', label: '📊 מאזן' },
  { key: 'insights', label: '✨ תובנות' },
];

export default function Reports() {
  const [type, setType] = useState<ReportType>('expense');
  const [period, setPeriod] = useState<ReportPeriod>(() => buildPeriod('selectedYear'));
  const [category, setCategory] = useState('');

  const { transactions } = useTransactions();

  const categoryOptions = type === 'income' ? INCOME_CATEGORIES : type === 'expense' ? CATEGORIES : [...CATEGORIES, ...INCOME_CATEGORIES];

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">דוחות</h1>
        {type !== 'insights' && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportExcel(transactions, period, type === 'income' ? 'income' : 'expense')}>
              <Download className="w-4 h-4 ml-1" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportPdf(transactions, period)}>
              <Download className="w-4 h-4 ml-1" /> PDF
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {TYPES.map(({ key, label }) => (
          <button key={key} onClick={() => setType(key)}
            className={`py-1.5 rounded-xl text-xs font-semibold transition-all ${type === key ? 'bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 text-white' : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10'}`}>
            {label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <PeriodSelector period={period} onChange={setPeriod} />
          {type !== 'insights' && (
            <div>
              <p className="text-xs text-white/50 mb-1">קטגוריה</p>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-9 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none" dir="rtl">
                <option value="" className="bg-slate-800">כל הקטגוריות</option>
                {categoryOptions.map((c) => <option key={c} value={c} className="bg-slate-800">{c}</option>)}
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      {type === 'expense' && <ExpensesTab transactions={transactions} period={period} category={category} />}
      {type === 'income' && <IncomeTab transactions={transactions} period={period} category={category} />}
      {type === 'balance' && <BalanceTab transactions={transactions} period={period} category={category} />}
      {type === 'insights' && <InsightsTab transactions={transactions} period={period} category={category} />}
    </div>
  );
}
```

- [ ] **Step 2: Remove the two old routes from `src/App.tsx`**

Current (lines 18, 20, 69–70):
```tsx
import AnnualAnalysis from '@/pages/AnnualAnalysis';
import Mileage from '@/pages/Mileage';
import Trends from '@/pages/Trends';
```
and
```tsx
              <Route path="/annual-analysis"   element={<AnnualAnalysis />} />
              <Route path="/trends"            element={<Trends />} />
```
Change the import block to drop the two removed imports:
```tsx
import Mileage from '@/pages/Mileage';
```
And drop the two `<Route>` lines entirely from the `<Routes>` block.

- [ ] **Step 3: Remove the two nav entries from `src/components/Layout.tsx`**

Current `NAV_ITEMS` (lines 12–23):
```tsx
const NAV_ITEMS = [
  { label: 'בית',     icon: Home,       href: createPageUrl('Home') },
  { label: 'הוצאות', icon: ListPlus,   href: createPageUrl('Transactions'), accent: true },
  { label: 'דוחות',  icon: BarChart2,  href: createPageUrl('Reports') },
  { label: 'שנתי',   icon: TrendingUp,  href: '/annual-analysis' },
  { label: 'מגמות',  icon: Lightbulb,  href: '/trends' },
  { label: 'נכסים',  icon: Shield,      href: createPageUrl('Assets') },
  { label: 'מנויים', icon: CreditCard, href: createPageUrl('Subscriptions') },
  { label: 'רכב',    icon: Car,        href: createPageUrl('Mileage') },
  { label: 'Admin',  icon: Database,   href: '/admin', adminOnly: true },
  { label: 'הגדרות', icon: Settings,   href: createPageUrl('Settings'), headerOnly: true },
];
```
Change to:
```tsx
const NAV_ITEMS = [
  { label: 'בית',     icon: Home,       href: createPageUrl('Home') },
  { label: 'הוצאות', icon: ListPlus,   href: createPageUrl('Transactions'), accent: true },
  { label: 'דוחות',  icon: BarChart2,  href: createPageUrl('Reports') },
  { label: 'נכסים',  icon: Shield,      href: createPageUrl('Assets') },
  { label: 'מנויים', icon: CreditCard, href: createPageUrl('Subscriptions') },
  { label: 'רכב',    icon: Car,        href: createPageUrl('Mileage') },
  { label: 'Admin',  icon: Database,   href: '/admin', adminOnly: true },
  { label: 'הגדרות', icon: Settings,   href: createPageUrl('Settings'), headerOnly: true },
];
```
Also remove the now-unused `TrendingUp` and `Lightbulb` imports from the `lucide-react` import line at the top of the file if no other usage remains in the file (verify with a search before removing — `TrendingUp`/`Lightbulb` might not be used elsewhere in `Layout.tsx`).

- [ ] **Step 4: Type-check and build**

Run: `npx tsc --noEmit`
Expected: clean — no references remain to the deleted routes' components from `App.tsx`/`Layout.tsx` (the page files themselves, `AnnualAnalysis.tsx`/`Trends.tsx`, still exist on disk until Task 13, so this alone won't fail).

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Reports.tsx src/App.tsx src/components/Layout.tsx
git commit -m "feat(reports): unify Reports/AnnualAnalysis/Trends into one /reports page"
```

- [ ] **Step 6: Deploy and live-verify**

Run: `git push origin main`
Wait for the GitHub Actions deploy to complete (~2–4 min), then on the live app check, per design spec §10:
- **הוצאות**: custom range spanning a year boundary → category pie + matrix + per-child card all reflect it. Switch to "שנה נבחרת" → totals match what today's live `/annual-analysis` shows for that year (compare before deleting it in Task 13).
- **הכנסות**: same range → "לפי משלם" shows monthly breakdown.
- **מאזן**: new "🔒 התחייבות קבועה" KPI renders a sane 0–100% value.
- **תובנות**: all 7 sub-tabs render; תזרים חזוי shows the next 3 months; "שונות" flags at least one real month if applicable.
- **Export**: Excel and PDF both succeed for a custom range.
- Bottom nav no longer shows שנתי/מגמות and still fits without crowding.

---

### Task 13: Delete the superseded pages

**Files:**
- Delete: `src/pages/AnnualAnalysis.tsx`
- Delete: `src/pages/Trends.tsx`

**Interfaces:** none — by Task 12, nothing imports these files anymore.

- [ ] **Step 1: Confirm nothing still imports the two files**

Run: `grep -rn "AnnualAnalysis\|pages/Trends" src --include=*.tsx --include=*.ts`
Expected: no matches (Task 12 already removed the only imports, in `App.tsx`).

- [ ] **Step 2: Delete the files**

```bash
git rm src/pages/AnnualAnalysis.tsx src/pages/Trends.tsx
```

- [ ] **Step 3: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both clean/succeed.

- [ ] **Step 4: Commit and deploy**

```bash
git commit -m "chore(reports): remove AnnualAnalysis.tsx and Trends.tsx, superseded by unified דוחות page"
git push origin main
```

- [ ] **Step 5: Final live check**

After deploy completes, confirm `/annual-analysis` and `/trends` routes are gone from the live app (navigating to them directly shows nothing renders, since `HashRouter` has no matching `<Route>`), and `/reports` still works exactly as verified in Task 12.

---

## Self-Review Notes

- **Spec coverage:** §2 (period model) → Task 2. §3 (4-type structure + payer generalization) → Tasks 7–10, 12. §4 (4 new analyses) → Tasks 5, 9 (commit-rate), 10 (forecast, misc-drift), 7 (child-trend). §5 (exports) → Task 11. §6 (bug fix) → Task 10 (the ported מגמות chart now correctly sums `total`, not `topCategories[0]`, per Task 10's `trends` sub-tab implementation using `expensesInWindow` totals directly). §7 (no-LLM note) documented as a comment in `insights.ts`. §8 (exclusions) — no task implements budget-vs-actual or Assets/net-worth; none should. §9 (migration) → Task 12 (nav/routes), Task 13 (deletion). §10 (verify) → Task 12 Step 6 and Task 13 Step 5.
- **Placeholder scan:** none found — every step has complete code or an exact command with expected output.
- **Type consistency:** `ReportPeriod`/`PeriodQuickPick` (Task 2) used identically across Tasks 6–12. `NamedAmount`/`FixedVariableSplit`/`CategoryMonthMatrixRow` (Task 3) used identically in Tasks 7, 8, 9, 11. `Anomaly`/`Leak`/`ExecItem`/`ForecastMonth`/`MiscDriftMonth`/`PayerBreakdown` (Tasks 4–5) used identically in Task 10. `buildPeriod`/`periodMonths`/`inPeriod`/`priorPeriod`/`periodLabel` function names match between their Task 2 definitions and every later consumer.

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-27-unified-reports-page.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
