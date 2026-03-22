import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Trash2, Filter, X, Edit3, CheckCircle, Pencil, Save, PlusCircle, List, Sparkles, Loader2, Brain } from 'lucide-react';
import { base44, buildMerchantMap } from '@/lib/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toaster';
import { Transaction, CATEGORIES, INCOME_CATEGORIES, PAYMENT_METHODS, Category, IncomeCategory, Payer, PaymentMethod, ExpenseClass } from '@/types';
import { formatCurrency, formatDate, formatMonth, categoryColor, PAYER_LABELS } from '@/utils';
import { auth } from '@/lib/firebase';

// ── AddTransaction helpers ────────────────────────────────────────────────
const PAYERS: { val: Payer; label: string }[] = [
  { val: 'Shi', label: 'שי' },
  { val: 'Ortal', label: 'אורטל' },
  { val: 'Joint', label: 'משותף' },
];

const CLASSES: { val: ExpenseClass; label: string }[] = [
  { val: 'קבועה', label: 'קבועה' },
  { val: 'משתנה', label: 'משתנה' },
];

const MONTH_LABELS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

const today = () => new Date().toISOString().split('T')[0];

function defaultPayer(): Payer {
  const email = auth.currentUser?.email ?? '';
  if (email === 'ortalas@gmail.com') return 'Ortal';
  if (email === 'shaitura@gmail.com') return 'Shi';
  return 'Shi';
}

function emptyForm() {
  return {
    date: today(),
    type: 'expense' as 'expense' | 'income',
    category: 'שונות' as Category | IncomeCategory,
    sub_category: '',
    amount: '',
    payer: defaultPayer(),
    payment_method: 'אשראי' as PaymentMethod,
    expense_class: 'משתנה' as ExpenseClass,
    notes: '',
    installments: '1',
    status: 'paid' as Transaction['status'],
  };
}

// ── Transactions list helpers ─────────────────────────────────────────────
const EMOJI: Record<string, string> = {
  'מצרכים': '🛒', 'אוכל בחוץ': '🍽️', דיור: '🏠', רכב: '🚗', דלק: '⛽',
  ילדים: '👶', ביגוד: '👗', בריאות: '💊', ספורט: '⚽', לימודים: '📚', פנאי: '🎭', ביטוחים: '🛡️',
  תקשורת: '📱', חשבונות: '🧾', 'מתנות/אירועים': '🎁', שונות: '💼',
};

const PAYER_OPTIONS = [
  { v: '', l: 'הכל' }, { v: 'Shi', l: 'שי' }, { v: 'Ortal', l: 'אורטל' }, { v: 'Joint', l: 'משותף' },
];

const STATUS_OPTIONS = [
  { v: '', l: 'הכל' }, { v: 'paid', l: 'שולם' }, { v: 'pending', l: 'ממתין' }, { v: 'future', l: 'עתידי' },
];

const BULK_FIELDS = [
  { v: 'category', l: 'קטגוריה' },
  { v: 'payer', l: 'משלם' },
  { v: 'expense_class', l: 'סוג הוצאה' },
  { v: 'payment_method', l: 'שיטת תשלום' },
  { v: 'status', l: 'סטטוס' },
];

const MONTH_NAMES = ['ינו','פבר','מרץ','אפר','מאי','יוני','יולי','אוג','ספט','אוק','נוב','דצמ'];

function matchesSearch(t: Transaction, q: string): boolean {
  const s = q.toLowerCase();
  return [
    t.sub_category ?? '',
    t.category,
    t.notes ?? '',
    t.payer,
    t.payment_method,
    t.expense_class ?? '',
    t.status,
    String(t.amount),
    t.date,
    PAYER_LABELS[t.payer] ?? '',
  ].some((v) => v.toLowerCase().includes(s));
}

