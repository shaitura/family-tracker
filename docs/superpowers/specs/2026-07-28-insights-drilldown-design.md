# Insight drill-down — design spec

**Date:** 2026-07-28
**Scope:** `src/pages/reports/InsightsTab.tsx`, `src/lib/insights.ts`, `src/lib/insights.test.ts`

## Problem

Every insight in the תובנות tab (סיכום card, 🧠 ניתוח אנליסט card, חריגות sub-tab, דליפות
sub-tab) is currently rendered as a plain sentence — e.g. "עלייה חריגה בהוצאות תקשורת".
There is no way to see *which* transactions produced that sentence. The user has to go
find them manually in the raw transaction list.

## Goal

Every insight card that has a well-defined underlying transaction set becomes expandable
(accordion, click-to-toggle). Expanding shows the top 10 contributing transactions
(sorted by amount, descending) — date, category/note, payer, amount.

## Scope (explicit)

Applies to **all** insight surfaces in InsightsTab.tsx:
- "סיכום" card (`execItems`, from `executiveSummary()`)
- "🧠 ניתוח אנליסט" card (`analystItems`, from `analystInsights()`)
- חריגות sub-tab (`anomalies`, from `findAnomalies()`)
- דליפות sub-tab (`leaks`, from `findLeaks()`)

Out of scope: the chart-only sub-tabs (מגמות, השוואה, משלמים, תזרים חזוי, שונות) — those
are visualizations, not narrative "sentence" insights, and don't fit the same
click-to-expand pattern.

## Architecture

**The supporting-transaction list is computed inside `insights.ts`, next to the
heuristic that derives the insight — not re-derived in the component.**

Rationale: each insight function already has (or can easily receive) the exact
transaction subset that produced its conclusion. Computing the "proof" list anywhere
else means re-implementing the same filter twice, which drifts the moment one side
changes. `insights.ts` is already the single source of truth for every other derived
number in this tab; the drill-down list is just one more derived value.

Cost: two functions that today only take pre-aggregated arrays need an additional
`allExpenses` parameter so they can produce a raw-transaction list:
- `seasonalHeadsUp(seasonal, now)` → `seasonalHeadsUp(seasonal, allExpenses, now)`
- `yoySameMonthInsight(yoy, currentYear, now)` → `yoySameMonthInsight(yoy, allExpenses, currentYear, now)`

Both changes are internal to `insights.ts` and its test file — `analystInsights()`
(the only caller in the component) already receives `allExpenses`, so it just threads
it through. No component-level signature changes.

## Type changes

```ts
export interface ExecItem { icon: string; text: string; level: ...; saving?: number; transactions: Transaction[] }
export interface AnalystInsight { icon: string; headline: string; detail: string; level: ...; transactions: Transaction[] }
export interface Anomaly { category: string; currentAmount: number; movingAvg: number; deviation: number; level: ...; transactions: Transaction[] }
export interface Leak { name: string; category: string; monthlyAvg: number; yearlyEstimate: number; months: number; occurrences: number; isSubscription: boolean; transactions: Transaction[] }
```

`transactions` is always present (never optional) — an empty array means "no
drill-down available," which the UI treats as non-expandable. In practice every
insight in scope has a non-empty list; the empty case exists only as a defensive
default (e.g. an insight recomputed with data that no longer matches).

All `transactions` arrays are pre-sorted by `amount` descending and capped at 10
entries at the source (`insights.ts`), not at render time.

## Per-insight transaction source

| Insight | Source function | Transaction filter |
|---|---|---|
| הוצאות בתקופה גבוהות/נמוכות/יציבות | `executiveSummary` | `expenses` (= period+category-filtered window), all categories |
| חריגה בקטגוריית X (סיכום card) | `executiveSummary` (reuses the matching `Anomaly.transactions`) | הוצאות קטגוריה X בתקופה |
| קטגוריה מובילת X | `executiveSummary` | הוצאות קטגוריה X בתקופה |
| זוהו N הוצאות קבועות (leaks summary line) | `executiveSummary` | union of all `Leak.transactions`, re-sorted/capped to 10 |
| יחס הוצאות/הכנסה, חיסכון/גירעון | `executiveSummary` | `expenses` (same set as the top-level period line) |
| X% מההוצאות קבועות | `executiveSummary` | `expenses.filter(expense_class === 'קבועה')` |
| חריגה בקטגוריית X (חריגות tab card) | `findAnomalies` | הוצאות קטגוריה X בחודשי `months` (התקופה הנוכחית) |
| דליפה בודדת (דליפות tab card) | `findLeaks` | הטרנזקציות שהורכבו לתוך אותה קבוצת-דליפה (זהות ל-`occurrences`, ממילא ≤10 ברוב המקרים) |
| "X עולה/יורדת בעקביות" | `categoryTrendInsights` | הוצאות קטגוריה X בחלון ה-lookback (4 חודשים) |
| "X הוא בד״כ חודש-שיא" | `seasonalHeadsUp` | הוצאות מכל ההיסטוריה שנפלו בחודש הקלנדרי הנוכחי (כל השנים) |
| "חודש Y השנה גבוה/נמוך מאשתקד" | `yoySameMonthInsight` | הוצאות חודש Y **בשנה הנוכחית בלבד** (ההסבר לפער) |
| "התקציב נוטה יותר ל-X" | `categoryShareShift` | הוצאות קטגוריה X בחלון ה"אחרון" (6 חודשים) |

## `findLeaks` change

`findLeaks` already groups matching transactions internally (`groups[key].amounts`,
`.months`) but discards the actual `Transaction` objects after aggregating. It needs
to also accumulate `transactions: Transaction[]` per group, sorted by amount desc,
capped to 10, and return it on each `Leak`.

## UI behavior (`InsightsTab.tsx`)

- Each insight card renders a chevron affordance when `transactions.length > 0`.
- Clicking anywhere on the card toggles an inline expansion below the existing
  text/detail — no modal, no navigation.
- Expansion renders a compact list: `DD/MM/YYYY · category (· sub_category/notes if
  present) · payer initial · amount`, RTL, using the existing `formatCurrency` and
  `LEVEL_STYLE` conventions already in the file.
- Expand/collapse state is local per card group (`useState<Set<number>>` keyed by
  array index), independent across the four card groups (סיכום, ניתוח אנליסט, חריגות,
  דליפות). Index-based keys are acceptable here — these lists don't reorder while a
  card is expanded (they only recompute on transaction-data or period changes, which
  already re-renders the whole tab).
- No new dependency — reuses `lucide-react` for the chevron icon (already imported).

## Testing

`insights.test.ts` (23 existing tests) gets:
- Assertions that `transactions` is present, correctly sorted, and capped at 10 on the
  functions that gain it (`findAnomalies`, `findLeaks`, `executiveSummary`,
  `categoryTrendInsights`, `seasonalHeadsUp`, `yoySameMonthInsight`,
  `categoryShareShift`).
- Updated call sites for the two functions whose signature changes
  (`seasonalHeadsUp`, `yoySameMonthInsight`) to pass `allExpenses`.
- No existing assertion changes behavior — this is a strictly additive field.

No new test file; extends the existing one, consistent with how every other
insights.ts function is tested today.

## Non-goals

- No LLM involvement — stays 100% rule-based, consistent with every other function in
  `insights.ts`.
- No new backend/Firestore reads — all data already loaded into `transactions` at the
  page level.
- No changes to the chart-only sub-tabs (מגמות, השוואה, משלמים, תזרים חזוי, שונות).
- No configurable "top N" — hardcoded at 10 per the approved scope.
