// src/pages/reports/IncomeTab.tsx
import { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Transaction } from '@/types';
import { formatCurrency, categoryColor } from '@/utils';
import { ReportPeriod, periodMonths } from '@/lib/reportPeriod';
import { byCategory, byMonth, categoryMonthMatrix } from '@/lib/reportAggregates';

const COLORS = ['#22d3ee', '#a855f7', '#ec4899', '#f97316', '#eab308', '#84cc16', '#10b981', '#f43f5e', '#06b6d4', '#8b5cf6'];
const PAYER_HE: Record<string, string> = { Shi: 'שי', Ortal: 'אורטל', Joint: 'משותף' };

type SubTab = 'category' | 'month' | 'payer';

export function IncomeTab({ transactions, period, category }: { transactions: Transaction[]; period: ReportPeriod; category: string }) {
  const [subTab, setSubTab] = useState<SubTab>('category');
  const months = useMemo(() => periodMonths(period), [period]);
  const isMultiMonth = months.length > 1 || period.isAllTime;

  const filtered = useMemo(
    () => transactions.filter((t) => t.type === 'income' && (!category || t.category === category)),
    [transactions, category],
  );

  const total = filtered.reduce((s, t) => s + t.amount, 0);
  const catData = useMemo(() => byCategory(filtered), [filtered]);
  const monthData = useMemo(() => byMonth(filtered, months), [filtered, months]);
  const matrix = useMemo(() => (isMultiMonth ? categoryMonthMatrix(filtered, months) : []), [filtered, months, isMultiMonth]);

  // "לפי משלם" — monthly-granular whenever the range spans >1 month (spec §3, applies to both types)
  const payerByMonth = useMemo(() => {
    if (!isMultiMonth) return [];
    return months.map((m) => {
      const row: Record<string, number | string> = { month: m };
      for (const p of ['Shi', 'Ortal', 'Joint']) {
        row[PAYER_HE[p]] = filtered.filter((t) => t.date.startsWith(m) && t.payer === p).reduce((s, t) => s + t.amount, 0);
      }
      return row;
    });
  }, [filtered, months, isMultiMonth]);
  const payerTotals = useMemo(() => {
    const acc: Record<string, number> = { Shi: 0, Ortal: 0, Joint: 0 };
    for (const t of filtered) acc[t.payer] = (acc[t.payer] || 0) + t.amount;
    return ['Shi', 'Ortal', 'Joint'].map((p) => ({ name: PAYER_HE[p], value: acc[p] }));
  }, [filtered]);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="text-center">
        <p className="text-xs text-white/50">סה"כ הכנסות</p>
        <p className="text-3xl font-black text-emerald-400">{formatCurrency(total)}</p>
        <p className="text-xs text-white/40">{filtered.length} עסקאות</p>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {([['category', 'לפי קטגוריה'], ['month', 'לפי חודש'], ['payer', 'לפי משלם']] as [SubTab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setSubTab(key)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${subTab === key ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-white/5 border border-white/10 text-white/50'}`}>
            {label}
          </button>
        ))}
      </div>

      {subTab === 'category' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={catData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" nameKey="name" paddingAngle={2}>
                    {catData.map((entry) => <Cell key={entry.name} fill={categoryColor(entry.name)} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          {isMultiMonth && matrix.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">קטגוריה × חודש</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto -mx-4 px-1">
                  <table dir="rtl" className="text-[11px] min-w-[780px] w-full border-collapse">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-right py-2 pr-2 pl-1 text-white/50 font-medium sticky right-0 bg-slate-900 min-w-[70px]">קטגוריה</th>
                        {months.map((m) => <th key={m} className="text-center py-2 px-0.5 text-white/40 font-medium w-12">{m.slice(5)}</th>)}
                        <th className="text-center py-2 px-1 text-emerald-400/80 font-bold w-16">סה"כ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.map((row) => (
                        <tr key={row.category} className="border-b border-white/5">
                          <td className="py-2 pr-2 pl-1 font-medium sticky right-0 bg-slate-900" style={{ color: categoryColor(row.category) }}>{row.category}</td>
                          {months.map((m) => <td key={m} className="text-center py-2 px-0.5 text-white">{row.byMonth[m] ? Math.round(row.byMonth[m]).toLocaleString('he') : '—'}</td>)}
                          <td className="text-center py-2 px-1 text-white font-bold">{formatCurrency(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {subTab === 'month' && (
        <Card>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={[...monthData].reverse()} barSize={24}>
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {monthData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {subTab === 'payer' && (
        <Card>
          <CardContent className="pt-4">
            {isMultiMonth ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={payerByMonth} barSize={20}>
                  <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={(v: number) => formatCurrency(v as number)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#ffffff80' }} />
                  <Bar dataKey="שי" stackId="a" fill="#22d3ee" />
                  <Bar dataKey="אורטל" stackId="a" fill="#ec4899" />
                  <Bar dataKey="משותף" stackId="a" fill="#a855f7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              payerTotals.map(({ name, value }) => (
                <div key={name} className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-sm text-white">{name}</span>
                  <span className="text-sm font-bold text-white">{formatCurrency(value)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
