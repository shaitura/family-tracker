import { Transaction, Payer } from '@/types';
import { EARLIEST_DATA_MONTH } from './reportPeriod';

const SHORT_MONTHS = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

function fmt(n: number): string { return `₪${Math.round(n).toLocaleString('he')}`; }
function fmtK(n: number): string { return `₪${Math.round(n).toLocaleString('en-US')}`; }

/** Top-10 by amount desc — the standard "supporting evidence" slice attached to every insight. */
function topTransactions(txs: Transaction[]): Transaction[] {
  return [...txs].sort((a, b) => b.amount - a.amount).slice(0, 10);
}

// ── Anomalies ────────────────────────────────────────────────────────────────
export interface Anomaly { category: string; currentAmount: number; movingAvg: number; deviation: number; level: 'warn' | 'bad'; transactions: Transaction[] }

/** Categories whose average-per-month over `months` deviates >=30% from the equal-length `priorMonths` window. */
export function findAnomalies(allExpenses: Transaction[], months: string[], priorMonths: string[]): Anomaly[] {
  if (months.length === 0) return [];
  const inMonths = allExpenses.filter((t) => months.includes(t.date.slice(0, 7)));
  const results: Anomaly[] = [];
  const categories = new Set(allExpenses.map((t) => t.category));
  for (const cat of categories) {
    const catTx = inMonths.filter((t) => t.category === cat);
    const curMonthly = catTx.reduce((s, t) => s + t.amount, 0) / months.length;
    const priorMonthly = priorMonths.length > 0
      ? allExpenses.filter((t) => priorMonths.includes(t.date.slice(0, 7)) && t.category === cat).reduce((s, t) => s + t.amount, 0) / priorMonths.length
      : 0;
    if (priorMonthly < 200 || curMonthly < 100) continue;
    const dev = Math.round(((curMonthly - priorMonthly) / priorMonthly) * 100);
    if (dev >= 30) {
      results.push({
        category: cat,
        currentAmount: Math.round(curMonthly * months.length),
        movingAvg: Math.round(priorMonthly * months.length),
        deviation: dev,
        level: dev >= 60 ? 'bad' : 'warn',
        transactions: topTransactions(catTx),
      });
    }
  }
  return results.sort((a, b) => b.deviation - a.deviation);
}

// ── Leaks ────────────────────────────────────────────────────────────────────
export interface Leak {
  name: string; category: string; monthlyAvg: number; yearlyEstimate: number;
  months: number; occurrences: number; isSubscription: boolean; transactions: Transaction[];
}

/** Recurring-looking "משתנה" expenses (same description in >=3 distinct months) — period-independent by design. */
export function findLeaks(allExpenses: Transaction[]): Leak[] {
  const groups: Record<string, { amounts: number[]; months: Set<string>; category: string; transactions: Transaction[] }> = {};
  for (const t of allExpenses.filter((t) => t.expense_class === 'משתנה')) {
    const key = (t.sub_category || t.notes || '').trim().toLowerCase();
    if (!key || key.length < 3) continue;
    if (!groups[key]) groups[key] = { amounts: [], months: new Set(), category: t.category, transactions: [] };
    groups[key].amounts.push(t.amount);
    groups[key].months.add(t.date.slice(0, 7));
    groups[key].transactions.push(t);
  }
  return Object.entries(groups)
    .filter(([, g]) => g.months.size >= 3)
    .map(([name, g]) => {
      const total = g.amounts.reduce((s, a) => s + a, 0);
      const monthlyAvg = Math.round(total / g.months.size);
      return {
        name, category: g.category, monthlyAvg, yearlyEstimate: monthlyAvg * 12,
        months: g.months.size, occurrences: g.amounts.length,
        isSubscription: g.amounts.length >= 3 && g.amounts.every((a) => Math.abs(a - g.amounts[0]) < 5),
        transactions: topTransactions(g.transactions),
      };
    })
    .sort((a, b) => b.yearlyEstimate - a.yearlyEstimate)
    .slice(0, 20);
}

// ── Year-over-year & seasonal ─────────────────────────────────────────────────
export type YoyRow = { month: string } & Record<number, number>;

export function yearOverYear(allExpenses: Transaction[], currentYear: number): YoyRow[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    const sum = (y: number) => allExpenses.filter((t) => t.date.startsWith(`${y}-${m}`)).reduce((s, t) => s + t.amount, 0);
    const row = { month: SHORT_MONTHS[i] } as YoyRow;
    row[currentYear - 2] = Math.round(sum(currentYear - 2));
    row[currentYear - 1] = Math.round(sum(currentYear - 1));
    row[currentYear] = Math.round(sum(currentYear));
    return row;
  }).reverse();
}

