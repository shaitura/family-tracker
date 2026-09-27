import { chromium } from 'playwright';
import { buildSeed, MONTHS } from './seed.mjs';

const SEED = buildSeed();

// ── Independent oracle. Deliberately does NOT import reportPeriod.ts: the app's
// own window maths is the thing under test, so the expected values are derived
// from the seed with a separate implementation.
function monthRange(start, end) {
  const out = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
function oracle(win) {
  const hit = (t) => win === 'all' ? true : (t.date.slice(0, 7) >= win[0] && t.date.slice(0, 7) <= win[1]);
  const rows = SEED.filter(hit);
  const exp = rows.filter(t => t.type === 'expense');
  const inc = rows.filter(t => t.type === 'income');
  const sum = (a) => a.reduce((s, t) => s + t.amount, 0);
  const expTotal = sum(exp), incTotal = sum(inc);
  const fixedExp = sum(exp.filter(t => t.expense_class === 'קבועה'));
  return {
    expTotal, expCount: exp.length, incTotal, incCount: inc.length,
    net: incTotal - expTotal,
    savePct: incTotal > 0 ? Math.round((incTotal - expTotal) / incTotal * 100) : 0,
    expRatio: incTotal > 0 ? Math.round(expTotal / incTotal * 100) : null,
    fixedExp,
    months: win === 'all' ? null : monthRange(win[0], win[1]).length,
    priorWin: win === 'all' ? 'all' : (() => {
      const len = monthRange(win[0], win[1]).length;
      const shift = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 - n, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
      const pe = shift(win[0], 1);
      return [shift(pe, len - 1), pe];
    })(),
  };
}

const PERIODS = [
  { key: 'currentMonth', chip: 'החודש הנוכחי',        win: ['2026-08', '2026-08'] },
  { key: 'lastMonth',    chip: 'חודש קודם',            win: ['2026-07', '2026-07'] },
  { key: 'year2026',     chip: 'שנה נבחרת', year: '2026', win: ['2026-01', '2026-12'] },
  { key: 'year2025',     chip: 'שנה נבחרת', year: '2025', win: ['2025-01', '2025-12'] },
  { key: 'year2024',     chip: 'שנה נבחרת', year: '2024', win: ['2024-01', '2024-12'] },
  { key: 'year2022',     chip: 'שנה נבחרת', year: '2022', win: ['2022-01', '2022-12'] }, // empty-window edge case
  { key: 'lastQuarter',  chip: 'רבעון אחרון',          win: ['2026-06', '2026-08'] },
  { key: 'last12',       chip: '12 חודשים אחרונים',    win: ['2025-09', '2026-08'] },
  { key: 'last18',       chip: '18 חודשים אחרונים',    win: ['2025-03', '2026-08'] },
  { key: 'allTime',      chip: 'כל הזמן',              win: 'all' },
  { key: 'custom',       chip: 'טווח מותאם', custom: ['2024-02', '2024-04'], win: ['2024-02', '2024-04'] },
];

const results = [];
const errs = [];
const execTexts = [];
const num = (s) => s == null ? null : Number(s.replace(/[₪,\s]/g, ''));
function check(label, actual, expected) {
  const ok = String(actual) === String(expected);
  results.push({ label, actual, expected, ok });
  if (!ok) console.log(`  ✗ ${label}: got ${actual}, expected ${expected}`);
}

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 430, height: 4000 } });
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
await p.goto('http://127.0.0.1:5178/harness/index.html', { waitUntil: 'networkidle' });
await p.waitForTimeout(600);

const clickTab = async (name) => { await p.getByRole('button', { name, exact: true }).click(); await p.waitForTimeout(350); };

async function applyPeriod(P) {
  await p.getByRole('button', { name: P.chip, exact: true }).click();
  await p.waitForTimeout(250);
  if (P.year) { await p.locator('select').first().selectOption(P.year); await p.waitForTimeout(250); }
  if (P.custom) {
    const ins = p.locator('input[type=month]');
    await ins.nth(0).fill(P.custom[0]); await p.waitForTimeout(200);
    await ins.nth(1).fill(P.custom[1]); await p.waitForTimeout(250);
  }
  await p.waitForTimeout(300);
}

