// src/pages/Reports.tsx
import { useState } from 'react';
import { Download, RotateCcw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTransactions } from '@/hooks/useTransactions';
import { CATEGORIES, INCOME_CATEGORIES } from '@/types';
import { ReportPeriod, buildPeriod } from '@/lib/reportPeriod';
import { PeriodSelector } from './reports/PeriodSelector';
import { YEAR_OPTIONS } from './reports/PeriodSelector';
import { ExpensesTab } from './reports/ExpensesTab';
import { IncomeTab } from './reports/IncomeTab';
import { BalanceTab } from './reports/BalanceTab';
import { InsightsTab } from './reports/InsightsTab';
import { exportExcel, exportPdf } from './reports/exportReport';

type ReportType = 'expense' | 'income' | 'balance' | 'insights';
const TYPES: { key: ReportType; label: string }[] = [
  { key: 'expense', label: '💸 הוצאות' },
  { key: 'income', label: '💰 הכנסות' },
  { key: 'balance', label: '📊 מאזן' },
  { key: 'insights', label: '✨ תובנות' },
];

const DEFAULT_YOY_TO_YEAR = Number(YEAR_OPTIONS[0]);
const DEFAULT_YOY_FROM_YEAR = Number(YEAR_OPTIONS[1] ?? YEAR_OPTIONS[0]);

export default function Reports() {
  const [type, setType] = useState<ReportType>('expense');
  const [period, setPeriod] = useState<ReportPeriod>(() => buildPeriod('selectedYear'));
  const [category, setCategory] = useState('');
  const [yoyFromYear, setYoyFromYear] = useState(DEFAULT_YOY_FROM_YEAR);
  const [yoyToYear, setYoyToYear] = useState(DEFAULT_YOY_TO_YEAR);

  const { transactions } = useTransactions();

  const resetFilters = () => {
    setCategory('');
    setYoyFromYear(DEFAULT_YOY_FROM_YEAR);
    setYoyToYear(DEFAULT_YOY_TO_YEAR);
  };
  const filtersChanged = category !== '' || yoyFromYear !== DEFAULT_YOY_FROM_YEAR || yoyToYear !== DEFAULT_YOY_TO_YEAR;

  const categoryOptions = type === 'income' ? INCOME_CATEGORIES : type === 'expense' ? CATEGORIES : [...CATEGORIES, ...INCOME_CATEGORIES];

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">דוחות</h1>
        {type !== 'insights' && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportExcel(transactions, period, type === 'income' ? 'income' : 'expense')}>
              <Download className="w-4 h-4 ml-1" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportPdf(transactions, period)}>
              <Download className="w-4 h-4 ml-1" /> PDF
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {TYPES.map(({ key, label }) => (
          <button key={key} onClick={() => { setType(key); setCategory(''); setYoyFromYear(DEFAULT_YOY_FROM_YEAR); setYoyToYear(DEFAULT_YOY_TO_YEAR); }}
            className={`py-1.5 rounded-xl text-xs font-semibold transition-all ${type === key ? 'bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 text-white' : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10'}`}>
            {label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <PeriodSelector period={period} onChange={setPeriod} />
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-white/50">קטגוריה</p>
              {filtersChanged && (
                <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300">
                  <RotateCcw className="w-3 h-3" /> אפס סינון
                </button>
              )}
            </div>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-9 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none" dir="rtl">
              <option value="" className="bg-slate-800">כל הקטגוריות</option>
              {categoryOptions.map((c) => <option key={c} value={c} className="bg-slate-800">{c}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      {type === 'expense' && <ExpensesTab transactions={transactions} period={period} category={category} />}
      {type === 'income' && <IncomeTab transactions={transactions} period={period} category={category} />}
      {type === 'balance' && <BalanceTab transactions={transactions} period={period} category={category} />}
      {type === 'insights' && (
        <InsightsTab
          transactions={transactions} period={period} category={category}
          yoyFromYear={yoyFromYear} yoyToYear={yoyToYear} setYoyFromYear={setYoyFromYear} setYoyToYear={setYoyToYear}
        />
      )}
    </div>
  );
}
