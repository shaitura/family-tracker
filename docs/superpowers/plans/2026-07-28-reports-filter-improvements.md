# Reports Filter & Tooltip Readability Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 gaps in the `/reports` page found after the insights drill-down feature shipped: the category filter is hidden on the Insights tab (and one of its subtabs silently ignores it anyway); the year-over-year chart is stuck comparing the current year and the 2 before it with no way to pick other years; every chart tooltip renders its value text in that series' own (sometimes unreadable) color instead of a fixed readable color; and there's no single button to clear the category/year filters back to default.

**Architecture:** A new shared `ChartTooltip` presentational component replaces recharts' default tooltip content everywhere on the reports page, fixing the readability bug at the source instead of tuning per-chart style props that can't reliably override it. `yearOverYear()` in `insights.ts` generalizes from a hardcoded "current year and 2 before it" to an arbitrary list of years, so the existing whole-history "🧠 ניתוח אנליסט" card and the new user-facing year picker can both call it with the exact years each one needs. The year-picker's `[from, to]` state is lifted to `Reports.tsx` (alongside the existing `category` state) so one `resetFilters()` function and one button can clear everything.

**Tech Stack:** React 18 + TypeScript, Vitest (pure-logic tests only — this repo has no DOM/component test setup), recharts, Tailwind, lucide-react icons.

## Global Constraints

- No new runtime dependencies.
- `ChartTooltip` renders every label and value in a fixed, readable color (`#fff` for values, `#e2e8f0` for names, against a `#1e293b` background) — the series/slice color appears only as an 8×8px swatch, never as text color.
- Every `formatter` passed to `ChartTooltip` has the shape `(value: number, name: string) => [string, string]` (returns `[formattedValue, formattedName]`) — this is a deliberate normalization across all 16 existing Tooltip call sites (some previously relied on recharts auto-deriving the name, some already returned a tuple; all become the same shape).
- The category filter, once visible on every report type, must actually be respected by every subtab of Insights — including תזרים חזוי (forecast), which currently has a real bug: it filters from the raw `transactions` array instead of the category-filtered `allExpenses`.
- The new year-comparison picker is exactly two dropdowns ("מ" / "עד"), not a multi-select — picking the same year in both collapses to one visible bar, not two.
- "אפס סינון" (reset filter) resets `category` and the year-comparison selection only — never the period selector, which already has its own quick-pick reset behavior and is out of scope.
- Spec reference: `docs/superpowers/specs/2026-07-28-reports-filter-improvements-design.md`.

---

## Task 1: `ChartTooltip` shared component

**Files:**
- Create: `src/pages/reports/ChartTooltip.tsx`

**Interfaces:**
- Produces: `export function ChartTooltip({ active, label, payload, formatter }: ChartTooltipProps): JSX.Element | null` — renders `null` when `active` is falsy or `payload` is empty/undefined. `formatter?: (value: number, name: string) => [string, string]`; when omitted, falls back to raw `String(value)`/`String(name)`.

No test for this task — `ChartTooltip` is a presentational component in a repo with no DOM/component test setup (established precedent: `InsightDrilldownList.tsx` from the prior drill-down feature). Verified visually in Task 8.

- [ ] **Step 1: Create the component**

Create `src/pages/reports/ChartTooltip.tsx`:

```tsx
// src/pages/reports/ChartTooltip.tsx
interface ChartTooltipPayloadEntry {
  name?: string | number;
  value?: number;
  color?: string;
  dataKey?: string | number;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: ChartTooltipPayloadEntry[];
  formatter?: (value: number, name: string) => [string, string];
}

/**
 * Shared recharts tooltip content. Recharts' default tooltip colors each value
 * row using that series' own color as the TEXT color — on this app's dark
 * background, low-contrast series colors (purple, indigo) become close to
 * unreadable. This renders every label/value in a fixed, readable color and
 * demotes the series color to a small swatch instead.
 */
export function ChartTooltip({ active, label, payload, formatter }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 10px', fontSize: 11, minWidth: 120 }}>
      {label != null && <div style={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      {payload.map((entry, i) => {
        const rawName = String(entry.name ?? entry.dataKey ?? '');
        const [val, name] = formatter ? formatter(Number(entry.value ?? 0), rawName) : [String(entry.value ?? ''), rawName];
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#e2e8f0' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: entry.color ?? '#94a3b8', flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{name}</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>{val}</span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (this is a new, self-contained file with no external callers yet).

- [ ] **Step 3: Commit**

```bash
git add src/pages/reports/ChartTooltip.tsx
git commit -m "feat(reports): add shared ChartTooltip with fixed-readable text color"
```

---

## Task 2: `yearOverYear()` — generalize from 3-fixed-years to an arbitrary year list

**Files:**
- Modify: `src/lib/insights.ts:81-91`
- Test: `src/lib/insights.test.ts:61-70` (the `describe('yearOverYear', ...)` block)

**Interfaces:**
- Produces: `export function yearOverYear(allExpenses: Transaction[], years: number[]): YoyRow[]` — **signature changed**: 2nd parameter is now `years: number[]` instead of `currentYear: number`. Every call site (only `InsightsTab.tsx`, updated in Task 3b) must pass an explicit array.

- [ ] **Step 1: Write the failing tests**

Replace the whole `describe('yearOverYear', ...)` block in `src/lib/insights.test.ts` (lines 61-70) with:

```ts
describe('yearOverYear', () => {
  it('sums each calendar month across the requested years', () => {
    const all = [tx({ date: '2024-07-01', amount: 100 }), tx({ date: '2025-07-01', amount: 200 }), tx({ date: '2026-07-01', amount: 300 })];
    const out = yearOverYear(all, [2024, 2025, 2026]);
    const julRow = out.find((r) => r.month === 'יול')!;
    expect(julRow[2024]).toBe(100);
    expect(julRow[2025]).toBe(200);
    expect(julRow[2026]).toBe(300);
  });

  it('supports an arbitrary, non-adjacent pair of years', () => {
    const all = [
      tx({ date: '2022-03-01', amount: 500 }),
      tx({ date: '2024-03-01', amount: 999 }), // not requested, must not appear
      tx({ date: '2026-03-01', amount: 700 }),
    ];
    const out = yearOverYear(all, [2022, 2026]);
    const marRow = out.find((r) => r.month === 'מרץ')!;
    expect(marRow[2022]).toBe(500);
    expect(marRow[2026]).toBe(700);
    expect(marRow[2024]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- insights.test.ts -t "yearOverYear"`
Expected: FAIL — `yearOverYear(all, [2024, 2025, 2026])` doesn't type/behave correctly against the current `(allExpenses, currentYear: number)` signature (TypeScript error at minimum; if it runs anyway under esbuild's untyped transform, the second test's non-adjacent-years assertion will fail since the current implementation ignores the array and hardcodes `currentYear-2/-1/currentYear`).

- [ ] **Step 3: Implement**

Replace the body of `yearOverYear` (lines 81-91):

```ts
export function yearOverYear(allExpenses: Transaction[], years: number[]): YoyRow[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    const sum = (y: number) => allExpenses.filter((t) => t.date.startsWith(`${y}-${m}`)).reduce((s, t) => s + t.amount, 0);
    const row = { month: SHORT_MONTHS[i] } as YoyRow;
    for (const y of years) row[y] = Math.round(sum(y));
    return row;
  }).reverse();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- insights.test.ts -t "yearOverYear"`
Expected: PASS (both tests)

- [ ] **Step 5: Run the full insights test file to confirm no regressions**

Run: `npm test -- insights.test.ts`
Expected: all tests pass. `npx tsc --noEmit` will show 1 error (the `InsightsTab.tsx` call site still passes a bare `currentYear` number) — that's expected and fixed in Task 3b; ignore it for this task.

- [ ] **Step 6: Commit**

```bash
git add src/lib/insights.ts src/lib/insights.test.ts
git commit -m "feat(insights): generalize yearOverYear to accept an arbitrary year list"
```

---

## Task 3a: `InsightsTab.tsx` — fix the forecast category bug + swap 7 tooltips to `ChartTooltip`

**Files:**
- Modify: `src/pages/reports/InsightsTab.tsx`

**Interfaces:**
- Consumes: `ChartTooltip` from `./ChartTooltip` (Task 1).

This task does NOT touch the "השוואה שנה-על-שנה" chart block (its Tooltip, data, and JSX are fully replaced in Task 3b) — leave lines around `yoy`/`currentYear - 2` etc. untouched here.

- [ ] **Step 1: Add the import, remove the now-unused `TT` const**

Add this import right after the existing `import { InsightDrilldownList, toggleIndex } from './InsightDrilldownList';` line:

```tsx
import { ChartTooltip } from './ChartTooltip';
```

Delete this line entirely (it becomes unused once every `contentStyle={TT}` below is replaced):

```tsx
const TT = { background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11, color: '#fff' };
```

- [ ] **Step 2: Fix the forecast subtab's category bug**

Replace:

```tsx
  const futureExpenses = useMemo(() => transactions.filter((t) => t.type === 'expense' && t.status === 'future'), [transactions]);
  const recentVariable = useMemo(() => {
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;
    return transactions.filter((t) => t.type === 'expense' && t.expense_class === 'משתנה' && t.date.slice(0, 7) >= cutoffKey);
  }, [transactions, now]);
```

with:

```tsx
  const futureExpenses = useMemo(() => transactions.filter((t) => t.type === 'expense' && (!category || t.category === category) && t.status === 'future'), [transactions, category]);
  const recentVariable = useMemo(() => {
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;
    return transactions.filter((t) => t.type === 'expense' && (!category || t.category === category) && t.expense_class === 'משתנה' && t.date.slice(0, 7) >= cutoffKey);
  }, [transactions, category, now]);
```

- [ ] **Step 3: Swap the 7 in-scope Tooltip instances**

**Important:** the line `<Tooltip contentStyle={TT} formatter={(v: number) => formatCurrency(v)} />` (18-space indent) appears **three times** in this file — the trends monthly bar (3.2 below), the seasonal peaks bar (3.3 below), and the "השוואה שנה-על-שנה" chart (which Task 3b replaces wholesale — do NOT touch it here). Because the bare line isn't unique, edits 3.2 and 3.3 below include a neighboring line to disambiguate — do **not** use `replace_all` for either, and do not simplify them down to just the bare Tooltip line. A 4th, differently-indented (20-space) occurrence of similar-looking text is 3.1 below — it IS unique on its own since its indentation differs from the other three.

**3.1 — trends stacked-area chart** (inside `{subTab === 'trends' && ...}`, the category-over-time `AreaChart`; this line has 20-space indentation, distinct from the 18-space occurrences elsewhere in the file — safe to match on its own):

```tsx
                    <Tooltip contentStyle={TT} formatter={(v: number) => formatCurrency(v)} />
```
→
```tsx
                    <Tooltip content={<ChartTooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), name]} />} />
```

**3.2 — trends monthly total bar chart** (inside `{subTab === 'trends' && ...}`, immediately below 3.1's chart). Match this whole 2-line block, not just the Tooltip line alone, to disambiguate from the seasonal-peaks and yoy-chart occurrences of the identical Tooltip text:

```tsx
                  <Tooltip contentStyle={TT} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="total" fill="#06b6d4" radius={[3, 3, 0, 0]} />
```
→
```tsx
                  <Tooltip content={<ChartTooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), name]} />} />
                  <Bar dataKey="total" fill="#06b6d4" radius={[3, 3, 0, 0]} />
