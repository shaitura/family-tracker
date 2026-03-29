import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LabelList } from 'recharts';
import { Download } from 'lucide-react';
import { base44 } from '@/lib/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Transaction } from '@/types';
import { formatCurrency, categoryColor, PAYER_LABELS } from '@/utils';

const COLORS = ['#22d3ee', '#a855f7', '#ec4899', '#f97316', '#eab308', '#84cc16', '#10b981', '#f43f5e', '#06b6d4', '#8b5cf6'];

export default function Reports() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [year, setYear] = useState(String(currentYear));
  const [month, setMonth] = useState(String(currentMonth).padStart(2, '0'));
  const [fullYear, setFullYear] = useState(false);
  const [txType, setTxType] = useState('expense');
  const [expClass, setExpClass] = useState('');

  const { data: transactions = [] } = useQuery<Transaction[]>({ queryKey: ['transactions'], queryFn: () => base44.entities.Transaction.filter() });

  const months = Array.from({ length: 12 }, (_, i) => ({ val: String(i + 1).padStart(2, '0'), label: new Date(2000, i).toLocaleString('he', { month: 'short' }) }));

  const filtered = useMemo(() => transactions.filter((t) => {
    const prefix = fullYear ? `${year}-` : `${year}-${month}`;
    if (!t.date.startsWith(prefix)) return false;
    if (t.type !== txType) return false;
    if (expClass && t.expense_class !== expClass) return false;
    return true;
  }), [transactions, year, month, fullYear, txType, expClass]);

  const { catData, payerData, total, byMonth } = useMemo(() => {
    const byCat: Record<string, number> = {};
    const byPayer: Record<string, number> = {};
    let total = 0;
    for (const t of filtered) {
      byCat[t.category] = (byCat[t.category] || 0) + t.amount;
      byPayer[t.payer] = (byPayer[t.payer] || 0) + t.amount;
      total += t.amount;
    }
    const catData = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
    const payerData = Object.entries(byPayer).map(([payer, amount]) => ({ name: PAYER_LABELS[payer] || payer, amount }));
    const byMonth = months.map(({ val, label }) => {
      const sum = filtered.filter((t) => t.date.startsWith(`${year}-${val}`)).reduce((s, t) => s + t.amount, 0);
      return { name: label, amount: sum };
    });
    return { catData, payerData, total, byMonth };
  }, [filtered, year]);

  // Fixed vs variable (ignores expClass filter so split is always meaningful)
  const { fixedTotal, varTotal, splitTotal, fixedCats, varCats } = useMemo(() => {
    const filteredForSplit = transactions.filter((t) => {
      const prefix = fullYear ? `${year}-` : `${year}-${month}`;
      if (!t.date.startsWith(prefix)) return false;
      if (t.type !== txType) return false;
      return true;
    });
    const fixedByCat: Record<string, number> = {};
    const varByCat:   Record<string, number> = {};
    let fixedTotal = 0, varTotal = 0;
    for (const t of filteredForSplit) {
      if (t.expense_class === 'קבועה') { fixedByCat[t.category] = (fixedByCat[t.category] || 0) + t.amount; fixedTotal += t.amount; }
      if (t.expense_class === 'משתנה') { varByCat[t.category]   = (varByCat[t.category]   || 0) + t.amount; varTotal   += t.amount; }
    }
    return {
      fixedTotal,
      varTotal,
      splitTotal: fixedTotal + varTotal,
      fixedCats: Object.entries(fixedByCat).sort((a, b) => b[1] - a[1]),
      varCats:   Object.entries(varByCat).sort((a, b) => b[1] - a[1]),
    };
  }, [transactions, year, month, fullYear, txType]);
  // Income vs Expenses comparison (ignores txType/expClass filters)
  const { incomeTotal, expenseTotal, balanceByMonth } = useMemo(() => {
    const prefix = fullYear ? `${year}-` : `${year}-${month}`;
    const periodTxs = transactions.filter((t) => t.date.startsWith(prefix));
    const incomeTotal = periodTxs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenseTotal = periodTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const balanceByMonth = months.map(({ val, label }) => ({
      name: label,
      'הכנסות': periodTxs.filter((t) => t.type === 'income' && t.date.startsWith(`${year}-${val}`)).reduce((s, t) => s + t.amount, 0),
      'הוצאות': periodTxs.filter((t) => t.type === 'expense' && t.date.startsWith(`${year}-${val}`)).reduce((s, t) => s + t.amount, 0),
    }));
    return { incomeTotal, expenseTotal, balanceByMonth };
  }, [transactions, year, month, fullYear, months]);

  const exportExcel = async () => {
    const { utils, writeFile } = await import('xlsx');
    const wb = utils.book_new();

    // Helper: apply formats to cells in specific columns (skipping header row)
    const applyFormats = (ws: ReturnType<typeof utils.json_to_sheet>, colFormats: { col: number; fmt: string }[]) => {
      const range = utils.decode_range(ws['!ref'] || 'A1');
      colFormats.forEach(({ col, fmt }) => {
        for (let row = range.s.r + 1; row <= range.e.r; row++) {
          const addr = utils.encode_cell({ r: row, c: col });
          if (ws[addr]) ws[addr].z = fmt;
        }
      });
    };

    // Helper: mark sheet as RTL
    const rtl = (ws: ReturnType<typeof utils.json_to_sheet>) => {
      ws['!views'] = [{ rightToLeft: true }];
      return ws;
    };

    const ILS = '"₪"#,##0';
    const PCT = '0.0"%"';

    // Sheet 1: raw transactions
    const txRows = filtered.map((t) => ({
      תאריך: t.date,
      קטגוריה: t.category,
      סכום: t.amount,
      משלם: PAYER_LABELS[t.payer] || t.payer,
      אמצעי_תשלום: t.payment_method,
      סוג: t.expense_class,
      הערות: t.notes || '',
    }));
    const txSheet = rtl(utils.json_to_sheet(txRows));
    txSheet['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 24 }];
    applyFormats(txSheet, [{ col: 2, fmt: ILS }]);
    utils.book_append_sheet(wb, txSheet, 'עסקאות');

    // Sheet 2: by category
    const catRows = catData.map(({ name, value }) => ({
      קטגוריה: name,
      סכום: value,
      אחוז: total > 0 ? +(value / total * 100).toFixed(1) : 0,
    }));
    catRows.push({ קטגוריה: 'סה"כ', סכום: total, אחוז: 100 });
    const catSheet = rtl(utils.json_to_sheet(catRows));
    catSheet['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 10 }];
    applyFormats(catSheet, [{ col: 1, fmt: ILS }, { col: 2, fmt: PCT }]);
    utils.book_append_sheet(wb, catSheet, 'לפי קטגוריה');

    // Sheet 3: by month
    const monthRows = byMonth.map(({ name, amount }) => ({
      חודש: name,
      סכום: amount,
      אחוז: total > 0 ? +(amount / total * 100).toFixed(1) : 0,
    }));
    const monthSheet = rtl(utils.json_to_sheet(monthRows));
    monthSheet['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 10 }];
    applyFormats(monthSheet, [{ col: 1, fmt: ILS }, { col: 2, fmt: PCT }]);
    utils.book_append_sheet(wb, monthSheet, 'לפי חודש');

    // Sheet 4: by payer
    const payerRows = payerData.map(({ name, amount }) => ({
      משלם: name,
      סכום: amount,
      אחוז: total > 0 ? +(amount / total * 100).toFixed(1) : 0,
    }));
    const payerSheet = rtl(utils.json_to_sheet(payerRows));
    payerSheet['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 10 }];
    applyFormats(payerSheet, [{ col: 1, fmt: ILS }, { col: 2, fmt: PCT }]);
    utils.book_append_sheet(wb, payerSheet, 'לפי משלם');

    // Sheet 5: fixed vs variable
    const splitRows = [
      { סוג: 'קבועה', סכום: fixedTotal, אחוז: splitTotal > 0 ? +(fixedTotal / splitTotal * 100).toFixed(1) : 0 },
      { סוג: 'משתנה', סכום: varTotal, אחוז: splitTotal > 0 ? +(varTotal / splitTotal * 100).toFixed(1) : 0 },
      { סוג: 'סה"כ', סכום: splitTotal, אחוז: 100 },
    ];
    const splitSheet = rtl(utils.json_to_sheet(splitRows));
    splitSheet['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 10 }];
    applyFormats(splitSheet, [{ col: 1, fmt: ILS }, { col: 2, fmt: PCT }]);
    utils.book_append_sheet(wb, splitSheet, 'קבועה vs משתנה');

    writeFile(wb, `family-report-${year}-${fullYear ? 'full' : month}.xlsx`);
  };

  const exportPDF = () => {
    const period = fullYear ? `${year} — שנה מלאה` : `${year}-${month}`;
    const prefix = fullYear ? `${year}-` : `${year}-${month}`;
    const C = ['#22d3ee','#a855f7','#ec4899','#f97316','#eab308','#84cc16','#10b981','#f43f5e','#06b6d4','#8b5cf6'];

    const computeStats = (type: string) => {
      const txs = transactions.filter((t) => t.date.startsWith(prefix) && t.type === type);
      const tot = txs.reduce((s, t) => s + t.amount, 0);
      const byCat: Record<string, number> = {};
      txs.forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
      const catRows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
      const byPayer: Record<string, number> = {};
      txs.forEach((t) => { byPayer[t.payer] = (byPayer[t.payer] || 0) + t.amount; });
      const payerRows = Object.entries(byPayer).map(([p, a]) => [PAYER_LABELS[p] || p, a] as [string, number]).sort((a, b) => b[1] - a[1]);
      const monthRows = months.map(({ val, label }) => ({
        label, amount: txs.filter((t) => t.date.startsWith(`${year}-${val}`)).reduce((s, t) => s + t.amount, 0),
      }));
      const fixedTot = txs.filter((t) => t.expense_class === 'קבועה').reduce((s, t) => s + t.amount, 0);
      const varTot   = txs.filter((t) => t.expense_class === 'משתנה').reduce((s, t) => s + t.amount, 0);
      return { tot, catRows, payerRows, monthRows, fixedTot, varTot };
    };

    const fmtILS = (n: number) => `₪${Math.abs(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;
    const fmtPct = (n: number, tot: number) => (tot > 0 ? `${(n / tot * 100).toFixed(1)}%` : '—');

    // SVG donut chart
    const svgDonut = (segs: [string, number][], tot: number, colors: string[]): string => {
      if (tot === 0 || segs.length === 0) return '';
      const cx = 80, cy = 80, R = 65, r = 38;
      if (segs.length === 1) {
        return `<svg width="160" height="160" viewBox="0 0 160 160"><circle cx="${cx}" cy="${cy}" r="${R}" fill="${colors[0]}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="white"/></svg>`;
      }
      let angle = -Math.PI / 2;
      const paths = segs.map(([, val], i) => {
        const a = Math.min((val / tot) * 2 * Math.PI, 2 * Math.PI - 0.001);
        const end = angle + a;
        const p = (rad: number, radius: number) => [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
        const [x1,y1] = p(angle, R); const [x2,y2] = p(end, R);
        const [ix1,iy1] = p(angle, r); const [ix2,iy2] = p(end, r);
        const large = a > Math.PI ? 1 : 0;
        const d = `M${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} L${ix2.toFixed(1)},${iy2.toFixed(1)} A${r},${r} 0 ${large} 0 ${ix1.toFixed(1)},${iy1.toFixed(1)}Z`;
        angle = end;
        return `<path d="${d}" fill="${colors[i % colors.length]}" stroke="white" stroke-width="1.5"/>`;
      });
      return `<svg width="160" height="160" viewBox="0 0 160 160">${paths.join('')}</svg>`;
    };

    // SVG bar chart
    const svgBars = (items: {label: string; value: number}[], colors: string[]): string => {
      if (!items.length) return '';
      const max = Math.max(...items.map((i) => i.value), 1);
      const W = 34, GAP = 5, MAXH = 80, TH = 18;
      const totalW = items.length * (W + GAP) + 4;
      const bars = items.map((item, i) => {
        const h = Math.max(item.value > 0 ? Math.round((item.value / max) * MAXH) : 0, item.value > 0 ? 3 : 0);
        const x = 2 + i * (W + GAP);
        return `<rect x="${x}" y="${MAXH - h}" width="${W}" height="${h}" rx="3" fill="${colors[i % colors.length]}"/>
          <text x="${x + W / 2}" y="${MAXH + 13}" text-anchor="middle" font-size="9" fill="#64748b">${item.label}</text>`;
      });
      return `<svg width="${totalW}" height="${MAXH + TH}" viewBox="0 0 ${totalW} ${MAXH + TH}" style="width:100%;max-height:110px">${bars.join('')}</svg>`;
    };

    // Legend row
    const row = (color: string, label: string, amount: string, pct: string) =>
      `<div class="lrow"><span class="dot" style="background:${color}"></span><span class="lname">${label}</span><span class="lamt">${amount}</span><span class="lpct">${pct}</span></div>`;

    // Chart+legend block
    const chartBlock = (chart: string, rows: string) =>
      `<div class="cblock"><div class="chart">${chart}</div><div class="legend">${rows}</div></div>`;

    const section = (label: string, type: string) => {
      const { tot, catRows, payerRows, monthRows, fixedTot, varTot } = computeStats(type);
      if (tot === 0) return '';
      const splitTot = fixedTot + varTot;
      const activeMonths = monthRows.filter((m) => m.amount > 0);

      const catSvg = svgDonut(catRows, tot, C);
      const catLegend = catRows.map(([name, val], i) => row(C[i % C.length], name, fmtILS(val), fmtPct(val, tot))).join('');

      const monthSvg = svgBars(activeMonths.map((m) => ({ label: m.label, value: m.amount })), C);
      const monthLegend = [...activeMonths].sort((a, b) => b.amount - a.amount).map((m, i) => row(C[i % C.length], m.label, fmtILS(m.amount), fmtPct(m.amount, tot))).join('');

      const payerSvg = svgBars(payerRows.map(([name, val]) => ({ label: name, value: val })), C);
      const payerLegend = payerRows.map(([name, val], i) => row(C[i % C.length], name, fmtILS(val), fmtPct(val, tot))).join('');

      const splitSvg = svgDonut([['קבועה', fixedTot], ['משתנה', varTot]], splitTot, ['#22d3ee', '#a855f7']);
      const splitLegend = [
        row('#22d3ee', 'קבועה', fmtILS(fixedTot), fmtPct(fixedTot, splitTot)),
        row('#a855f7', 'משתנה', fmtILS(varTot),   fmtPct(varTot,   splitTot)),
      ].join('');

      return `<div class="section">
        <h2>${label}<span>${fmtILS(tot)}</span></h2>

        <h3>לפי קטגוריה</h3>
        ${chartBlock(catSvg, catLegend)}

        ${fullYear && activeMonths.length > 0 ? `
        <h3>לפי חודש</h3>
        <div class="bar-wrap">${monthSvg}</div>
        <div class="legend">${monthLegend}</div>
        ` : ''}

        ${payerRows.length > 0 ? `
        <h3>לפי משלם</h3>
        ${chartBlock(payerSvg, payerLegend)}
        ` : ''}

        ${type === 'expense' && splitTot > 0 ? `
        <h3>קבועה מול משתנה</h3>
        ${chartBlock(splitSvg, splitLegend)}
        ` : ''}
      </div>`;
    };

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="he"><head>
  <meta charset="utf-8">
  <title>דוח משפחתי — ${period}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,sans-serif;padding:24px 28px;color:#1e293b;direction:rtl;background:#fff}
    h1{font-size:20px;font-weight:800;margin-bottom:3px}
    .period{color:#64748b;font-size:13px;margin-bottom:22px}
    .section{margin-bottom:30px}
    h2{font-size:15px;font-weight:700;background:#1e293b;color:#fff;padding:8px 14px;border-radius:8px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center}
    h3{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.6px;margin:16px 0 8px;padding-bottom:4px;border-bottom:1px solid #e2e8f0}
    .cblock{display:flex;gap:16px;align-items:flex-start;margin-bottom:4px}
    .chart{flex-shrink:0;width:160px}
    .bar-wrap{margin-bottom:8px}
    .legend{flex:1;min-width:0}
    .lrow{display:flex;align-items:center;gap:7px;padding:4px 0;border-bottom:1px solid #f8fafc}
    .dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
    .lname{flex:1;font-size:12px}
    .lamt{font-weight:600;font-size:12px}
    .lpct{color:#64748b;font-size:11px;min-width:38px;text-align:left}
    @page{margin:12mm}
    @media print{body{padding:0}.subsection{page-break-inside:avoid}}
  </style>
</head>
<body>
  <h1>דוח משפחתי</h1>
  <p class="period">${period}</p>
  ${section('הוצאות', 'expense')}
  ${section('הכנסות', 'income')}
</body></html>`;

    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
      w.addEventListener('load', () => { w.focus(); w.print(); });
    }
  };

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">דוחות</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel}>
            <Download className="w-4 h-4 ml-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF}>
            <Download className="w-4 h-4 ml-1" /> PDF
          </Button>
        </div>
      </div>

      {/* Exportable content */}
      <div id="reports-content">

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          {/* Year + month/full-year toggle */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-white/50 mb-1">שנה</p>
              <select value={year} onChange={(e) => setYear(e.target.value)} className="w-full h-9 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none">
                {Array.from({ length: currentYear - 2021 }, (_, i) => String(2022 + i)).reverse().map((y) => <option key={y} value={y} className="bg-slate-800">{y}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs text-white/50 mb-1">תקופה</p>
              <div className="flex gap-1">
                <select
                  value={fullYear ? 'full' : month}
                  onChange={(e) => {
                    if (e.target.value === 'full') { setFullYear(true); }
                    else { setFullYear(false); setMonth(e.target.value); }
                  }}
                  className="w-full h-9 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none"
                >
                  <option value="full" className="bg-slate-800 font-semibold">📅 שנה מלאה</option>
                  {months.map(({ val, label: l }) => <option key={val} value={val} className="bg-slate-800">{l}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {[{ v: 'expense', l: '💸 הוצאות' }, { v: 'income', l: '💰 הכנסות' }].map(({ v, l }) => (
              <button key={v} onClick={() => setTxType(v)} className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-all ${txType === v ? 'bg-cyan-500/30 border border-cyan-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50'}`}>{l}</button>
            ))}
          </div>
          <div className="flex gap-2">
            {[{ v: '', l: 'הכל' }, { v: 'קבועה', l: 'קבועה' }, { v: 'משתנה', l: 'משתנה' }].map(({ v, l }) => (
              <button key={v} onClick={() => setExpClass(v)} className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-all ${expClass === v ? 'bg-purple-500/30 border border-purple-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50'}`}>{l}</button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Total */}
      <div className="text-center">
        <p className="text-xs text-white/50">סה"כ {fullYear ? `${year}` : ''}</p>
        <p className="text-3xl font-black text-white">{formatCurrency(total)}</p>
        <p className="text-xs text-white/40">{filtered.length} עסקאות</p>
      </div>

      <Tabs defaultValue={fullYear ? 'monthly' : 'category'} key={fullYear ? 'year' : 'month'}>
        <TabsList dir="rtl">
          {fullYear && <TabsTrigger value="monthly">לפי חודש</TabsTrigger>}
          <TabsTrigger value="category">לפי קטגוריה</TabsTrigger>
          <TabsTrigger value="payer">לפי משלם</TabsTrigger>
          <TabsTrigger value="split">קבועה / משתנה</TabsTrigger>
          <TabsTrigger value="balance">מאזן</TabsTrigger>
        </TabsList>

        {/* Monthly breakdown — full year only */}
        {fullYear && (
          <TabsContent value="monthly">
            {byMonth.some((m) => m.amount > 0) ? (
              <Card>
                <CardContent className="pt-4">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={[...byMonth].reverse()} barSize={28}>
                      <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis hide />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
                      <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                        {[...byMonth].reverse().map((_, i) => <Cell key={i} fill={COLORS[(11 - i) % COLORS.length]} />)}
                        <LabelList dataKey="amount" position="top" style={{ fill: '#e2e8f0', fontSize: 10, fontWeight: 'bold' }} formatter={(v: number) => v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v > 0 ? String(Math.round(v)) : ''} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="mt-3 space-y-1.5">
                    {byMonth.filter((m) => m.amount > 0).map(({ name, amount }, i) => {
                      const pct = total ? amount / total * 100 : 0;
                      return (
                        <div key={name} className="flex items-center gap-3 py-1 border-b border-white/5">
                          {/* left: amount + pct */}
                          <div className="flex items-center gap-2 w-44 shrink-0 justify-end flex-row-reverse">
                            <span className="text-sm font-bold text-white tabular-nums">{formatCurrency(amount)}</span>
                            <span className="text-xs text-white/40 w-8 text-right tabular-nums">{Math.round(pct)}%</span>
                          </div>
                          {/* progress bar */}
                          <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full bg-cyan-400/70" style={{ width: `${pct}%` }} />
                          </div>
                          {/* right: month name */}
                          <span className="text-sm text-white w-10 text-right shrink-0">{name}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ) : <EmptyState />}
          </TabsContent>
        )}

        <TabsContent value="category">
          {catData.length > 0 ? (
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={catData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" nameKey="name" paddingAngle={2}>
                        {catData.map((entry, i) => (
                          <Cell key={entry.name} fill={categoryColor(entry.name) || COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4 space-y-2">
                  {catData.map(({ name, value }) => (
                    <div key={name} className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: categoryColor(name) }} />
                      <span className="text-sm text-white flex-1">{name}</span>
                      <span className="text-sm font-bold text-white">{formatCurrency(value)}</span>
                      <span className="text-xs text-white/40 w-10 text-left">{total ? Math.round(value / total * 100) : 0}%</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          ) : (
            <EmptyState />
          )}
        </TabsContent>

        {/* Fixed vs Variable tab */}
        <TabsContent value="split">
          {splitTotal > 0 ? (
            <div className="space-y-4">
              {/* Segmented bar */}
              <Card>
                <CardContent className="pt-4 space-y-4">
                  <div className="flex rounded-full overflow-hidden h-5">
                    {fixedTotal > 0 && (
                      <div
                        className="bg-cyan-500 transition-all"
                        style={{ width: `${(fixedTotal / splitTotal) * 100}%` }}
                        title={`קבועה ${Math.round(fixedTotal / splitTotal * 100)}%`}
                      />
                    )}
                    {varTotal > 0 && (
                      <div
                        className="bg-purple-500 transition-all"
                        style={{ width: `${(varTotal / splitTotal) * 100}%` }}
                        title={`משתנה ${Math.round(varTotal / splitTotal * 100)}%`}
                      />
                    )}
                  </div>

                  {/* Two big numbers */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-cyan-500/10 border border-cyan-500/25 p-3 text-center">
                      <p className="text-[10px] text-cyan-400 mb-1">קבועה</p>
                      <p className="text-lg font-black text-white">{formatCurrency(fixedTotal)}</p>
                      <p className="text-xs text-white/40">{splitTotal ? Math.round(fixedTotal / splitTotal * 100) : 0}%</p>
                    </div>
                    <div className="rounded-2xl bg-purple-500/10 border border-purple-500/25 p-3 text-center">
                      <p className="text-[10px] text-purple-400 mb-1">משתנה</p>
                      <p className="text-lg font-black text-white">{formatCurrency(varTotal)}</p>
                      <p className="text-xs text-white/40">{splitTotal ? Math.round(varTotal / splitTotal * 100) : 0}%</p>
                    </div>
                  </div>

                  {/* Donut */}
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'קבועה', value: fixedTotal },
                          { name: 'משתנה', value: varTotal },
                        ]}
                        cx="50%" cy="50%"
                        innerRadius={50} outerRadius={80}
                        dataKey="value" nameKey="name" paddingAngle={3}
                      >
                        <Cell fill="#22d3ee" />
                        <Cell fill="#a855f7" />
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
                      <Legend formatter={(v) => <span style={{ color: '#cbd5e1', fontSize: 12 }}>{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Category breakdown per class */}
              <div className="grid grid-cols-1 gap-3">
                {[
                  { label: 'קבועה', cats: fixedCats, color: 'text-cyan-400', bg: 'bg-cyan-500/15', total: fixedTotal },
                  { label: 'משתנה', cats: varCats, color: 'text-purple-400', bg: 'bg-purple-500/15', total: varTotal },
                ].map(({ label, cats, color, bg, total: classTotal }) => cats.length > 0 && (
                  <Card key={label}>
                    <CardContent className="pt-3 pb-3">
                      <p className={`text-xs font-semibold ${color} mb-2`}>{label} — {formatCurrency(classTotal)}</p>
                      <div className="space-y-1.5">
                        {cats.map(([name, value]) => (
                          <div key={name} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: categoryColor(name) }} />
                            <span className="text-xs text-white flex-1">{name}</span>
                            <span className="text-xs font-bold text-white">{formatCurrency(value)}</span>
                            <div className={`h-1.5 rounded-full ${bg} overflow-hidden`} style={{ width: 60 }}>
                              <div className="h-full rounded-full bg-current" style={{ width: `${classTotal ? (value / classTotal) * 100 : 0}%`, backgroundColor: categoryColor(name) || undefined }} />
                            </div>
                            <span className="text-[10px] text-white/40 w-7 text-left">{classTotal ? Math.round(value / classTotal * 100) : 0}%</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : <EmptyState />}
        </TabsContent>

        <TabsContent value="payer">
          {payerData.length > 0 ? (
            <Card>
              <CardContent className="pt-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={payerData} barSize={40}>
                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
                    <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                      {payerData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      <LabelList dataKey="amount" position="top" style={{ fill: '#e2e8f0', fontSize: 11, fontWeight: 'bold' }} formatter={(v: number) => v >= 1000 ? (v / 1000).toFixed(1).replace('.0', '') + 'K' : String(Math.round(v))} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-3 space-y-2">
                  {payerData.map(({ name, amount }) => (
                    <div key={name} className="flex justify-between items-center py-1.5 border-b border-white/5">
                      <span className="text-sm text-white">{name}</span>
                      <div className="text-left">
                        <p className="text-sm font-bold text-white">{formatCurrency(amount)}</p>
                        <p className="text-xs text-white/40">{total ? Math.round(amount / total * 100) : 0}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <EmptyState />
          )}
        </TabsContent>
        {/* Income vs Expenses tab */}
        <TabsContent value="balance">
          <div className="space-y-4">
            {/* Three summary cards */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/25 p-3 text-center">
                <p className="text-[10px] text-emerald-400 mb-1">הכנסות</p>
                <p className="text-base font-black text-white leading-tight">{formatCurrency(incomeTotal)}</p>
              </div>
              <div className="rounded-2xl bg-rose-500/10 border border-rose-500/25 p-3 text-center">
                <p className="text-[10px] text-rose-400 mb-1">הוצאות</p>
                <p className="text-base font-black text-white leading-tight">{formatCurrency(expenseTotal)}</p>
              </div>
              <div className={`rounded-2xl p-3 text-center border ${incomeTotal - expenseTotal >= 0 ? 'bg-cyan-500/10 border-cyan-500/25' : 'bg-orange-500/10 border-orange-500/25'}`}>
                <p className="text-[10px] text-white/50 mb-1">מאזן</p>
                <p className={`text-base font-black leading-tight ${incomeTotal - expenseTotal >= 0 ? 'text-cyan-400' : 'text-orange-400'}`}>{formatCurrency(incomeTotal - expenseTotal)}</p>
              </div>
            </div>

            {/* Visual ratio bar */}
            {(incomeTotal > 0 || expenseTotal > 0) && (
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex rounded-full overflow-hidden h-4">
                    {incomeTotal > 0 && (
                      <div className="bg-emerald-500 transition-all" style={{ width: `${(incomeTotal / (incomeTotal + expenseTotal)) * 100}%` }} />
                    )}
                    {expenseTotal > 0 && (
                      <div className="bg-rose-500 transition-all" style={{ width: `${(expenseTotal / (incomeTotal + expenseTotal)) * 100}%` }} />
                    )}
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-emerald-400">הכנסות {incomeTotal + expenseTotal > 0 ? Math.round(incomeTotal / (incomeTotal + expenseTotal) * 100) : 0}%</span>
                    <span className="text-rose-400">הוצאות {incomeTotal + expenseTotal > 0 ? Math.round(expenseTotal / (incomeTotal + expenseTotal) * 100) : 0}%</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Monthly grouped bar chart — full year only */}
            {fullYear && balanceByMonth.some((m) => m['הכנסות'] > 0 || m['הוצאות'] > 0) && (
              <Card>
                <CardContent className="pt-4">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={[...balanceByMonth].reverse()} barSize={14} barGap={2}>
                      <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis hide />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
                      <Legend formatter={(v) => <span style={{ color: '#cbd5e1', fontSize: 12 }}>{v}</span>} />
                      <Bar dataKey="הכנסות" fill="#10b981" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="הוצאות" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Month-by-month balance list — full year only */}
            {fullYear && balanceByMonth.some((m) => m['הכנסות'] > 0 || m['הוצאות'] > 0) && (
              <Card>
                <CardContent className="pt-4 space-y-1">
                  <div className="grid grid-cols-4 gap-1 text-[10px] text-white/40 mb-2 px-1">
                    <span>חודש</span><span className="text-right">הכנסות</span><span className="text-right">הוצאות</span><span className="text-right">מאזן</span>
                  </div>
                  {balanceByMonth.filter((m) => m['הכנסות'] > 0 || m['הוצאות'] > 0).map((m) => {
                    const bal = m['הכנסות'] - m['הוצאות'];
                    return (
                      <div key={m.name} className="grid grid-cols-4 gap-1 items-center py-1 border-b border-white/5 text-xs">
                        <span className="text-white/70">{m.name}</span>
                        <span className="text-emerald-400 text-right tabular-nums">{formatCurrency(m['הכנסות'])}</span>
                        <span className="text-rose-400 text-right tabular-nums">{formatCurrency(m['הוצאות'])}</span>
                        <span className={`font-bold text-right tabular-nums ${bal >= 0 ? 'text-cyan-400' : 'text-orange-400'}`}>{formatCurrency(bal)}</span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {incomeTotal === 0 && expenseTotal === 0 && <EmptyState />}
          </div>
        </TabsContent>

      </Tabs>
      </div>{/* end reports-content */}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12 text-white/30">
      <p className="text-4xl mb-2">📊</p>
      <p>אין נתונים לתקופה זו</p>
    </div>
  );
}
