import { chromium } from 'playwright';
import { buildSeed } from './seed.mjs';
const SEED = buildSeed();
const HE = { Shi: 'שי', Ortal: 'אורטל', Joint: 'משותף' };

function oracle(win, type) {
  const hit = t => win === 'all' || (t.date.slice(0,7) >= win[0] && t.date.slice(0,7) <= win[1]);
  const rows = SEED.filter(t => hit(t) && t.type === type);
  const sum = a => a.reduce((s,t) => s + t.amount, 0);
  const fixed = sum(rows.filter(t => t.expense_class === 'קבועה'));
  const varia = sum(rows.filter(t => t.expense_class === 'משתנה'));
  const fixedPct = (fixed+varia) ? Math.round(fixed/(fixed+varia)*100) : 0;
  return { Shi: sum(rows.filter(t=>t.payer==='Shi')), Ortal: sum(rows.filter(t=>t.payer==='Ortal')),
           Joint: sum(rows.filter(t=>t.payer==='Joint')), total: sum(rows),
           fixed, varia, fixedPct, varPct: (fixed+varia) ? 100-fixedPct : 0 };
}

const PERIODS = [
  { chip: 'חודש קודם',         win: ['2026-07','2026-07'], multi: false },
  { chip: 'החודש הנוכחי',      win: ['2026-08','2026-08'], multi: false },
  { chip: 'רבעון אחרון',       win: ['2026-06','2026-08'], multi: true },
  { chip: '12 חודשים אחרונים', win: ['2025-09','2026-08'], multi: true },
  { chip: 'כל הזמן',           win: 'all',                 multi: true },
];
const res = [], errs = [];
const num = s => s == null ? null : Number(String(s).replace(/[₪,\s]/g,''));
const check = (l,a,e) => { const ok = String(a)===String(e); res.push({l,a,e,ok}); if(!ok) console.log(`  ✗ ${l}: got ${a}, expected ${e}`); };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args:['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 430, height: 4000 } });
p.on('pageerror', e => errs.push('PAGEERROR: '+e.message));
await p.goto('http://127.0.0.1:5178/harness/index.html', { waitUntil:'networkidle' });
await p.waitForTimeout(600);
const click = async n => { await p.getByRole('button',{name:n,exact:true}).click(); await p.waitForTimeout(420); };

// payer rows rendered as label/value pairs (single-month layout)
const payerRows = () => p.$$eval('div.flex.justify-between', ds => Object.fromEntries(
  ds.map(d => [...d.querySelectorAll('span')].map(s => s.textContent.trim()))
    .filter(a => a.length === 2 && /^₪/.test(a[1])).map(a => [a[0], a[1]])));
const axisTicks = () => p.$$eval('.recharts-xAxis .recharts-cartesian-axis-tick-value',
  ns => ns.map(n => n.textContent.trim()));

for (const P of PERIODS) {
  for (const [tab, type] of [['💸 הוצאות','expense'], ['💰 הכנסות','income']]) {
    const E = oracle(P.win, type);
    await click(tab); await click(P.chip); await p.waitForTimeout(250);

    await click('לפי משלם');
    if (!P.multi) {
      const rows = await payerRows();
      for (const k of ['Shi','Ortal','Joint']) {
        if (E[k] > 0) check(`${P.chip}/${type}/payer-${k}`, num(rows[HE[k]]), E[k]);
      }
    } else if (type === 'income') {
      // multi-month income has a per-month payer table with a totals row
      const tot = await p.$$eval('table tbody tr', rs => {
        const r = rs.find(r => r.querySelector('td')?.textContent.trim() === 'סה"כ');
        return r ? [...r.querySelectorAll('td')].map(td => td.textContent.trim()) : null;
      });
      check(`${P.chip}/income/payer-table-Shi`,   num(tot?.[1]), E.Shi);
      check(`${P.chip}/income/payer-table-Ortal`, num(tot?.[2]), E.Ortal);
      check(`${P.chip}/income/payer-table-Joint`, num(tot?.[3]), E.Joint);
      check(`${P.chip}/income/payer-table-total`, num(tot?.[4]), E.total);
    }
    // every x-axis tick must fall inside the selected window
    if (P.multi && P.win !== 'all') {
      const ticks = (await axisTicks()).filter(t => /^\d{4}-\d{2}$/.test(t));
      check(`${P.chip}/${type}/axis-ticks-in-window`,
        ticks.length > 0 && ticks.every(t => t >= P.win[0] && t <= P.win[1]), true);
    }

    await click('קבועה / משתנה');
    const t = await p.innerText('body');
    const m = t.match(/קבועה\s*\n+\s*₪([\d,]+)\s*\n+\s*(\d+)%\s*\n+\s*משתנה\s*\n+\s*₪([\d,]+)\s*\n+\s*(\d+)%/);
    check(`${P.chip}/${type}/split-fixed`,    num((m||[])[1]), E.fixed);
    check(`${P.chip}/${type}/split-fixedPct`, Number((m||[])[2]), E.fixedPct);
    check(`${P.chip}/${type}/split-var`,      num((m||[])[3]), E.varia);
    check(`${P.chip}/${type}/split-pct-sums-100`, Number((m||[])[2]) + Number((m||[])[4]), 100);
  }
}

// ── Evidence for the content findings ──
await click('📊 מאזן'); await click('שנה נבחרת');
await p.locator('select').first().selectOption('2024'); await p.waitForTimeout(700);
const kpi = await p.$$eval('div.rounded-2xl', ds => ds.slice(0,7).map(d => d.innerText.replace(/\n+/g,' = ')));
console.log('\n=== BALANCE KPI cards, שנה נבחרת 2024 (income 68,532 vs expenses 1,039,797 → deficit 971,265) ===');
console.log(kpi.join('\n'));
await p.screenshot({ path:'/tmp/shot-balance-2024-deficit.png' });

await click('✨ תובנות'); await click('כל הזמן'); await p.waitForTimeout(700);
const ins = await p.innerText('body');
console.log('\n=== INSIGHTS, כל הזמן — period-comparison bullet ===');
console.log((ins.match(/הוצאות (יציבות|בתקופה)[^\n]*/)||['(none)'])[0]);
await p.screenshot({ path:'/tmp/shot-insights-alltime.png' });

console.log('\n=== page errors ===', JSON.stringify(errs));
const f = res.filter(r=>!r.ok);
console.log(`\n=== ${res.length-f.length}/${res.length} sub-tab checks passed ===`);
if (f.length) console.log(JSON.stringify(f,null,1));
await b.close();
