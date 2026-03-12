import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, Pencil, Trash2, Save, X, ChevronDown, ChevronUp } from 'lucide-react';
import { base44 } from '@/lib/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toaster';
import { Transaction, CATEGORIES, INCOME_CATEGORIES, Category, IncomeCategory, Payer, ExpenseClass } from '@/types';
import { formatCurrency, categoryColor } from '@/utils';
import { usePendingClarifications, PendingItem } from '@/hooks/usePendingClarifications';

const PAYER_LABELS: Record<Payer, string> = { Shi: 'שי', Ortal: 'אורטל', Joint: 'משותף' };
const PAYER_COLORS: Record<Payer, string> = {
  Shi: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  Ortal: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  Joint: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

export function PendingClarificationsCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { items, removeItem, updateItem, clearAll } = usePendingClarifications();
  const [collapsed, setCollapsed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PendingItem | null>(null);

  const { mutate: saveItem, isPending: saving } = useMutation({
    mutationFn: async (item: PendingItem) => {
      await base44.entities.Transaction.create({
        date: item.date || new Date().toISOString().split('T')[0],
        type: item.type || 'expense',
        category: item.category || 'שונות',
        amount: item.amount || 0,
        payer: (item.payer as Payer) || 'Shi',
        payment_method: item.payment_method || 'אשראי',
        expense_class: item.expense_class || 'משתנה',
        status: item.status || 'paid',
        notes: item.notes,
        sub_category: item.sub_category,
        installments: item.installments,
      } as Omit<Transaction, 'id'>);
    },
    onSuccess: (_, item) => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      removeItem(item._id);
      setEditingId(null);
      toast({ title: 'עסקה נשמרה!', variant: 'success' });
    },
    onError: (e) => toast({ title: 'שגיאה בשמירה', description: String(e), variant: 'destructive' }),
  });

  if (items.length === 0) return null;

  const openEdit = (item: PendingItem) => {
    setEditingId(item._id);
    setDraft({ ...item });
  };

  const cancelEdit = () => { setEditingId(null); setDraft(null); };

  const setD = <K extends keyof PendingItem>(k: K, v: PendingItem[K]) =>
    setDraft((d) => d ? { ...d, [k]: v } : d);

  const commitAndSave = () => {
    if (!draft) return;
    updateItem(draft._id, draft);
    saveItem(draft);
  };

  return (
    <Card className="border-orange-500/30 bg-orange-500/5" dir="rtl">
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setCollapsed((v) => !v)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-orange-400" />
            <CardTitle className="text-sm text-orange-300">ממתינים לבירור</CardTitle>
            <Badge className="text-[10px] px-1.5 py-0 bg-orange-500/30 text-orange-300 border-orange-500/40">
              {items.length}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); clearAll(); }}
              className="text-[10px] text-white/30 hover:text-rose-400 transition-colors"
            >
              נקה הכל
            </button>
            {collapsed ? <ChevronDown className="w-4 h-4 text-white/40" /> : <ChevronUp className="w-4 h-4 text-white/40" />}
          </div>
        </div>
      </CardHeader>

      <AnimatePresence>
        {!collapsed && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <CardContent className="space-y-2 pt-0">
              {items.map((item) => (
                <div key={item._id}>

                  {/* View row */}
                  {editingId !== item._id && (
                    <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 px-3 py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm text-white truncate">{item.notes || item.category}</p>
                          <p className={`text-sm font-bold shrink-0 ${item.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {item.type === 'income' ? '+' : ''}{item.amount ? formatCurrency(item.amount) : '—'}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="text-xs text-white/40">{item.date}</span>
                          {item.payer && (
                            <span className={`text-[10px] border rounded-full px-1.5 py-0.5 font-medium ${PAYER_COLORS[item.payer as Payer]}`}>
                              {PAYER_LABELS[item.payer as Payer]}
                            </span>
                          )}
                          {item.category && (
                            <Badge className="text-[10px] px-1.5 py-0" style={{ backgroundColor: categoryColor(item.category) + '25', color: categoryColor(item.category), borderColor: categoryColor(item.category) + '40' }}>
                              {item.category}
                            </Badge>
                          )}
                          {item.expense_class === 'קבועה' && (
                            <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full px-1.5 py-0.5">קבועה</span>
                          )}
                          {item.installments && item.installments > 1 && (
                            <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full px-1.5 py-0.5">{item.installments} תשלומים</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg text-white/30 hover:text-cyan-400 hover:bg-white/10 transition-colors" title="ערוך ושמור">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => removeItem(item._id)} className="p-1.5 rounded-lg text-white/30 hover:text-rose-400 hover:bg-white/10 transition-colors" title="מחק">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Edit row */}
                  {editingId === item._id && draft && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl border border-cyan-500/50 bg-cyan-500/5 p-3 space-y-3"
                    >
                      {/* Type */}
                      <div className="grid grid-cols-2 gap-2">
                        {(['expense', 'income'] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => { setD('type', t); setD('category', t === 'income' ? INCOME_CATEGORIES[0] : 'שונות'); }}
                            className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${
                              draft.type === t
                                ? t === 'expense' ? 'bg-rose-500/30 border border-rose-500/60 text-rose-300' : 'bg-emerald-500/30 border border-emerald-500/60 text-emerald-300'
                                : 'bg-white/5 border border-white/10 text-white/40 hover:bg-white/10'
                            }`}
                          >
                            {t === 'expense' ? '💸 הוצאה' : '💰 הכנסה'}
                          </button>
                        ))}
                      </div>

                      {/* Date + Amount */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-white/50 block mb-1">תאריך</label>
                          <Input type="date" value={draft.date || ''} onChange={(e) => setD('date', e.target.value)} className="h-8 text-xs" />
                        </div>
                        <div>
                          <label className="text-[10px] text-white/50 block mb-1">סכום (₪)</label>
                          <Input type="number" value={draft.amount || ''} onChange={(e) => setD('amount', parseFloat(e.target.value) || 0)} className="h-8 text-xs" min="0" step="0.01" />
                        </div>
                      </div>

                      {/* Payer */}
                      <div>
                        <label className="text-[10px] text-white/50 block mb-1">משלם</label>
                        <div className="flex gap-1.5">
                          {(['Shi', 'Ortal', 'Joint'] as Payer[]).map((p) => (
                            <button key={p} onClick={() => setD('payer', p)}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all border ${draft.payer === p ? PAYER_COLORS[p] : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}>
                              {PAYER_LABELS[p]}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Category */}
                      <div>
                        <label className="text-[10px] text-white/50 block mb-1">קטגוריה</label>
                        <select
                          value={draft.category || ''}
                          onChange={(e) => setD('category', e.target.value as Category | IncomeCategory)}
                          className="w-full h-8 rounded-lg border border-white/15 bg-white/5 px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                          dir="rtl"
                        >
                          {(draft.type === 'income' ? INCOME_CATEGORIES : CATEGORIES).map((c) => (
                            <option key={c} value={c} className="bg-slate-800">{c}</option>
                          ))}
                        </select>
                      </div>

                      {/* Expense class */}
                      {draft.type === 'expense' && (
                        <div>
                          <label className="text-[10px] text-white/50 block mb-1">סוג הוצאה</label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {(['משתנה', 'קבועה'] as ExpenseClass[]).map((cls) => (
                              <button key={cls} onClick={() => setD('expense_class', cls)}
                                className={`py-1.5 rounded-lg text-xs font-medium transition-all border ${
                                  draft.expense_class === cls ? 'bg-purple-500/30 border-purple-500/60 text-purple-300' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                                }`}>
                                {cls === 'משתנה' ? '🔄 משתנה' : '📌 קבועה'}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Installments */}
                      {draft.type === 'expense' && (
                        <div>
                          <label className="text-[10px] text-white/50 block mb-1">מספר תשלומים</label>
                          <Input type="number" min="1" max="36" value={draft.installments || 1} onChange={(e) => setD('installments', parseInt(e.target.value) || 1)} className="h-8 text-xs" />
                        </div>
                      )}

                      {/* Notes */}
                      <div>
                        <label className="text-[10px] text-white/50 block mb-1">תיאור</label>
                        <Input value={draft.notes || ''} onChange={(e) => setD('notes', e.target.value)} className="h-8 text-xs" dir="rtl" placeholder="שם הוצאה / הכנסה..." />
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" onClick={commitAndSave} disabled={saving} className="flex-1 h-8 text-xs gap-1.5">
                          <Save className="w-3.5 h-3.5" /> שמור עסקה
                        </Button>
                        <button onClick={() => removeItem(item._id)}
                          className="px-3 h-8 rounded-lg text-xs text-rose-400/70 hover:text-rose-400 border border-rose-500/20 hover:border-rose-500/40 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={cancelEdit}
                          className="px-3 h-8 rounded-lg text-xs text-white/50 hover:text-white/80 border border-white/10 hover:border-white/20 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  )}

                </div>
              ))}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
