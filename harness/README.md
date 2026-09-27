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
