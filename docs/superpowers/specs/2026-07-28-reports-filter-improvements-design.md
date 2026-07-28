# Reports page — filter & readability improvements (round 2)

**Date:** 2026-07-28
**Scope:** `src/pages/Reports.tsx`, `src/pages/reports/PeriodSelector.tsx`, `src/pages/reports/InsightsTab.tsx`, `src/pages/reports/ExpensesTab.tsx`, `src/pages/reports/IncomeTab.tsx`, `src/pages/reports/BalanceTab.tsx`, `src/lib/insights.ts`, `src/lib/insights.test.ts`

## Problem

Four separate, user-reported gaps in the `/reports` page, found after the insights drill-down feature shipped:

1. The category filter already works end-to-end inside `InsightsTab` (every data function already respects the `category` prop) but its UI selector is hidden specifically when the תובנות (Insights) tab is active — `Reports.tsx` gates it behind `{type !== 'insights' && (...)}`. Users cannot see or set it there at all.
2. The "השוואה שנה-על-שנה" (year-over-year) chart inside Insights → השוואה hardcodes the 3 years `currentYear-2, currentYear-1, currentYear` — there is no way to compare two arbitrary years (e.g. 2022 vs 2026, or any pair other than "now vs the last two").
3. Every chart tooltip across the reports page renders each series' value using that series' own color as the *text* color (a recharts default) instead of a fixed, readable color — on this app's dark background, low-contrast series colors (purple, indigo) become close to unreadable. Confirmed with a screenshot: a payer-breakdown pie tooltip showing `שי : 101,004` in near-invisible dark-on-dark text.
4. There is no single control to clear an applied category filter (or, once built, the new year-comparison selection) back to defaults — a user has to manually reset the `<select>` back to "כל הקטגוריות".

## Goal

1. Category filter is visible and functional on every report type, including Insights, and every subtab within Insights actually respects it (a real bug was found: the "תזרים חזוי" forecast subtab currently filters from the raw `transactions` array instead of the category-filtered `allExpenses`, so it silently ignores the category filter today).
2. The year-over-year chart in Insights → השוואה becomes two "משנה" / "עד שנה" dropdowns; picking any two years re-renders the chart for exactly those two years.
3. Every `Tooltip` on the reports page (Expenses, Income, Balance, Insights — 4 files) renders through one shared, readable tooltip component: fixed light text color for labels and values, series color demoted to a small swatch rather than the text color itself.
4. A "אפס סינון" (reset filter) button appears next to the category selector, visible only when something is non-default, and resets both the category and the year-comparison selection (not the period selector — it already has its own quick-pick reset behavior and wasn't reported as a problem).

## Architecture

### 1. Category filter visibility + forecast bug

`Reports.tsx` already computes the right category list for a mixed expense+income tab (the `else` branch of its ternary, `[...CATEGORIES, ...INCOME_CATEGORIES]`, already covers `'balance'` and will cover `'insights'` once the gate is removed — no list-computation change needed). Fix is two lines:
- Remove the `type !== 'insights'` condition wrapping the category `<select>` block.
- In `InsightsTab.tsx`, `futureExpenses` and `recentVariable` (used only by the "תזרים חזוי" forecast subtab) currently filter `transactions` directly with no category check. Add `(!category || t.category === category)` to both filters, matching the pattern every other derived value in the file already uses via `allExpenses`.

### 2. Selectable year-over-year comparison

`yearOverYear()` in `insights.ts` changes signature from `(allExpenses, currentYear: number)` — which hardcodes "this year and the 2 before it" — to `(allExpenses, years: number[])`, summing each of the 12 calendar months for exactly the years passed in. This generalization has two independent callers after the change, so neither breaks the other:

- **`analystInsights()`'s internal use** (the "🧠 ניתוח אנליסט" card's `yoySameMonthInsight` sub-analysis, which is unrelated to the visible chart and always needs `currentYear` vs `currentYear-1` specifically): calls `yearOverYear(allExpenses, [currentYear - 1, currentYear])`.
- **The new visible chart**, driven by two dropdowns' state: calls `yearOverYear(allExpenses, [yoyFromYear, yoyToYear])`.

State ownership: `yoyFromYear`/`yoyToYear` are lifted to `Reports.tsx` (alongside the existing `category`/`period` state) rather than kept local to `InsightsTab`, so the new "אפס סינון" button (item 4) has one place to reset every filter. `Reports.tsx` passes them down as props plus their setters, the same pattern already used for `category`.

Defaults: `toYear = currentYear`, `fromYear = Math.max(EARLIEST_YEAR, currentYear - 1)` (clamped for the case where only one year of data exists) — this reproduces today's most useful pairing (current year vs. last year) as the starting view, so nothing looks different until the user changes it.