```

**3.3 — seasonal peaks bar chart** (inside `{subTab === 'compare' && ...}`, the "שיאים עונתיים" card). Match this whole 2-line block for the same disambiguation reason:

```tsx
                  <Tooltip contentStyle={TT} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="avg" fill="#f59e0b" radius={[3, 3, 0, 0]}>
```
→
```tsx
                  <Tooltip content={<ChartTooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), name]} />} />
                  <Bar dataKey="avg" fill="#f59e0b" radius={[3, 3, 0, 0]}>
```

**3.4 — payment methods stacked bar chart** (inside `{subTab === 'compare' && ...}`, the "אמצעי תשלום לאורך זמן" `BarChart`; unique on its own — the only `formatCurrency(v as number)` variant paired with a single-arg formatter):

```tsx
                  <Tooltip contentStyle={TT} formatter={(v: number) => formatCurrency(v as number)} />
```
→
```tsx
                  <Tooltip content={<ChartTooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), name]} />} />
```

**3.5 — payer pie chart** (inside `{subTab === 'payers' && ...}`, the top `PieChart` — this is the exact chart from the user's screenshot; unique on its own):

```tsx
                  <Tooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), String(name)]} contentStyle={TT} />
```
→
```tsx
                  <Tooltip content={<ChartTooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), name]} />} />