export interface SeasonalPeak { month: string; avg: number; ratio: number }

/** Calendar months whose historical average (across all available years, >=2 required) exceeds the overall monthly average. */
export function seasonalPeaks(allExpenses: Transaction[], currentYear: number): SeasonalPeak[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    const yt: number[] = [];
    for (let y = Number(EARLIEST_DATA_MONTH.slice(0, 4)); y <= currentYear; y++) {
      const total = allExpenses.filter((t) => t.date.startsWith(`${y}-${m}`)).reduce((s, t) => s + t.amount, 0);
      if (total > 0) yt.push(total);
    }
    if (yt.length < 2) return null;
    const avg = yt.reduce((s, v) => s + v, 0) / yt.length;
    const totalMonths = new Set(allExpenses.map((t) => t.date.slice(0, 7))).size;
    const overallAvg = allExpenses.reduce((s, t) => s + t.amount, 0) / Math.max(1, totalMonths);
    return { month: SHORT_MONTHS[i], avg: Math.round(avg), ratio: Math.round((avg / Math.max(1, overallAvg)) * 100) / 100 };
  }).filter((x): x is SeasonalPeak => x !== null).sort((a, b) => b.ratio - a.ratio);
}

// ── Payment method ─────────────────────────────────────────────────────────────
export const PAYMENT_METHODS_LIST = ['אשראי', 'מזומן', 'ביט', 'העברה', 'הוראת קבע', "צ'ק"];

export type PaymentMethodByMonth = { month: string } & Record<string, number | string>;

export function paymentMethodByMonth(expensesInWindow: Transaction[], months: string[]): PaymentMethodByMonth[] {
  return months.slice(-12).map((m) => {
    const row: PaymentMethodByMonth = { month: m };
    for (const method of PAYMENT_METHODS_LIST) {
      row[method] = expensesInWindow.filter((t) => t.date.startsWith(m) && t.payment_method === method).reduce((s, t) => s + t.amount, 0);
    }
    return row;
  }).reverse();
}

// ── Payer × category breakdown ("משלמים" tab) ──────────────────────────────────
export interface NamedAmount { name: string; value: number }
export type PayerCategoryRow = { category: string } & Record<string, number | string>;
export interface PayerBreakdown { byCat: PayerCategoryRow[]; pieData: NamedAmount[] }

const PAYER_HE: Record<string, string> = { Shi: 'שי', Ortal: 'אורטל', Joint: 'משותף' };

/** Matches both the current Payer enum and legacy Hebrew-string values from old Firestore rows. */
function matchPayer(t: Transaction, p: string): boolean {
  if (p === 'Shi')   return t.payer === 'Shi'   || (t.payer as string) === 'שי';
  if (p === 'Ortal') return t.payer === 'Ortal' || (t.payer as string) === 'אורטל';
  if (p === 'Joint') return t.payer === 'Joint' || (t.payer as string) === 'משותף';
  return false;
}

export function payerCategoryBreakdown(expensesInWindow: Transaction[]): PayerBreakdown {
  const payers: Payer[] = ['Shi', 'Ortal', 'Joint'];
  const byCat = Array.from(new Set(expensesInWindow.map((t) => t.category)))
    .map((cat) => {
      const row: PayerCategoryRow = { category: cat };
      for (const p of payers) row[PAYER_HE[p]] = expensesInWindow.filter((t) => t.category === cat && matchPayer(t, p)).reduce((s, t) => s + t.amount, 0);
      return row;
    })
    .sort((a, b) => {
      const totalA = payers.reduce((s, p) => s + (a[PAYER_HE[p]] as number), 0);
      const totalB = payers.reduce((s, p) => s + (b[PAYER_HE[p]] as number), 0);
      return totalB - totalA;
    })
    .slice(0, 10);
  const totals: Record<string, number> = { Shi: 0, Ortal: 0, Joint: 0 };
  for (const t of expensesInWindow) {
    for (const p of payers) if (matchPayer(t, p)) { totals[p] = (totals[p] || 0) + t.amount; break; }
  }
  const pieData = payers.map((p) => ({ name: PAYER_HE[p], value: Math.round(totals[p] || 0) })).filter((x) => x.value > 0);
  return { byCat, pieData };
}

// ── Executive summary ───────────────────────────────────────────────────────────
export interface ExecItem { icon: string; text: string; level: 'ok' | 'warn' | 'bad' | 'info'; saving?: number; transactions: Transaction[] }

