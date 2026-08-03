import { Card, CardContent } from '@/components/ui/card';
import { FixedVariableSplit } from '@/lib/reportAggregates';
import { formatCurrency } from '@/utils';

/**
 * Percentage of the classified total. The denominator is `splitTotal`
 * (fixed + variable), not the period total: `fixedVariableSplit` only counts
 * rows explicitly classed 'קבועה' or 'משתנה', so anything unclassified is
 * outside this breakdown and must not silently shrink the percentages.
 */
export function splitPercent(part: number, splitTotal: number): number | null {
  if (!splitTotal) return null;
  return Math.round((part / splitTotal) * 100);
}

/**
 * The two shares as displayed. The variable share is derived as the complement
 * of the fixed one rather than rounded independently — two independent
 * roundings can total 101% (e.g. 50.5 / 49.5), and a breakdown of one whole
 * that doesn't add to 100 reads as a bug.
 */
export function splitPercents(split: FixedVariableSplit): { fixed: number; variable: number } | null {
  const fixed = splitPercent(split.fixedTotal, split.splitTotal);
  if (fixed === null) return null;
  return { fixed, variable: 100 - fixed };
}

/**
 * The fixed/variable breakdown, shared by the expense and income tabs so both
 * read identically. Amount on top, share of the classified total underneath.
 */
export function FixedVariableSplitCard({ split, fixedLabel, varLabel }: {
  split: FixedVariableSplit;
  fixedLabel: string;
  varLabel: string;
}) {
  const pct = splitPercents(split);

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-cyan-500/10 border border-cyan-500/25 p-3 text-center">
            <p className="text-[10px] text-cyan-400 mb-1">{fixedLabel}</p>
            <p className="text-lg font-black text-white">{formatCurrency(split.fixedTotal)}</p>
            {pct && (
              <p className="text-[11px] font-semibold text-cyan-400/80 mt-0.5">{pct.fixed}%</p>
            )}
          </div>
          <div className="rounded-2xl bg-purple-500/10 border border-purple-500/25 p-3 text-center">
            <p className="text-[10px] text-purple-400 mb-1">{varLabel}</p>
            <p className="text-lg font-black text-white">{formatCurrency(split.varTotal)}</p>
            {pct && (
              <p className="text-[11px] font-semibold text-purple-400/80 mt-0.5">{pct.variable}%</p>
            )}
          </div>
        </div>

        {split.splitTotal === 0 && (
          <p className="text-xs text-white/30 text-center">אין תנועות מסווגות בתקופה הזו</p>
        )}
      </CardContent>
    </Card>
  );
}
