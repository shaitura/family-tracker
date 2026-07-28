# Insight Drill-Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every narrative insight card in the תובנות (Insights) tab of `/reports` becomes expandable to show its top-10 supporting transactions, sorted by amount descending.

**Architecture:** Each insight-producing pure function in `src/lib/insights.ts` already has (or is given) the raw transaction set that produced its conclusion — it now also attaches a `transactions: Transaction[]` field (top 10 by amount, pre-sorted, pre-capped) to its output. `InsightsTab.tsx` renders those lists inline via a new shared `InsightDrilldownList` component, toggled per-card with local `Set<number>` state.

**Tech Stack:** React 18 + TypeScript, Vitest (pure-logic tests only — this repo has no DOM/component test setup, `vitest.config.ts` runs `environment: 'node'`), Tailwind, lucide-react icons.

## Global Constraints

- Every `transactions` array is sorted by `amount` descending and capped at exactly 10 entries — computed once inside `insights.ts`, never re-sliced in the component.
- `transactions` is a required (non-optional) field on `ExecItem`, `AnalystInsight`, `Anomaly`, `Leak` — an empty array means "not expandable," never `undefined`.
- No new runtime dependencies. Reuse `lucide-react` (already a dependency) for the chevron icon, `formatCurrency`/`formatDate`/`PAYER_LABELS` from `src/utils/index.ts` (already used elsewhere in this codebase) for row formatting.
- No LLM calls — stays 100% rule-based, consistent with every other function in `insights.ts`.
- Follow this repo's existing test convention: pure-logic functions get Vitest unit tests in a co-located `*.test.ts` file; presentational `.tsx` components are not unit-tested (no existing `.test.tsx` file in this repo, no DOM test environment configured) — verify those visually via the dev server instead.
- Spec reference: `docs/superpowers/specs/2026-07-28-insights-drilldown-design.md`.

---

## Task 1: `topTransactions` helper + `findAnomalies` drill-down

**Files:**
- Modify: `src/lib/insights.ts:10` (interface), `src/lib/insights.ts:13-36` (function)
- Test: `src/lib/insights.test.ts:16-37`

