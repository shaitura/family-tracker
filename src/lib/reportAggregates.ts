import { Transaction } from '@/types';
import { PAYER_LABELS } from '@/utils';

export interface NamedAmount { name: string; value: number }

export function byCategory(txs: Transaction[]): NamedAmount[] {
  const acc: Record<string, number> = {};
  for (const t of txs) acc[t.category] = (acc[t.category] || 0) + t.amount;
  return Object.entries(acc).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
}

export function byPayer(txs: Transaction[]): NamedAmount[] {
  const acc: Record<string, number> = {};
  for (const t of txs) acc[t.payer] = (acc[t.payer] || 0) + t.amount;
  return Object.entries(acc).map(([payer, value]) => ({ name: PAYER_LABELS[payer] || payer, value }));
}

export function byMonth(txs: Transaction[], months: string[]): NamedAmount[] {
  return months.map((m) => ({
    name: m,
    value: txs.filter((t) => t.date.startsWith(m)).reduce((s, t) => s + t.amount, 0),
  }));
}

export interface FixedVariableSplit {
  fixedTotal: number;
  varTotal: number;
  splitTotal: number;
  fixedCats: [string, number][];
  varCats: [string, number][];
}

export function fixedVariableSplit(txs: Transaction[]): FixedVariableSplit {
  const fixedByCat: Record<string, number> = {};
  const varByCat: Record<string, number> = {};
  let fixedTotal = 0, varTotal = 0;
  for (const t of txs) {
    if (t.expense_class === 'קבועה') { fixedByCat[t.category] = (fixedByCat[t.category] || 0) + t.amount; fixedTotal += t.amount; }
    if (t.expense_class === 'משתנה') { varByCat[t.category] = (varByCat[t.category] || 0) + t.amount; varTotal += t.amount; }
  }
  return {
    fixedTotal, varTotal, splitTotal: fixedTotal + varTotal,
    fixedCats: Object.entries(fixedByCat).sort((a, b) => b[1] - a[1]),
    varCats: Object.entries(varByCat).sort((a, b) => b[1] - a[1]),
  };
}

export interface CategoryMonthMatrixRow {
  category: string;
  byMonth: Record<string, number>;
  total: number;
  avg: number;
}

/** Rows = categories present in `txs` within `months`; columns implied by `months`. */
export function categoryMonthMatrix(txs: Transaction[], months: string[]): CategoryMonthMatrixRow[] {
  const monthSet = new Set(months);
  const byCatMonth: Record<string, Record<string, number>> = {};
  for (const t of txs) {
    const m = t.date.slice(0, 7);
    if (!monthSet.has(m)) continue;
    if (!byCatMonth[t.category]) byCatMonth[t.category] = {};
    byCatMonth[t.category][m] = (byCatMonth[t.category][m] || 0) + t.amount;
  }
  return Object.entries(byCatMonth).map(([category, monthMap]) => {
    const total = months.reduce((s, m) => s + (monthMap[m] || 0), 0);
    return { category, byMonth: monthMap, total, avg: months.length ? total / months.length : 0 };
  }).sort((a, b) => b.total - a.total);
}