/** Ordered rule-based sentences — NOT an LLM call (see design spec §7: all client-side heuristics). */
export function executiveSummary(params: {
  expenses: Transaction[]; priorExpenses: Transaction[]; income: number;
  anomalies: Anomaly[]; leaks: Leak[];
}): ExecItem[] {
  const { expenses, priorExpenses, income, anomalies, leaks } = params;
  const items: ExecItem[] = [];
  if (!expenses.length) return items;
  const curTotal = expenses.reduce((s, t) => s + t.amount, 0);
  const priorTotal = priorExpenses.reduce((s, t) => s + t.amount, 0);
  const periodTx = topTransactions(expenses);
  if (priorTotal > 0) {
    const pct = Math.round(((curTotal - priorTotal) / priorTotal) * 100);
    items.push(pct > 10
      ? { icon: '📈', level: 'bad', text: `הוצאות בתקופה גבוהות ב-${pct}% לעומת התקופה הקודמת (${fmt(curTotal)} לעומת ${fmt(priorTotal)})`, transactions: periodTx }
      : pct < -10
      ? { icon: '📉', level: 'ok', text: `הוצאות בתקופה נמוכות ב-${Math.abs(pct)}% לעומת התקופה הקודמת (${fmt(curTotal)})`, transactions: periodTx }
      : { icon: '⚖️', level: 'info', text: `הוצאות יציבות: ${fmt(curTotal)} (שינוי של ${pct > 0 ? '+' : ''}${pct}%)`, transactions: periodTx });
  }
  if (anomalies.length > 0) {
    const top = anomalies[0];
    items.push({ icon: '⚠️', level: top.level, text: `חריגה בקטגוריית ${top.category}: ${fmt(top.currentAmount)} לעומת ${fmt(top.movingAvg)} בתקופה הקודמת (+${top.deviation}%)`, transactions: top.transactions });
  }
  const topCatEntries = Object.entries(
    expenses.reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + t.amount; return acc; }, {} as Record<string, number>),
  ).sort((a, b) => b[1] - a[1]);
  const topCat = topCatEntries[0];
  if (topCat) items.push({ icon: '🎯', level: 'info', text: `קטגוריה מובילת: ${topCat[0]} — ${fmt(topCat[1])}`, transactions: topTransactions(expenses.filter((t) => t.category === topCat[0])) });
  if (leaks.length > 0) {
    const totalLeak = leaks.reduce((s, l) => s + l.yearlyEstimate, 0);
    items.push({ icon: '💸', level: 'warn', text: `זוהו ${leaks.length} הוצאות קבועות בסך ${fmtK(totalLeak)} ש"ח/שנה`, transactions: topTransactions(leaks.flatMap((l) => l.transactions)) });
  }
  if (income > 0 && curTotal > 0) {
    const ratio = Math.round((curTotal / income) * 100);
    items.push(ratio > 90
      ? { icon: '🚨', level: 'bad', text: `הוצאות מהוות ${ratio}% מההכנסה — סכנת גירעון!`, transactions: periodTx }
      : ratio > 70
      ? { icon: '⚠️', level: 'warn', text: `הוצאות מהוות ${ratio}% מההכנסה`, transactions: periodTx }
      : { icon: '✅', level: 'ok', text: `יחס הוצאות/הכנסה תקין: ${ratio}%`, transactions: periodTx });
    const saved = income - curTotal;
    const savePct = Math.round((saved / income) * 100);
    if (savePct > 20) items.push({ icon: '🏦', level: 'ok', text: `חיסכון בתקופה: ${fmt(saved)} (${savePct}% מההכנסה)`, transactions: periodTx });
    else if (savePct < 0) items.push({ icon: '🔴', level: 'bad', text: `גירעון בתקופה: ${fmt(Math.abs(saved))} — ההוצאות עולות על ההכנסה`, transactions: periodTx });
  }
  const fixedExpenses = expenses.filter((t) => t.expense_class === 'קבועה');
  const fixedAmt = fixedExpenses.reduce((s, t) => s + t.amount, 0);
  if (curTotal > 0 && fixedAmt > 0) {
    const fixedPct = Math.round((fixedAmt / curTotal) * 100);
    items.push({ icon: '📋', level: 'info', text: `${fixedPct}% מהוצאות הן קבועות (${fmt(fixedAmt)})`, transactions: topTransactions(fixedExpenses) });
  }
  return items.slice(0, 5);
}

