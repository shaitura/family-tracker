import { monthsInRange, currentMonthKey } from './recurrence';

export { currentMonthKey };

/** Earliest calendar month with real data — floor for period pickers (custom range, year dropdown, seasonal analysis). */
export const EARLIEST_DATA_MONTH = '2022-01';

export type PeriodQuickPick =
  | 'currentMonth' | 'selectedYear' | 'lastQuarter' | 'last12' | 'last18' | 'allTime' | 'custom';

export interface ReportPeriod {
  quickPick: PeriodQuickPick;
  startMonth: string;   // 'YYYY-MM', ignored when isAllTime
  endMonth: string;     // 'YYYY-MM', ignored when isAllTime
  year: string;         // the year shown by the "שנה נבחרת" year-picker
  isAllTime: boolean;
}

function subtractMonths(ym: string, count: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 - count, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function buildPeriod(
  quickPick: PeriodQuickPick,
  opts: { year?: string; customStart?: string; customEnd?: string; now?: Date } = {},
): ReportPeriod {
  const now = opts.now ?? new Date();
  const nowMonth = currentMonthKey(now);
  const year = opts.year ?? String(now.getFullYear());

  if (quickPick === 'currentMonth') {
    return { quickPick, startMonth: nowMonth, endMonth: nowMonth, year, isAllTime: false };
  }
  if (quickPick === 'selectedYear') {
    return { quickPick, startMonth: `${year}-01`, endMonth: `${year}-12`, year, isAllTime: false };
  }
  if (quickPick === 'lastQuarter') {
    return { quickPick, startMonth: subtractMonths(nowMonth, 2), endMonth: nowMonth, year, isAllTime: false };
  }
  if (quickPick === 'last12') {
    return { quickPick, startMonth: subtractMonths(nowMonth, 11), endMonth: nowMonth, year, isAllTime: false };
  }
  if (quickPick === 'last18') {
    return { quickPick, startMonth: subtractMonths(nowMonth, 17), endMonth: nowMonth, year, isAllTime: false };
  }
  if (quickPick === 'allTime') {
    return { quickPick, startMonth: '', endMonth: '', year, isAllTime: true };
  }
  // custom
  const s = opts.customStart || nowMonth;
  const e = opts.customEnd || nowMonth;
  const [startMonth, endMonth] = s <= e ? [s, e] : [e, s];
  return { quickPick, startMonth, endMonth, year, isAllTime: false };
}

/** Months covered by a period. Empty for allTime — caller should skip date filtering instead. */
export function periodMonths(period: ReportPeriod): string[] {
  if (period.isAllTime) return [];
  return monthsInRange(period.startMonth, period.endMonth);
}

/** True if a transaction date falls within the period (allTime always matches). */
export function inPeriod(dateStr: string, period: ReportPeriod): boolean {
  if (period.isAllTime) return true;
  const ym = dateStr.slice(0, 7);
  return ym >= period.startMonth && ym <= period.endMonth;
}

/** The equal-length period immediately preceding this one — used for anomaly comparisons. */
export function priorPeriod(period: ReportPeriod): ReportPeriod {
  if (period.isAllTime) return { ...period, startMonth: '', endMonth: '' };
  const len = periodMonths(period).length;
  const priorEnd = subtractMonths(period.startMonth, 1);
  const priorStart = subtractMonths(priorEnd, len - 1);
  return { ...period, quickPick: 'custom', startMonth: priorStart, endMonth: priorEnd };
}

export function periodLabel(period: ReportPeriod): string {
  if (period.isAllTime) return 'כל הזמן';
  if (period.quickPick === 'selectedYear') return period.year;
  if (period.startMonth === period.endMonth) return period.startMonth;
  return `${period.startMonth} → ${period.endMonth}`;
}
