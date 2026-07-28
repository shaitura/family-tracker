// src/pages/reports/InsightsTab.tsx
import { useState, useMemo } from 'react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { Sparkles, Brain } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Transaction } from '@/types';
import { formatCurrency } from '@/utils';
import { ReportPeriod, periodMonths, priorPeriod, inPeriod, periodLabel } from '@/lib/reportPeriod';
import {
  findAnomalies, findLeaks, yearOverYear, seasonalPeaks, paymentMethodByMonth, PAYMENT_METHODS_LIST,
  payerCategoryBreakdown, executiveSummary, cashflowForecast, miscDrift, analystInsights,
} from '@/lib/insights';

const COLORS = ['#22d3ee', '#a855f7', '#ec4899', '#f97316', '#eab308', '#10b981'];
const PAYER_COLORS = ['#22d3ee', '#ec4899', '#a855f7'];
const PAYER_HE_KEYS = ['שי', 'אורטל', 'משותף']; // order matches PAYER_COLORS and insights.ts's payerCategoryBreakdown()
const METHOD_COLORS = ['#22d3ee', '#f97316', '#a855f7', '#10b981', '#eab308', '#94a3b8'];
const TT = { background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11, color: '#fff' };

type SubTab = 'trends' | 'compare' | 'anomalies' | 'payers' | 'leaks' | 'forecast' | 'misc';

const LEVEL_STYLE: Record<string, string> = {
  ok: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300',
  warn: 'border-amber-500/30 bg-amber-500/5 text-amber-300',
  bad: 'border-rose-500/30 bg-rose-500/5 text-rose-300',
  info: 'border-white/10 bg-white/5 text-white/70',
};