**Interfaces:**
- Produces: `topTransactions(txs: Transaction[]): Transaction[]` (module-private helper, not exported) — sorts by `amount` desc, slices to 10. Used by every task below.
- Produces: `Anomaly.transactions: Transaction[]`

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe('findAnomalies', ...)` block in `src/lib/insights.test.ts` (after the test at line 27, before the "ignores categories below the minimum-amount noise floor" test):

```ts
  it('attaches the top-10 contributing transactions, sorted by amount desc', () => {
    const all = [
      tx({ category: 'רכב', date: '2026-06-01', amount: 500 }),
      tx({ category: 'רכב', date: '2026-07-01', amount: 300 }),
      tx({ category: 'רכב', date: '2026-07-05', amount: 700 }),
    ];
    const out = findAnomalies(all, ['2026-07'], ['2026-06']);
    expect(out[0].transactions.map((t) => t.amount)).toEqual([700, 300]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- insights.test.ts -t "attaches the top-10"`
Expected: FAIL — `out[0].transactions` is `undefined`.

- [ ] **Step 3: Implement**

Add the helper near the top of `src/lib/insights.ts`, right after the `fmtK` function (currently line 7):

```ts
/** Top-10 by amount desc — the standard "supporting evidence" slice attached to every insight. */
function topTransactions(txs: Transaction[]): Transaction[] {
  return [...txs].sort((a, b) => b.amount - a.amount).slice(0, 10);
}
```

Replace the `Anomaly` interface (line 10):

```ts
export interface Anomaly { category: string; currentAmount: number; movingAvg: number; deviation: number; level: 'warn' | 'bad'; transactions: Transaction[] }
```

Replace the body of `findAnomalies` (lines 13-36):

```ts
export function findAnomalies(allExpenses: Transaction[], months: string[], priorMonths: string[]): Anomaly[] {
  if (months.length === 0) return [];
  const inMonths = allExpenses.filter((t) => months.includes(t.date.slice(0, 7)));
  const results: Anomaly[] = [];
  const categories = new Set(allExpenses.map((t) => t.category));
  for (const cat of categories) {
    const catTx = inMonths.filter((t) => t.category === cat);
    const curMonthly = catTx.reduce((s, t) => s + t.amount, 0) / months.length;
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
        transactions: topTransactions(catTx),
      });
    }
  }
  return results.sort((a, b) => b.deviation - a.deviation);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- insights.test.ts -t "attaches the top-10"`
Expected: PASS

- [ ] **Step 5: Run the full insights test file to confirm no regressions**

Run: `npm test -- insights.test.ts`
Expected: all existing `findAnomalies` tests still PASS (the `Anomaly` object literal in the `executiveSummary` test fixture at `src/lib/insights.test.ts:119` will now fail type-checking — that's expected and fixed in Task 3; ignore TS errors for now, only check this file's own tests pass at runtime).

- [ ] **Step 6: Commit**

```bash
git add src/lib/insights.ts src/lib/insights.test.ts
git commit -m "feat(insights): attach top-10 supporting transactions to findAnomalies"
```

---

## Task 2: `findLeaks` drill-down

**Files:**
- Modify: `src/lib/insights.ts:39-42` (interface), `src/lib/insights.ts:45-67` (function)
- Test: `src/lib/insights.test.ts:39-59`

**Interfaces:**
- Consumes: `topTransactions()` from Task 1.
- Produces: `Leak.transactions: Transaction[]`

- [ ] **Step 1: Write the failing test**

Add inside `describe('findLeaks', ...)` in `src/lib/insights.test.ts`, after the existing "detects a description recurring" test (after line 53):

```ts
  it('attaches the underlying transactions for the group, sorted by amount desc', () => {
    const all = [
      tx({ expense_class: 'משתנה', notes: 'נטפליקס', date: '2026-05-01', amount: 40 }),
      tx({ expense_class: 'משתנה', notes: 'נטפליקס', date: '2026-06-01', amount: 60 }),
      tx({ expense_class: 'משתנה', notes: 'נטפליקס', date: '2026-07-01', amount: 50 }),
    ];
    const out = findLeaks(all);
    expect(out[0].transactions.map((t) => t.amount)).toEqual([60, 50, 40]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- insights.test.ts -t "attaches the underlying transactions for the group"`
Expected: FAIL — `out[0].transactions` is `undefined`.

- [ ] **Step 3: Implement**

Replace the `Leak` interface (lines 39-42):

```ts
export interface Leak {
  name: string; category: string; monthlyAvg: number; yearlyEstimate: number;
  months: number; occurrences: number; isSubscription: boolean; transactions: Transaction[];
}
```

Replace the body of `findLeaks` (lines 45-67):

```ts
export function findLeaks(allExpenses: Transaction[]): Leak[] {
  const groups: Record<string, { amounts: number[]; months: Set<string>; category: string; transactions: Transaction[] }> = {};
  for (const t of allExpenses.filter((t) => t.expense_class === 'משתנה')) {
    const key = (t.sub_category || t.notes || '').trim().toLowerCase();
    if (!key || key.length < 3) continue;
    if (!groups[key]) groups[key] = { amounts: [], months: new Set(), category: t.category, transactions: [] };
    groups[key].amounts.push(t.amount);
    groups[key].months.add(t.date.slice(0, 7));
    groups[key].transactions.push(t);
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
        transactions: topTransactions(g.transactions),
      };
    })
    .sort((a, b) => b.yearlyEstimate - a.yearlyEstimate)
    .slice(0, 20);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- insights.test.ts -t "attaches the underlying transactions for the group"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights.ts src/lib/insights.test.ts
git commit -m "feat(insights): attach supporting transactions to findLeaks"
```

---

## Task 3: `executiveSummary` drill-down (all 7 possible items)

**Files:**
- Modify: `src/lib/insights.ts:156` (interface), `src/lib/insights.ts:159-206` (function)
- Test: `src/lib/insights.test.ts:114-129`

**Interfaces:**
- Consumes: `Anomaly.transactions`, `Leak.transactions` (Tasks 1-2), `topTransactions()` (Task 1).
- Produces: `ExecItem.transactions: Transaction[]`

- [ ] **Step 1: Write the failing test**

The existing test at `src/lib/insights.test.ts:115-124` constructs an `Anomaly` object literal missing `transactions` — it will already be a TS error after Task 1. Fix it now and add drill-down assertions. Replace the whole `describe('executiveSummary', ...)` block (lines 114-129) with:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- insights.test.ts -t "executiveSummary"`
Expected: FAIL — `item.transactions` is `undefined` on all cases.

- [ ] **Step 3: Implement**

Replace the `ExecItem` interface (line 156):

```ts
export interface ExecItem { icon: string; text: string; level: 'ok' | 'warn' | 'bad' | 'info'; saving?: number; transactions: Transaction[] }
```

Replace the body of `executiveSummary` (lines 159-206):

```ts
export function executiveSummary(params: {
  expenses: Transaction[]; priorExpenses: Transaction[]; income: number;
  anomalies: Anomaly[]; leaks: Leak[];
}): ExecItem[] {
  const { expenses, priorExpenses, income, anomalies, leaks } = params;
  const items: ExecItem[] = [];
  if (!expenses.length) return items;
  const curTotal = expenses.reduce((s, t) => s + t.amount, 0);
  const priorTotal = priorExpenses.reduce((s, t) => s + t.amount, 0);
  const periodTx = topTransactions(expenses);
  if (priorTotal > 0) {
    const pct = Math.round(((curTotal - priorTotal) / priorTotal) * 100);
    items.push(pct > 10
      ? { icon: '📈', level: 'bad', text: `הוצאות בתקופה גבוהות ב-${pct}% לעומת התקופה הקודמת (${fmt(curTotal)} לעומת ${fmt(priorTotal)})`, transactions: periodTx }
      : pct < -10
      ? { icon: '📉', level: 'ok', text: `הוצאות בתקופה נמוכות ב-${Math.abs(pct)}% לעומת התקופה הקודמת (${fmt(curTotal)})`, transactions: periodTx }
      : { icon: '⚖️', level: 'info', text: `הוצאות יציבות: ${fmt(curTotal)} (שינוי של ${pct > 0 ? '+' : ''}${pct}%)`, transactions: periodTx });
  }
  if (anomalies.length > 0) {
    const top = anomalies[0];
    items.push({ icon: '⚠️', level: top.level, text: `חריגה בקטגוריית ${top.category}: ${fmt(top.currentAmount)} לעומת ${fmt(top.movingAvg)} בתקופה הקודמת (+${top.deviation}%)`, transactions: top.transactions });
  }
  const topCatEntries = Object.entries(
    expenses.reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + t.amount; return acc; }, {} as Record<string, number>),
  ).sort((a, b) => b[1] - a[1]);
  const topCat = topCatEntries[0];
  if (topCat) items.push({ icon: '🎯', level: 'info', text: `קטגוריה מובילת: ${topCat[0]} — ${fmt(topCat[1])}`, transactions: topTransactions(expenses.filter((t) => t.category === topCat[0])) });
  if (leaks.length > 0) {
    const totalLeak = leaks.reduce((s, l) => s + l.yearlyEstimate, 0);
    items.push({ icon: '💸', level: 'warn', text: `זוהו ${leaks.length} הוצאות קבועות בסך ${fmtK(totalLeak)} ש"ח/שנה`, transactions: topTransactions(leaks.flatMap((l) => l.transactions)) });
  }
  if (income > 0 && curTotal > 0) {
    const ratio = Math.round((curTotal / income) * 100);
    items.push(ratio > 90
      ? { icon: '🚨', level: 'bad', text: `הוצאות מהוות ${ratio}% מההכנסה — סכנת גירעון!`, transactions: periodTx }
      : ratio > 70
      ? { icon: '⚠️', level: 'warn', text: `הוצאות מהוות ${ratio}% מההכנסה`, transactions: periodTx }
      : { icon: '✅', level: 'ok', text: `יחס הוצאות/הכנסה תקין: ${ratio}%`, transactions: periodTx });
    const saved = income - curTotal;
    const savePct = Math.round((saved / income) * 100);
    if (savePct > 20) items.push({ icon: '🏦', level: 'ok', text: `חיסכון בתקופה: ${fmt(saved)} (${savePct}% מההכנסה)`, transactions: periodTx });
    else if (savePct < 0) items.push({ icon: '🔴', level: 'bad', text: `גירעון בתקופה: ${fmt(Math.abs(saved))} — ההוצאות עולות על ההכנסה`, transactions: periodTx });
  }
  const fixedExpenses = expenses.filter((t) => t.expense_class === 'קבועה');
  const fixedAmt = fixedExpenses.reduce((s, t) => s + t.amount, 0);
  if (curTotal > 0 && fixedAmt > 0) {
    const fixedPct = Math.round((fixedAmt / curTotal) * 100);
    items.push({ icon: '📋', level: 'info', text: `${fixedPct}% מהוצאות הן קבועות (${fmt(fixedAmt)})`, transactions: topTransactions(fixedExpenses) });
  }
  return items.slice(0, 5);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- insights.test.ts -t "executiveSummary"`
Expected: PASS (all 4 sub-tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights.ts src/lib/insights.test.ts
git commit -m "feat(insights): attach supporting transactions to every executiveSummary item"
```

---

## Task 4: `categoryTrendInsights` drill-down

**Files:**
- Modify: `src/lib/insights.ts:253` (interface), `src/lib/insights.ts:258-276` (function)
- Test: `src/lib/insights.test.ts:171-204`

**Interfaces:**
- Consumes: `topTransactions()` (Task 1).
- Produces: `AnalystInsight.transactions: Transaction[]`

- [ ] **Step 1: Write the failing test**

Add inside `describe('categoryTrendInsights', ...)`, after the "flags a category rising" test (after line 183):

```ts
  it('attaches only the matched category\'s transactions within the lookback window, sorted by amount desc', () => {
    const all = [
      tx({ category: 'רכב', date: '2026-04-01', amount: 100 }),
      tx({ category: 'רכב', date: '2026-05-01', amount: 150 }),
      tx({ category: 'רכב', date: '2026-06-01', amount: 200 }),
      tx({ category: 'רכב', date: '2026-07-01', amount: 250 }),
      tx({ category: 'דיור', date: '2026-07-01', amount: 999 }), // different category, must not appear
      tx({ category: 'רכב', date: '2026-03-01', amount: 999 }),  // outside lookback window, must not appear
    ];
    const out = categoryTrendInsights(all, NOW);
    expect(out[0].transactions.map((t) => t.amount)).toEqual([250, 200, 150, 100]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- insights.test.ts -t "attaches only the matched category"`
Expected: FAIL — `out[0].transactions` is `undefined`.

- [ ] **Step 3: Implement**

Replace the `AnalystInsight` interface (line 253):

```ts
export interface AnalystInsight { icon: string; headline: string; detail: string; level: 'ok' | 'warn' | 'bad' | 'info'; transactions: Transaction[] }
```

Replace the body of `categoryTrendInsights` (lines 258-276):

```ts
export function categoryTrendInsights(allExpenses: Transaction[], now: Date = new Date(), lookback = 4): AnalystInsight[] {
  const months = Array.from({ length: lookback }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - (lookback - 1 - i), 1)));
  const cats = Array.from(new Set(allExpenses.map((t) => t.category)));
  const insights: AnalystInsight[] = [];
  for (const cat of cats) {
    const catTx = allExpenses.filter((t) => t.category === cat && months.includes(t.date.slice(0, 7)));
    const perMonth = months.map((m) => catTx.filter((t) => t.date.startsWith(m)).reduce((s, t) => s + t.amount, 0));
    if (perMonth.some((v) => v < 50)) continue; // needs real spend every month to call it a genuine trend, not sporadic purchases
    const rising = perMonth.every((v, i) => i === 0 || v > perMonth[i - 1]);
    const falling = perMonth.every((v, i) => i === 0 || v < perMonth[i - 1]);
    if (!rising && !falling) continue;
    const first = perMonth[0], last = perMonth[perMonth.length - 1];
    const pct = Math.round(((last - first) / first) * 100);
    if (Math.abs(pct) < 15) continue; // ignore noise-level drift
    insights.push(rising
      ? { icon: '📈', level: pct > 40 ? 'bad' : 'warn', headline: `${cat} עולה בעקביות`, detail: `${lookback} חודשים ברציפות — מ-${fmt(first)} ל-${fmt(last)} (+${pct}%)`, transactions: topTransactions(catTx) }
      : { icon: '📉', level: 'ok', headline: `${cat} יורדת בעקביות`, detail: `${lookback} חודשים ברציפות — מ-${fmt(first)} ל-${fmt(last)} (${pct}%)`, transactions: topTransactions(catTx) });
  }
  return insights.sort((a, b) => (a.level === 'bad' ? -1 : 0) - (b.level === 'bad' ? -1 : 0)).slice(0, 2);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- insights.test.ts -t "categoryTrendInsights"`
Expected: PASS (all sub-tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights.ts src/lib/insights.test.ts
git commit -m "feat(insights): attach supporting transactions to categoryTrendInsights"
```

---

## Task 5: `seasonalHeadsUp` drill-down (signature change)

**Files:**
- Modify: `src/lib/insights.ts:279-289` (function), `src/lib/insights.ts:344` (call site inside `analystInsights`)
- Test: `src/lib/insights.test.ts:206-220`

**Interfaces:**
- Consumes: `topTransactions()` (Task 1).
- Produces: `seasonalHeadsUp(seasonal: SeasonalPeak[], allExpenses: Transaction[], now?: Date): AnalystInsight[]` — **signature changed**: `allExpenses` is now the 2nd parameter (was 2-arg, now 3-arg). Every call site in this codebase is `analystInsights()` — updated in this same task.

- [ ] **Step 1: Write the failing test**

Replace the whole `describe('seasonalHeadsUp', ...)` block (lines 206-220) with:

```ts
describe('seasonalHeadsUp', () => {
  it('warns when the current real-world month is a known seasonal peak', () => {
    const out = seasonalHeadsUp([{ month: 'יול', avg: 5000, ratio: 1.3 }], [], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].headline).toContain('יול');
  });

  it('stays silent when the current month is not a peak', () => {
    expect(seasonalHeadsUp([{ month: 'יול', avg: 5000, ratio: 1.05 }], [], NOW)).toEqual([]);
  });

  it('stays silent when there is no seasonal data for the current month', () => {
    expect(seasonalHeadsUp([{ month: 'דצמ', avg: 5000, ratio: 1.3 }], [], NOW)).toEqual([]);
  });

  it('attaches transactions from any year that fall in the matched calendar month', () => {
    const all = [
      tx({ date: '2025-07-10', amount: 300 }),
      tx({ date: '2026-07-03', amount: 500 }),
      tx({ date: '2026-08-01', amount: 999 }), // different month, must not appear
    ];
    const out = seasonalHeadsUp([{ month: 'יול', avg: 5000, ratio: 1.3 }], all, NOW);
    expect(out[0].transactions.map((t) => t.amount)).toEqual([500, 300]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- insights.test.ts -t "seasonalHeadsUp"`
Expected: FAIL — first 3 tests fail to compile/run (extra arg not yet accepted is harmless in JS, but `out[0].transactions` is `undefined` in the 4th test).

- [ ] **Step 3: Implement**

Replace the body of `seasonalHeadsUp` (lines 279-289):

```ts
/** If the real-world current month is historically a seasonal peak, warn ahead of time instead of only after the fact. */
export function seasonalHeadsUp(seasonal: SeasonalPeak[], allExpenses: Transaction[], now: Date = new Date()): AnalystInsight[] {
  const currentMonthLabel = SHORT_MONTHS[now.getMonth()];
  const match = seasonal.find((s) => s.month === currentMonthLabel && s.ratio > 1.15);
  if (!match) return [];
  const pct = Math.round((match.ratio - 1) * 100);
  const currentMonthNum = String(now.getMonth() + 1).padStart(2, '0');
  const matchingTx = allExpenses.filter((t) => t.date.slice(5, 7) === currentMonthNum);
  return [{
    icon: '📅', level: 'warn',
    headline: `${match.month} הוא בדרך כלל חודש-שיא בהוצאות`,
    detail: `בממוצע כ-${pct}% מעל חודש רגיל (${fmt(match.avg)}) — כדאי להיערך מראש`,
    transactions: topTransactions(matchingTx),
  }];
}
```

Update the call site inside `analystInsights` (line 344, part of the array literal at lines 344-349):

```ts
    ...seasonalHeadsUp(seasonal, allExpenses, now),
```

(Just this one line changes inside the existing `return [ ... ].slice(0, 6)` array in `analystInsights` — leave the other 3 spread lines untouched for now, `yoySameMonthInsight`'s call is fixed in Task 6.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- insights.test.ts -t "seasonalHeadsUp"`
Expected: PASS (all 4 sub-tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights.ts src/lib/insights.test.ts
git commit -m "feat(insights): attach supporting transactions to seasonalHeadsUp"
```

---

## Task 6: `yoySameMonthInsight` drill-down (signature change)

**Files:**
- Modify: `src/lib/insights.ts:292-308` (function), `src/lib/insights.ts:345` (call site inside `analystInsights`)
- Test: `src/lib/insights.test.ts:222-237`

**Interfaces:**
- Consumes: `topTransactions()` (Task 1).
- Produces: `yoySameMonthInsight(yoy: YoyRow[], allExpenses: Transaction[], currentYear: number, now?: Date): AnalystInsight[]` — **signature changed**: `allExpenses` inserted as 2nd parameter.

- [ ] **Step 1: Write the failing test**

Replace the whole `describe('yoySameMonthInsight', ...)` block (lines 222-237) with:

```ts
describe('yoySameMonthInsight', () => {
  it('flags a significant rise vs. the same month last year', () => {
    const yoy = [{ month: 'יוני', 2025: 700, 2026: 1000 }];
    const out = yoySameMonthInsight(yoy, [], 2026, NOW); // last complete month before July = June
    expect(out).toHaveLength(1);
    expect(out[0].level).toBe('bad'); // ~43% rise, >25%
  });

  it('stays silent in January (no complete month yet this year)', () => {
    expect(yoySameMonthInsight([{ month: 'דצמ', 2025: 700, 2026: 1000 }], [], 2026, new Date(2026, 0, 10))).toEqual([]);
  });

  it('stays silent below the noise threshold', () => {
    expect(yoySameMonthInsight([{ month: 'יוני', 2025: 700, 2026: 730 }], [], 2026, NOW)).toEqual([]);
  });

  it('attaches only this-year transactions from the matched month', () => {
    const yoy = [{ month: 'יוני', 2025: 700, 2026: 1000 }];
    const all = [
      tx({ date: '2026-06-05', amount: 600 }),
      tx({ date: '2026-06-20', amount: 400 }),
      tx({ date: '2025-06-05', amount: 700 }), // last year, must not appear
    ];
    const out = yoySameMonthInsight(yoy, all, 2026, NOW);
    expect(out[0].transactions.map((t) => t.amount)).toEqual([600, 400]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- insights.test.ts -t "yoySameMonthInsight"`
Expected: FAIL — `out[0].transactions` is `undefined` in the 4th test.

- [ ] **Step 3: Implement**

Replace the body of `yoySameMonthInsight` (lines 292-308):

```ts
/** Same-calendar-month comparison: the most recently fully-elapsed month vs. the same month last year. */
export function yoySameMonthInsight(yoy: YoyRow[], allExpenses: Transaction[], currentYear: number, now: Date = new Date()): AnalystInsight[] {
  const lastCompleteMonthIdx = now.getMonth() - 1; // 0-based; -1 in January means no complete month yet this year
  if (lastCompleteMonthIdx < 0) return [];
  const label = SHORT_MONTHS[lastCompleteMonthIdx];
  const row = yoy.find((r) => r.month === label);
  if (!row) return [];
  const thisYear = row[currentYear] ?? 0;
  const lastYear = row[currentYear - 1] ?? 0;
  if (lastYear < 200) return [];
  const pct = Math.round(((thisYear - lastYear) / lastYear) * 100);
  if (Math.abs(pct) < 15) return [];
  const monthNum = String(lastCompleteMonthIdx + 1).padStart(2, '0');
  const matchingTx = allExpenses.filter((t) => t.date.startsWith(`${currentYear}-${monthNum}`));
  return [{
    icon: pct > 0 ? '🔺' : '🔻', level: pct > 25 ? 'bad' : pct > 0 ? 'warn' : 'ok',
    headline: `${label} השנה ${pct > 0 ? 'גבוה' : 'נמוך'} משמעותית מאשתקד`,
    detail: `${fmt(thisYear)} לעומת ${fmt(lastYear)} ב-${label} ${currentYear - 1} (${pct > 0 ? '+' : ''}${pct}%)`,
    transactions: topTransactions(matchingTx),
  }];
}
```

Update the call site inside `analystInsights` (line 345):

```ts
    ...yoySameMonthInsight(yoy, allExpenses, currentYear, now),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- insights.test.ts -t "yoySameMonthInsight"`
Expected: PASS (all 4 sub-tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights.ts src/lib/insights.test.ts
git commit -m "feat(insights): attach supporting transactions to yoySameMonthInsight"
```

---

## Task 7: `categoryShareShift` drill-down

**Files:**
- Modify: `src/lib/insights.ts:311-337`
- Test: `src/lib/insights.test.ts:239-257`

**Interfaces:**
- Consumes: `topTransactions()` (Task 1).
- Produces: `transactions` field populated on `categoryShareShift`'s output (no signature change — already receives `allExpenses`).

- [ ] **Step 1: Write the failing test**

Add inside `describe('categoryShareShift', ...)`, after the "flags the category whose budget share shifted the most" test (after line 252):

```ts
  it('attaches only the shifted category\'s transactions from the recent 6-month window', () => {
    const all: Transaction[] = [];
    for (const ym of OLDER_MONTHS) all.push(tx({ category: 'דיור', date: `${ym}-01`, amount: 900 }), tx({ category: 'פנאי', date: `${ym}-01`, amount: 100 }));
    for (const ym of RECENT_MONTHS) all.push(tx({ category: 'דיור', date: `${ym}-01`, amount: 500 }), tx({ category: 'פנאי', date: `${ym}-01`, amount: 500 }));
    const out = categoryShareShift(all, NOW);
    const shiftedCat = out[0].headline.replace('התקציב נוטה יותר ל', '');
    expect(out[0].transactions.every((t) => t.category === shiftedCat)).toBe(true);
    expect(out[0].transactions.every((t) => RECENT_MONTHS.includes(t.date.slice(0, 7)))).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- insights.test.ts -t "attaches only the shifted category"`
Expected: FAIL — `out[0].transactions` is `undefined`.

- [ ] **Step 3: Implement**

Replace the body of `categoryShareShift` (lines 311-337):

```ts
/** Which category's share of total spend shifted the most, comparing the last 6 months to the 6 before that. */
export function categoryShareShift(allExpenses: Transaction[], now: Date = new Date()): AnalystInsight[] {
  const monthsBack = (offset: number) => Array.from({ length: 6 }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - offset - (5 - i), 1)));
  const recent = monthsBack(0), older = monthsBack(6);
  const shareByCat = (months: string[]) => {
    const inWindow = allExpenses.filter((t) => months.includes(t.date.slice(0, 7)));
    const total = inWindow.reduce((s, t) => s + t.amount, 0);
    if (total === 0) return {} as Record<string, number>;
    const byCat: Record<string, number> = {};
    for (const t of inWindow) byCat[t.category] = (byCat[t.category] || 0) + t.amount;
    return Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, v / total]));
  };
  const recentShare = shareByCat(recent), olderShare = shareByCat(older);
  if (Object.keys(olderShare).length === 0) return [];
  let biggest: { cat: string; delta: number } | null = null;
  for (const cat of new Set([...Object.keys(recentShare), ...Object.keys(olderShare)])) {
    const delta = (recentShare[cat] || 0) - (olderShare[cat] || 0);
    if (!biggest || Math.abs(delta) > Math.abs(biggest.delta)) biggest = { cat, delta };
  }
  if (!biggest || Math.abs(biggest.delta) < 0.04) return []; // <4 percentage-points shift = noise
  const fromPct = Math.round((olderShare[biggest.cat] || 0) * 100);
  const toPct = Math.round((recentShare[biggest.cat] || 0) * 100);
  const recentCatTx = allExpenses.filter((t) => t.category === biggest!.cat && recent.includes(t.date.slice(0, 7)));
  return [{
    icon: '🧭', level: 'info',
    headline: `התקציב נוטה יותר ל${biggest.cat}`,
    detail: `${fromPct}% מסך ההוצאות לפני חצי שנה → ${toPct}% היום`,
    transactions: topTransactions(recentCatTx),
  }];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- insights.test.ts -t "categoryShareShift"`
Expected: PASS (all sub-tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights.ts src/lib/insights.test.ts
git commit -m "feat(insights): attach supporting transactions to categoryShareShift"
```

---

## Task 8: Full verification checkpoint (logic layer)

**Files:** none modified — verification only.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`
Expected: all tests in `src/lib/insights.test.ts` (now 27 tests: 23 original + 4 new) PASS. No other test files exist in this repo, so this is the full suite.

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors. This catches any remaining mismatched call to `seasonalHeadsUp`/`yoySameMonthInsight` outside the test file (there are none besides `analystInsights` itself, already fixed in Tasks 5-6) and confirms every `ExecItem`/`AnalystInsight`/`Anomaly`/`Leak` literal across the codebase now includes `transactions`.

- [ ] **Step 3: If either command fails, fix before proceeding**

Do not start Task 9 until both commands are clean — Tasks 9-13 build UI on top of these types and will compound any leftover mismatch.

---

## Task 9: `InsightDrilldownList` component + `toggleIndex` helper

**Files:**
- Create: `src/pages/reports/InsightDrilldownList.tsx`
- Test: `src/pages/reports/InsightDrilldownList.test.ts`

**Interfaces:**
- Consumes: `Transaction` (from `@/types`), `formatCurrency`/`formatDate`/`PAYER_LABELS` (from `@/utils`).
- Produces: `export function InsightDrilldownList({ transactions }: { transactions: Transaction[] }): JSX.Element | null` — renders `null` when `transactions.length === 0`.
- Produces: `export function toggleIndex(set: Set<number>, i: number): Set<number>` — pure helper, returns a **new** Set with `i` added if absent or removed if present (does not mutate `set`).

- [ ] **Step 1: Write the failing test**

Create `src/pages/reports/InsightDrilldownList.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- InsightDrilldownList.test.ts`
Expected: FAIL — cannot resolve `./InsightDrilldownList` (file doesn't exist yet).

- [ ] **Step 3: Implement**

Create `src/pages/reports/InsightDrilldownList.tsx`:

```tsx
// src/pages/reports/InsightDrilldownList.tsx
import { Transaction } from '@/types';
import { formatCurrency, formatDate, PAYER_LABELS } from '@/utils';

/** Toggles index `i` in `set`, returning a new Set — never mutates the input. */
export function toggleIndex(set: Set<number>, i: number): Set<number> {
  const next = new Set(set);
  if (next.has(i)) next.delete(i); else next.add(i);
  return next;
}

/** Compact top-10 supporting-transactions list, rendered under an expanded insight card. */
export function InsightDrilldownList({ transactions }: { transactions: Transaction[] }) {
  if (transactions.length === 0) return null;
  return (
    <div className="mt-2 mr-6 space-y-1 border-t border-white/10 pt-2" onClick={(e) => e.stopPropagation()}>
      {transactions.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-2 text-xs text-white/60">
          <span className="shrink-0 text-white/40">{formatDate(t.date)}</span>
          <span className="flex-1 truncate">{t.sub_category || t.notes || t.category}</span>
          <span className="shrink-0 text-white/40">{PAYER_LABELS[t.payer] ?? t.payer}</span>
          <span className="shrink-0 font-medium text-white/80">{formatCurrency(t.amount)}</span>
        </div>
      ))}
    </div>
  );
}
```

Note: `onClick={(e) => e.stopPropagation()}` on the wrapper prevents a click inside the expanded list (e.g. accidental text selection) from bubbling up to the parent card's own `onClick` and collapsing the list it's inside of.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- InsightDrilldownList.test.ts`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/pages/reports/InsightDrilldownList.tsx src/pages/reports/InsightDrilldownList.test.ts
git commit -m "feat(reports): InsightDrilldownList component + toggleIndex helper"
```

---

## Task 10: Wire drill-down into the "סיכום" card

**Files:**
- Modify: `src/pages/reports/InsightsTab.tsx:1-30` (imports + state), `src/pages/reports/InsightsTab.tsx:114-125` (JSX)

**Interfaces:**
- Consumes: `InsightDrilldownList`, `toggleIndex` from `./InsightDrilldownList` (Task 9); `item.transactions` from `ExecItem` (Task 3).

- [ ] **Step 1: Add imports**

In `src/pages/reports/InsightsTab.tsx`, replace line 4:

```tsx
import { Sparkles, Brain, ChevronDown } from 'lucide-react';
```

Add a new import line right after line 12 (after the `@/lib/insights` import block):

```tsx
import { InsightDrilldownList, toggleIndex } from './InsightDrilldownList';
```

- [ ] **Step 2: Add expand-state**

Replace line 30 (`const [subTab, setSubTab] = useState<SubTab>('trends');`) with:

```tsx
  const [subTab, setSubTab] = useState<SubTab>('trends');
  const [expandedExec, setExpandedExec] = useState<Set<number>>(new Set());
```

- [ ] **Step 3: Wire the exec-card JSX**

Replace lines 118-123 (the `execItems.map(...)` block):

```tsx
              {execItems.map((item, i) => {
                const expandable = item.transactions.length > 0;
                const open = expandedExec.has(i);
                return (
                  <div key={i}
                    className={`flex flex-col gap-2 p-3 rounded-xl border ${LEVEL_STYLE[item.level]} ${expandable ? 'cursor-pointer' : ''}`}
                    onClick={() => expandable && setExpandedExec((s) => toggleIndex(s, i))}>
                    <div className="flex gap-2.5 items-start text-sm leading-relaxed">
                      <span className="text-base leading-none mt-0.5 shrink-0">{item.icon}</span>
                      <span className="flex-1">{item.text}</span>
                      {expandable && <ChevronDown className={`w-4 h-4 shrink-0 mt-0.5 transition-transform ${open ? 'rotate-180' : ''}`} />}
                    </div>
                    {open && <InsightDrilldownList transactions={item.transactions} />}
                  </div>
                );
              })}
```

- [ ] **Step 4: Manual check**

This task has no automated test (presentational JSX wiring in a repo with no component test setup — see Global Constraints). Defer visual verification to Task 14, which exercises all four wired cards together in the browser at once.

- [ ] **Step 5: Commit**

```bash
git add src/pages/reports/InsightsTab.tsx
git commit -m "feat(reports): expandable drill-down on the סיכום insight card"
```

---

## Task 11: Wire drill-down into the "🧠 ניתוח אנליסט" card

**Files:**
- Modify: `src/pages/reports/InsightsTab.tsx` (state + JSX, both touched again in this task)

**Interfaces:**
- Consumes: same as Task 10; `item.transactions` from `AnalystInsight` (Tasks 4-7).

- [ ] **Step 1: Add expand-state**

Immediately after the `expandedExec` line added in Task 10, add:

```tsx
  const [expandedAnalyst, setExpandedAnalyst] = useState<Set<number>>(new Set());
```

- [ ] **Step 2: Wire the analyst-card JSX**

Find the `analystItems.map(...)` block (originally lines 138-146, now shifted a few lines down by Task 10's edits — locate via the `ניתוח אנליסט` card content). Replace it with:

```tsx
              {analystItems.map((item, i) => {
                const expandable = item.transactions.length > 0;
                const open = expandedAnalyst.has(i);
                return (
                  <div key={i}
                    className={`p-3 rounded-xl border ${LEVEL_STYLE[item.level]} ${expandable ? 'cursor-pointer' : ''}`}
                    onClick={() => expandable && setExpandedAnalyst((s) => toggleIndex(s, i))}>
                    <div className="flex gap-2.5 items-start text-sm font-medium leading-relaxed">
                      <span className="text-base leading-none mt-0.5 shrink-0">{item.icon}</span>
                      <span className="flex-1">{item.headline}</span>
                      {expandable && <ChevronDown className={`w-4 h-4 shrink-0 mt-0.5 transition-transform ${open ? 'rotate-180' : ''}`} />}
                    </div>
                    <p className="text-xs text-white/50 mt-1 mr-6">{item.detail}</p>
                    {open && <InsightDrilldownList transactions={item.transactions} />}
                  </div>
                );
              })}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/reports/InsightsTab.tsx
git commit -m "feat(reports): expandable drill-down on the ניתוח אנליסט insight card"
```

---

## Task 12: Wire drill-down into the חריגות (anomalies) sub-tab

**Files:**
- Modify: `src/pages/reports/InsightsTab.tsx` (state + JSX)

**Interfaces:**
- Consumes: same as Task 10; `a.transactions` from `Anomaly` (Task 1).

- [ ] **Step 1: Add expand-state**

Immediately after `expandedAnalyst` (added in Task 11), add:

```tsx
  const [expandedAnomaly, setExpandedAnomaly] = useState<Set<number>>(new Set());
```

- [ ] **Step 2: Wire the anomalies-tab JSX**

Find the `anomalies.map((a) => (...))` block (originally lines 267-277, inside `{subTab === 'anomalies' && (...)}`). Replace it with:

```tsx
          ) : anomalies.map((a, i) => {
            const expandable = a.transactions.length > 0;
            const open = expandedAnomaly.has(i);
            return (
              <Card key={a.category}
                className={`border ${expandable ? 'cursor-pointer' : ''} ${a.level === 'bad' ? 'bg-red-500/10 border-red-500/30' : 'bg-yellow-500/10 border-yellow-500/30'}`}
                onClick={() => expandable && setExpandedAnomaly((s) => toggleIndex(s, i))}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-sm text-white">{a.category}</div>
                      <div className="text-xs text-white/50 mt-0.5">התקופה: {formatCurrency(a.currentAmount)} | קודם: {formatCurrency(a.movingAvg)}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className={`text-lg font-bold ${a.level === 'bad' ? 'text-red-400' : 'text-yellow-400'}`}>+{a.deviation}%</div>
                      {expandable && <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />}
                    </div>
                  </div>
                  {open && <InsightDrilldownList transactions={a.transactions} />}
                </CardContent>
              </Card>
            );
          })}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/reports/InsightsTab.tsx
git commit -m "feat(reports): expandable drill-down on חריגות anomaly cards"
```

---

## Task 13: Wire drill-down into the דליפות (leaks) sub-tab

**Files:**
- Modify: `src/pages/reports/InsightsTab.tsx` (state + JSX)

**Interfaces:**
- Consumes: same as Task 10; `l.transactions` from `Leak` (Task 2).

- [ ] **Step 1: Add expand-state**

Immediately after `expandedAnomaly` (added in Task 12), add:

```tsx
  const [expandedLeak, setExpandedLeak] = useState<Set<number>>(new Set());
```

- [ ] **Step 2: Wire the leaks-tab JSX**

Find the `leaks.map((l) => (...))` block (originally lines 356-372, inside `{subTab === 'leaks' && (...)}`). Replace it with:

```tsx
          ) : leaks.map((l, i) => {
            const expandable = l.transactions.length > 0;
            const open = expandedLeak.has(i);
            return (
              <Card key={l.name} className={`bg-white/5 border-white/10 ${expandable ? 'cursor-pointer' : ''}`}
                onClick={() => expandable && setExpandedLeak((s) => toggleIndex(s, i))}>
                <CardContent className="py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">{l.name}</span>
                        {l.isSubscription && <span className="shrink-0 text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded-full">מנוי</span>}
                      </div>
                      <div className="text-xs text-white/40 mt-0.5">{l.category} · {l.months} חודשים · {l.occurrences} פעמים</div>
                    </div>
                    <div className="text-left shrink-0 flex items-center gap-2">
                      <div>
                        <div className="text-sm font-bold text-amber-400">{formatCurrency(l.monthlyAvg)}/חודש</div>
                        <div className="text-xs text-white/40">{formatCurrency(l.yearlyEstimate)}/שנה</div>
                      </div>
                      {expandable && <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />}
                    </div>
                  </div>
                  {open && <InsightDrilldownList transactions={l.transactions} />}
                </CardContent>
              </Card>
            );
          })}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/reports/InsightsTab.tsx
git commit -m "feat(reports): expandable drill-down on דליפות leak cards"
```

---

## Task 14: Full verification (build + manual browser check)

**Files:** none modified — verification only.

- [ ] **Step 1: Run the full test suite one more time**

Run: `npm test`
Expected: all tests pass (27 in `insights.test.ts` + 3 in `InsightDrilldownList.test.ts` = 30 total).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build completes with no errors (this also re-runs `tsc`).

- [ ] **Step 4: Manual verification in the browser**

Start the dev server (`npm run dev`), navigate to `/reports`, open the תובנות tab, and confirm:
- The "סיכום" card items show a chevron and expand to a transaction list on click.
- The "🧠 ניתוח אנליסט" card items do the same (may need real data spanning several months/years to have any items rendered at all — if the card is empty, that's expected on a dataset too small to trigger any of the 4 heuristics, not a bug).
- Switch to the חריגות sub-tab: cards with a chevron expand to show the categories' transactions.
- Switch to the דליפות sub-tab: cards expand to show each recurring charge's individual occurrences.
- Expanding one card does not collapse a different, already-expanded card (independent state per card).
- Clicking inside an expanded transaction row does not collapse that card (the `stopPropagation` from Task 9 is doing its job).

If anything looks wrong, fix the source before considering this plan complete — this manual pass is the only check that exercises the real UI, since this repo has no automated component tests.

---

## Self-Review Notes

**Spec coverage:** every row of the spec's "Per-insight transaction source" table maps to Tasks 1-7 (`findAnomalies`→1, `findLeaks`→2, `executiveSummary`'s 7 items→3, `categoryTrendInsights`→4, `seasonalHeadsUp`→5, `yoySameMonthInsight`→6, `categoryShareShift`→7); UI wiring for all four card surfaces (סיכום, ניתוח אנליסט, חריגות, דליפות) → Tasks 10-13; the spec's "no configurable top N, hardcoded at 10" → `topTransactions()` in Task 1; the spec's row format (date/category-or-note/payer/amount) → `InsightDrilldownList` in Task 9.

**Type consistency:** `ExecItem`, `AnalystInsight`, `Anomaly`, `Leak` all gain the identical `transactions: Transaction[]` field name — verified consistent across Tasks 1-7. `toggleIndex`/`InsightDrilldownList` names match between Task 9's implementation and Tasks 10-13's usage.

**Placeholder scan:** no TBDs — every step shows complete code.
