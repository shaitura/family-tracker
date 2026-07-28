// src/pages/reports/BalanceTab.tsx
import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Transaction } from '@/types';
import { formatCurrency } from '@/utils';
import { ReportPeriod, periodMonths, currentMonthKey, inPeriod } from '@/lib/reportPeriod';
import { fixedVariableSplit } from '@/lib/reportAggregates';
import { ChartTooltip } from './ChartTooltip';

const INVESTMENT_CATS = ['חסכון', 'חיסכון', 'השקעות', 'השקעה', 'קרן השתלמות', 'פנסיה', 'קופת גמל', 'גמל'];
const isInvCat = (cat: string) => INVESTMENT_CATS.some((k) => cat.includes(k));
const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export function BalanceTab({ transactions, period, category }: { transactions: Transaction[]; period: ReportPeriod; category: string }) {
  const months = useMemo(() => periodMonths(period), [period]);
  const isMultiMonth = months.length > 1 || period.isAllTime;

  const filtered = useMemo(() => transactions.filter((t) => (!category || t.category === category) && inPeriod(t.date, period)), [transactions, category, period]);
  const incomeTxs = useMemo(() => filtered.filter((t) => t.type === 'income'), [filtered]);
  const expenseTxs = useMemo(() => filtered.filter((t) => t.type === 'expense'), [filtered]);

  const incomeTotal = incomeTxs.reduce((s, t) => s + t.amount, 0);
  const expenseTotal = expenseTxs.reduce((s, t) => s + t.amount, 0);
  const investmentTotal = expenseTxs.filter((t) => isInvCat(t.category)).reduce((s, t) => s + t.amount, 0);
  const { fixedTotal } = fixedVariableSplit(expenseTxs);
  const commitRatio = incomeTotal > 0 ? Math.round((fixedTotal / incomeTotal) * 100) : null;
  const expRatio = incomeTotal > 0 ? Math.round((expenseTotal / incomeTotal) * 100) : null;
  const invRatio = incomeTotal > 0 ? Math.round((investmentTotal / incomeTotal) * 100) : null;

  const byMonthChart = useMemo(() => months.map((m) => ({
    name: m,
    isCurrent: m === currentMonthKey(),
    'הכנסות': incomeTxs.filter((t) => t.date.startsWith(m)).reduce((s, t) => s + t.amount, 0),
    'הוצאות': expenseTxs.filter((t) => t.date.startsWith(m)).reduce((s, t) => s + t.amount, 0),
  })), [months, incomeTxs, expenseTxs]);

  // "כל הזמן" → year-over-year comparison instead of the (otherwise empty, since periodMonths([]) for allTime) monthly chart.
  const availableYears = useMemo(() => Array.from(new Set(filtered.map((t) => t.date.slice(0, 4)))).sort(), [filtered]);
  const yearlyMatrix = useMemo(() => {
    if (!period.isAllTime) return [];
    return Array.from({ length: 12 }, (_, i) => {
      const mm = String(i + 1).padStart(2, '0');
      const byYear: Record<string, { income: number; expense: number }> = {};
      for (const y of availableYears) {
        byYear[y] = {
          income: incomeTxs.filter((t) => t.date.startsWith(`${y}-${mm}`)).reduce((s, t) => s + t.amount, 0),
          expense: expenseTxs.filter((t) => t.date.startsWith(`${y}-${mm}`)).reduce((s, t) => s + t.amount, 0),
        };
      }
      return { monthLabel: MONTH_NAMES[i], monthNum: mm, byYear };
    });
  }, [period.isAllTime, availableYears, incomeTxs, expenseTxs]);
  const yearlyTotals = useMemo(() => {
    const totals: Record<string, { income: number; expense: number }> = {};
    for (const y of availableYears) {
      totals[y] = {
        income: yearlyMatrix.reduce((s, r) => s + r.byYear[y].income, 0),
        expense: yearlyMatrix.reduce((s, r) => s + r.byYear[y].expense, 0),
      };
    }
    return totals;
  }, [availableYears, yearlyMatrix]);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/25 p-4 text-center">
          <p className="text-xs text-emerald-400 mb-1">💰 הכנסות</p>
          <p className="text-2xl font-black text-white">{formatCurrency(incomeTotal)}</p>
        </div>
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/25 p-4 text-center">
          <p className="text-xs text-rose-400 mb-1">💸 הוצאות</p>
          <p className="text-2xl font-black text-white">{formatCurrency(expenseTotal)}</p>
        </div>
        <div className={`rounded-2xl p-4 text-center border ${incomeTotal - expenseTotal >= 0 ? 'bg-cyan-500/10 border-cyan-500/25' : 'bg-orange-500/10 border-orange-500/25'}`}>
          <p className="text-xs text-white/50 mb-1">📊 מאזן</p>
          <p className={`text-2xl font-black ${incomeTotal - expenseTotal >= 0 ? 'text-cyan-400' : 'text-orange-400'}`}>{formatCurrency(incomeTotal - expenseTotal)}</p>
        </div>
        <div className="rounded-2xl bg-violet-500/10 border border-violet-500/25 p-4 text-center">
          <p className="text-xs text-violet-400 mb-1">🏦 שיעור חיסכון</p>
          <p className="text-2xl font-black text-white">{incomeTotal > 0 ? Math.round((incomeTotal - expenseTotal) / incomeTotal * 100) : 0}%</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-center">
          <p className="text-[10px] text-white/50 mb-1">📊 יחס הוצאה/הכנסה</p>
          <p className={`text-lg font-black ${expRatio == null ? 'text-white/40' : expRatio > 90 ? 'text-red-400' : expRatio > 70 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {expRatio != null ? `${expRatio}%` : '—'}
          </p>
        </div>
        <div className="rounded-2xl bg-purple-500/10 border border-purple-500/25 p-3 text-center">
          <p className="text-[10px] text-purple-400 mb-1">📈 לאפיקי השקעה</p>
          <p className="text-lg font-black text-purple-300">{invRatio != null ? `${invRatio}%` : '—'}</p>
        </div>
        <div className="rounded-2xl bg-cyan-500/10 border border-cyan-500/25 p-3 text-center">
          <p className="text-[10px] text-cyan-400 mb-1">🔒 התחייבות קבועה</p>
          <p className="text-lg font-black text-cyan-300">{commitRatio != null ? `${commitRatio}%` : '—'}</p>
        </div>
      </div>

      {isMultiMonth && !period.isAllTime && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-sm">הכנסות מול הוצאות לפי חודש</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={[...byMonthChart].reverse()} barSize={14} barGap={2}>
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip content={<ChartTooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), name]} />} />
                  <Legend formatter={(v) => <span style={{ color: '#cbd5e1', fontSize: 12 }}>{v}</span>} />
                  <Bar dataKey="הכנסות" fill="#10b981" radius={[6, 6, 0, 0]}>
                    {[...byMonthChart].reverse().map((m, i) => <Cell key={i} fill="#10b981" fillOpacity={m.isCurrent ? 1 : 0.5} stroke={m.isCurrent ? '#fff' : 'none'} strokeWidth={1.5} />)}
                  </Bar>
                  <Bar dataKey="הוצאות" fill="#f43f5e" radius={[6, 6, 0, 0]}>
                    {[...byMonthChart].reverse().map((m, i) => <Cell key={i} fill="#f43f5e" fillOpacity={m.isCurrent ? 1 : 0.5} stroke={m.isCurrent ? '#fff' : 'none'} strokeWidth={1.5} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 space-y-1">
              {byMonthChart.filter((m) => m['הכנסות'] > 0 || m['הוצאות'] > 0).map((m) => {
                const bal = m['הכנסות'] - m['הוצאות'];
                return (
                  <div key={m.name} className={`grid grid-cols-4 gap-1 items-center py-1.5 border-b text-xs ${m.isCurrent ? 'bg-cyan-500/10 rounded-lg px-2 -mx-2 border-cyan-500/30 font-semibold' : 'border-white/5'}`}>
                    <span className={m.isCurrent ? 'text-cyan-300' : 'text-white/70'}>{m.name}{m.isCurrent ? ' ◀' : ''}</span>
                    <span className="text-emerald-400 text-right tabular-nums">{formatCurrency(m['הכנסות'])}</span>
                    <span className="text-rose-400 text-right tabular-nums">{formatCurrency(m['הוצאות'])}</span>
                    <span className={`font-bold text-right tabular-nums ${bal >= 0 ? 'text-cyan-400' : 'text-orange-400'}`}>{formatCurrency(bal)}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}

      {period.isAllTime && availableYears.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">הכנסות מול הוצאות — השוואה שנתית</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto -mx-4 px-1">
              <table dir="rtl" className="text-[11px] min-w-[600px] w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/10">
                    <th rowSpan={2} className="text-right py-2 pr-2 pl-1 text-white/50 font-medium sticky right-0 bg-slate-900 align-bottom min-w-[60px]">חודש</th>
                    {availableYears.map((y) => (
                      <th key={y} colSpan={2} className="text-center py-1 text-white/70 font-bold border-r border-white/10">{y}</th>
                    ))}
                  </tr>
                  <tr className="border-b border-white/10">
                    {availableYears.flatMap((y) => [
                      <th key={`${y}-inc`} className="text-center py-1 px-1 text-emerald-400/70 font-medium w-16 border-r border-white/5">הכנסות</th>,
                      <th key={`${y}-exp`} className="text-center py-1 px-1 text-rose-400/70 font-medium w-16">הוצאות</th>,
                    ])}
                  </tr>
                </thead>
                <tbody>
                  {yearlyMatrix.map((row) => (
                    <tr key={row.monthNum} className="border-b border-white/5">
                      <td className="py-1.5 pr-2 pl-1 text-white/70 sticky right-0 bg-slate-900">{row.monthLabel}</td>
                      {availableYears.flatMap((y) => {
                        const cell = row.byYear[y];
                        return [
                          <td key={`${y}-inc`} className="text-center py-1.5 px-1 text-emerald-400 border-r border-white/5">{cell.income > 0 ? formatCurrency(cell.income) : '—'}</td>,
                          <td key={`${y}-exp`} className="text-center py-1.5 px-1 text-rose-400">{cell.expense > 0 ? formatCurrency(cell.expense) : '—'}</td>,
                        ];
                      })}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-white/20 font-bold">
                    <td className="py-2 pr-2 pl-1 text-white sticky right-0 bg-slate-900">סה"כ</td>
                    {availableYears.flatMap((y) => [
                      <td key={`${y}-ti`} className="text-center py-2 px-1 text-emerald-300 border-r border-white/5">{formatCurrency(yearlyTotals[y].income)}</td>,
                      <td key={`${y}-te`} className="text-center py-2 px-1 text-rose-300">{formatCurrency(yearlyTotals[y].expense)}</td>,
                    ])}
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
