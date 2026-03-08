import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, CheckCircle, ArrowRight } from 'lucide-react';
import { base44 } from '@/lib/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/toaster';
import { CATEGORIES, PAYMENT_METHODS, Transaction, Category, Payer, PaymentMethod, ExpenseClass } from '@/types';
import { createPageUrl } from '@/utils';

const PAYERS: { val: Payer; label: string }[] = [
  { val: 'Shi', label: 'שי' },
  { val: 'Ortal', label: 'אורטל' },
  { val: 'Joint', label: 'משותף' },
];

const CLASSES: { val: ExpenseClass; label: string }[] = [
  { val: 'קבועה', label: 'קבועה' },
  { val: 'משתנה', label: 'משתנה' },
];

const today = () => new Date().toISOString().split('T')[0];

function emptyForm() {
  return {
    date: today(),
    type: 'expense' as 'expense' | 'income',
    category: 'שונות' as Category,
    sub_category: '',
    amount: '',
    payer: 'Shi' as Payer,
    payment_method: 'אשראי' as PaymentMethod,
    expense_class: 'משתנה' as ExpenseClass,
    notes: '',
    installments: '1',
    status: 'paid' as Transaction['status'],
  };
}

export default function AddTransaction() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState(emptyForm());
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      const base: Omit<Transaction, 'id'> = {
        date: form.date,
        type: form.type,
        category: form.category,
        sub_category: form.sub_category || undefined,
        amount: parseFloat(form.amount) || 0,
        payer: form.payer,
        payment_method: form.payment_method,
        expense_class: form.expense_class,
        notes: form.notes || undefined,
        installments: parseInt(form.installments) || 1,
        status: form.status,
      };
      const inst = parseInt(form.installments) || 1;
      if (inst > 1) {
        const tasks = Array.from({ length: inst }, (_, i) => {
          const d = new Date(form.date);
          d.setMonth(d.getMonth() + i);
          return base44.entities.Transaction.create({ ...base, date: d.toISOString().split('T')[0], amount: base.amount / inst, notes: `${base.notes || base.category} - תשלום ${i + 1}/${inst}` });
        });
        await Promise.all(tasks);
      } else {
        await base44.entities.Transaction.create(base);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      setSuccess(true);
      setTimeout(() => { setSuccess(false); setForm(emptyForm()); }, 2000);
      toast({ title: 'העסקה נשמרה בהצלחה!', variant: 'success' });
    },
    onError: (e) => toast({ title: 'שגיאה בשמירה', description: String(e), variant: 'destructive' }),
  });

  const handleAiParse = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const res = await base44.integrations.Core.InvokeLLM({ prompt: aiText });
      const tx = res.transactions?.[0];
      if (tx) {
        if (tx.date) set('date', tx.date);
        if (tx.amount) set('amount', String(tx.amount));
        if (tx.category) set('category', tx.category as Category);
        if (tx.notes) set('notes', tx.notes);
        if (tx.payer) set('payer', tx.payer as Payer);
        toast({ title: 'פורסר בהצלחה!', description: 'בדוק את הפרטים ושמור', variant: 'success' });
      } else {
        toast({ title: 'לא נמצאה עסקה בטקסט', variant: 'destructive' });
      }
    } finally {
      setAiLoading(false);
      setAiText('');
    }
  };

  if (success) {
    return (
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.5 }} className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-emerald-400" />
        </motion.div>
        <p className="text-xl font-bold text-white">נשמר בהצלחה!</p>
        <p className="text-sm text-white/50">העסקה נוספה לרשימה</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl hover:bg-white/10 transition-colors">
          <ArrowRight className="w-5 h-5 text-white/60" />
        </button>
        <h1 className="text-lg font-bold text-white">הוסף עסקה</h1>
      </div>

      {/* AI Quick Parse */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-white/80">פענוח מהיר עם AI</span>
          </div>
          <Textarea
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            placeholder="הדבק טקסט כגון: 'סופר רמי לוי 250 ש״ח 15/03' ..."
            rows={2}
            dir="rtl"
          />
          <Button variant="gradient" size="sm" onClick={handleAiParse} disabled={aiLoading || !aiText.trim()} className="w-full">
            {aiLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> מפענח...</> : <><Sparkles className="w-4 h-4" /> פענח טקסט</>}
          </Button>
        </CardContent>
      </Card>

      {/* Form */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          {/* Type */}
          <div>
            <Label className="mb-2 block">סוג</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['expense', 'income'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => set('type', t)}
                  className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    form.type === t
                      ? t === 'expense' ? 'bg-rose-500/30 border border-rose-500/60 text-rose-300' : 'bg-emerald-500/30 border border-emerald-500/60 text-emerald-300'
                      : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10'
                  }`}
                >
                  {t === 'expense' ? '💸 הוצאה' : '💰 הכנסה'}
                </button>
              ))}
            </div>
          </div>

          {/* Date & Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block">תאריך</Label>
              <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block">סכום (₪)</Label>
              <Input type="number" placeholder="0.00" value={form.amount} onChange={(e) => set('amount', e.target.value)} min="0" step="0.01" />
            </div>
          </div>

          {/* Category */}
          <div>
            <Label className="mb-1 block">קטגוריה</Label>
            <select
              value={form.category}
              onChange={(e) => set('category', e.target.value as Category)}
              className="w-full h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              dir="rtl"
            >
              {CATEGORIES.map((c) => <option key={c} value={c} className="bg-slate-800">{c}</option>)}
            </select>
          </div>

          {/* Sub-category & Notes */}
          <div>
            <Label className="mb-1 block">תת-קטגוריה (אופציונלי)</Label>
            <Input placeholder="תיאור ספציפי..." value={form.sub_category} onChange={(e) => set('sub_category', e.target.value)} dir="rtl" />
          </div>

          {/* Payer */}
          <div>
            <Label className="mb-2 block">משלם</Label>
            <div className="flex gap-2">
              {PAYERS.map(({ val, label }) => (
                <button
                  key={val}
                  onClick={() => set('payer', val)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                    form.payer === val ? 'bg-gradient-to-r from-cyan-500/30 to-purple-500/30 border border-cyan-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <Label className="mb-1 block">אמצעי תשלום</Label>
            <select
              value={form.payment_method}
              onChange={(e) => set('payment_method', e.target.value as PaymentMethod)}
              className="w-full h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              dir="rtl"
            >
              {PAYMENT_METHODS.map((m) => <option key={m} value={m} className="bg-slate-800">{m}</option>)}
            </select>
          </div>

          {/* Expense class */}
          {form.type === 'expense' && (
            <div>
              <Label className="mb-2 block">סוג הוצאה</Label>
              <div className="flex gap-2">
                {CLASSES.map(({ val, label }) => (
                  <button
                    key={val}
                    onClick={() => set('expense_class', val)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                      form.expense_class === val ? 'bg-gradient-to-r from-purple-500/30 to-pink-500/30 border border-purple-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Installments */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block">מספר תשלומים</Label>
              <Input type="number" min="1" max="36" value={form.installments} onChange={(e) => set('installments', e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block">סטטוס</Label>
              <select
                value={form.status}
                onChange={(e) => set('status', e.target.value as Transaction['status'])}
                className="w-full h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                dir="rtl"
              >
                <option value="paid" className="bg-slate-800">שולם</option>
                <option value="pending" className="bg-slate-800">ממתין</option>
                <option value="future" className="bg-slate-800">עתידי</option>
              </select>
            </div>
          </div>

          {parseInt(form.installments) > 1 && (
            <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/20 p-3 text-xs text-cyan-300">
              ℹ️ הסכום יחולק ל-{form.installments} תשלומים של {form.amount ? `₪${(parseFloat(form.amount) / parseInt(form.installments)).toFixed(0)}` : '—'} כל אחד
            </div>
          )}

          {/* Notes */}
          <div>
            <Label className="mb-1 block">הערות</Label>
            <Input placeholder="הערה חופשית..." value={form.notes} onChange={(e) => set('notes', e.target.value)} dir="rtl" />
          </div>

          <Button onClick={() => save()} disabled={isPending || !form.amount} className="w-full" size="lg">
            {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> שומר...</> : '💾 שמור עסקה'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