// ── Cashflow forecast ────────────────────────────────────────────────────────
export interface ForecastMonth { month: string; knownFixed: number; estimatedVariable: number; total: number }

/**
 * `futureExpenses` = transactions already flagged status:'future' by useTransactions()
 * (i.e. RecurringRule instances projected into upcoming months). `recentVariableExpenses`
 * = actual "משתנה" expenses from the last `lookbackMonths` — their average estimates
 * the variable spend not covered by any declared recurring rule.
 */
export function cashflowForecast(
  futureExpenses: Transaction[],
  recentVariableExpenses: Transaction[],
  monthsAhead: string[],
  lookbackMonths: number,
): ForecastMonth[] {
  const avgVariable = recentVariableExpenses.length > 0 && lookbackMonths > 0
    ? recentVariableExpenses.reduce((s, t) => s + t.amount, 0) / lookbackMonths
    : 0;
  return monthsAhead.map((m) => {
    const knownFixed = futureExpenses.filter((t) => t.date.startsWith(m)).reduce((s, t) => s + t.amount, 0);
    const estimatedVariable = Math.round(avgVariable);
    return { month: m, knownFixed, estimatedVariable, total: knownFixed + estimatedVariable };
  });
}

// ── "שונות" drift indicator ──────────────────────────────────────────────────
export interface MiscDriftMonth { month: string; miscTotal: number; totalExpense: number; sharePct: number; flagged: boolean }

const MISC_DRIFT_THRESHOLD_PCT = 15;

export function miscDrift(expenses: Transaction[], months: string[]): MiscDriftMonth[] {
  return months.map((m) => {
    const inMonth = expenses.filter((t) => t.date.startsWith(m));
    const totalExpense = inMonth.reduce((s, t) => s + t.amount, 0);
    const miscTotal = inMonth.filter((t) => t.category === 'שונות').reduce((s, t) => s + t.amount, 0);
    const sharePct = totalExpense > 0 ? Math.round((miscTotal / totalExpense) * 100) : 0;
    return { month: m, miscTotal, totalExpense, sharePct, flagged: sharePct > MISC_DRIFT_THRESHOLD_PCT };
  });
}

// ── Analyst insights: cross-cutting, whole-history narrative ──────────────────
// Distinct from executiveSummary() (period-vs-prior-period only): this looks across
// ALL available history to surface slow trends, seasonal heads-up, and YoY drift that
// a single-period comparison misses. Still no LLM — rule-based heuristics, same as
// every other function in this file.
export interface AnalystInsight { icon: string; headline: string; detail: string; level: 'ok' | 'warn' | 'bad' | 'info' }

function monthKey(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

/** Consecutive-month rise/fall for each category over the last `lookback` months (default 4) — catches slow creep a single-period anomaly threshold misses. */
export function categoryTrendInsights(allExpenses: Transaction[], now: Date = new Date(), lookback = 4): AnalystInsight[] {
  const months = Array.from({ length: lookback }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - (lookback - 1 - i), 1)));
  const cats = Array.from(new Set(allExpenses.map((t) => t.category)));
  const insights: AnalystInsight[] = [];
  for (const cat of cats) {
    const perMonth = months.map((m) => allExpenses.filter((t) => t.category === cat && t.date.startsWith(m)).reduce((s, t) => s + t.amount, 0));
    if (perMonth.some((v) => v < 50)) continue; // needs real spend every month to call it a genuine trend, not sporadic purchases
    const rising = perMonth.every((v, i) => i === 0 || v > perMonth[i - 1]);
    const falling = perMonth.every((v, i) => i === 0 || v < perMonth[i - 1]);
    if (!rising && !falling) continue;
    const first = perMonth[0], last = perMonth[perMonth.length - 1];
    const pct = Math.round(((last - first) / first) * 100);
    if (Math.abs(pct) < 15) continue; // ignore noise-level drift
    insights.push(rising
      ? { icon: '📈', level: pct > 40 ? 'bad' : 'warn', headline: `${cat} עולה בעקביות`, detail: `${lookback} חודשים ברציפות — מ-${fmt(first)} ל-${fmt(last)} (+${pct}%)` }
      : { icon: '📉', level: 'ok', headline: `${cat} יורדת בעקביות`, detail: `${lookback} חודשים ברציפות — מ-${fmt(first)} ל-${fmt(last)} (${pct}%)` });
  }
  return insights.sort((a, b) => (a.level === 'bad' ? -1 : 0) - (b.level === 'bad' ? -1 : 0)).slice(0, 2);
}

