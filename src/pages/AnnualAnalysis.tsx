import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { base44 } from '@/lib/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Transaction, CATEGORIES } from '@/types';
import { formatCurrency, categoryColor } from '@/utils';

const MONTH_NAMES = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יולי', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

function compactNum(val: number): string {
  if (val <= 0) return '—';
  if (val >= 1000) return (val / 1000).toFixed(1).replace('.0', '') + 'K';
  return String(Math.round(val));
}

const TOOLTIP_STYLE = {
  background: '#1e293b',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  color: '#fff',
};

// ── Annual Table Tab ──────────────────────────────────────────────────────────
function AnnualTableTab({ expenses }: { expenses: Transaction[] }) {
  const expByCatMonth: Record<string, Record<string, number>> = {};
  CATEGORIES.forEach((cat) => { expByCatMonth[cat] = {}; });
  expenses.forEach((t) => {
    const m = t.date.slice(5, 7);
    expByCatMonth[t.category][m] = (expByCatMonth[t.category][m] || 0) + t.amount;
  });

  const activeCategories = CATEGORIES.filter((cat) =>
    MONTHS.some((m) => (expByCatMonth[cat][m] || 0) > 0),
  );

  const monthlyTotals = MONTHS.map((m) =>
    expenses.filter((t) => t.date.slice(5, 7) === m).reduce((s, t) => s + t.amount, 0),
  );

  const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="overflow-x-auto -mx-4 px-1">
          <table className="text-[11px] min-w-[780px] w-full border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-right py-2 pr-2 pl-1 text-white/50 font-medium sticky right-0 bg-slate-900 min-w-[70px]">קטגוריה</th>
                {MONTH_NAMES.map((m) => (
                  <th key={m} className="text-center py-2 px-0.5 text-white/40 font-medium w-12">{m}</th>
                ))}
                <th className="text-center py-2 px-1 text-cyan-400/80 font-bold w-16">סה"כ</th>
                <th className="text-center py-2 px-1 text-white/40 font-medium w-16">ממוצע</th>
              </tr>
            </thead>
            <tbody>
              {activeCategories.map((cat) => {
                const rowTotal = MONTHS.reduce((s, m) => s + (expByCatMonth[cat][m] || 0), 0);
                const rowAvg = rowTotal / 12;
                return (
                  <tr key={cat} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                    <td
                      className="py-2 pr-2 pl-1 font-medium sticky right-0 bg-slate-900"
                      style={{ color: categoryColor(cat) }}
                    >
                      {cat}
                    </td>
                    {MONTHS.map((m) => {
                      const val = expByCatMonth[cat][m] || 0;
                      return (
                        <td key={m} className={`text-center py-2 px-0.5 ${val > 0 ? 'text-white' : 'text-white/15'}`}>
                          {compactNum(val)}
                        </td>
                      );
                    })}
                    <td className="text-center py-2 px-1 text-white font-bold">
                      {rowTotal > 0 ? formatCurrency(rowTotal) : '—'}
                    </td>
                    <td className="text-center py-2 px-1 text-white/50">
                      {rowTotal > 0 ? formatCurrency(rowAvg) : '—'}
                    </td>
                  </tr>
                );
              })}
              {/* Totals row */}
              <tr className="border-t-2 border-white/20">
                <td className="py-2 pr-2 pl-1 text-white font-bold sticky right-0 bg-slate-900">סה"כ</td>
                {monthlyTotals.map((total, i) => (
                  <td key={i} className={`text-center py-2 px-0.5 font-bold ${total > 0 ? 'text-cyan-400' : 'text-white/15'}`}>
                    {compactNum(total)}
                  </td>
                ))}
                <td className="text-center py-2 px-1 text-cyan-400 font-black">{formatCurrency(totalExpense)}</td>
                <td className="text-center py-2 px-1 text-cyan-300 font-bold">{formatCurrency(totalExpense / 12)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Fixed vs Variable Tab ─────────────────────────────────────────────────────
function FixedVariableTab({ expenses, incomes }: { expenses: Transaction[]; incomes: Transaction[] }) {
  const [mode, setMode] = useState<'expense' | 'income'>('expense');

  const monthData = MONTHS.map((m, i) => {
    const mExp = expenses.filter((t) => t.date.slice(5, 7) === m);
    const mInc = incomes.filter((t) => t.date.slice(5, 7) === m);
    return {
      month: MONTH_NAMES[i],
      expFixed: mExp.filter((t) => t.expense_class === 'קבועה').reduce((s, t) => s + t.amount, 0),
      expVar: mExp.filter((t) => t.expense_class === 'משתנה').reduce((s, t) => s + t.amount, 0),
      incFixed: mInc.filter((t) => t.expense_class === 'קבועה').reduce((s, t) => s + t.amount, 0),
      incVar: mInc.filter((t) => t.expense_class === 'משתנה').reduce((s, t) => s + t.amount, 0),
    };
  });

  const fixedKey = mode === 'expense' ? 'expFixed' : 'incFixed';
  const varKey = mode === 'expense' ? 'expVar' : 'incVar';

  const totalFixed = monthData.reduce((s, m) => s + m[fixedKey], 0);
  const totalVar = monthData.reduce((s, m) => s + m[varKey], 0);
  const grandTotal = totalFixed + totalVar;
  const activeMonths = monthData.filter((m) => m[fixedKey] > 0 || m[varKey] > 0).length || 1;

  const chartData = monthData.map((m) => ({
    month: m.month,
    קבועה: m[fixedKey],
    משתנה: m[varKey],
  }));

  return (
    <div className="space-y-3">
      {/* Toggle */}
      <div className="flex gap-2">
        {[{ v: 'expense', l: '💸 הוצאות' }, { v: 'income', l: '💰 הכנסות' }].map(({ v, l }) => (
          <button
            key={v}
            onClick={() => setMode(v as 'expense' | 'income')}
            className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-all ${
              mode === v
                ? 'bg-cyan-500/30 border border-cyan-500/50 text-white'
                : 'bg-white/5 border border-white/10 text-white/50'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'קבועות', val: totalFixed, pct: grandTotal ? Math.round((totalFixed / grandTotal) * 100) : 0, color: 'text-purple-400' },
          { label: 'משתנות', val: totalVar, pct: grandTotal ? Math.round((totalVar / grandTotal) * 100) : 0, color: 'text-cyan-400' },
          { label: 'שנתי', val: grandTotal, pct: null, color: 'text-white' },
        ].map(({ label, val, pct, color }) => (
          <Card key={label}>
            <CardContent className="pt-3 pb-2 text-center">
              <p className="text-[10px] text-white/40 mb-0.5">{label}</p>
              <p className={`text-sm font-black ${color}`}>{formatCurrency(val)}</p>
              {pct !== null && <p className="text-[10px] text-white/30">{pct}%</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart */}
      <Card>
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barSize={14}>
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="קבועה" fill="#a855f7" radius={[4, 4, 0, 0]} />
              <Bar dataKey="משתנה" fill="#22d3ee" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Monthly breakdown table */}
      <Card>
        <CardContent className="pt-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 text-white/40">
                <th className="text-right py-1.5">חודש</th>
                <th className="text-center py-1.5 text-purple-400/70">קבועות</th>
                <th className="text-center py-1.5 text-cyan-400/70">משתנות</th>
                <th className="text-center py-1.5">סה"כ</th>
                <th className="text-center py-1.5">% קבועות</th>
              </tr>
            </thead>
            <tbody>
              {monthData.map((m, i) => {
                const fixed = m[fixedKey];
                const variable = m[varKey];
                const total = fixed + variable;
                const pct = total > 0 ? Math.round((fixed / total) * 100) : 0;
                if (total === 0) return null;
                return (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/[0.03]">
                    <td className="py-1.5 text-white/70">{m.month}</td>
                    <td className="text-center py-1.5 text-purple-400 font-medium">{formatCurrency(fixed)}</td>
                    <td className="text-center py-1.5 text-cyan-400 font-medium">{formatCurrency(variable)}</td>
                    <td className="text-center py-1.5 text-white font-bold">{formatCurrency(total)}</td>
                    <td className="text-center py-1.5 text-white/50">{pct}%</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-white/20 font-bold">
                <td className="py-2 text-white">שנתי</td>
                <td className="text-center py-2 text-purple-300">{formatCurrency(totalFixed)}</td>
                <td className="text-center py-2 text-cyan-300">{formatCurrency(totalVar)}</td>
                <td className="text-center py-2 text-white">{formatCurrency(grandTotal)}</td>
                <td className="text-center py-2 text-white/50">
                  {grandTotal ? Math.round((totalFixed / grandTotal) * 100) : 0}%
                </td>
              </tr>
              <tr className="text-white/50">
                <td className="py-1.5">ממוצע חודשי</td>
                <td className="text-center py-1.5">{formatCurrency(totalFixed / activeMonths)}</td>
                <td className="text-center py-1.5">{formatCurrency(totalVar / activeMonths)}</td>
                <td className="text-center py-1.5">{formatCurrency(grandTotal / activeMonths)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Income Distribution Tab ───────────────────────────────────────────────────
function IncomeDistributionTab({ incomes }: { incomes: Transaction[] }) {
  const monthData = MONTHS.map((m, i) => {
    const mInc = incomes.filter((t) => t.date.slice(5, 7) === m);
    const shi = mInc.filter((t) => t.payer === 'Shi').reduce((s, t) => s + t.amount, 0);
    const ortal = mInc.filter((t) => t.payer === 'Ortal').reduce((s, t) => s + t.amount, 0);
    const joint = mInc.filter((t) => t.payer === 'Joint').reduce((s, t) => s + t.amount, 0);
    return { month: MONTH_NAMES[i], shi, ortal, joint, total: shi + ortal + joint };
  });

  const totalShi = monthData.reduce((s, m) => s + m.shi, 0);
  const totalOrtal = monthData.reduce((s, m) => s + m.ortal, 0);
  const totalJoint = monthData.reduce((s, m) => s + m.joint, 0);
  const totalIncome = totalShi + totalOrtal + totalJoint;
  const activeMonths = monthData.filter((m) => m.total > 0).length || 1;

  const chartData = monthData.filter((m) => m.total > 0).map((m) => ({
    month: m.month,
    שי: m.shi,
    אורטל: m.ortal,
    משותף: m.joint,
  }));

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'שי', val: totalShi, color: 'text-cyan-400' },
          { label: 'אורטל', val: totalOrtal, color: 'text-pink-400' },
          { label: 'משותף', val: totalJoint, color: 'text-purple-400' },
        ].map(({ label, val, color }) => (
          <Card key={label}>
            <CardContent className="pt-3 pb-2 text-center">
              <p className="text-[10px] text-white/40 mb-0.5">{label}</p>
              <p className={`text-sm font-black ${color}`}>{formatCurrency(val)}</p>
              <p className="text-[10px] text-white/30">
                {totalIncome ? Math.round((val / totalIncome) * 100) : 0}%
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart */}
      <Card>
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barSize={20}>
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="שי" fill="#22d3ee" stackId="a" />
              <Bar dataKey="אורטל" fill="#ec4899" stackId="a" />
              <Bar dataKey="משותף" fill="#a855f7" radius={[4, 4, 0, 0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Monthly table */}
      <Card>
        <CardContent className="pt-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 text-white/40">
                <th className="text-right py-1.5">חודש</th>
                <th className="text-center py-1.5 text-cyan-400/70">שי</th>
                <th className="text-center py-1.5 text-pink-400/70">אורטל</th>
                <th className="text-center py-1.5 text-purple-400/70">משותף</th>
                <th className="text-center py-1.5">סה"כ</th>
              </tr>
            </thead>
            <tbody>
              {monthData.map((m, i) => {
                if (m.total === 0) return null;
                return (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/[0.03]">
                    <td className="py-1.5 text-white/70">{m.month}</td>
                    <td className="text-center py-1.5 text-cyan-400">{m.shi > 0 ? formatCurrency(m.shi) : '—'}</td>
                    <td className="text-center py-1.5 text-pink-400">{m.ortal > 0 ? formatCurrency(m.ortal) : '—'}</td>
                    <td className="text-center py-1.5 text-purple-400">{m.joint > 0 ? formatCurrency(m.joint) : '—'}</td>
                    <td className="text-center py-1.5 text-white font-bold">{formatCurrency(m.total)}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-white/20 font-bold">
                <td className="py-2 text-white">שנתי</td>
                <td className="text-center py-2 text-cyan-300">{formatCurrency(totalShi)}</td>
                <td className="text-center py-2 text-pink-300">{formatCurrency(totalOrtal)}</td>
                <td className="text-center py-2 text-purple-300">{formatCurrency(totalJoint)}</td>
                <td className="text-center py-2 text-white">{formatCurrency(totalIncome)}</td>
              </tr>
              <tr className="text-white/50">
                <td className="py-1.5">ממוצע חודשי</td>
                <td className="text-center py-1.5">{formatCurrency(totalShi / activeMonths)}</td>
                <td className="text-center py-1.5">{formatCurrency(totalOrtal / activeMonths)}</td>
                <td className="text-center py-1.5">{formatCurrency(totalJoint / activeMonths)}</td>
                <td className="text-center py-1.5">{formatCurrency(totalIncome / activeMonths)}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Net Profit Tab ────────────────────────────────────────────────────────────
function NetProfitTab({ expenses, incomes }: { expenses: Transaction[]; incomes: Transaction[] }) {
  const monthData = MONTHS.map((m, i) => {
    const income = incomes.filter((t) => t.date.slice(5, 7) === m).reduce((s, t) => s + t.amount, 0);
    const expense = expenses.filter((t) => t.date.slice(5, 7) === m).reduce((s, t) => s + t.amount, 0);
    return { month: MONTH_NAMES[i], income, expense, net: income - expense };
  });

  const totalIncome = incomes.reduce((s, t) => s + t.amount, 0);
  const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);
  const totalNet = totalIncome - totalExpense;
  const activeMonths = monthData.filter((m) => m.income > 0 || m.expense > 0).length || 1;
  const avgNet = totalNet / activeMonths;
  const avgIncome = totalIncome / activeMonths;
  const avgExpense = totalExpense / activeMonths;

  const chartData = monthData.filter((m) => m.income > 0 || m.expense > 0);

  return (
    <div className="space-y-3">
      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'הכנסות שנתיות', val: totalIncome, color: 'text-green-400' },
          { label: 'הוצאות שנתיות', val: totalExpense, color: 'text-red-400' },
          { label: 'רווח נקי שנתי', val: totalNet, color: totalNet >= 0 ? 'text-emerald-400' : 'text-rose-400' },
        ].map(({ label, val, color }) => (
          <Card key={label}>
            <CardContent className="pt-3 pb-2 text-center">
              <p className="text-[10px] text-white/40 mb-0.5">{label}</p>
              <p className={`text-sm font-black ${color}`}>{formatCurrency(Math.abs(val))}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Avg net profit */}
      <Card>
        <CardContent className="py-3 text-center">
          <p className="text-xs text-white/40">רווח נקי ממוצע חודשי</p>
          <p className={`text-2xl font-black mt-0.5 ${avgNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {avgNet < 0 ? '-' : ''}{formatCurrency(Math.abs(avgNet))}
          </p>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barSize={12}>
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="income" name="הכנסות" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="הוצאות" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="net" name="רווח נקי" fill="#22d3ee" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Monthly table */}
      <Card>
        <CardContent className="pt-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 text-white/40">
                <th className="text-right py-1.5">חודש</th>
                <th className="text-center py-1.5 text-green-400/70">הכנסות</th>
                <th className="text-center py-1.5 text-red-400/70">הוצאות</th>
                <th className="text-center py-1.5">רווח נקי</th>
              </tr>
            </thead>
            <tbody>
              {monthData.map((m, i) => {
                if (m.income === 0 && m.expense === 0) return null;
                const positive = m.net >= 0;
                return (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/[0.03]">
                    <td className="py-1.5 text-white/70">{m.month}</td>
                    <td className="text-center py-1.5 text-green-400">{formatCurrency(m.income)}</td>
                    <td className="text-center py-1.5 text-red-400">{formatCurrency(m.expense)}</td>
                    <td className={`text-center py-1.5 font-bold ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {m.net < 0 ? '-' : ''}{formatCurrency(Math.abs(m.net))}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-white/20 font-bold">
                <td className="py-2 text-white">שנתי</td>
                <td className="text-center py-2 text-green-300">{formatCurrency(totalIncome)}</td>
                <td className="text-center py-2 text-red-300">{formatCurrency(totalExpense)}</td>
                <td className={`text-center py-2 ${totalNet >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {totalNet < 0 ? '-' : ''}{formatCurrency(Math.abs(totalNet))}
                </td>
              </tr>
              <tr className="text-white/50">
                <td className="py-1.5">ממוצע חודשי</td>
                <td className="text-center py-1.5">{formatCurrency(avgIncome)}</td>
                <td className="text-center py-1.5">{formatCurrency(avgExpense)}</td>
                <td className={`text-center py-1.5 ${avgNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {avgNet < 0 ? '-' : ''}{formatCurrency(Math.abs(avgNet))}
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AnnualAnalysis() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));

  const { data: transactions = [] } = useQuery<Transaction[]>({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.filter(),
  });

  const yearTx = transactions.filter((t) => t.date.startsWith(year));
  const expenses = yearTx.filter((t) => t.type === 'expense');
  const incomes = yearTx.filter((t) => t.type === 'income');

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">ניתוח שנתי</h1>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="h-9 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none"
        >
          {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
            <option key={y} value={y} className="bg-slate-800">{y}</option>
          ))}
        </select>
      </div>

      <Tabs defaultValue="table">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="table" className="text-xs">טבלה</TabsTrigger>
          <TabsTrigger value="fixed" className="text-xs">קבועות</TabsTrigger>
          <TabsTrigger value="income" className="text-xs">הכנסות</TabsTrigger>
          <TabsTrigger value="profit" className="text-xs">רווח</TabsTrigger>
        </TabsList>

        <TabsContent value="table">
          <AnnualTableTab expenses={expenses} />
        </TabsContent>

        <TabsContent value="fixed">
          <FixedVariableTab expenses={expenses} incomes={incomes} />
        </TabsContent>

        <TabsContent value="income">
          <IncomeDistributionTab incomes={incomes} />
        </TabsContent>

        <TabsContent value="profit">
          <NetProfitTab expenses={expenses} incomes={incomes} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
