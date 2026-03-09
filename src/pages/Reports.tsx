import { useState } from 'react';
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

  const filtered = transactions.filter((t) => {
    const prefix = fullYear ? `${year}-` : `${year}-${month}`;
    if (!t.date.startsWith(prefix)) return false;
    if (t.type !== txType) return false;
    if (expClass && t.expense_class !== expClass) return false;
    return true;
  });

  // By category
  const byCat: Record<string, number> = {};
  filtered.forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const catData = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));

  // By payer
  const byPayer: Record<string, number> = {};
  filtered.forEach((t) => { byPayer[t.payer] = (byPayer[t.payer] || 0) + t.amount; });
  const payerData = Object.entries(byPayer).map(([payer, amount]) => ({ name: PAYER_LABELS[payer] || payer, amount }));

  // By month (only used in full-year mode)
  const months = Array.from({ length: 12 }, (_, i) => ({ val: String(i + 1).padStart(2, '0'), label: new Date(2000, i).toLocaleString('he', { month: 'short' }) }));
  const byMonth = months.map(({ val, label }) => {
    const sum = filtered.filter((t) => t.date.startsWith(`${year}-${val}`)).reduce((s, t) => s + t.amount, 0);
    return { name: label, amount: sum };
  });

  const total = filtered.reduce((s, t) => s + t.amount, 0);

  const exportExcel = async () => {
    const { utils, writeFile } = await import('xlsx');
    const rows = filtered.map((t) => ({
      תאריך: t.date, קטגוריה: t.category, סכום: t.amount,
      משלם: PAYER_LABELS[t.payer], אמצעי_תשלום: t.payment_method,
      סוג: t.expense_class, הערות: t.notes || '',
    }));
    const wb = utils.book_new();
    utils.book_append_sheet(wb, utils.json_to_sheet(rows), 'דוח');
    writeFile(wb, `family-report-${year}-${fullYear ? 'full' : month}.xlsx`);
  };

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">דוחות</h1>
        <Button variant="outline" size="sm" onClick={exportExcel}>
          <Download className="w-4 h-4 ml-1" /> Excel
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          {/* Year + month/full-year toggle */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-white/50 mb-1">שנה</p>
              <select value={year} onChange={(e) => setYear(e.target.value)} className="w-full h-9 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none">
                {[currentYear - 1, currentYear, currentYear + 1].map((y) => <option key={y} value={y} className="bg-slate-800">{y}</option>)}
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
        <TabsList>
          {fullYear && <TabsTrigger value="monthly">לפי חודש</TabsTrigger>}
          <TabsTrigger value="category">לפי קטגוריה</TabsTrigger>
          <TabsTrigger value="payer">לפי משלם</TabsTrigger>
        </TabsList>

        {/* Monthly breakdown — full year only */}
        {fullYear && (
          <TabsContent value="monthly">
            {byMonth.some((m) => m.amount > 0) ? (
              <Card>
                <CardContent className="pt-4">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={byMonth} barSize={28}>
                      <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis hide />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }} />
                      <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                        {byMonth.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        <LabelList dataKey="amount" position="top" style={{ fill: '#e2e8f0', fontSize: 10, fontWeight: 'bold' }} formatter={(v: number) => v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v > 0 ? String(Math.round(v)) : ''} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="mt-3 space-y-1.5">
                    {byMonth.filter((m) => m.amount > 0).sort((a, b) => b.amount - a.amount).map(({ name, amount }) => (
                      <div key={name} className="flex justify-between items-center py-1 border-b border-white/5">
                        <span className="text-sm text-white">{name}</span>
                        <div className="text-left">
                          <span className="text-sm font-bold text-white">{formatCurrency(amount)}</span>
                          <span className="text-xs text-white/40 mr-2">{total ? Math.round(amount / total * 100) : 0}%</span>
                        </div>
                      </div>
                    ))}
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
      </Tabs>
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
