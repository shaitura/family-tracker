import { PeriodQuickPick, ReportPeriod, buildPeriod, EARLIEST_DATA_MONTH } from '@/lib/reportPeriod';

const QUICK_PICKS: { key: PeriodQuickPick; label: string }[] = [
  { key: 'currentMonth', label: 'החודש הנוכחי' },
  { key: 'lastMonth', label: 'חודש קודם' },
  { key: 'selectedYear', label: 'שנה נבחרת' },
  { key: 'lastQuarter', label: 'רבעון אחרון' },
  { key: 'last12', label: '12 חודשים אחרונים' },
  { key: 'last18', label: '18 חודשים אחרונים' },
  { key: 'allTime', label: 'כל הזמן' },
  { key: 'custom', label: 'טווח מותאם' },
];

const currentYear = new Date().getFullYear();
const EARLIEST_YEAR = Number(EARLIEST_DATA_MONTH.slice(0, 4));
export const YEAR_OPTIONS = Array.from({ length: currentYear - EARLIEST_YEAR + 1 }, (_, i) => String(EARLIEST_YEAR + i)).reverse();

export function PeriodSelector({ period, onChange }: { period: ReportPeriod; onChange: (p: ReportPeriod) => void }) {
  const pick = (key: PeriodQuickPick) => onChange(buildPeriod(key, { year: period.year, customStart: period.startMonth, customEnd: period.endMonth }));

  return (
    <div className="space-y-2" dir="rtl">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {QUICK_PICKS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => pick(key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              period.quickPick === key ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-white/5 border border-white/10 text-white/50 hover:text-white/70'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {period.quickPick === 'selectedYear' && (
        <select
          value={period.year}
          onChange={(e) => onChange(buildPeriod('selectedYear', { year: e.target.value }))}
          className="w-full h-9 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none"
        >
          {YEAR_OPTIONS.map((y) => <option key={y} value={y} className="bg-slate-800">{y}</option>)}
        </select>
      )}

      {period.quickPick === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-0.5 block text-[10px] text-white/40">מחודש</label>
            <input
              type="month"
              value={period.startMonth}
              min={EARLIEST_DATA_MONTH}
              onChange={(e) => onChange(buildPeriod('custom', { customStart: e.target.value, customEnd: period.endMonth }))}
              className="w-full h-9 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-white/40">עד חודש</label>
            <input
              type="month"
              value={period.endMonth}
              min={period.startMonth || EARLIEST_DATA_MONTH}
              onChange={(e) => onChange(buildPeriod('custom', { customStart: period.startMonth, customEnd: e.target.value }))}
              className="w-full h-9 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