```

**3.6 — payer × category horizontal bar chart** (inside `{subTab === 'payers' && ...}`, "פירוט לפי קטגוריה"; unique on its own):

```tsx
                    <Tooltip contentStyle={TT} formatter={(v: number, name: string): [string, string] => [formatCurrency(v as number), String(name)]} />
```
→
```tsx
                    <Tooltip content={<ChartTooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), name]} />} />
```

**3.7 — leaks-by-category pie chart** (inside `{subTab === 'leaks' && ...}`; unique on its own):

```tsx
                    <Tooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(Math.round(v)) + ' /שנה', String(name)]} contentStyle={TT} />
```
→
```tsx
                    <Tooltip content={<ChartTooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(Math.round(v)) + ' /שנה', name]} />} />
```

- [ ] **Step 4: Verify no stray `TT`/`contentStyle` references remain outside the yoy chart block**

Run: `grep -n "contentStyle={TT}\|=TT\b" src/pages/reports/InsightsTab.tsx`
Expected: exactly ONE remaining match — the "השוואה שנה-על-שנה" chart's `<Tooltip contentStyle={TT} formatter={(v: number) => formatCurrency(v)} />` — that one is intentionally left for Task 3b.

- [ ] **Step 5: Type-check and test**

Run: `npx tsc --noEmit`
Expected: 1 error remaining (the `yearOverYear(allExpenses, currentYear)` call site, from Task 2 — expected, fixed in Task 3b). No NEW errors beyond that one.

Run: `npm test`
Expected: all tests pass (this task touches no test files; the suite covers `insights.ts`/`InsightDrilldownList.tsx` logic only, unaffected by this JSX-only change).

- [ ] **Step 6: Commit**

```bash
git add src/pages/reports/InsightsTab.tsx
git commit -m "fix(reports): respect category filter in forecast subtab; readable tooltips (7/8)"
```

---

## Task 3b: `InsightsTab.tsx` — selectable year-over-year comparison

**Files:**
- Modify: `src/pages/reports/InsightsTab.tsx`
- Modify: `src/pages/reports/PeriodSelector.tsx:15`

**Interfaces:**
- Consumes: `yearOverYear(allExpenses, years: number[])` (Task 2), `ChartTooltip` (Task 1, already imported by Task 3a).
- Produces: `InsightsTab` now requires 4 additional props: `yoyFromYear: number`, `yoyToYear: number`, `setYoyFromYear: (y: number) => void`, `setYoyToYear: (y: number) => void`. **This intentionally breaks `tsc --noEmit`** at the one call site (`Reports.tsx`, which doesn't pass these props yet) — expected, closed by Task 7, verified clean at Task 8. Do not touch `Reports.tsx` in this task.
- Produces: `export const YEAR_OPTIONS` from `PeriodSelector.tsx` (was module-private) — the list of available years (`EARLIEST_YEAR..currentYear`, descending), reused here instead of recomputed.

- [ ] **Step 1: Export `YEAR_OPTIONS` from `PeriodSelector.tsx`**

In `src/pages/reports/PeriodSelector.tsx`, change:

```ts
const YEAR_OPTIONS = Array.from({ length: currentYear - EARLIEST_YEAR + 1 }, (_, i) => String(EARLIEST_YEAR + i)).reverse();
```

to:

```ts
export const YEAR_OPTIONS = Array.from({ length: currentYear - EARLIEST_YEAR + 1 }, (_, i) => String(EARLIEST_YEAR + i)).reverse();
```

(One word added — `export`. No other change to this file.)

- [ ] **Step 2: Import `YEAR_OPTIONS` into `InsightsTab.tsx`**

Add this import near the top of `src/pages/reports/InsightsTab.tsx`, alongside the other local imports:

```tsx
import { YEAR_OPTIONS } from './PeriodSelector';
```

- [ ] **Step 3: Update the `InsightsTab` props signature**

Replace:

```tsx
export function InsightsTab({ transactions, period, category }: { transactions: Transaction[]; period: ReportPeriod; category: string }) {
```

with:

```tsx
export function InsightsTab({
  transactions, period, category, yoyFromYear, yoyToYear, setYoyFromYear, setYoyToYear,
}: {
  transactions: Transaction[]; period: ReportPeriod; category: string;
  yoyFromYear: number; yoyToYear: number; setYoyFromYear: (y: number) => void; setYoyToYear: (y: number) => void;
}) {
```

- [ ] **Step 4: Split the single `yoy` computation into `yoyForAnalyst` and `yoyChart`**

Replace:

```tsx
  const yoy = useMemo(() => yearOverYear(allExpenses, currentYear), [allExpenses, currentYear]);
```

with:

```tsx
  const yoyForAnalyst = useMemo(() => yearOverYear(allExpenses, [currentYear - 1, currentYear]), [allExpenses, currentYear]);
  const yoyYears = useMemo(() => Array.from(new Set([yoyFromYear, yoyToYear])), [yoyFromYear, yoyToYear]);
  const yoyChart = useMemo(() => yearOverYear(allExpenses, yoyYears), [allExpenses, yoyYears]);
```

- [ ] **Step 5: Update the `analystInsights()` call to use `yoyForAnalyst`**

Replace:

```tsx
  const analystItems = useMemo(
    () => analystInsights({ allExpenses, seasonal, yoy, currentYear }),
    [allExpenses, seasonal, yoy, currentYear],
  );
```

with:

```tsx
  const analystItems = useMemo(
    () => analystInsights({ allExpenses, seasonal, yoy: yoyForAnalyst, currentYear }),
    [allExpenses, seasonal, yoyForAnalyst, currentYear],
  );
```

- [ ] **Step 6: Replace the "השוואה שנה-על-שנה" chart block**

Replace the entire card (inside `{subTab === 'compare' && ...}`, the first `<Card>` in that block):

```tsx
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
```

with:

```tsx
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-white/60">השוואה שנה-על-שנה</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/40">מ</span>
                  <select value={yoyFromYear} onChange={(e) => setYoyFromYear(Number(e.target.value))}
                    className="h-8 rounded-lg border border-white/15 bg-white/5 px-2 text-xs text-white focus:outline-none">
                    {YEAR_OPTIONS.map((y) => <option key={y} value={y} className="bg-slate-800">{y}</option>)}
                  </select>
                  <span className="text-xs text-white/40">עד</span>
                  <select value={yoyToYear} onChange={(e) => setYoyToYear(Number(e.target.value))}
                    className="h-8 rounded-lg border border-white/15 bg-white/5 px-2 text-xs text-white focus:outline-none">
                    {YEAR_OPTIONS.map((y) => <option key={y} value={y} className="bg-slate-800">{y}</option>)}
                  </select>
                </div>
              </div>
              <div dir="ltr"><ResponsiveContainer width="100%" height={260}>
                <BarChart data={yoyChart} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#ffffff50' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#ffffff50' }} />
                  <Tooltip content={<ChartTooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), name]} />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#ffffff80' }} />
                  {yoyYears.map((y, i) => <Bar key={y} dataKey={y} fill={COLORS[i % COLORS.length]} radius={[2, 2, 0, 0]} />)}
                </BarChart>
              </ResponsiveContainer></div>
            </CardContent>
          </Card>