export default function Transactions() {
  const qc = useQueryClient();
  const { toast } = useToast();

  // ── Tab state ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');

  // ── Add-transaction state ─────────────────────────────────────────────────
  const [form, setForm] = useState(emptyForm());
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleMonth = (m: number) =>
    setSelectedMonths((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);

  // merchantMap is computed after transactions query below

  const { mutate: save, isPending: savePending } = useMutation({
    mutationFn: async () => {
      const year = new Date(form.date).getFullYear();
      const base: Omit<Transaction, 'id'> = {
        date: form.date,
        type: form.type,
        category: form.category as Category,
        sub_category: form.sub_category || undefined,
        amount: parseFloat(form.amount) || 0,
        payer: form.payer,
        payment_method: form.payment_method,
        expense_class: form.expense_class,
        notes: form.notes || undefined,
        installments: parseInt(form.installments) || 1,
        status: form.status,
      };
      if (form.expense_class === 'קבועה' && selectedMonths.length > 0) {
        await Promise.all(selectedMonths.map((m) => {
          const mm = String(m).padStart(2, '0');
          return base44.entities.Transaction.create({ ...base, date: `${year}-${mm}-01` });
        }));
        return;
      }
      const inst = parseInt(form.installments) || 1;
      if (inst > 1) {
        await Promise.all(Array.from({ length: inst }, (_, i) => {
          const d = new Date(form.date);
          d.setMonth(d.getMonth() + i);
          return base44.entities.Transaction.create({ ...base, date: d.toISOString().split('T')[0], amount: base.amount / inst, notes: `${base.notes || base.category} - תשלום ${i + 1}/${inst}` });
        }));
      } else {
        await base44.entities.Transaction.create(base);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      setAddSuccess(true);
      setSelectedMonths([]);
      setTimeout(() => { setAddSuccess(false); setForm(emptyForm()); setActiveTab('list'); }, 1500);
      toast({ title: 'העסקה נשמרה בהצלחה!', variant: 'success' });
    },
    onError: (e) => toast({ title: 'שגיאה בשמירה', description: String(e), variant: 'destructive' }),
  });

  const handleAiParse = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: aiText,
        merchantMap: Object.keys(merchantMap).length > 0 ? merchantMap : undefined,
      });
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

  // ── List state ────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterPayer, setFilterPayer] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState('');
  const [filterExpenseClass, setFilterExpenseClass] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Transaction>>({});
  const [applyToAll, setApplyToAll] = useState(false);
  const setE = <K extends keyof Transaction>(k: K, v: Transaction[K]) => setEditForm((f) => ({ ...f, [k]: v }));

  const { mutate: update, isPending: updatePending } = useMutation({
    mutationFn: async ({ id, data, allMonths }: { id: string; data: Partial<Transaction>; allMonths: boolean }) => {
      if (allMonths && data.expense_class === 'קבועה') {
        const origTx = transactions.find((t) => t.id === id);
        const year = (origTx?.date ?? data.date ?? '').slice(0, 4);
        const siblings = transactions.filter((t) =>
          t.expense_class === 'קבועה' &&
          t.category === origTx?.category &&
          t.payer === origTx?.payer &&
          (t.sub_category ?? '') === (origTx?.sub_category ?? '') &&
          t.date.startsWith(year)
        );
        const updateData = { ...data };
        delete (updateData as Partial<Transaction> & { date?: string }).date;
        await Promise.all(siblings.map((t) => base44.entities.Transaction.update(t.id, updateData)));
      } else {
        await base44.entities.Transaction.update(id, data);
      }
    },
    onSuccess: (_, { allMonths }) => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      setEditingId(null);
      setApplyToAll(false);
      toast({ title: allMonths ? 'כל ההעתקים עודכנו' : 'עסקה עודכנה', variant: 'success' });
    },
    onError: (e) => toast({ title: 'שגיאה בעדכון', description: String(e), variant: 'destructive' }),
  });

  function startEdit(tx: Transaction) {
    setEditingId(tx.id);
    setEditForm({ ...tx });
    setApplyToAll(false);
  }

  // bulk edit
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkField, setBulkField] = useState('category');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  const { data: transactions = [] } = useQuery<Transaction[]>({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.filter(),
  });

  const merchantMap = useMemo(() => buildMerchantMap(transactions), [transactions]);

  const { mutate: del } = useMutation({
    mutationFn: (id: string) => base44.entities.Transaction.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transactions'] }); toast({ title: 'עסקה נמחקה', variant: 'default' }); },
  });

  const availableYears = useMemo(() => {
    const years = new Set(transactions.map((t) => t.date.slice(0, 4)));
    return Array.from(years).sort().reverse();
  }, [transactions]);

  const filtered = useMemo(() =>
    transactions
      .filter((t) => {
        if (filterCat && t.category !== filterCat) return false;
        if (filterPayer && t.payer !== filterPayer) return false;
        if (filterType && t.type !== filterType) return false;
        if (filterPaymentMethod && t.payment_method !== filterPaymentMethod) return false;
        if (filterExpenseClass && t.expense_class !== filterExpenseClass) return false;
        if (filterStatus && t.status !== filterStatus) return false;
        if (!search) {
          if (filterYear && !t.date.startsWith(filterYear)) return false;
          if (filterMonth && t.date.slice(8, 10) !== filterMonth) return false;
        }
        if (search && !matchesSearch(t, search)) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions, filterCat, filterPayer, filterType, filterPaymentMethod, filterExpenseClass, filterStatus, filterYear, filterMonth, search]
  );

  // Extract YYYY-MM from a date string regardless of format
  function monthKey(dateStr: string): string {
    if (dateStr.length < 7) return dateStr;
    const mid = dateStr.slice(5, 7);
    const num = parseInt(mid, 10);
    if (num >= 1 && num <= 12) {
      // Middle segment is a valid month → YYYY-MM-DD format
      return dateStr.slice(0, 7);
    }
    // Middle segment is a day (> 12) → YYYY-DD-MM format
    return dateStr.slice(0, 4) + '-' + dateStr.slice(8, 10);
  }

  // Group by month (YYYY-MM)
  const groupedByMonth = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const key = monthKey(t.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    // Sort groups by YYYY-MM descending (newest first)
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const activeFilters = [filterCat, filterPayer, filterType, filterPaymentMethod, filterExpenseClass, filterStatus, filterYear, filterMonth].filter(Boolean).length;

  function clearFilters() {
    setFilterCat(''); setFilterPayer(''); setFilterType('');
    setFilterPaymentMethod(''); setFilterExpenseClass(''); setFilterStatus('');
    setFilterYear(''); setFilterMonth('');
  }

  // Active filter chips data
  const activeFilterChips = useMemo(() => {
    const chips: { label: string; clear: () => void }[] = [];
    if (filterCat) chips.push({ label: filterCat, clear: () => setFilterCat('') });
    if (filterPayer) chips.push({ label: PAYER_LABELS[filterPayer] ?? filterPayer, clear: () => setFilterPayer('') });
    if (filterType) chips.push({ label: filterType === 'expense' ? '💸 הוצאות' : '💰 הכנסות', clear: () => setFilterType('') });
    if (filterPaymentMethod) chips.push({ label: filterPaymentMethod, clear: () => setFilterPaymentMethod('') });
    if (filterExpenseClass) chips.push({ label: filterExpenseClass, clear: () => setFilterExpenseClass('') });
    if (filterStatus) {
      const statusLabel = STATUS_OPTIONS.find((o) => o.v === filterStatus)?.l ?? filterStatus;
      chips.push({ label: statusLabel, clear: () => setFilterStatus('') });
    }
    if (filterYear) chips.push({ label: filterYear, clear: () => setFilterYear('') });
    if (filterMonth) {
      const monthLabel = MONTH_NAMES[parseInt(filterMonth) - 1] ?? filterMonth;
      chips.push({ label: monthLabel, clear: () => setFilterMonth('') });
    }
    return chips;
  }, [filterCat, filterPayer, filterType, filterPaymentMethod, filterExpenseClass, filterStatus, filterYear, filterMonth]);

  async function applyBulkEdit() {
    if (!bulkValue) return;
    setBulkLoading(true);
    try {
      await Promise.all(filtered.map((t) => base44.entities.Transaction.update(t.id, { [bulkField]: bulkValue } as Partial<Transaction>)));
      qc.invalidateQueries({ queryKey: ['transactions'] });
      toast({ title: `עודכנו ${filtered.length} עסקאות`, variant: 'default' });
      setShowBulkEdit(false);
      setBulkValue('');
    } catch {
      toast({ title: 'שגיאה בעדכון', variant: 'destructive' });
    }
    setBulkLoading(false);
  }

  function BulkValueSelector() {
    if (bulkField === 'category') {
      return (
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setBulkValue(c)}
              className={`px-2 py-1 rounded-full text-xs transition-all ${bulkValue === c ? 'border text-white' : 'bg-white/5 border border-white/10 text-white/50'}`}
              style={bulkValue === c ? { backgroundColor: categoryColor(c) + '30', borderColor: categoryColor(c) + '60', color: categoryColor(c) } : {}}>
              {c}
            </button>
          ))}
        </div>
      );
    }
    if (bulkField === 'payer') {
      return (
        <div className="flex gap-1.5">
          {[{ v: 'Shi', l: 'שי' }, { v: 'Ortal', l: 'אורטל' }, { v: 'Joint', l: 'משותף' }].map(({ v, l }) => (
            <button key={v} onClick={() => setBulkValue(v)}
              className={`flex-1 py-1.5 rounded-xl text-xs transition-all ${bulkValue === v ? 'bg-purple-500/30 border border-purple-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50'}`}>
              {l}
            </button>
          ))}
        </div>
      );
    }
    if (bulkField === 'expense_class') {
      return (
        <div className="flex gap-1.5">
          {[{ v: 'קבועה', l: 'קבועה' }, { v: 'משתנה', l: 'משתנה' }].map(({ v, l }) => (
            <button key={v} onClick={() => setBulkValue(v)}
              className={`flex-1 py-1.5 rounded-xl text-xs transition-all ${bulkValue === v ? 'bg-cyan-500/30 border border-cyan-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50'}`}>
              {l}
            </button>
          ))}
        </div>
      );
    }
    if (bulkField === 'payment_method') {
      return (
        <div className="flex flex-wrap gap-1.5">
          {PAYMENT_METHODS.map((m) => (
            <button key={m} onClick={() => setBulkValue(m)}
              className={`px-2.5 py-1 rounded-full text-xs transition-all ${bulkValue === m ? 'bg-cyan-500/30 border border-cyan-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50'}`}>
              {m}
            </button>
          ))}
        </div>
      );
    }
    if (bulkField === 'status') {
      return (
        <div className="flex gap-1.5">
          {[{ v: 'paid', l: 'שולם' }, { v: 'pending', l: 'ממתין' }, { v: 'future', l: 'עתידי' }].map(({ v, l }) => (
            <button key={v} onClick={() => setBulkValue(v)}
              className={`flex-1 py-1.5 rounded-xl text-xs transition-all ${bulkValue === v ? 'bg-cyan-500/30 border border-cyan-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50'}`}>
              {l}
            </button>
          ))}
        </div>
      );
    }
    return null;
  }

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">

      {/* ── Tabs ── */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('list')}
          className={`flex items-center gap-2 flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'list'
              ? 'bg-white/10 border border-white/20 text-white'
              : 'bg-white/5 border border-white/10 text-white/40 hover:text-white/70'
          }`}
        >
          <List className="w-4 h-4 mx-auto" />
          <span>כל העסקאות</span>
        </button>
        <button
          onClick={() => setActiveTab('add')}
          className={`flex items-center gap-2 flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'add'
              ? 'bg-gradient-to-r from-cyan-500/30 to-purple-500/30 border border-cyan-500/50 text-white'
              : 'bg-white/5 border border-white/10 text-white/40 hover:text-white/70'
          }`}
        >
          <PlusCircle className="w-4 h-4 mx-auto" />
          <span>הוסף עסקה</span>
        </button>
      </div>

      {/* ── Add Transaction Panel ── */}
      <AnimatePresence mode="wait">
        {activeTab === 'add' && (
          <motion.div key="add-panel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">

            {addSuccess ? (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center">
                  <CheckCircle className="w-10 h-10 text-emerald-400" />
                </div>
                <p className="text-xl font-bold text-white">נשמר בהצלחה!</p>
              </motion.div>
            ) : (
              <>
                {/* AI Quick Parse */}
                <Card>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        <span className="text-sm font-medium text-white/80">פענוח מהיר עם AI</span>
                      </div>
                      {transactions.length > 0 && (
                        <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                          <Brain className="w-3 h-3 text-emerald-400" />
                          <span className="text-[10px] text-emerald-400 font-medium">מאומן על {transactions.length.toLocaleString()} עסקאות</span>
                        </div>
                      )}
                    </div>
                    <Textarea value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="הדבק טקסט כגון: 'סופר רמי לוי 250 ש״ח 15/03' ..." rows={2} dir="rtl" />
                    <Button variant="gradient" size="sm" onClick={handleAiParse} disabled={aiLoading || !aiText.trim()} className="w-full">
                      {aiLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> מפענח...</> : <><Sparkles className="w-4 h-4" /> פענח טקסט</>}
                    </Button>
                  </CardContent>
                </Card>

                {/* Add Form */}
                <Card>
                  <CardContent className="pt-4 space-y-4">
                    {/* Type */}
                    <div>
                      <Label className="mb-2 block">סוג</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['expense', 'income'] as const).map((t) => (
                          <button key={t} onClick={() => { set('type', t); set('category', t === 'income' ? INCOME_CATEGORIES[0] : 'שונות'); }}
                            className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${form.type === t ? t === 'expense' ? 'bg-rose-500/30 border border-rose-500/60 text-rose-300' : 'bg-emerald-500/30 border border-emerald-500/60 text-emerald-300' : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10'}`}>
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
                      <select value={form.category} onChange={(e) => set('category', e.target.value as Category | IncomeCategory)}
                        className="w-full h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50" dir="rtl">
                        {(form.type === 'income' ? INCOME_CATEGORIES : CATEGORIES).map((c) => (
                          <option key={c} value={c} className="bg-slate-800">{c}</option>
                        ))}
                      </select>
                    </div>

                    {/* Sub-category */}
                    <div>
                      <Label className="mb-1 block">תת-קטגוריה (אופציונלי)</Label>
                      <Input placeholder="תיאור ספציפי..." value={form.sub_category} onChange={(e) => set('sub_category', e.target.value)} dir="rtl" />
                    </div>

                    {/* Payer */}
                    <div>
                      <Label className="mb-2 block">משלם</Label>
                      <div className="flex gap-2">
                        {PAYERS.map(({ val, label }) => (
                          <button key={val} onClick={() => set('payer', val)}
                            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${form.payer === val ? 'bg-gradient-to-r from-cyan-500/30 to-purple-500/30 border border-cyan-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Payment Method */}
                    <div>
                      <Label className="mb-1 block">אמצעי תשלום</Label>
                      <select value={form.payment_method} onChange={(e) => set('payment_method', e.target.value as PaymentMethod)}
                        className="w-full h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50" dir="rtl">
                        {PAYMENT_METHODS.map((m) => <option key={m} value={m} className="bg-slate-800">{m}</option>)}
                      </select>
                    </div>

                    {/* Expense class */}
                    <div>
                      <Label className="mb-2 block">{form.type === 'income' ? 'סוג הכנסה' : 'סוג הוצאה'}</Label>
                      <div className="flex gap-2">
                        {CLASSES.map(({ val, label }) => (
                          <button key={val} onClick={() => { set('expense_class', val); if (val !== 'קבועה') setSelectedMonths([]); }}
                            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${form.expense_class === val ? 'bg-gradient-to-r from-purple-500/30 to-pink-500/30 border border-purple-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <AnimatePresence>
                        {form.expense_class === 'קבועה' && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <div className="mt-3 rounded-xl bg-purple-500/10 border border-purple-500/20 p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-purple-300 font-medium">{form.type === 'income' ? 'באילו חודשים ההכנסה חוזרת?' : 'באילו חודשים ההוצאה חוזרת?'}</span>
                                <div className="flex gap-2">
                                  <button onClick={() => setSelectedMonths(Array.from({ length: 12 }, (_, i) => i + 1))} className="text-[10px] text-purple-400 hover:text-purple-300 underline">הכל</button>
                                  <button onClick={() => setSelectedMonths([])} className="text-[10px] text-white/40 hover:text-white/60 underline">נקה</button>
                                </div>
                              </div>
                              <div className="grid grid-cols-4 gap-1.5">
                                {MONTH_LABELS.map((name, i) => {
                                  const m = i + 1;
                                  const active = selectedMonths.includes(m);
                                  return (
                                    <button key={m} onClick={() => toggleMonth(m)}
                                      className={`py-1.5 rounded-lg text-xs font-medium transition-all ${active ? 'bg-purple-500/50 border border-purple-400/60 text-white' : 'bg-white/5 border border-white/10 text-white/40 hover:bg-white/10 hover:text-white/70'}`}>
                                      {name}
                                    </button>
                                  );
                                })}
                              </div>
                              {selectedMonths.length > 0 && (
                                <p className="mt-2 text-[10px] text-purple-300/70 text-center">
                                  {form.type === 'income' ? 'ההכנסה' : 'ההוצאה'} תתווסף ל-{selectedMonths.length} חודשים בשנת {new Date(form.date).getFullYear()}
                                </p>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Installments & Status */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="mb-1 block">מספר תשלומים</Label>
                        <Input type="number" min="1" max="36" value={form.installments} onChange={(e) => set('installments', e.target.value)} />
                      </div>
                      <div>
                        <Label className="mb-1 block">סטטוס</Label>
                        <select value={form.status} onChange={(e) => set('status', e.target.value as Transaction['status'])}
                          className="w-full h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50" dir="rtl">
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

                    <Button onClick={() => save()} disabled={savePending || !form.amount} className="w-full" size="lg">
                      {savePending ? <><Loader2 className="w-4 h-4 animate-spin" /> שומר...</> : '💾 שמור עסקה'}
                    </Button>
                  </CardContent>
                </Card>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── List Panel ── */}
      <AnimatePresence>
        {activeTab === 'list' && (
          <motion.div key="list-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

      {/* Search + filter toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <Input placeholder="חיפוש בכל השדות..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" dir="rtl" />
        </div>
        <Button variant="outline" size="icon" onClick={() => setShowFilters(!showFilters)} className="relative shrink-0">
          <Filter className="w-4 h-4" />
          {activeFilters > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-cyan-500 text-white text-[9px] flex items-center justify-center font-bold">
              {activeFilters}
            </span>
          )}
        </Button>
      </div>

      {/* Active filter chips */}
      {activeFilterChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          {activeFilterChips.map((chip) => (
            <button
              key={chip.label}
              onClick={chip.clear}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-rose-500/20 hover:border-rose-500/40 hover:text-rose-300 transition-all"
            >
              {chip.label}
              <X className="w-3 h-3" />
            </button>
          ))}
          {activeFilterChips.length > 1 && (
            <button onClick={clearFilters} className="text-xs text-white/30 hover:text-rose-400 transition-colors px-1">
              נקה הכל
            </button>
          )}
        </div>
      )}

      {/* Filters panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <Card>
              <CardContent className="pt-4 space-y-4">

                {/* קטגוריה */}
                <div>
                  <p className="text-xs text-white/50 mb-2">קטגוריה</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => setFilterCat('')} className={`px-2.5 py-1 rounded-full text-xs transition-all ${!filterCat ? 'bg-cyan-500/30 border border-cyan-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50'}`}>הכל</button>
                    {CATEGORIES.map((c) => (
                      <button key={c} onClick={() => setFilterCat(filterCat === c ? '' : c)}
                        className={`px-2.5 py-1 rounded-full text-xs transition-all ${filterCat === c ? 'border text-white' : 'bg-white/5 border border-white/10 text-white/50'}`}
                        style={filterCat === c ? { backgroundColor: categoryColor(c) + '30', borderColor: categoryColor(c) + '60', color: categoryColor(c) } : {}}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* משלם */}
                <div>
                  <p className="text-xs text-white/50 mb-2">משלם</p>
                  <div className="flex gap-1.5">
                    {PAYER_OPTIONS.map(({ v, l }) => (
                      <button key={v || 'all'} onClick={() => setFilterPayer(v)}
                        className={`flex-1 py-1.5 rounded-xl text-xs transition-all ${filterPayer === v ? 'bg-purple-500/30 border border-purple-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* סוג עסקה */}
                <div>
                  <p className="text-xs text-white/50 mb-2">סוג עסקה</p>
                  <div className="flex gap-1.5">
                    {[{ v: '', l: 'הכל' }, { v: 'expense', l: '💸 הוצאות' }, { v: 'income', l: '💰 הכנסות' }].map(({ v, l }) => (
                      <button key={v || 'all'} onClick={() => setFilterType(v)}
                        className={`flex-1 py-1.5 rounded-xl text-xs transition-all ${filterType === v ? 'bg-cyan-500/30 border border-cyan-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* שיטת תשלום */}
                <div>
                  <p className="text-xs text-white/50 mb-2">שיטת תשלום</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => setFilterPaymentMethod('')}
                      className={`px-2.5 py-1 rounded-full text-xs transition-all ${!filterPaymentMethod ? 'bg-cyan-500/30 border border-cyan-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50'}`}>הכל</button>
                    {PAYMENT_METHODS.map((m) => (
                      <button key={m} onClick={() => setFilterPaymentMethod(filterPaymentMethod === m ? '' : m)}
                        className={`px-2.5 py-1 rounded-full text-xs transition-all ${filterPaymentMethod === m ? 'bg-cyan-500/30 border border-cyan-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50'}`}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* סוג הוצאה */}
                <div>
                  <p className="text-xs text-white/50 mb-2">סוג הוצאה</p>
                  <div className="flex gap-1.5">
                    {[{ v: '', l: 'הכל' }, { v: 'קבועה', l: 'קבועה' }, { v: 'משתנה', l: 'משתנה' }].map(({ v, l }) => (
                      <button key={v || 'all'} onClick={() => setFilterExpenseClass(v)}
                        className={`flex-1 py-1.5 rounded-xl text-xs transition-all ${filterExpenseClass === v ? 'bg-purple-500/30 border border-purple-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* סטטוס */}
                <div>
                  <p className="text-xs text-white/50 mb-2">סטטוס</p>
                  <div className="flex gap-1.5">
                    {STATUS_OPTIONS.map(({ v, l }) => (
                      <button key={v || 'all'} onClick={() => setFilterStatus(v)}
                        className={`flex-1 py-1.5 rounded-xl text-xs transition-all ${filterStatus === v ? 'bg-cyan-500/30 border border-cyan-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* שנה */}
                {availableYears.length > 0 && (
                  <div>
                    <p className="text-xs text-white/50 mb-2">שנה</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => setFilterYear('')}
                        className={`px-2.5 py-1 rounded-full text-xs transition-all ${!filterYear ? 'bg-cyan-500/30 border border-cyan-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50'}`}>הכל</button>
                      {availableYears.map((y) => (
                        <button key={y} onClick={() => setFilterYear(filterYear === y ? '' : y)}
                          className={`px-2.5 py-1 rounded-full text-xs transition-all ${filterYear === y ? 'bg-cyan-500/30 border border-cyan-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50'}`}>
                          {y}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* חודש */}
                <div>
                  <p className="text-xs text-white/50 mb-2">חודש</p>
                  <div className="grid grid-cols-6 gap-1.5">
                    <button onClick={() => setFilterMonth('')}
                      className={`col-span-6 py-1 rounded-lg text-xs transition-all mb-1 ${!filterMonth ? 'bg-cyan-500/30 border border-cyan-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50'}`}>הכל</button>
                    {MONTH_NAMES.map((name, i) => {
                      const mm = String(i + 1).padStart(2, '0');
                      return (
                        <button key={mm} onClick={() => setFilterMonth(filterMonth === mm ? '' : mm)}
                          className={`py-1 rounded-lg text-xs transition-all ${filterMonth === mm ? 'bg-cyan-500/30 border border-cyan-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50'}`}>
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1 border-t border-white/10">
                  <button onClick={clearFilters} className="text-xs text-rose-400 flex items-center gap-1 px-2">
                    <X className="w-3 h-3" /> נקה הכל
                  </button>
                  <Button size="sm" onClick={() => setShowFilters(false)} className="flex-1 bg-cyan-500/80 hover:bg-cyan-500 text-white border-0 text-xs h-8">
                    סגור
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary + bulk edit toggle */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2 text-xs text-white/50">
          <span>{filtered.length} עסקאות</span>
          <span>·</span>
          <span className="text-emerald-400">+{formatCurrency(filtered.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0))}</span>
          <span>·</span>
          <span className="text-rose-400">-{formatCurrency(filtered.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0))}</span>
        </div>
        {filtered.length > 0 && (
          <button onClick={() => { setShowBulkEdit(!showBulkEdit); setBulkValue(''); }}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-all ${showBulkEdit ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300' : 'bg-white/5 border border-white/10 text-white/40 hover:text-white/70'}`}>
            <Edit3 className="w-3 h-3" />
            עריכה מרובה
          </button>
        )}
      </div>

      {/* Bulk edit panel */}
      <AnimatePresence>
        {showBulkEdit && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <Card className="border-amber-500/30">
              <CardContent className="pt-4 space-y-3">
                <p className="text-xs text-amber-300/80">עדכון <span className="font-bold text-amber-300">{filtered.length}</span> עסקאות מסוננות</p>

                {/* field selector */}
                <div>
                  <p className="text-xs text-white/50 mb-2">שדה לעדכון</p>
                  <div className="flex flex-wrap gap-1.5">
                    {BULK_FIELDS.map(({ v, l }) => (
                      <button key={v} onClick={() => { setBulkField(v); setBulkValue(''); }}
                        className={`px-2.5 py-1 rounded-full text-xs transition-all ${bulkField === v ? 'bg-amber-500/30 border border-amber-500/50 text-amber-200' : 'bg-white/5 border border-white/10 text-white/50'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* value selector */}
                <div>
                  <p className="text-xs text-white/50 mb-2">ערך חדש</p>
                  <BulkValueSelector />
                </div>

                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setShowBulkEdit(false)} className="flex-1 text-xs">ביטול</Button>
                  <Button size="sm" onClick={applyBulkEdit} disabled={!bulkValue || bulkLoading}
                    className="flex-1 text-xs bg-amber-500/80 hover:bg-amber-500 text-white border-0">
                    {bulkLoading ? '...' : <><CheckCircle className="w-3 h-3 ml-1" />עדכן הכל</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grouped list */}
      <div className="space-y-6">
        <AnimatePresence>
          {groupedByMonth.map(([monthKey, monthTxs]) => {
            const monthIncome = monthTxs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
            const monthExpense = monthTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
            return (
              <motion.div key={monthKey} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                {/* Month header */}
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-white/80 capitalize">
                      {formatMonth(monthKey)}
                    </h2>
                    <span className="text-xs text-white/30">{monthTxs.length}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    {monthIncome > 0 && <span className="text-emerald-400">+{formatCurrency(monthIncome)}</span>}
                    {monthExpense > 0 && <span className="text-rose-400">-{formatCurrency(monthExpense)}</span>}
                  </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-white/8 mb-3" />

                {/* Transactions in this month */}
                <div className="space-y-2">
                  {monthTxs.map((tx) => {
                    const isEditing = editingId === tx.id;
                    return (
                      <motion.div key={tx.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}>
                        <Card className={isEditing ? 'border-cyan-500/40' : ''}>
                          <CardContent className="py-3 px-4">
                            {/* ── Row ── */}
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg"
                                style={{ backgroundColor: categoryColor(tx.category) + '20', border: `1px solid ${categoryColor(tx.category)}35` }}>
                                {EMOJI[tx.category] ?? '💰'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-white truncate">{tx.sub_category || tx.notes || tx.category}</p>
                                    <p className="text-xs text-white/40 mt-0.5">{formatDate(tx.date)} · {PAYER_LABELS[tx.payer]} · {tx.payment_method}</p>
                                  </div>
                                  <div className="text-left shrink-0">
                                    <p className={`text-sm font-bold ${tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 mt-1.5">
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{tx.category}</Badge>
                                  {tx.expense_class && <Badge variant={tx.expense_class === 'קבועה' ? 'purple' : 'default'} className="text-[10px] px-1.5 py-0">{tx.expense_class}</Badge>}
                                  {tx.status !== 'paid' && <Badge variant={tx.status === 'pending' ? 'warning' : 'secondary'} className="text-[10px] px-1.5 py-0">{tx.status === 'pending' ? 'ממתין' : 'עתידי'}</Badge>}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => isEditing ? setEditingId(null) : startEdit(tx)}
                                  className={`p-1.5 rounded-lg transition-all ${isEditing ? 'text-cyan-400 bg-cyan-400/10' : 'text-white/20 hover:text-cyan-400 hover:bg-cyan-400/10'}`}
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button onClick={() => del(tx.id)} className="p-1.5 rounded-lg text-white/20 hover:text-rose-400 hover:bg-rose-400/10 transition-all">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* ── Inline edit form ── */}
                            <AnimatePresence>
                              {isEditing && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="mt-3 pt-3 border-t border-white/10 space-y-3" dir="rtl">
                                    {/* Date & Amount */}
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label className="text-[10px] mb-1 block">תאריך</Label>
                                        <Input type="date" value={editForm.date ?? ''} onChange={(e) => setE('date', e.target.value)} className="h-8 text-xs" />
                                      </div>
                                      <div>
                                        <Label className="text-[10px] mb-1 block">סכום (₪)</Label>
                                        <Input type="number" value={editForm.amount ?? ''} onChange={(e) => setE('amount', parseFloat(e.target.value) || 0)} className="h-8 text-xs" min="0" step="0.01" />
                                      </div>
                                    </div>

                                    {/* Category */}
                                    <div>
                                      <Label className="text-[10px] mb-1 block">קטגוריה</Label>
                                      <select value={editForm.category ?? ''} onChange={(e) => setE('category', e.target.value as Category)}
                                        className="w-full h-8 rounded-xl border border-white/15 bg-white/5 px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/50" dir="rtl">
                                        {CATEGORIES.map((c) => <option key={c} value={c} className="bg-slate-800">{c}</option>)}
                                      </select>
                                    </div>

                                    {/* Sub-category */}
                                    <div>
                                      <Label className="text-[10px] mb-1 block">תת-קטגוריה</Label>
                                      <Input value={editForm.sub_category ?? ''} onChange={(e) => setE('sub_category', e.target.value)} placeholder="תיאור ספציפי..." className="h-8 text-xs" dir="rtl" />
                                    </div>

                                    {/* Payer */}
                                    <div>
                                      <Label className="text-[10px] mb-1 block">משלם</Label>
                                      <div className="flex gap-1.5">
                                        {([['Shi','שי'],['Ortal','אורטל'],['Joint','משותף']] as [Payer,string][]).map(([v,l]) => (
                                          <button key={v} onClick={() => setE('payer', v)}
                                            className={`flex-1 py-1.5 rounded-lg text-xs transition-all ${editForm.payer === v ? 'bg-gradient-to-r from-cyan-500/30 to-purple-500/30 border border-cyan-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50'}`}>
                                            {l}
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Payment method */}
                                    <div>
                                      <Label className="text-[10px] mb-1 block">אמצעי תשלום</Label>
                                      <select value={editForm.payment_method ?? ''} onChange={(e) => setE('payment_method', e.target.value as PaymentMethod)}
                                        className="w-full h-8 rounded-xl border border-white/15 bg-white/5 px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/50" dir="rtl">
                                        {PAYMENT_METHODS.map((m) => <option key={m} value={m} className="bg-slate-800">{m}</option>)}
                                      </select>
                                    </div>

                                    {/* Expense class & Status */}
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label className="text-[10px] mb-1 block">סוג הוצאה</Label>
                                        <div className="flex gap-1">
                                          {(['קבועה','משתנה'] as ExpenseClass[]).map((v) => (
                                            <button key={v} onClick={() => { setE('expense_class', v); if (v !== 'קבועה') setApplyToAll(false); }}
                                              className={`flex-1 py-1.5 rounded-lg text-xs transition-all ${editForm.expense_class === v ? 'bg-purple-500/30 border border-purple-500/50 text-white' : 'bg-white/5 border border-white/10 text-white/50'}`}>
                                              {v}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                      <div>
                                        <Label className="text-[10px] mb-1 block">סטטוס</Label>
                                        <select value={editForm.status ?? 'paid'} onChange={(e) => setE('status', e.target.value as Transaction['status'])}
                                          className="w-full h-8 rounded-xl border border-white/15 bg-white/5 px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/50" dir="rtl">
                                          <option value="paid" className="bg-slate-800">שולם</option>
                                          <option value="pending" className="bg-slate-800">ממתין</option>
                                          <option value="future" className="bg-slate-800">עתידי</option>
                                        </select>
                                      </div>
                                    </div>

                                    {/* Notes */}
                                    <div>
                                      <Label className="text-[10px] mb-1 block">הערות</Label>
                                      <Input value={editForm.notes ?? ''} onChange={(e) => setE('notes', e.target.value)} placeholder="הערה חופשית..." className="h-8 text-xs" dir="rtl" />
                                    </div>

                                    {/* Apply to all months toggle — only for fixed */}
                                    {editForm.expense_class === 'קבועה' && (
                                      <button
                                        onClick={() => setApplyToAll((v) => !v)}
                                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all ${applyToAll ? 'bg-purple-500/20 border border-purple-500/40 text-purple-300' : 'bg-white/5 border border-white/10 text-white/40 hover:text-white/60'}`}
                                      >
                                        <span>החל על כל ההעתקים באותה שנה</span>
                                        <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${applyToAll ? 'bg-purple-500 border-purple-400' : 'border-white/30'}`}>
                                          {applyToAll && <span className="w-2 h-2 rounded-full bg-white" />}
                                        </span>
                                      </button>
                                    )}

                                    {/* Buttons */}
                                    <div className="flex gap-2 pt-1">
                                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="flex-1 text-xs h-8">ביטול</Button>
                                      <Button size="sm" onClick={() => update({ id: tx.id, data: editForm, allMonths: applyToAll })} disabled={updatePending}
                                        className="flex-1 text-xs h-8 bg-cyan-500/80 hover:bg-cyan-500 text-white border-0">
                                        {updatePending ? '...' : <><Save className="w-3 h-3 ml-1" />שמור</>}
                                      </Button>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-white/30">
            <p className="text-4xl mb-2">🔍</p>
            <p>לא נמצאו עסקאות</p>
          </div>
        )}
      </div>

          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
