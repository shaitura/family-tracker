import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import { TrendingUp, Sparkles, Droplets } from 'lucide-react';
import { base44 } from '@/lib/base44Client';
import { Transaction } from '@/types';
import { Card, CardContent } from '@/components/ui/card';

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) { return `₪${Math.round(n).toLocaleString('he')}`; }

function formatMonthLabel(ym: string) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleString('he', { month: 'short' }) + "'" + y.slice(2);
}

const COLORS = ['#22d3ee', '#a855f7', '#ec4899', '#f97316', '#eab308', '#10b981'];
const SHORT_MONTHS = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

// ── component ─────────────────────────────────────────────────────────────────
export default function Trends() {
  const [tab, setTab] = useState<'trends' | 'compare' | 'leaks'>('trends');

  const { data: transactions = [] } = useQuery<Transaction[]>({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.filter(),
  });

  const expenses = useMemo(() => transactions.filter(t => t.type === 'expense'), [transactions]);

  // ── last 18 months ──────────────────────────────────────────────────────────
  const last18Months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 18 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (17 - i), 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
  }, []);

  // ── top 6 categories by total spend ────────────────────────────────────────
  const topCategories = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const t of expenses) totals[t.category] = (totals[t.category] || 0) + t.amount;
    return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);
  }, [expenses]);

  // ── trend data (stacked area per category, 18 months) ──────────────────────
  const trendData = useMemo(() =>
    last18Months.map(ym => {
      const row: Record<string, number | string> = { month: formatMonthLabel(ym) };
      for (const cat of topCategories)
        row[cat] = expenses.filter(t => t.date.startsWith(ym) && t.category === cat)
          .reduce((s, t) => s + t.amount, 0);
      return row;
    }), [last18Months, expenses, topCategories]);

  // ── year-over-year ──────────────────────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const yoyData = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1).padStart(2, '0');
      const sum = (y: number) =>
        expenses.filter(t => t.date.startsWith(`${y}-${m}`)).reduce((s, t) => s + t.amount, 0);
      return {
        month: SHORT_MONTHS[i],
        [currentYear - 2]: Math.round(sum(currentYear - 2)),
        [currentYear - 1]: Math.round(sum(currentYear - 1)),
        [currentYear]:     Math.round(sum(currentYear)),
      };
    }), [expenses, currentYear]);

  // ── leak detector ───────────────────────────────────────────────────────────
  const leaks = useMemo(() => {
    const groups: Record<string, { amounts: number[]; months: Set<string>; category: string }> = {};
    for (const t of expenses.filter(t => t.expense_class === 'משתנה')) {
      const key = (t.sub_category || t.notes || '').trim().toLowerCase();
      if (!key || key.length < 3) continue;
      if (!groups[key]) groups[key] = { amounts: [], months: new Set(), category: t.category };
      groups[key].amounts.push(t.amount);
      groups[key].months.add(t.date.slice(0, 7));
    }
    return Object.entries(groups)
      .filter(([, g]) => g.months.size >= 3)
      .map(([name, g]) => {
        const total = g.amounts.reduce((s, a) => s + a, 0);
        const monthlyAvg = Math.round(total / g.months.size);
        return { name, category: g.category, monthlyAvg, yearlyEstimate: monthlyAvg * 12, months: g.months.size, occurrences: g.amounts.length };
      })
      .sort((a, b) => b.yearlyEstimate - a.yearlyEstimate)
      .slice(0, 20);
  }, [expenses]);

  // ── auto insights ───────────────────────────────────────────────────────────
  const insights = useMemo(() => {
    if (expenses.length === 0) return [];
    const now = new Date();
    const last6 = last18Months.slice(-6);
    const prev6 = last18Months.slice(-12, -6);
    const sumPeriod = (period: string[]) =>
      expenses.filter(t => period.some(ym => t.date.startsWith(ym))).reduce((s, t) => s + t.amount, 0);

    const last6Total = sumPeriod(last6);
    const prev6Total = sumPeriod(prev6);
    const items: { icon: string; text: string; color: string }[] = [];

    // Overall trend
    if (prev6Total > 0) {
      const pct = Math.round(((last6Total - prev6Total) / prev6Total) * 100);
      if (pct > 5)
        items.push({ icon: '📈', color: 'border-rose-500/20 bg-rose-500/5', text: `ההוצאות ב-6 החודשים האחרונים גבוהות ב-${pct}% לעומת 6 החודשים שלפניהם (${fmt(last6Total)} לעומת ${fmt(prev6Total)})` });
      else if (pct < -5)
        items.push({ icon: '📉', color: 'border-emerald-500/20 bg-emerald-500/5', text: `ההוצאות ב-6 החודשים האחרונים נמוכות ב-${Math.abs(pct)}% לעומת 6 החודשים שלפניהם — כל הכבוד!` });
      else
        items.push({ icon: '⚖️', color: 'border-white/8 bg-white/5', text: `ההוצאות יציבות ב-6 החודשים האחרונים (שינוי של ${pct >= 0 ? '+' : ''}${pct}% לעומת 6 החודשים הקודמים)` });
    }

    // Monthly average
    items.push({ icon: '💳', color: 'border-white/8 bg-white/5', text: `הוצאה חודשית ממוצעת (6 חודשים אחרונים): ${fmt(Math.round(last6Total / 6))}` });

    // Fastest growing / shrinking categories
    const catGrowth = topCategories.map(cat => {
      const last = expenses.filter(t => t.category === cat && last6.some(ym => t.date.startsWith(ym))).reduce((s, t) => s + t.amount, 0);
      const prev = expenses.filter(t => t.category === cat && prev6.some(ym => t.date.startsWith(ym))).reduce((s, t) => s + t.amount, 0);
      return { cat, pct: prev > 200 ? Math.round(((last - prev) / prev) * 100) : 0, last, prev };
    }).filter(x => x.prev > 200);

    const growing = [...catGrowth].sort((a, b) => b.pct - a.pct)[0];
    if (growing?.pct > 15)
      items.push({ icon: '🔺', color: 'border-orange-500/20 bg-orange-500/5', text: `"${growing.cat}" צמחה ב-${growing.pct}% — מ-${fmt(growing.prev)} ל-${fmt(growing.last)} ב-6 חודשים` });

    const shrinking = [...catGrowth].sort((a, b) => a.pct - b.pct)[0];
    if (shrinking?.pct < -15)
      items.push({ icon: '✅', color: 'border-emerald-500/20 bg-emerald-500/5', text: `הצלחתם לצמצם "${shrinking.cat}" ב-${Math.abs(shrinking.pct)}% — חיסכון של ${fmt(shrinking.prev - shrinking.last)} ב-6 חודשים` });

    // YoY
    const months = now.getMonth() + 1;
    const thisY = expenses.filter(t => t.date.startsWith(String(currentYear))).reduce((s, t) => s + t.amount, 0);
    const lastYSame = expenses.filter(t => t.date.startsWith(String(currentYear - 1)) && parseInt(t.date.slice(5, 7)) <= months).reduce((s, t) => s + t.amount, 0);
    if (thisY > 0 && lastYSame > 0) {
      const pct = Math.round(((thisY - lastYSame) / lastYSame) * 100);
      if (Math.abs(pct) > 3)
        items.push({ icon: '📅', color: pct > 0 ? 'border-rose-500/20 bg-rose-500/5' : 'border-emerald-500/20 bg-emerald-500/5', text: `${currentYear} (${months} חודשים): ${fmt(thisY)} לעומת ${fmt(lastYSame)} באותה תקופה ב-${currentYear - 1} (${pct > 0 ? '+' : ''}${pct}%)` });
    }

    // Top leak
    if (leaks.length > 0)
      items.push({ icon: '💧', color: 'border-cyan-500/20 bg-cyan-500/5', text: `"דולף" בולט: "${leaks[0].name}" עולה ${fmt(leaks[0].monthlyAvg)}/חודש בממוצע — ${fmt(leaks[0].yearlyEstimate)}/שנה` });

    return items;
  }, [expenses, last18Months, topCategories, leaks, currentYear]);

  // ── tooltip style ───────────────────────────────────────────────────────────
  const tooltipStyle = { background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 };

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">

      {/* Page title */}
      <h1 className="text-xl font-bold text-white flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-cyan-400" />
        מגמות ותובנות
      </h1>

      {/* ── Insights ── */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold text-white">תובנות אוטומטיות</span>
          </div>
          {insights.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-4">אין מספיק נתונים עדיין</p>
          ) : (
            <div className="space-y-2">
              {insights.map((ins, i) => (
                <div key={i} className={`flex gap-2.5 items-start text-sm text-white/80 leading-relaxed p-2.5 rounded-xl border ${ins.color}`}>
                  <span className="text-base leading-none mt-0.5 shrink-0">{ins.icon}</span>
                  <span>{ins.text}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Tab switcher ── */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/10">
        {([
          ['trends',  'מגמות'],
          ['compare', 'השוואה שנתית'],
          ['leaks',   'דולפים'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${tab === key ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-white/50 hover:text-white/70'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Trends (stacked area) ── */}
      {tab === 'trends' && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-white/50 mb-3">Top {topCategories.length} קטגוריות — 18 חודשים אחרונים (מוצבר)</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mb-4">
              {topCategories.map((cat, i) => (
                <span key={cat} className="flex items-center gap-1 text-[10px] text-white/60">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i] }} />
                  {cat}
                </span>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#94a3b8' }} interval={2} />
                <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} tickFormatter={v => `₪${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [fmt(v), name]} />
                {topCategories.map((cat, i) => (
                  <Area key={cat} type="monotone" dataKey={cat} stackId="1"
                    stroke={COLORS[i]} fill={COLORS[i]} fillOpacity={0.35} strokeWidth={1.5} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Tab: Year-over-Year ── */}
      {tab === 'compare' && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-white/50 mb-4">השוואה חודשית לפי שנה — {currentYear - 2} / {currentYear - 1} / {currentYear}</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={yoyData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} tickFormatter={v => `₪${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [fmt(v), String(name)]} />
                <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                <Bar dataKey={currentYear - 2} fill="#475569" radius={[2, 2, 0, 0]} />
                <Bar dataKey={currentYear - 1} fill="#a855f7" radius={[2, 2, 0, 0]} />
                <Bar dataKey={currentYear}     fill="#22d3ee" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Tab: Leak Detector ── */}
      {tab === 'leaks' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-white/50">
            <Droplets className="w-3.5 h-3.5 text-cyan-400" />
            הוצאות משתנות שחוזרות ב-3+ חודשים — ממוינות לפי עלות שנתית
          </div>
          {leaks.length === 0 ? (
            <Card><CardContent className="pt-4 text-center text-white/40 text-sm py-8">לא זוהו דולפים</CardContent></Card>
          ) : leaks.map((leak, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/8 gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-5 h-5 rounded-full bg-white/10 text-[10px] font-bold text-white/50 flex items-center justify-center shrink-0">{i + 1}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white truncate">{leak.name}</div>
                  <div className="text-[10px] text-white/40">{leak.category} · {leak.months} חודשים · {leak.occurrences} פעמים</div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold text-rose-400">{fmt(leak.monthlyAvg)}<span className="text-[9px] text-white/30">/חודש</span></div>
                <div className="text-[10px] text-white/40">{fmt(leak.yearlyEstimate)}/שנה</div>
              </div>
            </div>
          ))}

          {/* Total potential savings */}
          {leaks.length > 0 && (
            <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300">
              💡 סה"כ פוטנציאל חיסכון (צמצום 30% מהדולפים): {fmt(leaks.reduce((s, l) => s + l.monthlyAvg, 0) * 0.3)}/חודש — {fmt(leaks.reduce((s, l) => s + l.yearlyEstimate, 0) * 0.3)}/שנה
            </div>
          )}
        </div>
      )}
    </div>
  );
}