```

- [ ] **Step 7: Confirm no `TT` references remain**

Run: `grep -n "TT\b" src/pages/reports/InsightsTab.tsx`
Expected: no matches at all (the const was deleted in Task 3a; this was its last usage).

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: exactly 1 error — `Reports.tsx`'s `<InsightsTab transactions={transactions} period={period} category={category} />` call is now missing the 4 new required props. This is the expected, documented gap closed by Task 7. No other errors.

- [ ] **Step 9: Run the test suite**

Run: `npm test`
Expected: all tests pass (no test file covers `InsightsTab.tsx` directly; this confirms no regression in `insights.ts`/`InsightDrilldownList.tsx`).

- [ ] **Step 10: Commit**

```bash
git add src/pages/reports/InsightsTab.tsx src/pages/reports/PeriodSelector.tsx
git commit -m "feat(reports): selectable from/to year picker for the YoY comparison chart"
```

---

## Task 4: `ExpensesTab.tsx` — swap 4 tooltips to `ChartTooltip`

**Files:**
- Modify: `src/pages/reports/ExpensesTab.tsx`

**Interfaces:**
- Consumes: `ChartTooltip` from `./ChartTooltip` (Task 1).

- [ ] **Step 1: Add the import**

Add after the existing `import { byCategory, byPayer, byMonth, fixedVariableSplit, categoryMonthMatrix } from '@/lib/reportAggregates';` line:

```tsx
import { ChartTooltip } from './ChartTooltip';
```

- [ ] **Step 2: Replace all 4 Tooltip instances individually**

All 4 lines below look similar but each has different leading whitespace and/or formatter text, so each is independently unique in the file — match and replace each one individually (do not use `replace_all`, and do not assume any two are byte-identical).

**2.1 — category pie chart** (18-space indent):
```tsx
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
```
→
```tsx
                  <Tooltip content={<ChartTooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), name]} />} />
