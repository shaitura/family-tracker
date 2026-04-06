import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Sparkles, Droplets, AlertTriangle,
  CreditCard, Calendar, ChevronRight,
} from 'lucide-react';
import { base44 } from '@/lib/base44Client';
import { Transaction } from '@/types';
import { Card, CardContent } from '@/components/ui/card';

function fmt(n: number) { return `₪${Math.round(n).toLocaleString('he')}`; }
function fmtK(n: number) { return `₪${Math.round(n).toLocaleString('en-US')}`; }

function formatMonthLabel(ym: string) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleString('he', { month: 'short' }) + "'" + y.slice(2);
}

const COLORS = ['#22d3ee', '#a855f7', '#ec4899', '#f97316', '#eab308', '#10b981'];
const PAYER_COLORS = ['#22d3ee', '#ec4899', '#a855f7'];
const METHOD_COLORS = ['#22d3ee', '#f97316', '#a855f7', '#10b981', '#eab308', '#94a3b8'];
const SHORT_MONTHS = ['ינו','פבר','מרץ','אפר','מאי','יוני','יול','אוג','ספט','אוק','נוב','דצמ'];

type Period = 'month' | 'quarter' | 'year' | '18m' | 'all';

function getPeriodMonths(period: Period): string[] {
  const now = new Date();
  const make = (count: number) =>
    Array.from({ length: count }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
  if (period === 'month')   return [make(1)[0]];
  if (period === 'quarter') return make(3);
  if (period === 'year')    return make(12);
  if (period === '18m')     return make(18);
  return [];
}

const TT = { background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 };

interface ExecItem { icon: string; text: string; level: 'ok' | 'warn' | 'bad' | 'info'; saving?: number }

function ExecutiveSummary({ items }: { items: ExecItem[] }) {
  const ls: Record<string, string> = {
    ok: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300',
    warn: 'border-amber-500/30 bg-amber-500/5 text-amber-300',
    bad: 'border-rose-500/30 bg-rose-500/5 text-rose-300',
    info: 'border-white/10 bg-white/5 text-white/70',
  };
  return (
    <Card className="border-cyan-500/20 bg-gradient-to-br from-cyan-950/40 to-slate-900/60">
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-bold text-white">סיכום מנהלים — החודש</span>
        </div>
        {items.length === 0
          ? <p className="text-sm text-white/40 text-center py-3">אין מספיק נתונים</p>
          : <div className="space-y-2">
              {items.slice(0, 5).map((item, i) => (
                <div key={i} className={`flex gap-2.5 items-start text-sm leading-relaxed p-3 rounded-xl border ${ls[item.level]}`}>
                  <span className="text-base leading-none mt-0.5 shrink-0">{item.icon}</span>
                  <div className="flex-1">
                    <span>{item.text}</span>
                    {item.saving != null && item.saving > 0 && (
                      <span className="block text-[11px] mt-0.5 opacity-70">
                        💡 פוטנציאל חיסכון: {fmt(item.saving)}/שנה
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
        }
      </CardContent>
    </Card>
  );
}

function PeriodFilter({ value, onChange, selectedMonth, onMonthChange, monthOptions }: {
  value: Period;
  onChange: (p: Period) => void;
  selectedMonth: string;
  onMonthChange: (m: string) => void;
  monthOptions: { ym: string; label: string }[];
}) {
  const opts: [Period, string][] = [
    ['month', 'חודש'], ['quarter', 'רבעון'], ['year', 'שנה'], ['18m', '18 חודשים'], ['all', 'הכל'],
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1 p-1 bg-white/5 rounded-xl border border-white/10 overflow-x-auto">
        <Calendar className="w-3.5 h-3.5 text-white/30 mr-1 shrink-0" />
        {opts.map(([key, label]) => (
          <button key={key} onClick={() => onChange(key)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              value === key ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-white/50 hover:text-white/70'
            }`}>
            {label}
          </button>
        ))}
      </div>
      {value === 'month' && (
        <select
          value={selectedMonth}
          onChange={e => onMonthChange(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-cyan-500/40"
        >
          {monthOptions.map(o => (
            <option key={o.ym} value={o.ym} className="bg-slate-900 text-white">{o.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex-1 min-w-0 p-3 rounded-xl bg-white/5 border border-white/8">
      <div className="text-[10px] text-white/40 mb-1 truncate">{label}</div>
      <div className={`text-base font-bold ${color ?? 'text-white'} truncate`}>{value}</div>
      {sub && <div className="text-[10px] text-white/30 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}
export default function Trends() {
  const [tab, setTab] = useState<'trends'|'compare'|'leaks'|'anomalies'|'payers'>('trends');
  const [period, setPeriod] = useState<Period>('18m');
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  const { data: transactions = [] } = useQuery<Transaction[]>({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.filter(),
  });

  const allExpenses = useMemo(() => transactions.filter(t => t.type === 'expense'), [transactions]);
  const allIncome   = useMemo(() => transactions.filter(t => t.type === 'income'),  [transactions]);

  const effectiveMonth = useMemo(() => {
    if (period !== 'month') return '';
    if (selectedMonth) return selectedMonth;
    const now2 = new Date();
    return `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, '0')}`;
  }, [period, selectedMonth]);

  const periodMonths = useMemo(() => {
    if (period === 'month' && effectiveMonth) return [effectiveMonth];
    return getPeriodMonths(period);
  }, [period, effectiveMonth]);

  const expenses = useMemo(() =>
    period === 'all' ? allExpenses
      : allExpenses.filter(t => periodMonths.some(ym => t.date.startsWith(ym))),
    [allExpenses, period, periodMonths]);

  const monthOptions = useMemo(() => {
    const now2 = new Date();
    return Array.from({ length: 24 }, (_, i) => {
      const d = new Date(now2.getFullYear(), now2.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('he', { month: 'long', year: 'numeric' });
      return { ym, label };
    });
  }, []);


  const last18Months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 18 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (17 - i), 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
  }, []);

  const chartMonths = useMemo(() => {
    if (period === "all") {
      const months = new Set(allExpenses.map(t => t.date.slice(0, 7)));
      return Array.from(months).sort();
    }
    if (period === "18m") return last18Months;
    return periodMonths;
  }, [period, allExpenses, last18Months, periodMonths]);

  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevYM = (() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  const currentYear = now.getFullYear();

  const topCategories = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const t of allExpenses) totals[t.category] = (totals[t.category] || 0) + t.amount;
    return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);
  }, [allExpenses]);

  const trendData = useMemo(() =>
    chartMonths.map(ym => {
      const row: Record<string, number | string> = { month: formatMonthLabel(ym) };
      for (const cat of topCategories)
        row[cat] = allExpenses.filter(t => t.date.startsWith(ym) && t.category === cat).reduce((s, t) => s + t.amount, 0);
      return row;
    }).reverse(), [chartMonths, allExpenses, topCategories]);
  const yoyData = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1).padStart(2, "0");
      const sum = (y: number) => allExpenses.filter(t => t.date.startsWith(`${y}-${m}`)).reduce((s, t) => s + t.amount, 0);
      return {
        month: SHORT_MONTHS[i],
        [currentYear - 2]: Math.round(sum(currentYear - 2)),
        [currentYear - 1]: Math.round(sum(currentYear - 1)),
        [currentYear]:     Math.round(sum(currentYear)),
      };
    }).reverse(), [allExpenses, currentYear]);

  const seasonalPeaks = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1).padStart(2, "0");
      const yt: number[] = [];
      for (let y = 2022; y <= currentYear; y++) {
        const total = allExpenses.filter(t => t.date.startsWith(`${y}-${m}`)).reduce((s, t) => s + t.amount, 0);
        if (total > 0) yt.push(total);
      }
      if (yt.length < 2) return null;
      const avg = yt.reduce((s, v) => s + v, 0) / yt.length;
      const totalM = new Set(allExpenses.map(t => t.date.slice(0, 7))).size;
      const oa = allExpenses.reduce((s, t) => s + t.amount, 0) / Math.max(1, totalM);
      return { month: SHORT_MONTHS[i], avg: Math.round(avg), ratio: Math.round((avg / Math.max(1, oa)) * 100) / 100 };
    }).filter((x): x is { month: string; avg: number; ratio: number } => x !== null).sort((a, b) => b.ratio - a.ratio);
  }, [allExpenses, currentYear]);

  const anomalies = useMemo(() => {
    const results: { category: string; currentAmount: number; movingAvg: number; deviation: number; level: "warn"|"bad" }[] = [];
    const prev3 = Array.from({ length: 3 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (3 - i), 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
    for (const cat of Array.from(new Set(allExpenses.map(t => t.category)))) {
      const cur = allExpenses.filter(t => t.date.startsWith(currentYM) && t.category === cat).reduce((s, t) => s + t.amount, 0);
      const avg = prev3.map(ym => allExpenses.filter(t => t.date.startsWith(ym) && t.category === cat).reduce((s, t) => s + t.amount, 0)).reduce((s, v) => s + v, 0) / 3;
      if (avg < 200 || cur < 100) continue;
      const dev = Math.round(((cur - avg) / avg) * 100);
      if (dev >= 30) results.push({ category: cat, currentAmount: Math.round(cur), movingAvg: Math.round(avg), deviation: dev, level: dev >= 60 ? "bad" : "warn" });
    }
    return results.sort((a, b) => b.deviation - a.deviation);
  }, [allExpenses, currentYM, now]);

  const payerData = useMemo(() => {
    const payers = ["Shi", "Ortal", "Joint"];
    const payerLabels: Record<string, string> = { Shi: 'שי', Ortal: 'אורטל', Joint: 'משותף' };
    const matchPayer = (t: Transaction, p: string) => {
      if (p === 'Shi')   return t.payer === 'Shi'   || (t.payer as string) === 'שי';
      if (p === 'Ortal') return t.payer === 'Ortal' || (t.payer as string) === 'אורטל';
      if (p === 'Joint') return t.payer === 'Joint' || (t.payer as string) === 'משותף';
      return false;
    };
    const byCat = Array.from(new Set(expenses.map(t => t.category))).map(cat => {
      const row: Record<string, number|string> = { category: cat };
      for (const p of payers) row[p] = expenses.filter(t => t.category === cat && matchPayer(t, p)).reduce((s, t) => s + t.amount, 0);
      return row;
    }).sort((a, b) => ((b["Shi"] as number)+(b["Ortal"] as number)+(b["Joint"] as number)) - ((a["Shi"] as number)+(a["Ortal"] as number)+(a["Joint"] as number))).slice(0, 10);
    const totals: Record<string, number> = { Shi: 0, Ortal: 0, Joint: 0 };
    for (const t of expenses) {
      for (const p of payers) if (matchPayer(t, p)) { totals[p] = (totals[p] || 0) + t.amount; break; }
    }
    return { byCat, payerLabels, pieData: payers.map(p => ({ name: payerLabels[p], value: Math.round(totals[p] || 0) })).filter(x => x.value > 0) };
  }, [expenses]);
  const paymentMethodData = useMemo(() => {
    const methods = ["אשראי","מזומן","ביט","העברה","הוראת קבע","צ'ק"];
    const byMonth = chartMonths.slice(-12).map(ym => {
      const row: Record<string, number|string> = { month: formatMonthLabel(ym) };
      for (const m of methods) row[m] = allExpenses.filter(t => t.date.startsWith(ym) && t.payment_method === m).reduce((s, t) => s + t.amount, 0);
      return row;
    }).reverse();
    const totals: Record<string, number> = {};
    for (const t of expenses) totals[t.payment_method] = (totals[t.payment_method] || 0) + t.amount;
    const grand = Object.values(totals).reduce((s, v) => s + v, 0);
    return {
      byMonth, methods,
      pieData: methods.map(m => ({ name: m, value: Math.round(totals[m] || 0) })).filter(x => x.value > 0),
      cashPct: Math.round(((totals["מזומן"] || 0) / grand) * 100),
    };
  }, [expenses, allExpenses, chartMonths]);

  const leaks = useMemo(() => {
    const groups: Record<string, { amounts: number[]; months: Set<string>; category: string }> = {};
    for (const t of allExpenses.filter(t => t.expense_class === "משתנה")) {
      const key = (t.sub_category || t.notes || "").trim().toLowerCase();
      if (!key || key.length < 3) continue;
      if (!groups[key]) groups[key] = { amounts: [], months: new Set(), category: t.category };
      groups[key].amounts.push(t.amount);
      groups[key].months.add(t.date.slice(0, 7));
    }
    return Object.entries(groups).filter(([, g]) => g.months.size >= 3).map(([name, g]) => {
      const total = g.amounts.reduce((s, a) => s + a, 0);
      const monthlyAvg = Math.round(total / g.months.size);
      return { name, category: g.category, monthlyAvg, yearlyEstimate: monthlyAvg * 12, months: g.months.size, occurrences: g.amounts.length, isSubscription: g.amounts.length >= 3 && g.amounts.every(a => Math.abs(a - g.amounts[0]) < 5) };
    }).sort((a, b) => b.yearlyEstimate - a.yearlyEstimate).slice(0, 20);
  }, [allExpenses]);

  const leaksByCategory = useMemo(() => {
    const cats: Record<string, number> = {};
    for (const l of leaks) cats[l.category] = (cats[l.category] || 0) + l.yearlyEstimate;
    return Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [leaks]);

  const periodStats = useMemo(() => {
    const total = expenses.reduce((s, t) => s + t.amount, 0);
    const months = period === "all" ? new Set(allExpenses.map(t => t.date.slice(0, 7))).size : Math.max(1, periodMonths.length);
    const income = period === "all" ? allIncome.reduce((s, t) => s + t.amount, 0) : allIncome.filter(t => periodMonths.some(ym => t.date.startsWith(ym))).reduce((s, t) => s + t.amount, 0);
    return {
      total, monthly: total / months, income,
      fixed:    expenses.filter(t => t.expense_class === "קבועה").reduce((s, t) => s + t.amount, 0),
      variable: expenses.filter(t => t.expense_class === "משתנה").reduce((s, t) => s + t.amount, 0),
    };
  }, [expenses, allExpenses, allIncome, period, periodMonths]);
  const execItems = useMemo((): ExecItem[] => {
    const items: ExecItem[] = [];
    if (!allExpenses.length) return items;
    const cur  = allExpenses.filter(t => t.date.startsWith(currentYM));
    const prev = allExpenses.filter(t => t.date.startsWith(prevYM));
    const curTotal  = cur.reduce((s, t) => s + t.amount, 0);
    const prevTotal = prev.reduce((s, t) => s + t.amount, 0);
    if (prevTotal > 0) {
      const pct = Math.round(((curTotal - prevTotal) / prevTotal) * 100);
      items.push(pct > 10
        ? { icon: '📈', level: 'bad',  text: `הוצאות החודש גבוהות ב-${pct}% לעומת חודש שעבר (${fmt(curTotal)} לעומת ${fmt(prevTotal)})` }
        : pct < -10
        ? { icon: '📉', level: 'ok',   text: `הוצאות החודש נמוכות ב-${Math.abs(pct)}% לעומת חודש שעבר (${fmt(curTotal)})` }
        : { icon: '⚖️', level: 'info', text: `הוצאות החודש יציבות: ${fmt(curTotal)} (שינוי של ${pct > 0 ? '+' : ''}${pct}%)` });
    }
    if (anomalies.length > 0) {
      const top = anomalies[0];
      items.push({ icon: '⚠️', level: top.level, text: `חריגה בקטגוריית ${top.category}: ${fmt(top.currentAmount)} לעומת ממוצע ${fmt(top.movingAvg)} (+${top.deviation}%)` });
    }
    const topCat = Object.entries(
      allExpenses.filter(t => t.date.startsWith(currentYM))
        .reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + t.amount; return acc; }, {} as Record<string,number>)
    ).sort((a,b) => b[1]-a[1])[0];
    if (topCat) items.push({ icon: '🎯', level: 'info', text: `קטגוריה מובילת החודש: ${topCat[0]} — ${fmt(topCat[1])}` });
    if (leaks.length > 0) {
      const totalLeak = leaks.reduce((s,l) => s + l.yearlyEstimate, 0);
      items.push({ icon: '💸', level: 'warn', text: `זוהו ${leaks.length} הוצאות קבועות בסך ${fmtK(totalLeak)} ש"ח/שנה` });
    }
    const incCur = allIncome.filter(t => t.date.startsWith(currentYM)).reduce((s,t) => s+t.amount,0);
    if (incCur > 0 && curTotal > 0) {
      const ratio = Math.round((curTotal / incCur) * 100);
      items.push(ratio > 90
        ? { icon: '🚨', level: 'bad',  text: `הוצאות החודש מהוות ${ratio}% מההכנסה — סכנת גירעון!` }
        : ratio > 70
        ? { icon: '⚠️', level: 'warn', text: `הוצאות החודש מהוות ${ratio}% מההכנסה` }
        : { icon: '✅', level: 'ok',   text: `יחס הוצאות/הכנסה תקין: ${ratio}%` });
    }
    const incomeTotal = allIncome.filter(t => t.date.startsWith(currentYM)).reduce((s,t)=>s+t.amount,0);
    if (incomeTotal > 0 && curTotal > 0) {
      const saved = incomeTotal - curTotal;
      const savePct = Math.round((saved / incomeTotal) * 100);
      if (savePct > 20) items.push({ icon: '🏦', level: 'ok', text: `חיסכון החודש: ${fmt(saved)} (${savePct}% מההכנסה)` });
      else if (savePct < 0) items.push({ icon: '🔴', level: 'bad', text: `גירעון החודש: ${fmt(Math.abs(saved))} — ההוצאות עולות על ההכנסה` });
    }
    const fixedAmt = allExpenses.filter(t => t.date.startsWith(currentYM) && t.expense_class === 'קבועה').reduce((s,t)=>s+t.amount,0);
    if (curTotal > 0 && fixedAmt > 0) {
      const fixedPct = Math.round((fixedAmt / curTotal) * 100);
      items.push({ icon: '📋', level: 'info', text: `${fixedPct}% מהוצאות החודש הן קבועות (${fmt(fixedAmt)})` });
    }
    return items.slice(0, 5);
  }, [allExpenses, allIncome, anomalies, leaks, currentYM, prevYM]);

  const TABS: [typeof tab, string][] = [
    ['trends','מגמות'], ['compare','השוואה'], ['anomalies','חריגות'], ['payers','משלמים'], ['leaks','דליפות'],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 space-y-4" dir="rtl">
      <ExecutiveSummary items={execItems} />
      <PeriodFilter value={period} onChange={setPeriod} selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} monthOptions={monthOptions} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatCard label='סהֳכ הוצאות' value={fmt(periodStats.total)} color="text-rose-400" />
        <StatCard label='ממוצע חודשי' value={fmt(periodStats.monthly)} />
        <StatCard label='קבועות' value={fmt(periodStats.fixed)} sub={`${Math.round((periodStats.fixed/Math.max(1,periodStats.total))*100)}%`} />
        <StatCard label='משתנות' value={fmt(periodStats.variable)} sub={`${Math.round((periodStats.variable/Math.max(1,periodStats.total))*100)}%`} />
        <StatCard label='הכנסות' value={fmt(periodStats.income)} color="text-emerald-400" />
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === key ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-white/50 hover:text-white/70 border border-transparent'
            }`}>
            {label}
            {key === 'anomalies' && anomalies.length > 0 && (
              <span className="mr-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] bg-red-500 text-white rounded-full">{anomalies.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'trends' && (
        <div className="space-y-4">
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-4">
              <div className="text-sm text-white/60 mb-3">הוצאות לפי קטגוריה לאורך זמן</div>
              <div dir="ltr"><ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    {topCategories.map((cat, i) => (
                      <linearGradient key={cat} id={`g${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={COLORS[i % COLORS.length]} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#ffffff50' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#ffffff50' }} tickFormatter={v => fmtK(v as number)} />
                  <Tooltip contentStyle={TT} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#ffffff80' }} />
                  {topCategories.map((cat, i) => (
                    <Area key={cat} type="monotone" dataKey={cat} stackId="1"
                      stroke={COLORS[i % COLORS.length]} fill={`url(#g${i})`} strokeWidth={1.5} />
                  ))}
                </AreaChart>
              </ResponsiveContainer></div>
            </CardContent>
          </Card>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-4">
              <div className="text-sm text-white/60 mb-3">סהֳכ הוצאות חודשי</div>
              <div dir="ltr"><ResponsiveContainer width="100%" height={200}>
                <BarChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#ffffff50' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#ffffff50' }} tickFormatter={v => fmtK(v as number)} />
                  <Tooltip contentStyle={TT} />
                  <Bar dataKey={topCategories[0] ?? 'total'} fill="#06b6d4" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer></div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'compare' && (
        <div className="space-y-4">
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-4">
              <div className="text-sm text-white/60 mb-3">השוואה שנה-על-שנה</div>
              <div dir="ltr"><ResponsiveContainer width="100%" height={260}>
                <BarChart data={yoyData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#ffffff50' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#ffffff50' }} tickFormatter={v => fmtK(v as number)} />
                  <Tooltip contentStyle={TT} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#ffffff80' }} />
                  <Bar dataKey={currentYear - 2} fill="#6366f1" radius={[2,2,0,0]} />
                  <Bar dataKey={currentYear - 1} fill="#22d3ee" radius={[2,2,0,0]} />
                  <Bar dataKey={currentYear}     fill="#10b981" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer></div>
            </CardContent>
          </Card>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-4">
              <div className="text-sm text-white/60 mb-3">שיאים עונתיים</div>
              <div dir="ltr"><ResponsiveContainer width="100%" height={200}>
                <BarChart data={seasonalPeaks} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#ffffff50' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#ffffff50' }} tickFormatter={v => fmtK(v as number)} />
                  <Tooltip contentStyle={TT} />
                  <Bar dataKey="avg" fill="#f59e0b" radius={[3,3,0,0]}>
                    {seasonalPeaks.map((e, i) => (
                      <Cell key={i} fill={e.ratio > 1.2 ? '#ef4444' : e.ratio > 1.05 ? '#f59e0b' : '#10b981'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer></div>
              <div className="mt-2 text-xs text-white/40">אדום = שיא עונתי (20%+ מעל ממוצע), צהוב = מעט גבוה, ירוק = רגיל</div>
            </CardContent>
          </Card>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-4">
              <div className="text-sm text-white/60 mb-3">אמצעי תשלום לאורך זמן</div>
              <div className="flex gap-3 flex-wrap mb-3">
                {paymentMethodData.pieData.map((d, i) => (
                  <div key={d.name} className="text-xs text-white/60">
                    <span style={{ color: METHOD_COLORS[i % METHOD_COLORS.length] }}>●</span> {d.name}: {fmt(d.value)}
                  </div>
                ))}
              </div>
              <div dir="ltr"><ResponsiveContainer width="100%" height={200}>
                <BarChart data={paymentMethodData.byMonth} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#ffffff50' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#ffffff50' }} tickFormatter={v => fmtK(v as number)} />
                  <Tooltip contentStyle={TT} />
                  {paymentMethodData.methods.map((m, i) => (
                    <Bar key={m} dataKey={m} stackId="a" fill={METHOD_COLORS[i % METHOD_COLORS.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer></div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'anomalies' && (
        <div className="space-y-3">
          {anomalies.length === 0 ? (
            <Card className="bg-white/5 border-white/10">
              <CardContent className="py-8 text-center text-white/40">✅ לא נמצאו חריגות משמעותיות החודש</CardContent>
            </Card>
          ) : (
            <>
              <div className="text-xs text-white/40 px-1">חריגות מחושבות ביחס לממוצע נע של 3 חודשים</div>
              {anomalies.map(a => (
                <Card key={a.category} className={`border ${a.level === 'bad' ? 'bg-red-500/10 border-red-500/30' : 'bg-yellow-500/10 border-yellow-500/30'}`}>
                  <CardContent className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-sm text-white">{a.category}</div>
                      <div className="text-xs text-white/50 mt-0.5">
                        החודש: {fmt(a.currentAmount)} | ממוצע 3 חודשים: {fmt(a.movingAvg)}
                      </div>
                    </div>
                    <div className={`text-lg font-bold shrink-0 ${a.level === 'bad' ? 'text-red-400' : 'text-yellow-400'}`}>
                      +{a.deviation}%
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </div>
      )}

      {tab === 'payers' && (
        <div className="space-y-4">
          <div className="flex gap-4 flex-wrap">
            {payerData.pieData.map((d, i) => (
              <div key={d.name} className="flex-1 min-w-[80px] p-3 rounded-xl bg-white/5 border border-white/8 text-center">
                <div className="text-xs text-white/40">{d.name}</div>
                <div className="text-base font-bold mt-1" style={{ color: PAYER_COLORS[i] }}>{fmt(d.value)}</div>
              </div>
            ))}
          </div>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-4">
              <div className="text-sm text-white/60 mb-2">פירוט לפי קטגוריה</div>
              <div className="flex gap-4 mb-3">
                {['Shi','Ortal','Joint'].map((p,i) => (
                  <div key={p} className="flex items-center gap-1.5 text-xs text-white/60">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{background: PAYER_COLORS[i]}} />{p}
                  </div>
                ))}
              </div>
              <div dir="ltr"><ResponsiveContainer width="100%" height={300}>
                <BarChart data={payerData.byCat} layout="vertical" margin={{ top: 4, right: 20, bottom: 0, left: 70 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9, fill: '#ffffff50' }} tickFormatter={v => fmtK(v as number)} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 10, fill: '#ffffff70' }} width={68} />
                  <Tooltip contentStyle={TT} />
                  {['Shi','Ortal','Joint'].map((p, i) => (
                    <Bar key={p} dataKey={p} stackId="a" fill={PAYER_COLORS[i]} />
                  ))}
                </BarChart>
              </ResponsiveContainer></div>
            </CardContent>
          </Card>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-4">
              <div className="text-sm text-white/60 mb-3">חלוקה כוללת</div>
              <div dir="ltr"><ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={payerData.pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                    {payerData.pieData.map((_, i) => <Cell key={i} fill={PAYER_COLORS[i]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#ffffff80' }} />
                </PieChart>
              </ResponsiveContainer></div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'leaks' && (
        <div className="space-y-4">
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-4">
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm text-white/60">סיכום דליפות שנתי</div>
                <div className="text-xl font-bold text-amber-400">
                  {fmtK(leaks.reduce((s,l) => s+l.yearlyEstimate,0))} ש"ח/שנה
                </div>
              </div>
              {leaksByCategory.length > 0 && (
                <div dir="ltr"><ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={leaksByCategory} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                      {leaksByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => `${fmtK(v)} ₪/שנה`} />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#ffffff70' }} />
                  </PieChart>
                </ResponsiveContainer></div>
              )}
            </CardContent>
          </Card>
          {leaks.length === 0 ? (
            <div className="text-center text-white/40 py-8">✅ לא זוהו הוצאות חוזרות חשודות</div>
          ) : (
            <div className="space-y-2">
              {leaks.map(l => (
                <Card key={l.name} className="bg-white/5 border-white/10 hover:bg-white/8 transition-colors">
                  <CardContent className="py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">{l.name}</span>
                        {l.isSubscription && (
                          <span className="shrink-0 text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded-full">מנוי</span>
                        )}
                      </div>
                      <div className="text-xs text-white/40 mt-0.5">{l.category} · {l.months} חודשים · {l.occurrences} פעמים</div>
                    </div>
                    <div className="text-left shrink-0">
                      <div className="text-sm font-bold text-amber-400">{fmt(l.monthlyAvg)}/חודש</div>
                      <div className="text-xs text-white/40">{fmtK(l.yearlyEstimate)}/שנה</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