/** If the real-world current month is historically a seasonal peak, warn ahead of time instead of only after the fact. */
export function seasonalHeadsUp(seasonal: SeasonalPeak[], now: Date = new Date()): AnalystInsight[] {
  const currentMonthLabel = SHORT_MONTHS[now.getMonth()];
  const match = seasonal.find((s) => s.month === currentMonthLabel && s.ratio > 1.15);
  if (!match) return [];
  const pct = Math.round((match.ratio - 1) * 100);
  return [{
    icon: '📅', level: 'warn',
    headline: `${match.month} הוא בדרך כלל חודש-שיא בהוצאות`,
    detail: `בממוצע כ-${pct}% מעל חודש רגיל (${fmt(match.avg)}) — כדאי להיערך מראש`,
  }];
}

/** Same-calendar-month comparison: the most recently fully-elapsed month vs. the same month last year. */
export function yoySameMonthInsight(yoy: YoyRow[], currentYear: number, now: Date = new Date()): AnalystInsight[] {
  const lastCompleteMonthIdx = now.getMonth() - 1; // 0-based; -1 in January means no complete month yet this year
  if (lastCompleteMonthIdx < 0) return [];
  const label = SHORT_MONTHS[lastCompleteMonthIdx];
  const row = yoy.find((r) => r.month === label);
  if (!row) return [];
  const thisYear = row[currentYear] ?? 0;
  const lastYear = row[currentYear - 1] ?? 0;
  if (lastYear < 200) return [];
  const pct = Math.round(((thisYear - lastYear) / lastYear) * 100);
  if (Math.abs(pct) < 15) return [];
  return [{
    icon: pct > 0 ? '🔺' : '🔻', level: pct > 25 ? 'bad' : pct > 0 ? 'warn' : 'ok',
    headline: `${label} השנה ${pct > 0 ? 'גבוה' : 'נמוך'} משמעותית מאשתקד`,
    detail: `${fmt(thisYear)} לעומת ${fmt(lastYear)} ב-${label} ${currentYear - 1} (${pct > 0 ? '+' : ''}${pct}%)`,
  }];
}

/** Which category's share of total spend shifted the most, comparing the last 6 months to the 6 before that. */
export function categoryShareShift(allExpenses: Transaction[], now: Date = new Date()): AnalystInsight[] {
  const monthsBack = (offset: number) => Array.from({ length: 6 }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - offset - (5 - i), 1)));
  const recent = monthsBack(0), older = monthsBack(6);
  const shareByCat = (months: string[]) => {
    const inWindow = allExpenses.filter((t) => months.includes(t.date.slice(0, 7)));
    const total = inWindow.reduce((s, t) => s + t.amount, 0);
    if (total === 0) return {} as Record<string, number>;
    const byCat: Record<string, number> = {};
    for (const t of inWindow) byCat[t.category] = (byCat[t.category] || 0) + t.amount;
    return Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, v / total]));
  };
  const recentShare = shareByCat(recent), olderShare = shareByCat(older);
  if (Object.keys(olderShare).length === 0) return [];
  let biggest: { cat: string; delta: number } | null = null;
  for (const cat of new Set([...Object.keys(recentShare), ...Object.keys(olderShare)])) {
    const delta = (recentShare[cat] || 0) - (olderShare[cat] || 0);
    if (!biggest || Math.abs(delta) > Math.abs(biggest.delta)) biggest = { cat, delta };
  }
  if (!biggest || Math.abs(biggest.delta) < 0.04) return []; // <4 percentage-points shift = noise
  const fromPct = Math.round((olderShare[biggest.cat] || 0) * 100);
  const toPct = Math.round((recentShare[biggest.cat] || 0) * 100);
  return [{
    icon: '🧭', level: 'info',
    headline: `התקציב נוטה יותר ל${biggest.cat}`,
    detail: `${fromPct}% מסך ההוצאות לפני חצי שנה → ${toPct}% היום`,
  }];
}

/** Cross-cutting analyst-style read across ALL available history — complements executiveSummary(), which is period-scoped. */
export function analystInsights(params: {
  allExpenses: Transaction[]; seasonal: SeasonalPeak[]; yoy: YoyRow[]; currentYear: number; now?: Date;
}): AnalystInsight[] {
  const { allExpenses, seasonal, yoy, currentYear, now = new Date() } = params;
  return [
    ...seasonalHeadsUp(seasonal, now),
    ...yoySameMonthInsight(yoy, currentYear, now),
    ...categoryTrendInsights(allExpenses, now),
    ...categoryShareShift(allExpenses, now),
  ].slice(0, 6);
}