```

**2.2 — month bar chart** (16-space indent):
```tsx
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
```
→
```tsx
                <Tooltip content={<ChartTooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), name]} />} />
```

**2.3 — payer-by-month bar chart** (18-space indent, `as number` cast):
```tsx
                  <Tooltip formatter={(v: number) => formatCurrency(v as number)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
```
→
```tsx
                  <Tooltip content={<ChartTooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), name]} />} />
```

**2.4 — child-by-month bar chart** (20-space indent, `as number` cast):
```tsx
                    <Tooltip formatter={(v: number) => formatCurrency(v as number)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
```
→
```tsx
                    <Tooltip content={<ChartTooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), name]} />} />
```

- [ ] **Step 3: Confirm all 4 are gone**

Run: `grep -n "contentStyle" src/pages/reports/ExpensesTab.tsx`
Expected: no matches.

- [ ] **Step 4: Type-check and test**

Run: `npx tsc --noEmit`
Expected: same single pre-existing error as after Task 3b (the `Reports.tsx`/`InsightsTab` prop gap) — no new errors from this file.

Run: `npm test`
Expected: all tests pass (no test file covers `ExpensesTab.tsx`).

- [ ] **Step 5: Commit**

```bash
git add src/pages/reports/ExpensesTab.tsx
git commit -m "fix(reports): readable tooltips in ExpensesTab"
```

---

## Task 5: `IncomeTab.tsx` — swap 3 tooltips to `ChartTooltip`

**Files:**
- Modify: `src/pages/reports/IncomeTab.tsx`

**Interfaces:**
- Consumes: `ChartTooltip` from `./ChartTooltip` (Task 1).

- [ ] **Step 1: Add the import**

Add after the existing `import { byCategory, byMonth, categoryMonthMatrix } from '@/lib/reportAggregates';` line:

```tsx
import { ChartTooltip } from './ChartTooltip';
```

- [ ] **Step 2: Replace all 3 Tooltip instances individually**

All 3 lines below look similar but each has different leading whitespace and/or formatter text, so each is independently unique in the file — match and replace each one individually (do not use `replace_all`, and do not assume any two are byte-identical).

**2.1 — category pie chart** (18-space indent):
```tsx
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
```
→
```tsx
                  <Tooltip content={<ChartTooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), name]} />} />
```

**2.2 — month bar chart** (16-space indent):
```tsx
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
```
→
```tsx
                <Tooltip content={<ChartTooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), name]} />} />
```

**2.3 — payer-by-month bar chart** (20-space indent, `as number` cast):
```tsx
                    <Tooltip formatter={(v: number) => formatCurrency(v as number)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
```
→
```tsx
                    <Tooltip content={<ChartTooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), name]} />} />
