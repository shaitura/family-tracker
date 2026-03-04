import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { base44 } from '@/lib/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Transaction } from '@/types';
import { formatCurrency } from '@/utils';
import { format, subMonths, startOfMonth } from 'date-fns';
import { he } from 'date-fns/locale';

const MONTHS_COUNT = 6;

function buildMonthlyData(transactions: Transaction[]) {
  const months: { key: string; label: string }[] = [];
  for (let i = MONTHS_COUNT - 1; i >= 0; i--) {
    const d = subMonths(new Date(), i);
    months.push({ key: format(d, 'yyyy-MM'), label: format(d, 'MMM yy', { locale: he }) });
  }

  return months.map(({ key, label }) => {
    const txs = transactions.filter((t) => t.date.startsWith(key));
    const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const fixed = txs.filter((t) => t.type === 'expense' && t.expense_class === 'קבועה').reduce((s, t) => s + t.amount, 0);
    const variable = txs.filter((t) => t.type === 'expense' && t.expense_class === 'משתנה').reduce((s, t) => s + t.amount, 0);
    const shi = txs.filter((t) => t.type === 'expense' && t.payer === 'Shi').reduce((s, t) => s + t.amount, 0);
    const ortal = txs.filter((t) => t.type === 'expense' && t.payer === 'Ortal').reduce((s, t) => s + t.amount, 0);
    return { label, income, expenses, fixed, variable, שי: shi, אורטל: ortal };
  });
}

const tooltipStyle = { background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' };
const tf = (v: number) => formatCurrency(v);

export default function MonthlyReports() {
  const { data: transactions = [] } = useQuery<Transaction[]>({ queryKey: ['transactions'], queryFn: () => base44.entities.Transaction.filter() });
  const data = buildMonthlyData(transactions);

  const latestMonth = data[data.length - 1];
  const prevMonth = data[data.length - 2];
  const savingsRate = latestMonth.income > 0 ? Math.round((1 - latestMonth.expenses / latestMonth.income) * 100) : 0;
  const expChange = prevMonth?.expenses ? Math.round((latestMonth.expenses - prevMonth.expenses) / prevMonth.expenses * 100) : 0;

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <h1 className="text-lg font-bold text-white">דוחות חודשיים</h1>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">סקירה</TabsTrigger>
          <TabsTrigger value="fixed">קבוע/משתנה</TabsTrigger>
          <TabsTrigger value="compare">השוואה</TabsTrigger>
        </TabsList>

        {/* Tab 1: Overview */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-white/50">שיעור חיסכון</p>
                <p className={`text-2xl font-black mt-1 ${savingsRate > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{savingsRate}%</p>
                <p className="text-xs text-white/40">חודש נוכחי</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-white/50">שינוי הוצאות</p>
                <p className={`text-2xl font-black mt-1 ${expChange <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {expChange > 0 ? '+' : ''}{expChange}%
                </p>
                <p className="text-xs text-white/40">vs חודש קודם</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">הכנסות מול הוצאות</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={tf} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  <Area type="monotone" dataKey="income" name="הכנסות" stroke="#10b981" fill="url(#incomeGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="expenses" name="הוצאות" stroke="#f43f5e" fill="url(#expGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 space-y-2">
              {data.slice().reverse().slice(0, 4).map((m) => (
                <div key={m.label} className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0">
                  <span className="text-sm text-white/70">{m.label}</span>
                  <div className="flex gap-4">
                    <span className="text-xs text-emerald-400">{formatCurrency(m.income)}</span>
                    <span className="text-xs text-rose-400">{formatCurrency(m.expenses)}</span>
                    <span className={`text-xs font-bold ${m.income - m.expenses >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(m.income - m.expenses)}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Fixed/Variable */}
        <TabsContent value="fixed" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">הוצאות קבועות ומשתנות</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={tf} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  <Bar dataKey="fixed" name="קבועה" fill="#a855f7" radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="variable" name="משתנה" fill="#22d3ee" radius={[4, 4, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            {(['fixed', 'variable'] as const).map((k) => {
              const total = data.reduce((s, m) => s + m[k], 0);
              const avg = total / data.length;
              return (
                <Card key={k}>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-white/50">{k === 'fixed' ? 'הוצאות קבועות' : 'הוצאות משתנות'}</p>
                    <p className="text-xl font-black mt-1" style={{ color: k === 'fixed' ? '#a855f7' : '#22d3ee' }}>{formatCurrency(avg)}</p>
                    <p className="text-xs text-white/40">ממוצע חודשי</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab 3: Comparison */}
        <TabsContent value="compare" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">השוואה שי ואורטל</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={tf} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  <Line type="monotone" dataKey="שי" stroke="#22d3ee" strokeWidth={2.5} dot={{ fill: '#22d3ee', r: 4 }} />
                  <Line type="monotone" dataKey="אורטל" stroke="#ec4899" strokeWidth={2.5} dot={{ fill: '#ec4899', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 space-y-2">
              {data.slice().reverse().slice(0, 4).map((m) => (
                <div key={m.label} className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0">
                  <span className="text-sm text-white/70">{m.label}</span>
                  <div className="flex gap-4">
                    <span className="text-xs text-cyan-400">שי: {formatCurrency(m['שי'])}</span>
                    <span className="text-xs text-pink-400">אורטל: {formatCurrency(m['אורטל'])}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
