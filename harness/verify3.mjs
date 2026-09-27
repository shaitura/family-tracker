import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args:['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 430, height: 2400 } });
await p.goto('http://127.0.0.1:5178/harness/index.html', { waitUntil:'networkidle' });
await p.waitForTimeout(600);
const click = async n => { await p.getByRole('button',{name:n,exact:true}).click(); await p.waitForTimeout(500); };

// How many data marks does the chart area actually render?
const marks = () => p.evaluate(() => {
  const svgs = [...document.querySelectorAll('.recharts-surface')];
  return svgs.map(s => ({
    bars:  s.querySelectorAll('.recharts-bar-rectangle').length,
    areas: s.querySelectorAll('.recharts-area-area').length,
    lines: s.querySelectorAll('.recharts-line-curve').length,
    slices:s.querySelectorAll('.recharts-pie-sector').length,
    ticks: s.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick-value').length,
  }));
});

for (const period of ['12 חודשים אחרונים', 'כל הזמן']) {
  console.log(`\n################ ${period}`);
  for (const tab of ['💸 הוצאות', '💰 הכנסות']) {
    await click(tab); await click(period);
    for (const sub of ['לפי קטגוריה', 'לפי חודש', 'לפי משלם']) {
      await click(sub);
      const m = await marks();
      const tables = await p.locator('table').count();
      console.log(`${tab} :: ${sub}  → charts=${JSON.stringify(m)} tables=${tables}`);
    }
  }
}

// screenshot the empty state
await click('💰 הכנסות'); await click('כל הזמן'); await click('לפי משלם');
await p.screenshot({ path:'/tmp/shot-alltime-income-payer-EMPTY.png' });
await click('💸 הוצאות'); await click('לפי חודש');
await p.screenshot({ path:'/tmp/shot-alltime-expenses-bymonth-EMPTY.png' });
// contrast: the same sub-tab with a bounded period
await click('12 חודשים אחרונים'); await click('לפי חודש');
await p.screenshot({ path:'/tmp/shot-last12-expenses-bymonth-OK.png' });
await b.close();