```

- [ ] **Step 3: Confirm all 3 are gone**

Run: `grep -n "contentStyle" src/pages/reports/IncomeTab.tsx`
Expected: no matches.

- [ ] **Step 4: Type-check and test**

Run: `npx tsc --noEmit`
Expected: same single pre-existing error as after Task 3b — no new errors from this file.

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/reports/IncomeTab.tsx
git commit -m "fix(reports): readable tooltips in IncomeTab"
```

---

## Task 6: `BalanceTab.tsx` — swap 1 tooltip to `ChartTooltip`

**Files:**
- Modify: `src/pages/reports/BalanceTab.tsx`

**Interfaces:**
- Consumes: `ChartTooltip` from `./ChartTooltip` (Task 1).

- [ ] **Step 1: Add the import**

Add after the existing `import { fixedVariableSplit } from '@/lib/reportAggregates';` line:

```tsx
import { ChartTooltip } from './ChartTooltip';
```

- [ ] **Step 2: Replace the 1 tooltip occurrence**

```tsx
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
```

Replace with:

```tsx
                  <Tooltip content={<ChartTooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), name]} />} />
```

- [ ] **Step 3: Confirm it's gone**

Run: `grep -n "contentStyle" src/pages/reports/BalanceTab.tsx`
Expected: no matches.

- [ ] **Step 4: Type-check and test**

Run: `npx tsc --noEmit`
Expected: same single pre-existing error as after Task 3b — no new errors from this file.

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/reports/BalanceTab.tsx
git commit -m "fix(reports): readable tooltip in BalanceTab"
```

---

## Task 7: `Reports.tsx` — show category filter on Insights, wire year-picker state, add reset button

**Files:**
- Modify: `src/pages/Reports.tsx`

**Interfaces:**
- Consumes: `YEAR_OPTIONS` from `./reports/PeriodSelector` (Task 3b), `InsightsTab`'s new required props (Task 3b).
- Closes the `tsc --noEmit` gap opened by Task 3b.

- [ ] **Step 1: Update imports**

Replace:

```tsx
import { Download } from 'lucide-react';
```

with:

```tsx
import { Download, RotateCcw } from 'lucide-react';
```

Add, alongside the other local imports:

```tsx
import { YEAR_OPTIONS } from './reports/PeriodSelector';
```

- [ ] **Step 2: Add module-level default-year constants**

Add these right after the imports, before `type ReportType = ...`:

```tsx
const DEFAULT_YOY_TO_YEAR = Number(YEAR_OPTIONS[0]);
const DEFAULT_YOY_FROM_YEAR = Number(YEAR_OPTIONS[1] ?? YEAR_OPTIONS[0]);
```

- [ ] **Step 3: Add year-picker state and a `resetFilters`/`filtersChanged` pair**

Replace:

```tsx
  const [type, setType] = useState<ReportType>('expense');
  const [period, setPeriod] = useState<ReportPeriod>(() => buildPeriod('selectedYear'));
  const [category, setCategory] = useState('');

  const { transactions } = useTransactions();
```

with:

```tsx
  const [type, setType] = useState<ReportType>('expense');
  const [period, setPeriod] = useState<ReportPeriod>(() => buildPeriod('selectedYear'));
  const [category, setCategory] = useState('');
  const [yoyFromYear, setYoyFromYear] = useState(DEFAULT_YOY_FROM_YEAR);
  const [yoyToYear, setYoyToYear] = useState(DEFAULT_YOY_TO_YEAR);

  const { transactions } = useTransactions();

  const resetFilters = () => {
    setCategory('');
    setYoyFromYear(DEFAULT_YOY_FROM_YEAR);
    setYoyToYear(DEFAULT_YOY_TO_YEAR);
  };
  const filtersChanged = category !== '' || yoyFromYear !== DEFAULT_YOY_FROM_YEAR || yoyToYear !== DEFAULT_YOY_TO_YEAR;
```

- [ ] **Step 4: Reset the year-picker state when switching report type (alongside the existing category reset)**

Replace:

```tsx
          <button key={key} onClick={() => { setType(key); setCategory(''); }}