The dropdown options reuse the exact same year list `PeriodSelector.tsx` already computes for its "שנה נבחרת" picker (`EARLIEST_YEAR..currentYear`) — that array gets exported from `PeriodSelector.tsx` instead of staying module-private, so it isn't computed twice with two chances to drift.

The chart's Bars become a `.map()` over `Array.from(new Set([yoyFromYear, yoyToYear]))` (deduped, so picking the same year twice renders one bar instead of two colliding React keys) instead of three hardcoded `<Bar dataKey={currentYear-2}>` / `-1` / `` elements.

### 3. Shared, readable chart tooltip

New file `src/pages/reports/ChartTooltip.tsx` exports one component used everywhere a recharts `<Tooltip>` currently sets `contentStyle`. Root cause of the unreadable-text bug: recharts' default tooltip content colors each value row using that series' own color (`entry.color`) as the CSS `color` of the text itself — `contentStyle`/`labelStyle`/`itemStyle` tuning can't reliably override this per-row behavior, since `itemStyle` is *merged into*, not replacing, the per-row inline color recharts sets. The durable fix is to stop using recharts' default content renderer entirely and supply a fully custom one via the `content` prop:

```tsx
interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ name?: string | number; value?: number; color?: string; dataKey?: string | number }>;
  formatter?: (value: number, name: string) => [string, string]; // [formattedValue, formattedName]
}
export function ChartTooltip({ active, label, payload, formatter }: ChartTooltipProps) { ... }
```

Rendering rule: the label (month/category name at the top) and every value are always rendered in a fixed light color (`#fff` for values, `#e2e8f0` for names) against a fixed dark background (`#1e293b`, the lighter of the two shades already in use, standardized everywhere). The series/slice color still appears — as an 8×8px swatch to the left of each row — so the color-to-series mapping a user has already learned from the chart itself is preserved, just no longer used as illegible text color.

Because a custom `content` bypasses recharts' own `formatter`/`labelFormatter` props, every existing `<Tooltip formatter={...} contentStyle={...}>` call site becomes `<Tooltip content={<ChartTooltip formatter={...} />} />`, and every `formatter` is normalized to the `(value, name) => [string, string]` tuple shape (a few call sites already return tuples; the rest currently return a bare formatted string and rely on recharts to pair it with an auto-derived name — those gain an explicit second return value). This is mechanical and touches all 14 existing `Tooltip` instances across the 4 files; the various now-redundant inline `contentStyle` objects (`ExpensesTab`/`IncomeTab`/`BalanceTab`'s repeated `{ background: '#1e293b', ... }` literal, and `InsightsTab`'s `TT` const) are deleted.

### 4. Reset filter button

`Reports.tsx` gains a `resetFilters()` that sets `category` back to `''` and (if the insights-only year state is non-default) resets `yoyFromYear`/`yoyToYear` back to their computed defaults. A small button — icon (`RotateCcw` from `lucide-react`) + "אפס סינון" label — renders next to the "קטגוריה" label, conditionally: only when `category !== '' || yoyFromYear !== defaultFromYear || yoyToYear !== defaultToYear`. Switching the top-level report `type` (the existing `{ setType(key); setCategory(''); }` handler) also resets the year state now, for the same reason it already resets category — a stale, tab-specific filter shouldn't silently carry over when the user switches to a different report type.

The period selector is explicitly out of scope for this reset — it already exposes its own default-restoring quick-picks, and it wasn't part of the user's request.

## Non-goals

- No change to what `category` *means* per report type — still a single flat string, still resolved against the combined expense+income category list for mixed tabs (balance, insights), exactly as today.
- No multi-year (>2) comparison UI — the approved design is exactly two dropdowns, not a checkbox list. If a wider comparison is wanted later, it's a separate iteration.
- No redesign of the period selector or its own reset/quick-pick behavior.
- `ChartTooltip` is a rendering component only — no new data aggregation, no new hover interactions (click, pinning) beyond what recharts' default `active`/`payload` hover already provides.

## Testing

- `insights.test.ts`: update the existing `yearOverYear` test call site (`yearOverYear(all, 2026)` → `yearOverYear(all, [2024, 2025, 2026])` matching its own assertions), and add a new test asserting an arbitrary 2-element year array (e.g. `[2022, 2026]`, non-adjacent) produces exactly those two columns and no others.
- No new test infrastructure — `ChartTooltip.tsx` is a presentational component in a repo with no component-test setup (established precedent from the drill-down work); verified visually, not unit-tested.
- Manual verification (this repo requires live Firebase credentials not available in this sandboxed environment — flag this again explicitly when the plan reaches its verification task, same caveat as the drill-down feature): category filter narrows every Insights subtab including forecast; year dropdowns re-render the chart for an arbitrary non-adjacent pair; tooltip text is readable on every chart in all 4 report tabs; reset button appears/disappears correctly and clears exactly the two filters it owns.