for (const P of PERIODS) {
  const E = oracle(P.win);
  console.log(`\n### ${P.key}  win=${JSON.stringify(P.win)}  expect exp=${E.expTotal} inc=${E.incTotal}`);

  // ── הוצאות
  await clickTab('💸 הוצאות');
  await applyPeriod(P);
  let t = await p.innerText('body');
  check(`${P.key}/expenses/total`, num((t.match(/סה"כ הוצאות\s*\n+\s*(₪[\d,]+)/) || [])[1]), E.expTotal);
  check(`${P.key}/expenses/count`, Number((t.match(/(\d+)\s*עסקאות/) || [])[1]), E.expCount);
  if (E.months && E.months > 1 && E.expCount > 0) {
    const cols = await p.locator('table thead th').count();
    check(`${P.key}/expenses/matrix-cols`, cols, E.months + 3); // category + N months + total + avg
  }

  // ── הכנסות
  await clickTab('💰 הכנסות');
  await applyPeriod(P);
  t = await p.innerText('body');
  check(`${P.key}/income/total`, num((t.match(/סה"כ הכנסות\s*\n+\s*(₪[\d,]+)/) || [])[1]), E.incTotal);
  check(`${P.key}/income/count`, Number((t.match(/(\d+)\s*עסקאות/) || [])[1]), E.incCount);

  // ── מאזן
  await clickTab('📊 מאזן');
  await applyPeriod(P);
  t = await p.innerText('body');
  check(`${P.key}/balance/income`,  num((t.match(/💰 הכנסות\s*\n+\s*(₪[\d,]+)/) || [])[1]), E.incTotal);
  check(`${P.key}/balance/expense`, num((t.match(/💸 הוצאות\s*\n+\s*(₪[\d,]+)/) || [])[1]), E.expTotal);
  check(`${P.key}/balance/net`,     num((t.match(/📊 מאזן\s*\n+\s*(-?₪[\d,]+)/) || [])[1]), E.net);
  check(`${P.key}/balance/savePct`, Number((t.match(/🏦 שיעור חיסכון\s*\n+\s*(-?\d+)%/) || [])[1]), E.savePct);
  check(`${P.key}/balance/expRatio`, (t.match(/יחס הוצאה\/הכנסה\s*\n+\s*(—|-?\d+%)/) || [])[1], E.expRatio == null ? '—' : `${E.expRatio}%`);

  // ── תובנות (executive summary is the period-scoped block)
  await clickTab('✨ תובנות');
  await applyPeriod(P);
  t = await p.innerText('body');
  // executiveSummary has three shapes for the period-total bullet, and caps the
  // list at 5 items — so parse all three and only assert a bullet that is shown.
  const mUp   = t.match(/הוצאות בתקופה גבוהות ב-\d+% לעומת התקופה הקודמת \(₪([\d,]+) לעומת ₪([\d,]+)\)/);
  const mDown = t.match(/הוצאות בתקופה נמוכות ב-\d+% לעומת התקופה הקודמת \(₪([\d,]+)\)/);
  const mFlat = t.match(/הוצאות יציבות: ₪([\d,]+)/);
  const execExp   = num((mUp || mDown || mFlat || [])[1]);
  const execPrior = mUp ? num(mUp[2]) : null;
  const execSave  = num((t.match(/חיסכון בתקופה:\s*₪([\d,]+)/) || [])[1]);
  const execDef   = num((t.match(/גירעון בתקופה:\s*₪([\d,]+)/) || [])[1]);
  const execFixed = num((t.match(/מהוצאות הן קבועות\s*\(₪([\d,]+)\)/) || [])[1]);
  execTexts.push(`${P.key}: ` + (t.match(/סיכום —[^\n]*\n([\s\S]*?)\nמגמות/) || [])[1]?.replace(/\n+/g, ' | '));
  if (P.win === 'all') {
    // "All time" has no prior period, so the comparison bullet must be absent
    // entirely rather than comparing the period to itself.
    check(`${P.key}/insights/no-self-comparison`, execExp, null);
    check(`${P.key}/insights/no-zero-pct-tautology`, /הוצאות יציבות/.test(t), false);
  } else if (E.expCount > 0) {
    if (oracle(E.priorWin).expTotal > 0) check(`${P.key}/insights/exec-expenses`, execExp, E.expTotal);
    if (execPrior != null) check(`${P.key}/insights/exec-prior`, execPrior, oracle(E.priorWin).expTotal);
    if (execFixed != null) check(`${P.key}/insights/exec-fixed`, execFixed, E.fixedExp);
    if (E.net > 0 && execSave != null) check(`${P.key}/insights/exec-saving`, execSave, E.net);
    if (E.net < 0 && execDef != null) check(`${P.key}/insights/exec-deficit`, execDef, Math.abs(E.net));
  } else {
    check(`${P.key}/insights/empty-window-no-crash`, errs.length, 0);
  }
}

// ── Trap check: the ₪999,999 outlier (2024-03) must never appear in a short window.
await clickTab('💸 הוצאות');
for (const chip of ['החודש הנוכחי', 'חודש קודם', 'רבעון אחרון', '12 חודשים אחרונים']) {
  await p.getByRole('button', { name: chip, exact: true }).click();
  await p.waitForTimeout(400);
  const t = await p.innerText('body');
  check(`trap/${chip}/no-999999`, /999,999/.test(t), false);
}

await p.getByRole('button', { name: 'כל הזמן', exact: true }).click();
await p.waitForTimeout(500);
check('trap/allTime/includes-999999', /999,999/.test(await p.innerText('body')), true);

await p.screenshot({ path: '/tmp/shot-alltime-expenses.png', fullPage: true });

console.log('\n=== exec summaries ===\n' + execTexts.join('\n'));
console.log('\n=== page errors ===', JSON.stringify(errs, null, 1));
const fails = results.filter(r => !r.ok);
console.log(`\n=== ${results.length - fails.length}/${results.length} checks passed ===`);
if (fails.length) console.log(JSON.stringify(fails, null, 1));
await b.close();
process.exit(fails.length ? 1 : 0);
