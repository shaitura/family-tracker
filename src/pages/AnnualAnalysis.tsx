import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LabelList,
  PieChart, Pie, Cell,
} from 'recharts';
import { RefreshCw } from 'lucide-react';
import { base44 } from '@/lib/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Transaction } from '@/types';
import { formatCurrency, categoryColor } from '@/utils';

const MONTH_NAMES = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יולי', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

function compactNum(val: number): string {
  if (val <= 0) return '';
  if (val >= 1000) return (val / 1000).toFixed(1).replace('.0', '') + 'K';
  return String(Math.round(val));
}

const TOOLTIP_STYLE = {
  background: '#1e293b',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  color: '#fff',
};

// ── Annual Table Tab (סיכום כולל) ─────────────────────────────────────────────
function AnnualTableTab({ expenses }: { expenses: Transaction[] }) {
  // Build dynamically from actual data so unknown/extra categories are never dropped
  const expByCatMonth: Record<string, Record<string, number>> = {};
  expenses.forEach((t) => {
    if (!expByCatMonth[t.category]) expByCatMonth[t.category] = {};
    const m = t.date.slice(5, 7);
    expByCatMonth[t.category][m] = (expByCatMonth[t.category][m] || 0) + t.amount;
  });

  const activeCategories = Object.keys(expByCatMonth).filter((cat) =>
    MONTHS.some((m) => (expByCatMonth[cat][m] || 0) > 0),
  );

  const monthlyTotals = MONTHS.map((m) =>
    expenses.filter((t) => t.date.slice(5, 7) === m).reduce((s, t) => s + t.amount, 0),
  );

  const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);

  // Pie chart data – category totals
  const pieData = activeCategories.map((cat) => ({
    name: cat,
    value: MONTHS.reduce((s, m) => s + (expByCatMonth[cat][m] || 0), 0),
  })).filter((d) => d.value > 0);

  return (
    <div className="space-y-3">
      {/* Distribution chart */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-xs text-white/40 text-center mb-3">חלוקת הוצאות לפי קטגוריה</p>
          <div className="flex items-center gap-3" dir="ltr">
            {/* Pie */}
            <div className="flex-1 min-w-0">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={88}
                    innerRadius={40}
                    paddingAngle={2}
                    label={({ cx: pcx, cy: pcy, midAngle, outerRadius: or, percent, value }) => {
                      if (percent < 0.06) return null;
                      const RADIAN = Math.PI / 180;
                      const radius = or + 18;
                      const x = pcx + radius * Math.cos(-midAngle * RADIAN);
                      const y = pcy + radius * Math.sin(-midAngle * RADIAN);
                      return (
                        <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={9} fill="#cbd5e1">
                          <tspan x={x} dy="-5">{compactNum(value)}</tspan>
                          <tspan x={x} dy="11">{Math.round(percent * 100)}%</tspan>
                        </text>
                      );
                    }}
                    labelLine={false}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={categoryColor(entry.name)} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Legend – right side */}
            <div className="flex flex-col gap-1.5 shrink-0 w-[128px]" dir="rtl">
              {pieData.sort((a, b) => b.value - a.value).map((entry) => {
                const pct = totalExpense > 0 ? Math.round((entry.value / totalExpense) * 100) : 0;
                return (
                  <div key={entry.name} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: categoryColor(entry.name) }} />
                    <span className="text-[10px] text-white/70 flex-1 truncate">{entry.name}</span>
                    <span className="text-[9px] text-white/50 shrink-0">{compactNum(entry.value)}</span>
                    <span className="text-[9px] text-white/30 w-6 text-left shrink-0">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-4">
          <div className="overflow-x-auto -mx-4 px-1" dir="rtl">
            <table dir="rtl" className="text-[11px] min-w-[780px] w-full border-collapse">
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
                            {val > 0 ? compactNum(val) : '—'}
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
    </div>
  );
}

// ── Fixed vs Variable Tab (expenses only) ─────────────────────────────────────
function FixedVariableTab({ expenses }: { expenses: Transaction[] }) {
  const monthData = MONTHS.map((m, i) => {
    const mExp = expenses.filter((t) => t.date.slice(5, 7) === m);
    return {
      month: MONTH_NAMES[i],
      fixed: mExp.filter((t) => t.expense_class === 'קבועה').reduce((s, t) => s + t.amount, 0),
      variable: mExp.filter((t) => t.expense_class === 'משתנה').reduce((s, t) => s + t.amount, 0),
    };
  });

  const totalFixed = monthData.reduce((s, m) => s + m.fixed, 0);
  const totalVar = monthData.reduce((s, m) => s + m.variable, 0);
  const grandTotal = totalFixed + totalVar;
  const activeMonths = monthData.filter((m) => m.fixed > 0 || m.variable > 0).length || 1;

  const chartData = monthData.map((m) => ({
    month: m.month,
    קבועה: m.fixed,
    משתנה: m.variable,
  })).reverse(); // RTL: Jan on right → Dec on left

  return (
    <div className="space-y-3">
      {/* Summary cards — right→left: קבועות | משתנות | שנתי */}
      <div className="grid grid-cols-3 gap-2" dir="rtl">
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
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={chartData} barSize={14} barGap={2} margin={{ top: 18, right: 4, left: 4, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="קבועה" fill="#a855f7" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="קבועה" position="top" style={{ fill: '#c084fc', fontSize: 8 }} formatter={(v: number) => compactNum(v)} />
              </Bar>
              <Bar dataKey="משתנה" fill="#22d3ee" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="משתנה" position="top" style={{ fill: '#67e8f9', fontSize: 8 }} formatter={(v: number) => compactNum(v)} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Monthly breakdown table */}
      <Card>
        <CardContent className="pt-4">
          <table dir="rtl" className="w-full text-xs">
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
                const total = m.fixed + m.variable;
                const pct = total > 0 ? Math.round((m.fixed / total) * 100) : 0;
                if (total === 0) return null;
                return (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/[0.03]">
                    <td className="py-1.5 text-white/70">{m.month}</td>
                    <td className="text-center py-1.5 text-purple-400 font-medium">{formatCurrency(m.fixed)}</td>
                    <td className="text-center py-1.5 text-cyan-400 font-medium">{formatCurrency(m.variable)}</td>
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
    total: m.total, // for the total label at top of stacked bar
  })).reverse(); // RTL: Jan on right → Dec on left

  return (
    <div className="space-y-3">
      {/* Summary — right→left: שי | אורטל | משותף */}
      <div className="grid grid-cols-3 gap-2" dir="rtl">
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
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barSize={20} margin={{ top: 18, right: 4, left: 4, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="שי" fill="#22d3ee" stackId="a">
                <LabelList dataKey="שי" position="inside" style={{ fill: '#fff', fontSize: 8 }} formatter={(v: number) => compactNum(v)} />
              </Bar>
              <Bar dataKey="אורטל" fill="#ec4899" stackId="a">
                <LabelList dataKey="אורטל" position="inside" style={{ fill: '#fff', fontSize: 8 }} formatter={(v: number) => compactNum(v)} />
              </Bar>
              <Bar dataKey="משותף" fill="#a855f7" radius={[4, 4, 0, 0]} stackId="a">
                <LabelList dataKey="משותף" position="inside" style={{ fill: '#fff', fontSize: 8 }} formatter={(v: number) => compactNum(v)} />
                <LabelList dataKey="total" position="top" style={{ fill: '#e2e8f0', fontSize: 9, fontWeight: 'bold' }} formatter={(v: number) => compactNum(v)} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Monthly table */}
      <Card>
        <CardContent className="pt-4">
          <table dir="rtl" className="w-full text-xs">
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

  const chartData = monthData.filter((m) => m.income > 0 || m.expense > 0).reverse(); // RTL

  return (
    <div className="space-y-3">
      {/* KPI cards — right→left: הכנסות | הוצאות | רווח נקי */}
      <div className="grid grid-cols-3 gap-2" dir="rtl">
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
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barSize={12} margin={{ top: 18, right: 4, left: 4, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="income" name="הכנסות" fill="#22c55e" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="income" position="top" style={{ fill: '#86efac', fontSize: 8 }} formatter={(v: number) => compactNum(v)} />
              </Bar>
              <Bar dataKey="expense" name="הוצאות" fill="#f43f5e" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="expense" position="top" style={{ fill: '#fda4af', fontSize: 8 }} formatter={(v: number) => compactNum(v)} />
              </Bar>
              <Bar dataKey="net" name="רווח נקי" fill="#22d3ee" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="net" position="top" style={{ fill: '#67e8f9', fontSize: 8 }} formatter={(v: number) => compactNum(v)} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Monthly table */}
      <Card>
        <CardContent className="pt-4">
          <table dir="rtl" className="w-full text-xs">
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
  const currentYear = String(new Date().getFullYear());
  const [year, setYear] = useState(currentYear);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const { data: transactions = [] } = useQuery<Transaction[]>({
    queryKey: ['transactions', year],
    queryFn: () => base44.entities.Transaction.filter({
      dateRange: { start: `${year}-01-01`, end: `${year}-12-31` },
    }),
  });

  // Generate available years: 2020 → current year
  const availableYears = Array.from(
    { length: Number(currentYear) - 2019 },
    (_, i) => String(2020 + i),
  ).reverse();

  const expenses = transactions.filter((t) => t.type === 'expense');
  const incomes = transactions.filter((t) => t.type === 'income');

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['transactions', year] });
    setIsRefreshing(false);
  };

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">ניתוח שנתי</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 h-9 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            <span className="text-xs">רענן</span>
          </button>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="h-9 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none"
          >
            {availableYears.map((y) => (
              <option key={y} value={y} className="bg-slate-800">{y}</option>
            ))}
          </select>
        </div>
      </div>

      <Tabs defaultValue="fixed">
        <TabsList className="grid grid-cols-4 w-full" dir="rtl">
          <TabsTrigger value="fixed" className="text-xs">הוצאות</TabsTrigger>
          <TabsTrigger value="income" className="text-xs">הכנסות</TabsTrigger>
          <TabsTrigger value="profit" className="text-xs">רווח</TabsTrigger>
          <TabsTrigger value="table" className="text-xs">סיכום כולל</TabsTrigger>
        </TabsList>

        <TabsContent value="fixed">
          <FixedVariableTab expenses={expenses} />
        </TabsContent>

        <TabsContent value="income">
          <IncomeDistributionTab incomes={incomes} />
        </TabsContent>

        <TabsContent value="profit">
          <NetProfitTab expenses={expenses} incomes={incomes} />
        </TabsContent>

        <TabsContent value="table">
          <AnnualTableTab expenses={expenses} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
