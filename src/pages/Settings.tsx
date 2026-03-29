import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Bell, Wallet, LogOut, ChevronLeft } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { base44 } from '@/lib/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/toaster';
import { Budget, CATEGORIES } from '@/types';
import { currentMonthKey, formatCurrency, formatMonth } from '@/utils';

export default function Settings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const monthKey = currentMonthKey();

  const { data: budgets = [] } = useQuery<Budget[]>({ queryKey: ['budgets'], queryFn: () => base44.entities.Budget.filter() });
  const budget = budgets.find((b) => b.month === monthKey);

  const [totalLimit, setTotalLimit] = useState(String(budget?.total_limit ?? '20000'));
  const [alertThreshold, setAlertThreshold] = useState(String(budget?.alert_threshold ?? '80'));
  const [catLimits, setCatLimits] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(budget?.category_limits ?? {}).map(([k, v]) => [k, String(v)]))
  );
  const [notifyBudget, setNotifyBudget] = useState(true);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetText, setResetText] = useState('');
  const [notifyLarge, setNotifyLarge] = useState(true);
  const [notifyMonthly, setNotifyMonthly] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'settings', 'notifications')).then((snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.notifyBudget !== undefined) setNotifyBudget(d.notifyBudget);
        if (d.notifyLarge !== undefined) setNotifyLarge(d.notifyLarge);
        if (d.notifyMonthly !== undefined) setNotifyMonthly(d.notifyMonthly);
      }
    }).catch(() => {});
  }, []);

  const saveNotifSetting = (key: string, value: boolean) => {
    setDoc(doc(db, 'settings', 'notifications'), { [key]: value }, { merge: true }).catch(() => {});
  };

  const { mutate: saveBudget, isPending } = useMutation({
    mutationFn: async () => {
      const data: Omit<Budget, 'id'> = {
        month: monthKey,
        total_limit: parseFloat(totalLimit) || 20000,
        category_limits: Object.fromEntries(Object.entries(catLimits).filter(([, v]) => v).map(([k, v]) => [k, parseFloat(v)])),
        alert_threshold: parseFloat(alertThreshold) || 80,
      };
      if (budget) await base44.entities.Budget.update(budget.id, data);
      else await base44.entities.Budget.create(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] });
      toast({ title: 'הגדרות תקציב נשמרו!', variant: 'success' });
    },
  });

  const Section = ({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) => (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-cyan-400" />
          <CardTitle className="text-sm">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <h1 className="text-lg font-bold text-white">הגדרות</h1>

      {/* Profile */}
      <Section icon={User} title="פרופיל משפחתי">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-xl font-bold text-white">
            S
          </div>
          <div>
            <p className="font-semibold text-white">משפחת שי ואורטל</p>
            <p className="text-xs text-white/50">family@tracker.app</p>
          </div>
          <Badge variant="success" className="mr-auto">פעיל</Badge>
        </div>
        <div className="grid grid-cols-3 gap-2 pt-1">
          {[{ name: 'שי', color: '#22d3ee' }, { name: 'אורטל', color: '#ec4899' }, { name: 'משותף', color: '#a855f7' }].map(({ name, color }) => (
            <div key={name} className="rounded-xl border border-white/10 p-2 text-center" style={{ backgroundColor: color + '10', borderColor: color + '30' }}>
              <p className="text-sm font-medium" style={{ color }}>{name}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Budget */}
      <Section icon={Wallet} title={`תקציב חודשי — ${formatMonth(monthKey)}`}>
        <div>
          <Label className="mb-1 block">תקציב כולל (₪)</Label>
          <Input type="number" value={totalLimit} onChange={(e) => setTotalLimit(e.target.value)} placeholder="20000" />
        </div>
        <div>
          <Label className="mb-1 block">סף התראה (%)</Label>
          <Input type="number" value={alertThreshold} onChange={(e) => setAlertThreshold(e.target.value)} min="50" max="100" />
          <p className="text-xs text-white/40 mt-1">התראה כשמגיעים ל-{alertThreshold}% מהתקציב</p>
        </div>

        <div>
          <Label className="mb-2 block">תקציב לפי קטגוריה (₪)</Label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {CATEGORIES.slice(0, 8).map((cat) => (
              <div key={cat} className="flex items-center gap-2">
                <span className="text-sm text-white/60 w-16 shrink-0">{cat}</span>
                <Input
                  type="number"
                  value={catLimits[cat] ?? ''}
                  onChange={(e) => setCatLimits((prev) => ({ ...prev, [cat]: e.target.value }))}
                  placeholder="—"
                  className="h-8 text-sm"
                />
              </div>
            ))}
          </div>
        </div>

        <Button onClick={() => saveBudget()} disabled={isPending} className="w-full">
          {isPending ? 'שומר...' : '💾 שמור תקציב'}
        </Button>
      </Section>

      {/* Notifications */}
      <Section icon={Bell} title="התראות">
        {[
          { label: 'התראת חריגת תקציב', desc: 'קבל התראה כשמתקרבים לתקציב', state: notifyBudget, set: setNotifyBudget, fsKey: 'notifyBudget' },
          { label: 'הוצאות גדולות', desc: 'התראה על הוצאות מעל ₪500', state: notifyLarge, set: setNotifyLarge, fsKey: 'notifyLarge' },
          { label: 'סיכום חודשי', desc: 'שליחת דו"ח PDF במייל ב-1 לחודש', state: notifyMonthly, set: setNotifyMonthly, fsKey: 'notifyMonthly' },
        ].map(({ label, desc, state, set, fsKey }) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{label}</p>
              <p className="text-xs text-white/40">{desc}</p>
            </div>
            <Switch checked={state} onCheckedChange={(v) => { set(v); saveNotifSetting(fsKey, v); }} />
          </div>
        ))}
      </Section>

      {/* Data */}
      <Card>
        <CardContent className="pt-4 space-y-2">
          {resetConfirm ? (
            <div className="space-y-2 p-3 rounded-xl border border-rose-500/30 bg-rose-500/10">
              <p className="text-rose-400 text-sm text-center">כדי לאשר, הקלד: <strong>אפס הכל</strong></p>
              <input
                type="text"
                value={resetText}
                onChange={(e) => setResetText(e.target.value)}
                placeholder='הקלד "אפס הכל" לאישור'
                className="w-full border border-rose-500/30 rounded-lg px-3 py-2 text-right text-sm bg-transparent text-white"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setResetConfirm(false); setResetText(''); }}
                  className="flex-1 py-2 rounded-lg border border-white/20 text-white/70 text-sm"
                >ביטול</button>
                <button
                  disabled={resetText !== 'אפס הכל'}
                  onClick={async () => {
                    try {
                      await Promise.all([
                        base44.entities.Transaction.deleteAll(),
                        base44.entities.Budget.deleteAll(),
                        base44.entities.Asset.deleteAll(),
                      ]);
                    } catch(e) { /* ignore */ }
                    ['ft_transaction', 'ft_budget', 'ft_asset', 'ft_initialized'].forEach((k) => localStorage.removeItem(k));
                    window.location.reload();
                  }}
                  className="flex-1 py-2 rounded-lg bg-rose-600 text-white text-sm disabled:opacity-40"
                >אפס</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setResetConfirm(true)}
              className="w-full py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-sm font-medium hover:bg-rose-500/20 transition-colors flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" /> אפס כל הנתונים
            </button>
          )}
          <p className="text-center text-xs text-white/30">Family Tracker v1.0 · נתונים נשמרים בענן</p>
        </CardContent>
      </Card>
    </div>
  );
}
