import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Trash2, Filter, X, Edit3, CheckCircle, Pencil, Save } from 'lucide-react';
import { base44 } from '@/lib/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import { Transaction, CATEGORIES, PAYMENT_METHODS, Category, Payer, PaymentMethod, ExpenseClass } from '@/types';
import { formatCurrency, formatDate, categoryColor, PAYER_LABELS } from '@/utils';

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
        // Find all sibling fixed transactions in the same year
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
        delete (updateData as Partial<Transaction> & { date?: string }).date; // keep each sibling's own date
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

  const { mutate: del } = useMutation({
    mutationFn: (id: string) => base44.entities.Transaction.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transactions'] }); toast({ title: 'עסקה נמחקה', variant: 'default' }); },
  });

  const availableYears = useMemo(() => {
    const years = new Set(transactions.map((t) => t.date.slice(0, 4)));
    return Array.from(years).sort().reverse();
  }, [transactions]);

  const MONTH_NAMES = ['ינו','פבר','מרץ','אפר','מאי','יוני','יולי','אוג','ספט','אוק','נוב','דצמ'];

  const filtered = useMemo(() =>
    transactions
      .filter((t) => {
        if (filterCat && t.category !== filterCat) return false;
        if (filterPayer && t.payer !== filterPayer) return false;
        if (filterType && t.type !== filterType) return false;
        if (filterPaymentMethod && t.payment_method !== filterPaymentMethod) return false;
        if (filterExpenseClass && t.expense_class !== filterExpenseClass) return false;
        if (filterStatus && t.status !== filterStatus) return false;
        // Year/month filters are bypassed when a text search is active
        if (!search) {
          if (filterYear && !t.date.startsWith(filterYear)) return false;
          if (filterMonth && t.date.slice(5, 7) !== filterMonth) return false;
        }
        if (search && !matchesSearch(t, search)) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions, filterCat, filterPayer, filterType, filterPaymentMethod, filterExpenseClass, filterStatus, filterYear, filterMonth, search]
  );

  const activeFilters = [filterCat, filterPayer, filterType, filterPaymentMethod, filterExpenseClass, filterStatus, filterYear, filterMonth].filter(Boolean).length;

  function clearFilters() {
    setFilterCat(''); setFilterPayer(''); setFilterType('');
    setFilterPaymentMethod(''); setFilterExpenseClass(''); setFilterStatus('');
    setFilterYear(''); setFilterMonth('');
  }

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
      <h1 className="text-lg font-bold text-white">כל העסקאות</h1>

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

      {/* List */}
      <div className="space-y-2">
        <AnimatePresence>
          {filtered.map((tx) => {
            const isEditing = editingId === tx.id;
            return (
              <motion.div key={tx.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}>
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
        </AnimatePresence>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-white/30">
            <p className="text-4xl mb-2">🔍</p>
            <p>לא נמצאו עסקאות</p>
          </div>
        )}
      </div>
    </div>
  );
}