```

with:

```tsx
          <button key={key} onClick={() => { setType(key); setCategory(''); setYoyFromYear(DEFAULT_YOY_FROM_YEAR); setYoyToYear(DEFAULT_YOY_TO_YEAR); }}
```

- [ ] **Step 5: Show the category selector for every report type, and add the reset button**

Replace:

```tsx
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
```

with:

```tsx
          <PeriodSelector period={period} onChange={setPeriod} />
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-white/50">קטגוריה</p>
              {filtersChanged && (
                <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300">
                  <RotateCcw className="w-3 h-3" /> אפס סינון
                </button>
              )}
            </div>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-9 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none" dir="rtl">
              <option value="" className="bg-slate-800">כל הקטגוריות</option>
              {categoryOptions.map((c) => <option key={c} value={c} className="bg-slate-800">{c}</option>)}
            </select>
          </div>
```

- [ ] **Step 6: Pass the new props to `InsightsTab`**

Replace:

```tsx
      {type === 'insights' && <InsightsTab transactions={transactions} period={period} category={category} />}
```

with:

```tsx
      {type === 'insights' && (
        <InsightsTab
          transactions={transactions} period={period} category={category}
          yoyFromYear={yoyFromYear} yoyToYear={yoyToYear} setYoyFromYear={setYoyFromYear} setYoyToYear={setYoyToYear}
        />
      )}
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: **0 errors** — this closes the gap opened by Task 3b.

- [ ] **Step 8: Run the test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/pages/Reports.tsx
git commit -m "feat(reports): show category filter on Insights tab; wire YoY year state + reset-filters button"
```

---

## Task 8: Full verification + manual browser check

**Files:** none modified — verification only.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`
Expected: all tests pass — this is the full suite for the repo (no new test files were added by this plan beyond Task 2's `insights.test.ts` changes).

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 4: Manual verification in the browser**

This repo requires live Firebase credentials (no local `.env` in this environment) to run interactively with real data — the same constraint noted when the drill-down feature shipped. If credentials are available, start the dev server (`npm run dev`), navigate to `/reports`, and confirm:
- Category dropdown is visible and functional on all 4 report types, including תובנות (Insights).
- Switching to the Insights tab's תזרים חזוי (forecast) subtab and picking a category actually narrows the forecast numbers (this was the bug fixed in Task 3a).
- Insights → השוואה shows two year dropdowns ("מ" / "עד"); changing either re-renders the chart for exactly those two years, including a non-adjacent pair (e.g. earliest year vs. current year).
- Every chart tooltip across all 4 report tabs (Expenses, Income, Balance, Insights) shows clearly readable label + value text regardless of the underlying series color — specifically re-check the payer pie chart in Insights → משלמים, which is the exact chart from the original bug report.
- "אפס סינון" appears only once a category or year selection differs from default, and clicking it restores both to default in one click.
- Switching the top-level report type (e.g. הוצאות → תובנות) clears both the category and the year-comparison selection.

If anything looks wrong, fix the source before considering this plan complete.

---

## Self-Review Notes

**Spec coverage:** item 1 (category filter visibility + forecast bug) → Task 3a Step 2, Task 7 Step 5; item 2 (selectable YoY years) → Task 2, Task 3b; item 3 (readable tooltips) → Task 1 + Tasks 3a/3b/4/5/6 (all 16 call sites across 4 files); item 4 (reset button) → Task 7 Steps 3-5.

**Type consistency:** `ChartTooltip`'s `formatter` shape (`(value: number, name: string) => [string, string]`) is identical across every call site in Tasks 3a, 3b, 4, 5, 6 — verified no call site left the old bare-string-return shape. `yearOverYear(allExpenses, years: number[])` signature is consistent between Task 2's implementation and Task 3b's two call sites (`yoyForAnalyst`, `yoyChart`). `InsightsTab`'s 4 new prop names (`yoyFromYear`, `yoyToYear`, `setYoyFromYear`, `setYoyToYear`) match exactly between Task 3b's signature and Task 7's call site.

**Placeholder scan:** no TBDs — every step shows complete code.
