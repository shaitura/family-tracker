# Reports page — live browser harness

Runs `src/pages/Reports.tsx` and its four tabs in a real browser against a
deterministic seed, so the period selector can be exercised without Firestore
credentials. Only `@/hooks/useTransactions` is replaced (`useTransactions.ts`);
everything below it — the tabs, `reportPeriod`, `reportAggregates`, `insights` —
is the real product code.

The seed is built to fail loudly, not to pass: amounts are month-indexed so any
total decodes to exactly one window, and two outliers (₪999,999 in 2024-03,
₪888,888 in 2025-07) sit outside every short window. A slicer that stops
filtering shows six figures where four belong.

`verify.mjs` checks the KPI totals across 4 tabs x 11 period configurations,
`verify2.mjs` the sub-tabs, `verify3.mjs` that the by-month charts actually
render marks. Their expected values are computed from the seed by a separate
implementation that deliberately does **not** import `reportPeriod.ts` — the
window arithmetic is the thing under test, so it cannot also be the oracle.

```
npx vite --config harness/vite.config.ts     # serves 127.0.0.1:5178
node harness/verify.mjs && node harness/verify2.mjs && node harness/verify3.mjs
```

Needs `playwright` (`npm i -D playwright`, or any checkout that has it). The
drivers point at `/opt/pw-browsers/chromium` via `executablePath`; change that
line if your Chromium lives elsewhere. Note `xlsx` installs only from
cdn.sheetjs.com, so on a network that blocks it, install without the package and
stub it in `node_modules` — the harness never touches the export paths.

## Expenses page (`pages.html`)

`harness/pages.html` runs the real `Layout` + `Transactions` page (and the
`ErrorBoundary`) on the same seed plus one legacy row that lacks the fields the
type calls required — the shape that used to blank the page on a search.
`@/lib/firebase` is swapped for a dummy-config stub (`firebase.ts`), since the
real one throws at import time without an `.env`. `#/boom` renders a component
that throws, to see the boundary. Open
`http://127.0.0.1:5178/harness/pages.html#/` after starting the server above.

## Assets page, percent mode (`assets.html`)

`harness/assets.html` runs the real `Assets` page with its `['assets']` and
`['transactions']` queries pre-filled (`assets-main.tsx`), so "הצגה באחוזים"
can be checked without Firestore. The seed amounts are distinctive digit runs
(1,234,567 / 2,109,876 / 2,468 ...), one holding is under 1% of the whole, and
one policy has matching payments. The check: with the mode on, every tab's
`innerText`, and every pie tooltip on hover, contains no `₪` and no 3+ digit
number that is not a percentage, a year or a `#policy`. With the mode off, the
same scan must find the amounts; that is the proof the scan can see them.
Open `http://localhost:5178/harness/assets.html#/`. Note: in a background
browser pane the pie may not draw on first mount; a re-render (toggle the mode)
draws it. That happens with the mode off too and is not caused by the mode.
