# Unified Reports Page — Design Spec

**Date:** 2026-07-27
**Status:** Design approved by Shai section-by-section; pending final written-spec review before handoff to implementation planning.
**Repo:** `family-tracker` (this repo)

## 1. Problem & scope

Three report pages evolved independently and now overlap and diverge:

- **`src/pages/Reports.tsx`** — type toggle (הוצאות/הכנסות/מאזן), period = absolute year + (single month OR full year), category/payer/fixed-variable tabs, Excel + PDF export, per-child breakdown card.
- **`src/pages/AnnualAnalysis.tsx`** — always full calendar year, 3 tabs (fixed/variable, income-by-payer, net-profit), each with richer *monthly-granular* tables/charts than Reports has, including a unique category×month matrix (expenses only).
- **`src/pages/Trends.tsx`** — a *different* period model (rolling window ending today: month/quarter/year/18m/all, not calendar-aligned), 5 tabs (מגמות, השוואה, חריגות, משלמים, דליפות) built on rule-based heuristics (no LLM calls — see §7).

None of the three can express an arbitrary custom month range. This spec unifies all three into **one page, "דוחות"**, replacing all three routes, and adds the custom-range capability that doesn't exist anywhere today. It also folds in a small set of new "family financial planner" analyses that ride on data already in the app (RecurringRule, per-child tagging) — see §3.

