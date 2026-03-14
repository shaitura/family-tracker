import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Wallet, Plus, Upload, BarChart2, ArrowLeft } from 'lucide-react';
import { base44 } from '@/lib/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate, currentMonthKey, createPageUrl, categoryColor, PAYER_LABELS } from '@/utils';
import { Transaction, Budget } from '@/types';
import { PendingClarificationsCard } from '@/components/PendingClarificationsCard';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }) };

export default function Home() {
  const navigate = useNavigate();
  const monthKey = currentMonthKey();

  const { data: transactions = [] } = useQuery<Transaction[]>({ queryKey: ['transactions'], queryFn: () => base44.entities.Transaction.filter() });
  const { data: budgets = [] } = useQuery<Budget[]>({ queryKey: ['budgets'], queryFn: () => base44.entities.Budget.filter() });

  const monthTx = transactions.filter((t) => t.date.startsWith(monthKey));
  const income = monthTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = monthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const net = income - expenses;

  const budget = budgets.find((b) => b.month === monthKey);
  const budgetPct = budget ? Math.min(Math.round((expenses / budget.total_limit) * 100), 100) : 0;
  const overBudget = budget && expenses > budget.total_limit;
  const nearBudget = budget && budgetPct >= (budget.alert_threshold ?? 80);

  const recent = [...transactions]
    .sort((a, b) => {
      // Sort by created_at (when reported to app) if available, then by date
      const ta = a.created_at ?? 0;
      const tb = b.created_at ?? 0;
      if (tb !== ta) return tb - ta;
      return b.date.localeCompare(a.date);
    })
    .slice(0, 8);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Balance card */}
      <motion.div custom={0} initial="hidden" animate="visible" variants={fadeUp}>
        <Card className="overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/15 via-purple-500/10 to-pink-500/15 pointer-events-none" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-white/60 font-medium">יתרה חודשית</CardTitle>
              <Badge variant={net >= 0 ? 'success' : 'destructive'}>{net >= 0 ? 'חיובי' : 'גירעון'}</Badge>
            </div>
            <p className={`text-4xl font-black mt-1 ${net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {net >= 0 ? '+' : ''}{formatCurrency(net)}
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-white/50">הכנסות</span>
                </div>
                <p className="text-lg font-bold text-emerald-400">{formatCurrency(income)}</p>
              </div>
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingDown className="w-4 h-4 text-rose-400" />
                  <span className="text-xs text-white/50">הוצאות</span>
                </div>
                <p className="text-lg font-bold text-rose-400">{formatCurrency(expenses)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Budget card */}
      {budget ? (
        <motion.div custom={1} initial="hidden" animate="visible" variants={fadeUp}>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-cyan-400" />
                  <CardTitle className="text-sm">תקציב חודשי</CardTitle>
                </div>
                <span className={`text-sm font-bold ${overBudget ? 'text-rose-400' : nearBudget ? 'text-amber-400' : 'text-cyan-400'}`}>
                  {budgetPct}%
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <Progress
                value={budgetPct}
                indicatorClassName={overBudget ? 'bg-gradient-to-r from-rose-500 to-red-500' : nearBudget ? 'bg-gradient-to-r from-amber-500 to-orange-500' : undefined}
              />
              <div className="flex justify-between text-xs text-white/50">
                <span>נוצל: {formatCurrency(expenses)}</span>
                <span>תקציב: {formatCurrency(budget.total_limit)}</span>
              </div>
              {nearBudget && !overBudget && (
                <p className="text-xs text-amber-400 text-center">⚠️ מתקרב לגבול התקציב</p>
              )}
              {overBudget && (
                <p className="text-xs text-rose-400 text-center">🚨 חריגה מהתקציב!</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <motion.div custom={1} initial="hidden" animate="visible" variants={fadeUp}>
          <Card className="border-dashed border-white/20">
            <CardContent className="py-4 text-center">
              <p className="text-sm text-white/50 mb-2">לא הוגדר תקציב לחודש זה</p>
              <Button size="sm" variant="outline" onClick={() => navigate(createPageUrl('Settings'))}>
                הגדר תקציב
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Quick actions */}
      <motion.div custom={2} initial="hidden" animate="visible" variants={fadeUp}>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'הוסף עסקה', icon: Plus, action: () => navigate(createPageUrl('AddTransaction')), from: 'from-cyan-500', to: 'to-purple-500' },
            { label: 'ייבוא', icon: Upload, action: () => navigate(createPageUrl('Import')), from: 'from-purple-500', to: 'to-pink-500' },
            { label: 'דוחות', icon: BarChart2, action: () => navigate(createPageUrl('Reports')), from: 'from-pink-500', to: 'to-rose-500' },
          ].map(({ label, icon: Icon, action, from, to }) => (
            <button
              key={label}
              onClick={action}
              className={`rounded-2xl bg-gradient-to-br ${from} ${to} p-3 flex flex-col items-center gap-1.5 shadow-lg hover:scale-105 active:scale-95 transition-transform duration-150`}
            >
              <Icon className="w-5 h-5 text-white" />
              <span className="text-xs font-medium text-white">{label}</span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Pending clarifications */}
      <motion.div custom={3} initial="hidden" animate="visible" variants={fadeUp}>
        <PendingClarificationsCard />
      </motion.div>

      {/* Recent transactions */}
      <motion.div custom={4} initial="hidden" animate="visible" variants={fadeUp}>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">עסקאות אחרונות</CardTitle>
              <button onClick={() => navigate(createPageUrl('Transactions'))} className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
                כל העסקאות <ArrowLeft className="w-3 h-3" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-1 pt-0">
            {recent.length === 0 && (
              <p className="text-center text-sm text-white/40 py-4">אין עסקאות</p>
            )}
            {recent.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-white/5 transition-colors">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: categoryColor(tx.category) + '25', border: `1px solid ${categoryColor(tx.category)}40` }}>
                  <span className="text-base">{getCategoryEmoji(tx.category)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{tx.sub_category || tx.notes || tx.category}</p>
                  <p className="text-xs text-white/40">{formatDate(tx.date)} · {PAYER_LABELS[tx.payer]}</p>
                </div>
                <span className={`text-sm font-bold shrink-0 ${tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function getCategoryEmoji(cat: string): string {
  const map: Record<string, string> = {
    'מצרכים': '🛒', 'אוכל בחוץ': '🍽️', דיור: '🏠', רכב: '🚗', דלק: '⛽',
    ילדים: '👶', ביגוד: '👗', בריאות: '💊', ספורט: '⚽', לימודים: '📚', פנאי: '🎭', ביטוחים: '🛡️',
    תקשורת: '📱', 'מתנות/אירועים': '🎁', שונות: '💼',
  };
  return map[cat] ?? '💰';
}
