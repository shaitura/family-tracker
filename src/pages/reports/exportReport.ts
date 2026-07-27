// src/pages/reports/exportReport.ts
import { Transaction } from '@/types';
import { formatCurrency, PAYER_LABELS } from '@/utils';
import { ReportPeriod, periodMonths, periodLabel } from '@/lib/reportPeriod';
import { byCategory, byMonth, byPayer, fixedVariableSplit } from '@/lib/reportAggregates';

function inRange(t: Transaction, period: ReportPeriod): boolean {
  if (period.isAllTime) return true;
  const ym = t.date.slice(0, 7);
  return ym >= period.startMonth && ym <= period.endMonth;
}

export async function exportExcel(transactions: Transaction[], period: ReportPeriod, txType: 'expense' | 'income') {
  const { utils, writeFile } = await import('xlsx');
  const wb = utils.book_new();
  const filtered = transactions.filter((t) => t.type === txType && inRange(t, period));
  const total = filtered.reduce((s, t) => s + t.amount, 0);
  const months = periodMonths(period);

  const rtl = (ws: ReturnType<typeof utils.json_to_sheet>) => { ws['!views'] = [{ rightToLeft: true }]; return ws; };
  const ILS = '"₪"#,##0';
  const PCT = '0.0"%"';
  const applyFormats = (ws: ReturnType<typeof utils.json_to_sheet>, colFormats: { col: number; fmt: string }[]) => {
    const range = utils.decode_range(ws['!ref'] || 'A1');
    colFormats.forEach(({ col, fmt }) => { for (let row = range.s.r + 1; row <= range.e.r; row++) { const addr = utils.encode_cell({ r: row, c: col }); if (ws[addr]) ws[addr].z = fmt; } });
  };

  const txRows = filtered.map((t) => ({ תאריך: t.date, קטגוריה: t.category, סכום: t.amount, משלם: PAYER_LABELS[t.payer] || t.payer, אמצעי_תשלום: t.payment_method, סוג: t.expense_class, הערות: t.notes || '' }));
  const txSheet = rtl(utils.json_to_sheet(txRows));
  applyFormats(txSheet, [{ col: 2, fmt: ILS }]);
  utils.book_append_sheet(wb, txSheet, 'עסקאות');

  const catData = byCategory(filtered);
  const catRows = catData.map(({ name, value }) => ({ קטגוריה: name, סכום: value, אחוז: total > 0 ? +(value / total * 100).toFixed(1) : 0 }));
  catRows.push({ קטגוריה: 'סה"כ', סכום: total, אחוז: 100 });
  const catSheet = rtl(utils.json_to_sheet(catRows));
  applyFormats(catSheet, [{ col: 1, fmt: ILS }, { col: 2, fmt: PCT }]);
  utils.book_append_sheet(wb, catSheet, 'לפי קטגוריה');

  const monthRows = byMonth(filtered, months).map(({ name, value }) => ({ חודש: name, סכום: value, אחוז: total > 0 ? +(value / total * 100).toFixed(1) : 0 }));
  const monthSheet = rtl(utils.json_to_sheet(monthRows));
  applyFormats(monthSheet, [{ col: 1, fmt: ILS }, { col: 2, fmt: PCT }]);
  utils.book_append_sheet(wb, monthSheet, 'לפי חודש');

  const payerRows = byPayer(filtered).map(({ name, value }) => ({ משלם: name, סכום: value, אחוז: total > 0 ? +(value / total * 100).toFixed(1) : 0 }));
  const payerSheet = rtl(utils.json_to_sheet(payerRows));
  applyFormats(payerSheet, [{ col: 1, fmt: ILS }, { col: 2, fmt: PCT }]);
  utils.book_append_sheet(wb, payerSheet, 'לפי משלם');

  if (txType === 'expense') {
    const split = fixedVariableSplit(filtered);
    const splitRows = [
      { סוג: 'קבועה', סכום: split.fixedTotal, אחוז: split.splitTotal > 0 ? +(split.fixedTotal / split.splitTotal * 100).toFixed(1) : 0 },
      { סוג: 'משתנה', סכום: split.varTotal, אחוז: split.splitTotal > 0 ? +(split.varTotal / split.splitTotal * 100).toFixed(1) : 0 },
      { סוג: 'סה"כ', סכום: split.splitTotal, אחוז: 100 },
    ];
    const splitSheet = rtl(utils.json_to_sheet(splitRows));
    applyFormats(splitSheet, [{ col: 1, fmt: ILS }, { col: 2, fmt: PCT }]);
    utils.book_append_sheet(wb, splitSheet, 'קבועה vs משתנה');
  }

  writeFile(wb, `family-report-${periodLabel(period).replace(/[/\\?%*:|"<>]/g, '-')}.xlsx`);
}

export function exportPdf(transactions: Transaction[], period: ReportPeriod) {
  const label = periodLabel(period);
  const fmtILS = (n: number) => formatCurrency(n);
  const section = (title: string, txType: 'expense' | 'income') => {
    const txs = transactions.filter((t) => t.type === txType && inRange(t, period));
    const total = txs.reduce((s, t) => s + t.amount, 0);
    if (total === 0) return '';
    const cats = byCategory(txs);
    const rows = cats.map(({ name, value }) => `<div class="lrow"><span class="lname">${name}</span><span class="lamt">${fmtILS(value)}</span></div>`).join('');
    return `<div class="section"><h2>${title}<span>${fmtILS(total)}</span></h2><h3>לפי קטגוריה</h3><div class="legend">${rows}</div></div>`;
  };
  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>דוח משפחתי — ${label}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:24px;color:#1e293b;direction:rtl}
  h1{font-size:20px;font-weight:800}.period{color:#64748b;font-size:13px;margin-bottom:22px}
  h2{font-size:15px;font-weight:700;background:#1e293b;color:#fff;padding:8px 14px;border-radius:8px;margin:16px 0;display:flex;justify-content:space-between}
  h3{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin:12px 0 6px}
  .lrow{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f1f5f9;font-size:12px}
  @media print{body{padding:0}}</style></head><body>
  <h1>דוח משפחתי</h1><p class="period">${label}</p>
  ${section('הוצאות', 'expense')}${section('הכנסות', 'income')}
  </body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); w.addEventListener('load', () => { w.focus(); w.print(); }); }
}