**Explicitly out of scope for this round** (§8 has the full list): budget-vs-actual tracking (the family doesn't use the `Budget` entity), and any cross-reference into the `Assets` page/entity (net-worth-style analysis) — both deferred to a future round.

## 2. Unified period model

Today's three period paradigms (Reports: absolute year+month/full-year; AnnualAnalysis: always full calendar year; Trends: rolling window from today) are unified into **one internal representation**: an inclusive `{ startMonth: 'YYYY-MM', endMonth: 'YYYY-MM' }` range — the same shape `RecurringRule` already uses, so the period engine reuses `monthsInRange()` from `src/lib/recurrence.ts` rather than inventing a new date-range primitive.

The period selector shows quick-pick pills that all just populate this one range:

| Pill | Sets |
|---|---|
| החודש הנוכחי | start = end = current month |
| שנה נבחרת | start = Jan, end = Dec of a chosen year (year picker shown alongside) |
| רבעון אחרון | start = 2 months ago, end = current month |
| 12 חודשים אחרונים | start = 11 months ago, end = current month |
| 18 חודשים אחרונים | start = 17 months ago, end = current month |
| כל הזמן | no date filter (sentinel, not a real range) |
| **טווח מותאם** (new) | two free month-pickers: מחודש / עד חודש |

Every downstream computation (category/month/payer/fixed-variable/anomalies/trends) consumes "the list of months in range" and does not need to know which quick-pick produced it.

**Anomaly detection generalizes for free**: it already compares "current period" vs. "an equal-length prior period" in `Trends.tsx` — this works unchanged for any range, including custom ones.

**Leak detection stays period-independent**: it scans *all* history for recurring-looking variable expenses (≥3 months of a similar description) — this is inherently a multi-month pattern scan, not a "this period" question, so it ignores the period selector entirely (as it does today).

## 3. Top-level structure

The existing type toggle in `Reports.tsx` (הוצאות/הכנסות/מאזן) gets a **4th pill: תובנות**, which absorbs all of `Trends.tsx`.

| Type | Sub-tabs |
|---|---|
| **הוצאות** | לפי קטגוריה (+ category×month matrix when the range spans >1 month) · לפי חודש · לפי משלם · קבועה/משתנה · per-child card at the bottom, **enhanced** with a multi-month trend chart when the range spans >1 month |
| **הכנסות** | לפי קטגוריה (+ matrix) · לפי חודש · לפי משלם |
| **מאזן** | existing balance KPIs (income/expense/net/savings-rate, expense-ratio, investment-ratio) + **new** KPI card: שיעור התחייבות קבועה מההכנסה (`fixedTotal ÷ incomeTotal` — both already computed) + monthly income-vs-expense chart/table when range spans >1 month |
| **תובנות** (new, = all of Trends + 2 new items) | מגמות · השוואה (YoY 3-year + seasonal peaks + payment-method-over-time — all already built) · חריגות · משלמים (category×payer combined — kept **separate** from "לפי משלם" above per Shai's explicit call) · דליפות · **[new] תזרים חזוי** · **[new] "שונות" כאינדיקטור** |

**"לפי משלם" (both types)**: shows a period-total bar (today's Reports behavior) when the range is a single month, and automatically breaks down by month (like AnnualAnalysis's income tab today) whenever the range spans more than one month — this generalization was an explicit decision, not income-only.

## 4. The 4 new analyses actually being built

(Of the 8 ideas discussed, budget-vs-actual is excluded — no budget usage today — and net-worth/Assets is deferred — different entity, no shared date model. yoy-compare and payment-method-breakdown are **already implemented** in `Trends.tsx`'s "השוואה" tab and just need to be surfaced under תובנות, not rebuilt.)

| Analysis | Where | Computation |
|---|---|---|
| שיעור התחייבות קבועה | KPI card under מאזן | `fixedTotal ÷ incomeTotal` for the selected range |
| תזרים חזוי קדימה | New תובנות sub-tab | Mostly already works: any `RecurringRule` whose `end_month` is in the future already projects `status:'future'` virtual transactions via `useTransactions()`. Add: an estimate for future *variable* spend = average of the last 3–6 months' variable total, shown alongside the known recurring commitments. |
| מגמת עלות פר-ילד | Extends the existing per-child card (הוצאות type) | Same by-month accumulation pattern already used in `AnnualAnalysis.tsx`'s `expByCatMonth`, applied to `t.child` instead of `t.category`. Only rendered when the range spans >1 month. |
| "שונות" כאינדיקטור-איכות | Small card under תובנות | Monthly total + % share of total expenses for the "שונות" category across the range; a month is flagged when its share crosses a threshold (e.g. >15%). |

## 5. Exports

Excel and PDF export (currently in `Reports.tsx`, covering transactions/category/month/payer/fixed-variable, only for a single month or a single full year) get generalized to work over **any** period range, including custom ranges. Scope stays the same set of sheets/sections as today — **תובנות content (insights, anomalies, leaks, cashflow forecast) is not exported this round**, screen-only.

## 6. Known issue to fix opportunistically

While migrating `Trends.tsx`'s "מגמות" tab: the "סה״כ הוצאות חודשי" bar chart is mislabeled — it actually renders `dataKey={topCategories[0] ?? 'total'}` (the top category only, not the true monthly total). Fix this while rewriting the tab, not as a separate task.

## 7. Note on "AI"

Nothing in `Trends.tsx` calls an LLM. "חריגות" = ≥30% deviation vs. a prior-period moving average (with minimum-amount thresholds to avoid noise); "דליפות" = grouping near-identical `sub_category`/`notes` text appearing in ≥3 distinct months; "סיכום מנהלים" = an ordered sequence of `if`/`else` rules that generate Hebrew sentences from the computed stats. All client-side, already working, ports over as-is — no new AI/LLM infrastructure needed for this round.

## 8. Explicitly out of scope

- Budget-vs-actual tracking (`Budget` entity unused by this family today).
- Net-worth / `Assets` entity cross-reference — separate future round (different entity, no shared date model, flagged by Shai as the highest-risk idea to fold in blind).
- Excel/PDF export of תובנות tab content.
- Multi-select category filter (stays single-select, as already shipped).
- Editing a `RecurringRule`'s `end_month` from this page (out of an earlier round too).

## 9. Migration & deprecation

- Route `/reports` becomes the unified page.
- `NAV_ITEMS` in `src/components/Layout.tsx` drops the `שנתי` (`/annual-analysis`) and `מגמות` (`/trends`) entries.
- After the unified page is verified live (see §10), delete `src/pages/AnnualAnalysis.tsx` and `src/pages/Trends.tsx` outright — not just unlinked from nav.

## 10. Verified by

On the live app after deploy, per type:
- **הוצאות**: pick a custom range spanning a year boundary → category pie + matrix + per-child trend all reflect it; switch to "שנה נבחרת" → matches today's AnnualAnalysis numbers for that year exactly.
- **הכנסות**: same range → payer breakdown shows monthly granularity.
- **מאזן**: commit-rate KPI appears and is sane (0–100%).
- **תובנות**: all 5 ported sub-tabs render with real data; תזרים חזוי shows upcoming known RecurringRule commitments; "שונות" card flags at least one real month if applicable.
- **Export**: Excel/PDF succeed for a custom range.
- Old `/annual-analysis` and `/trends` routes/nav items are gone; bottom nav still fits without crowding.

## Appendix: Visual reference (Google Stitch)

A Stitch project was created for this design: `projects/8796654353386721974` ("Family Tracker — דוחות מאוחדים"). Its auto-generated design system, **"Luminous Hebrew Finance,"** captured the app's existing visual language precisely and can be treated as the canonical token reference:

- Background: `#0e1416` → `#343a3c` diagonal dark gradient (never light).
- Accent trio: cyan `#22d3ee` / purple `#a855f7` / pink `#ec4899`.
- Semantic: emerald = positive/income, rose = negative/expense, amber = warning, purple = קבועה, cyan = משתנה.
- Cards: 20px radius, 5%-white fill, 10%-white border, `backdrop-filter: blur(10px)`.
- Interactive elements: fully pill-shaped (`border-radius: 9999px`).
- Font: Be Vietnam Pro. RTL throughout.

Full-screen mockups (הוצאות/מאזן/תובנות) were requested from Stitch but did not finish generating within a reasonable wait (~10 minutes, 2 attempts) — likely a transient Stitch-side issue. The project may still complete the screens asynchronously; check `projects/8796654353386721974` directly in Stitch before implementation if a visual reference beyond the token list above is wanted. Not a blocker — the token set plus the existing live pages (Reports/AnnualAnalysis/Trends) are sufficient to implement from.