export function InsightsTab({ transactions, period, category }: { transactions: Transaction[]; period: ReportPeriod; category: string }) {
  const [subTab, setSubTab] = useState<SubTab>('trends');
  const now = new Date();
  const currentYear = now.getFullYear();

  const allExpenses = useMemo(() => transactions.filter((t) => t.type === 'expense' && (!category || t.category === category)), [transactions, category]);
  const months = useMemo(() => periodMonths(period), [period]);
  const prior = useMemo(() => priorPeriod(period), [period]);
  const priorMonths = useMemo(() => periodMonths(prior), [prior]);

  const expensesInWindow = useMemo(() => allExpenses.filter((t) => inPeriod(t.date, period)), [allExpenses, period]);
  const incomeInWindow = useMemo(
    () => transactions.filter((t) => t.type === 'income' && (!category || t.category === category) && inPeriod(t.date, period)).reduce((s, t) => s + t.amount, 0),
    [transactions, category, period],
  );
  const priorExpenses = useMemo(() => allExpenses.filter((t) => inPeriod(t.date, prior)), [allExpenses, prior]);

  const anomalies = useMemo(() => findAnomalies(allExpenses, months, priorMonths), [allExpenses, months, priorMonths]);
  const leaks = useMemo(() => findLeaks(allExpenses), [allExpenses]); // period-independent by design
  const leaksByCategory = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const l of leaks) acc[l.category] = (acc[l.category] || 0) + l.yearlyEstimate;
    return Object.entries(acc).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [leaks]);
  const execItems = useMemo(
    () => executiveSummary({ expenses: expensesInWindow, priorExpenses, income: incomeInWindow, anomalies, leaks }),
    [expensesInWindow, priorExpenses, incomeInWindow, anomalies, leaks],
  );

  const yoy = useMemo(() => yearOverYear(allExpenses, currentYear), [allExpenses, currentYear]);
  const seasonal = useMemo(() => seasonalPeaks(allExpenses, currentYear), [allExpenses, currentYear]);
  const paymentMethods = useMemo(() => paymentMethodByMonth(expensesInWindow, months), [expensesInWindow, months]);

  // "🧠 ניתוח אנליסט" — whole-history cross-cutting read, independent of the selected period (unlike execItems above).
  const analystItems = useMemo(
    () => analystInsights({ allExpenses, seasonal, yoy, currentYear }),
    [allExpenses, seasonal, yoy, currentYear],
  );

  const payer = useMemo(() => payerCategoryBreakdown(expensesInWindow), [expensesInWindow]);

  // תזרים חזוי — next 3 months from today, using already-future-projected transactions + a 3-month variable lookback.
  const forecastMonths = useMemo(() => {
    const nowM = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return Array.from({ length: 3 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }).filter((m) => m > nowM);
  }, [now, currentYear]);
  const futureExpenses = useMemo(() => transactions.filter((t) => t.type === 'expense' && t.status === 'future'), [transactions]);
  const recentVariable = useMemo(() => {
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;
    return transactions.filter((t) => t.type === 'expense' && t.expense_class === 'משתנה' && t.date.slice(0, 7) >= cutoffKey);
  }, [transactions, now]);
  const forecast = useMemo(() => cashflowForecast(futureExpenses, recentVariable, forecastMonths, 3), [futureExpenses, recentVariable, forecastMonths]);

  const misc = useMemo(() => miscDrift(expensesInWindow, months), [expensesInWindow, months]);

  // Top-6 category breakdown over time — restores the stacked-area chart the original Trends.tsx "מגמות" tab had.
  const topCategories = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const t of expensesInWindow) totals[t.category] = (totals[t.category] || 0) + t.amount;
    return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);
  }, [expensesInWindow]);
  const categoryTrendData = useMemo(() => months.map((m) => {
    const row: Record<string, number | string> = { month: m };
    for (const cat of topCategories) {
      row[cat] = expensesInWindow.filter((t) => t.date.startsWith(m) && t.category === cat).reduce((s, t) => s + t.amount, 0);
    }
    return row;
  }), [months, expensesInWindow, topCategories]);

  const TABS: [SubTab, string][] = [
    ['trends', 'מגמות'], ['compare', 'השוואה'], ['anomalies', 'חריגות'], ['payers', 'משלמים'], ['leaks', 'דליפות'], ['forecast', 'תזרים חזוי'], ['misc', 'שונות'],
  ];

  return (
    <div className="space-y-4" dir="rtl">
      <Card className="border-cyan-500/20 bg-gradient-to-br from-cyan-950/40 to-slate-900/60">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-bold text-white">סיכום — {periodLabel(period)}</span>
          </div>
          {execItems.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-3">אין מספיק נתונים</p>
          ) : (
            <div className="space-y-2">
              {execItems.map((item, i) => (
                <div key={i} className={`flex gap-2.5 items-start text-sm leading-relaxed p-3 rounded-xl border ${LEVEL_STYLE[item.level]}`}>
                  <span className="text-base leading-none mt-0.5 shrink-0">{item.icon}</span>
                  <span className="flex-1">{item.text}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {analystItems.length > 0 && (
        <Card className="border-indigo-500/20 bg-gradient-to-br from-indigo-950/40 to-slate-900/60">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Brain className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-bold text-white">ניתוח אנליסט</span>
            </div>
            <p className="text-[11px] text-white/40 mb-3">📌 מבוסס על כל ההיסטוריה — לא מושפע מבורר התקופה למעלה</p>
            <div className="space-y-2">
              {analystItems.map((item, i) => (
                <div key={i} className={`p-3 rounded-xl border ${LEVEL_STYLE[item.level]}`}>
                  <div className="flex gap-2.5 items-start text-sm font-medium leading-relaxed">
                    <span className="text-base leading-none mt-0.5 shrink-0">{item.icon}</span>
                    <span className="flex-1">{item.headline}</span>
                  </div>
                  <p className="text-xs text-white/50 mt-1 mr-6">{item.detail}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setSubTab(key)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${subTab === key ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-white/50 hover:text-white/70 border border-transparent'}`}>
            {label}
            {key === 'anomalies' && anomalies.length > 0 && <span className="mr-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] bg-red-500 text-white rounded-full">{anomalies.length}</span>}
          </button>
        ))}
      </div>

      {subTab === 'trends' && (
        <div className="space-y-4">
          {topCategories.length > 0 && (
            <Card className="bg-white/5 border-white/10">
              <CardContent className="pt-4">
                <div className="text-sm text-white/60 mb-3">הוצאות לפי קטגוריה לאורך זמן</div>
                <div dir="ltr"><ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={categoryTrendData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <defs>
                      {topCategories.map((cat, i) => (
                        <linearGradient key={cat} id={`insCatG${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.4} />
                          <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#ffffff50' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#ffffff50' }} />
                    <Tooltip contentStyle={TT} formatter={(v: number) => formatCurrency(v)} />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#ffffff80' }} />
                    {topCategories.map((cat, i) => (
                      <Area key={cat} type="monotone" dataKey={cat} stackId="1" stroke={COLORS[i % COLORS.length]} fill={`url(#insCatG${i})`} strokeWidth={1.5} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer></div>
              </CardContent>
            </Card>
          )}
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-4">
              <div className="text-sm text-white/60 mb-3">סה"כ הוצאות חודשי</div>
              <div dir="ltr"><ResponsiveContainer width="100%" height={220}>
                <BarChart data={months.map((m) => ({ month: m, total: expensesInWindow.filter((t) => t.date.startsWith(m)).reduce((s, t) => s + t.amount, 0) }))} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#ffffff50' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#ffffff50' }} />
                  <Tooltip contentStyle={TT} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="total" fill="#06b6d4" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer></div>
            </CardContent>
          </Card>
        </div>
      )}

      {subTab === 'compare' && (
        <div className="space-y-4">
          <p className="text-xs text-white/40 -mb-1">📌 השוואה זו מבוססת על כל ההיסטוריה הזמינה (שנים קלנדריות מלאות) — אינה מושפעת מבורר התקופה למעלה</p>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-4">
              <div className="text-sm text-white/60 mb-3">השוואה שנה-על-שנה</div>
              <div dir="ltr"><ResponsiveContainer width="100%" height={260}>
                <BarChart data={yoy} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#ffffff50' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#ffffff50' }} />
                  <Tooltip contentStyle={TT} formatter={(v: number) => formatCurrency(v)} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#ffffff80' }} />
                  <Bar dataKey={currentYear - 2} fill="#6366f1" radius={[2, 2, 0, 0]} />
                  <Bar dataKey={currentYear - 1} fill="#22d3ee" radius={[2, 2, 0, 0]} />
                  <Bar dataKey={currentYear} fill="#10b981" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer></div>
            </CardContent>
          </Card>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-4">
              <div className="text-sm text-white/60 mb-3">שיאים עונתיים</div>
              <div dir="ltr"><ResponsiveContainer width="100%" height={200}>
                <BarChart data={seasonal} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#ffffff50' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#ffffff50' }} />
                  <Tooltip contentStyle={TT} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="avg" fill="#f59e0b" radius={[3, 3, 0, 0]}>
                    {seasonal.map((e, i) => <Cell key={i} fill={e.ratio > 1.2 ? '#ef4444' : e.ratio > 1.05 ? '#f59e0b' : '#10b981'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer></div>
              <div className="mt-2 text-xs text-white/40">אדום = שיא עונתי (20%+ מעל ממוצע), צהוב = מעט גבוה, ירוק = רגיל</div>
            </CardContent>
          </Card>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-4">
              <div className="text-sm text-white/60 mb-3">אמצעי תשלום לאורך זמן</div>
              <div dir="ltr"><ResponsiveContainer width="100%" height={200}>
                <BarChart data={paymentMethods} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#ffffff50' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#ffffff50' }} />
                  <Tooltip contentStyle={TT} formatter={(v: number) => formatCurrency(v as number)} />
                  <Legend wrapperStyle={{ fontSize: 10, color: '#ffffff80' }} />
                  {PAYMENT_METHODS_LIST.map((m, i) => <Bar key={m} dataKey={m} stackId="a" fill={METHOD_COLORS[i % METHOD_COLORS.length]} />)}
                </BarChart>
              </ResponsiveContainer></div>
            </CardContent>
          </Card>
        </div>
      )}

      {subTab === 'anomalies' && (
        <div className="space-y-3">
          {anomalies.length === 0 ? (
            <Card className="bg-white/5 border-white/10"><CardContent className="py-8 text-center text-white/40">✅ לא נמצאו חריגות משמעותיות בתקופה זו</CardContent></Card>
          ) : anomalies.map((a) => (
            <Card key={a.category} className={`border ${a.level === 'bad' ? 'bg-red-500/10 border-red-500/30' : 'bg-yellow-500/10 border-yellow-500/30'}`}>
              <CardContent className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-sm text-white">{a.category}</div>
                  <div className="text-xs text-white/50 mt-0.5">התקופה: {formatCurrency(a.currentAmount)} | קודם: {formatCurrency(a.movingAvg)}</div>
                </div>
                <div className={`text-lg font-bold shrink-0 ${a.level === 'bad' ? 'text-red-400' : 'text-yellow-400'}`}>+{a.deviation}%</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {subTab === 'payers' && (
        <div className="space-y-4">
          <div className="flex gap-4 flex-wrap">
            {payer.pieData.map((d, i) => (
              <div key={d.name} className="flex-1 min-w-[80px] p-3 rounded-xl bg-white/5 border border-white/8 text-center">
                <div className="text-xs text-white/40">{d.name}</div>
                <div className="text-base font-bold mt-1" style={{ color: PAYER_COLORS[i] }}>{formatCurrency(d.value)}</div>
              </div>
            ))}
          </div>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={payer.pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                    {payer.pieData.map((_, i) => <Cell key={i} fill={PAYER_COLORS[i]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(v), String(name)]} contentStyle={TT} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#ffffff80' }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          {payer.byCat.length > 0 && (
            <Card className="bg-white/5 border-white/10">
              <CardContent className="pt-4">
                <div className="text-sm text-white/60 mb-2">פירוט לפי קטגוריה</div>
                <div className="flex gap-4 mb-3">
                  {PAYER_HE_KEYS.map((he, i) => (
                    <div key={he} className="flex items-center gap-1.5 text-xs text-white/60">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PAYER_COLORS[i] }} />{he}
                    </div>
                  ))}
                </div>
                <div dir="ltr"><ResponsiveContainer width="100%" height={Math.max(200, payer.byCat.length * 28)}>
                  <BarChart data={payer.byCat} layout="vertical" margin={{ top: 4, right: 75, bottom: 0, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                    <XAxis type="number" reversed tick={{ fontSize: 9, fill: '#ffffff50' }} />
                    <YAxis type="category" dataKey="category" orientation="right" tick={{ fontSize: 10, fill: '#ffffff70' }} width={70} />
                    <Tooltip contentStyle={TT} formatter={(v: number, name: string): [string, string] => [formatCurrency(v as number), String(name)]} />
                    {PAYER_HE_KEYS.map((he, i) => <Bar key={he} dataKey={he} stackId="a" fill={PAYER_COLORS[i]} />)}
                  </BarChart>
                </ResponsiveContainer></div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {subTab === 'leaks' && (
        <div className="space-y-4">
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-4 flex justify-between items-center">
              <div className="text-sm text-white/60">סיכום דליפות שנתי (כל ההיסטוריה)</div>
              <div className="text-xl font-bold text-amber-400">{formatCurrency(leaks.reduce((s, l) => s + l.yearlyEstimate, 0))} /שנה</div>
            </CardContent>
          </Card>
          <p className="text-xs text-white/40">📌 דליפות מזוהות על כל ההיסטוריה — אינן מושפעות מבורר התקופה למעלה</p>
          {leaksByCategory.length > 0 && (
            <Card className="bg-white/5 border-white/10">
              <CardContent className="pt-4">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={leaksByCategory} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                      {leaksByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, name: string): [string, string] => [formatCurrency(Math.round(v)) + ' /שנה', String(name)]} contentStyle={TT} />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#ffffff70' }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          {leaks.length === 0 ? (
            <div className="text-center text-white/40 py-8">✅ לא זוהו הוצאות חוזרות חשודות</div>
          ) : leaks.map((l) => (
            <Card key={l.name} className="bg-white/5 border-white/10">
              <CardContent className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">{l.name}</span>
                    {l.isSubscription && <span className="shrink-0 text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded-full">מנוי</span>}
                  </div>
                  <div className="text-xs text-white/40 mt-0.5">{l.category} · {l.months} חודשים · {l.occurrences} פעמים</div>
                </div>
                <div className="text-left shrink-0">
                  <div className="text-sm font-bold text-amber-400">{formatCurrency(l.monthlyAvg)}/חודש</div>
                  <div className="text-xs text-white/40">{formatCurrency(l.yearlyEstimate)}/שנה</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {subTab === 'forecast' && (
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-4 space-y-3">
            <div className="text-sm text-white/60">תזרים חזוי — 3 החודשים הבאים</div>
            <p className="text-xs text-white/40">📌 תזרים תמיד מציג את 3 החודשים הבאים מהיום — אינו מושפע מבורר התקופה למעלה</p>
            {forecast.length === 0 ? (
              <p className="text-sm text-white/40 text-center py-4">אין חודשים עתידיים להצגה</p>
            ) : forecast.map((f) => (
              <div key={f.month} className="flex items-center justify-between py-2 border-b border-white/5 text-sm">
                <span className="text-white/70">{f.month}</span>
                <div className="text-left">
                  <span className="text-cyan-400">{formatCurrency(f.knownFixed)} ידוע</span>
                  <span className="text-white/30 mx-1">+</span>
                  <span className="text-white/50">{formatCurrency(f.estimatedVariable)} משוער</span>
                  <span className="block text-white font-bold">{formatCurrency(f.total)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {subTab === 'misc' && (
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-4 space-y-2">
            <div className="text-sm text-white/60 mb-2">"שונות" כאחוז מסך ההוצאות, לפי חודש</div>
            {misc.map((m) => (
              <div key={m.month} className={`flex items-center justify-between py-2 px-2 rounded-lg text-sm ${m.flagged ? 'bg-amber-500/10 border border-amber-500/30' : ''}`}>
                <span className="text-white/70">{m.month}</span>
                <span className={m.flagged ? 'text-amber-400 font-bold' : 'text-white/50'}>{formatCurrency(m.miscTotal)} ({m.sharePct}%){m.flagged ? ' ⚠️' : ''}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
