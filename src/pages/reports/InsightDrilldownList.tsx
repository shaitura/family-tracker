// src/pages/reports/InsightDrilldownList.tsx
import { Transaction } from '@/types';
import { formatCurrency, formatDate, PAYER_LABELS } from '@/utils';

/** Toggles index `i` in `set`, returning a new Set — never mutates the input. */
export function toggleIndex(set: Set<number>, i: number): Set<number> {
  const next = new Set(set);
  if (next.has(i)) next.delete(i); else next.add(i);
  return next;
}

/** Compact top-10 supporting-transactions list, rendered under an expanded insight card. */
export function InsightDrilldownList({ transactions }: { transactions: Transaction[] }) {
  if (transactions.length === 0) return null;
  return (
    <div className="mt-2 mr-6 space-y-1 border-t border-white/10 pt-2" onClick={(e) => e.stopPropagation()}>
      {transactions.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-2 text-xs text-white/60">
          <span className="shrink-0 text-white/40">{formatDate(t.date)}</span>
          <span className="flex-1 truncate">{t.sub_category || t.notes || t.category}</span>
          <span className="shrink-0 text-white/40">{PAYER_LABELS[t.payer] ?? t.payer}</span>
          <span className="shrink-0 font-medium text-white/80">{formatCurrency(t.amount)}</span>
        </div>
      ))}
    </div>
  );
}
