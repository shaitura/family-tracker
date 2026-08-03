import { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Transaction, CHILD_TAGS } from '@/types';
import { formatCurrency, categoryColor, PAYER_LABELS, CHILD_LABELS } from '@/utils';
import { ReportPeriod, periodMonths, inPeriod } from '@/lib/reportPeriod';
import { byCategory, byPayer, byMonth, fixedVariableSplit, categoryMonthMatrix } from '@/lib/reportAggregates';
import { ChartTooltip } from './ChartTooltip';
import { FixedVariableSplitCard } from './FixedVariableSplitCard';

const COLORS = ['#22d3ee', '#a855f7', '#ec4899', '#f97316', '#eab308', '#84cc16', '#10b981', '#f43f5e', '#06b6d4', '#8b5cf6'];
const CHILD_COLORS: Record<string, string> = { Yuval: '#a855f7', Aviv: '#10b981', Ziv: '#f59e0b', Shared: '#6366f1', none: '#64748b' };

type SubTab = 'category' | 'month' | 'payer' | 'split';

export function ExpensesTab({ transactions, period, category }: { transactions: Transaction[]; period: ReportPeriod; category: string }) {
  const [subTab, setSubTab] = useState<SubTab>('category');
  const months = useMemo(() => periodMonths(period), [period]);
  const isMultiMonth = months.length > 1 || period.isAllTime;

  const filtered = useMemo(
    () => transactions.filter((t) => t.type === 'expense' && (!category || t.category === category) && inPeriod(t.date, period)),
    [transactions, category, period],
  );

  const total = filtered.reduce((s, t) => s + t.amount, 0);
  const catData = useMemo(() => byCategory(filtered), [filtered]);
  const payerData = useMemo(() => byPayer(filtered), [filtered]);
  const payerByMonth = useMemo(() => {
    if (!isMultiMonth) return [];
    return months.map((m) => {
      const row: Record<string, number | string> = { month: m };
      for (const p of ['Shi', 'Ortal', 'Joint']) {
        row[PAYER_LABELS[p] ?? p] = filtered.filter((t) => t.date.startsWith(m) && t.payer === p).reduce((s, t) => s + t.amount, 0);
      }
      return row;
    });
  }, [filtered, months, isMultiMonth]);
  const monthData = useMemo(() => byMonth(filtered, months), [filtered, months]);
  const split = useMemo(() => fixedVariableSplit(filtered), [filtered]);
  const matrix = useMemo(() => (isMultiMonth ? categoryMonthMatrix(filtered, months) : []), [filtered, months, isMultiMonth]);

  // Per-child breakdown — always shown when the active category filter is "ילדים" or unset
  const showChild = !category || category === 'ילדים';
  const kidsExpenses = useMemo(() => filtered.filter((t) => t.category === 'ילדים'), [filtered]);
  const childTotals = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const t of kidsExpenses) { const k = t.child || 'none'; acc[k] = (acc[k] || 0) + t.amount; }
    const order: string[] = [...CHILD_TAGS, 'none'];
    return order.filter((k) => acc[k]).map((k) => ({ key: k, label: k === 'none' ? 'ללא שיוך' : (CHILD_LABELS[k] ?? k), value: acc[k] }));
  }, [kidsExpenses]);
  const childTotal = childTotals.reduce((s, d) => s + d.value, 0);
  const childByMonth = useMemo(() => {
    if (!isMultiMonth) return [];
    return months.map((m) => {
      const row: Record<string, number | string> = { month: m };
      for (const child of [...CHILD_TAGS, 'none']) {
        row[child] = kidsExpenses.filter((t) => t.date.startsWith(m) && (t.child || 'none') === child).reduce((s, t) => s + t.amount, 0);
      }
      return row;
    });
  }, [kidsExpenses, months, isMultiMonth]);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="text-center">
        <p className="text-xs text-white/50">סה"כ הוצאות</p>
        <p className="text-3xl font-black text-rose-400">{formatCurrency(total)}</p>
        <p className="text-xs text-white/40">{filtered.length} עסקאות</p>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {([['category', 'לפי קטגוריה'], ['month', 'לפי חודש'], ['payer', 'לפי משלם'], ['split', 'קבועה / משתנה']] as [SubTab, string][]).map(([key, label]) => (
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
                  <Tooltip content={<ChartTooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), name]} />} />
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
                        <th className="text-center py-2 px-1 text-cyan-400/80 font-bold w-16">סה"כ</th>
                        <th className="text-center py-2 px-1 text-white/40 font-medium w-16">ממוצע</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.map((row) => (
                        <tr key={row.category} className="border-b border-white/5">
                          <td className="py-2 pr-2 pl-1 font-medium sticky right-0 bg-slate-900" style={{ color: categoryColor(row.category) }}>{row.category}</td>
                          {months.map((m) => (
                            <td key={m} className={`text-center py-2 px-0.5 ${row.byMonth[m] ? 'text-white' : 'text-white/15'}`}>
                              {row.byMonth[m] ? Math.round(row.byMonth[m]).toLocaleString('he') : '—'}
                            </td>
                          ))}
                          <td className="text-center py-2 px-1 text-white font-bold">{formatCurrency(row.total)}</td>
                          <td className="text-center py-2 px-1 text-white/50">{formatCurrency(row.avg)}</td>
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
                <Tooltip content={<ChartTooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), name]} />} />
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
                  <Tooltip content={<ChartTooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), name]} />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#ffffff80' }} />
                  <Bar dataKey={PAYER_LABELS['Shi']} stackId="a" fill="#22d3ee" />
                  <Bar dataKey={PAYER_LABELS['Ortal']} stackId="a" fill="#ec4899" />
                  <Bar dataKey={PAYER_LABELS['Joint']} stackId="a" fill="#a855f7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              payerData.map(({ name, value }) => (
                <div key={name} className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-sm text-white">{name}</span>
                  <span className="text-sm font-bold text-white">{formatCurrency(value)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {subTab === 'split' && (
        <FixedVariableSplitCard split={split} fixedLabel="קבועה" varLabel="משתנה" />
      )}

      {showChild && childTotals.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">👨‍👩‍👧‍👦 הוצאות ילדים לפי ילד/ה</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-2">
            {childTotals.map(({ key, label, value }) => {
              const color = CHILD_COLORS[key] ?? '#64748b';
              const pct = childTotal ? Math.round(value / childTotal * 100) : 0;
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-sm text-white flex-1">{label}</span>
                    <span className="text-sm font-bold text-white">{formatCurrency(value)}</span>
                    <span className="text-xs text-white/40 w-10 text-left">{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} /></div>
                </div>
              );
            })}
            {isMultiMonth && childByMonth.length > 0 && (
              <div className="pt-3">
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={childByMonth} barSize={10}>
                    <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip content={<ChartTooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), name]} />} />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#ffffff80' }} formatter={(value: string) => CHILD_LABELS[value] ?? (value === 'none' ? 'ללא שיוך' : value)} />
                    {[...CHILD_TAGS, 'none'].map((child) => (
                      <Bar key={child} dataKey={child} stackId="a" fill={CHILD_COLORS[child] ?? '#64748b'} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
