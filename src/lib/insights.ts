import { Transaction, Payer } from '@/types';

const SHORT_MONTHS = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

function fmt(n: number): string { return `₪${Math.round(n).toLocaleString('he')}`; }
function fmtK(n: number): string { return `₪${Math.round(n).toLocaleString('en-US')}`; }

// ── Anomalies ────────────────────────────────────────────────────────────────
export interface Anomaly { category: string; currentAmount: number; movingAvg: number; deviation: number; level: 'warn' | 'bad' }

/** Categories whose average-per-month over `months` deviates >=30% from the equal-length `priorMonths` window. */
export function findAnomalies(allExpenses: Transaction[], months: string[], priorMonths: string[]): Anomaly[] {
  if (months.length === 0) return [];
  const inMonths = allExpenses.filter((t) => months.includes(t.date.slice(0, 7)));
  const results: Anomaly[] = [];
  const categories = new Set(allExpenses.map((t) => t.category));
  for (const cat of categories) {
    const curMonthly = inMonths.filter((t) => t.category === cat).reduce((s, t) => s + t.amount, 0) / months.length;
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
      });
    }
  }
  return results.sort((a, b) => b.deviation - a.deviation);
}

// ── Leaks ────────────────────────────────────────────────────────────────────
export interface Leak {
  name: string; category: string; monthlyAvg: number; yearlyEstimate: number;
  months: number; occurrences: number; isSubscription: boolean;
}

/** Recurring-looking "משתנה" expenses (same description in >=3 distinct months) — period-independent by design. */
export function findLeaks(allExpenses: Transaction[]): Leak[] {
  const groups: Record<string, { amounts: number[]; months: Set<string>; category: string }> = {};
  for (const t of allExpenses.filter((t) => t.expense_class === 'משתנה')) {
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
      return {
        name, category: g.category, monthlyAvg, yearlyEstimate: monthlyAvg * 12,
        months: g.months.size, occurrences: g.amounts.length,
        isSubscription: g.amounts.length >= 3 && g.amounts.every((a) => Math.abs(a - g.amounts[0]) < 5),
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
    for (let y = 2022; y <= currentYear; y++) {
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
export interface ExecItem { icon: string; text: string; level: 'ok' | 'warn' | 'bad' | 'info'; saving?: number }

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
  if (priorTotal > 0) {
    const pct = Math.round(((curTotal - priorTotal) / priorTotal) * 100);
    items.push(pct > 10
      ? { icon: '📈', level: 'bad', text: `הוצאות בתקופה גבוהות ב-${pct}% לעומת התקופה הקודמת (${fmt(curTotal)} לעומת ${fmt(priorTotal)})` }
      : pct < -10
      ? { icon: '📉', level: 'ok', text: `הוצאות בתקופה נמוכות ב-${Math.abs(pct)}% לעומת התקופה הקודמת (${fmt(curTotal)})` }
      : { icon: '⚖️', level: 'info', text: `הוצאות יציבות: ${fmt(curTotal)} (שינוי של ${pct > 0 ? '+' : ''}${pct}%)` });
  }
  if (anomalies.length > 0) {
    const top = anomalies[0];
    items.push({ icon: '⚠️', level: top.level, text: `חריגה בקטגוריית ${top.category}: ${fmt(top.currentAmount)} לעומת ${fmt(top.movingAvg)} בתקופה הקודמת (+${top.deviation}%)` });
  }
  const topCat = Object.entries(
    expenses.reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + t.amount; return acc; }, {} as Record<string, number>),
  ).sort((a, b) => b[1] - a[1])[0];
  if (topCat) items.push({ icon: '🎯', level: 'info', text: `קטגוריה מובילת: ${topCat[0]} — ${fmt(topCat[1])}` });
  if (leaks.length > 0) {
    const totalLeak = leaks.reduce((s, l) => s + l.yearlyEstimate, 0);
    items.push({ icon: '💸', level: 'warn', text: `זוהו ${leaks.length} הוצאות קבועות בסך ${fmtK(totalLeak)} ש"ח/שנה` });
  }
  if (income > 0 && curTotal > 0) {
    const ratio = Math.round((curTotal / income) * 100);
    items.push(ratio > 90
      ? { icon: '🚨', level: 'bad', text: `הוצאות מהוות ${ratio}% מההכנסה — סכנת גירעון!` }
      : ratio > 70
      ? { icon: '⚠️', level: 'warn', text: `הוצאות מהוות ${ratio}% מההכנסה` }
      : { icon: '✅', level: 'ok', text: `יחס הוצאות/הכנסה תקין: ${ratio}%` });
    const saved = income - curTotal;
    const savePct = Math.round((saved / income) * 100);
    if (savePct > 20) items.push({ icon: '🏦', level: 'ok', text: `חיסכון בתקופה: ${fmt(saved)} (${savePct}% מההכנסה)` });
    else if (savePct < 0) items.push({ icon: '🔴', level: 'bad', text: `גירעון בתקופה: ${fmt(Math.abs(saved))} — ההוצאות עולות על ההכנסה` });
  }
  const fixedAmt = expenses.filter((t) => t.expense_class === 'קבועה').reduce((s, t) => s + t.amount, 0);
  if (curTotal > 0 && fixedAmt > 0) {
    const fixedPct = Math.round((fixedAmt / curTotal) * 100);
    items.push({ icon: '📋', level: 'info', text: `${fixedPct}% מהוצאות הן קבועות (${fmt(fixedAmt)})` });
  }
  return items.slice(0, 5);
}
