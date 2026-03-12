import { useState, useRef, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, MessageSquare, Loader2, CheckCircle, AlertTriangle, X, Pencil, Save, HelpCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { base44, buildMerchantMap, parseWhatsAppExport, WaTransaction } from '@/lib/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toaster';
import { Transaction, CATEGORIES, INCOME_CATEGORIES, Category, IncomeCategory, Payer, ExpenseClass } from '@/types';
import { formatCurrency, categoryColor } from '@/utils';

const PAYER_LABELS: Record<Payer, string> = { Shi: 'שי', Ortal: 'אורטל', Joint: 'משותף' };
const PAYER_COLORS: Record<Payer, string> = {
  Shi: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  Ortal: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  Joint: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

export default function Import() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<'whatsapp' | 'file'>('whatsapp');
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<WaTransaction[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<WaTransaction | null>(null);

  const { data: allTransactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.filter(),
    staleTime: 5 * 60 * 1000,
  });
  const merchantMap = useMemo(() => buildMerchantMap(allTransactions), [allTransactions]);

  const { mutate: saveAll, isPending: saving } = useMutation({
    mutationFn: async () => {
      const toSave = preview.filter((_, i) => selected.has(i));
      await base44.entities.Transaction.bulkCreate(
        toSave.map((t) => ({
          date: t.date || new Date().toISOString().split('T')[0],
          type: t.type || 'expense',
          category: t.category || 'שונות',
          amount: t.amount || 0,
          payer: (t.payer as Payer) || 'Shi',
          payment_method: t.payment_method || 'אשראי',
          expense_class: t.expense_class || 'משתנה',
          status: t.status || 'paid',
          notes: t.notes,
          sub_category: t.sub_category,
          installments: t.installments,
        } as Omit<Transaction, 'id'>)),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      const savedCount = selected.size;
      // Keep only items that were NOT saved (unsaved + needs-clarification remain)
      setPreview((prev) => prev.filter((_, i) => !selected.has(i)));
      setSelected(new Set());
      setEditingIndex(null);
      toast({ title: `${savedCount} עסקאות נוספו בהצלחה!`, variant: 'success' });
    },
    onError: (e) => toast({ title: 'שגיאה בשמירה', description: String(e), variant: 'destructive' }),
  });

  const parseWhatsApp = () => {
    if (!text.trim()) return;
    setParsing(true);
    setEditingIndex(null);
    try {
      const txs = parseWhatsAppExport(text, merchantMap);
      setPreview(txs);
      setSelected(new Set(txs.map((_, i) => i).filter((i) => !txs[i].uncertain)));
      if (txs.length === 0) {
        toast({ title: 'לא נמצאו עסקאות בטקסט', variant: 'destructive' });
      } else {
        const uncertain = txs.filter((t) => t.uncertain).length;
        toast({
          title: `נמצאו ${txs.length} עסקאות`,
          description: uncertain > 0 ? `${uncertain} פריטים דורשים בדיקה (מסומנים בצהוב)` : 'הכל נראה תקין!',
          variant: 'success',
        });
      }
    } finally {
      setParsing(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
        const txs: WaTransaction[] = rows.map((row) => {
          const amount = parseFloat(String(row['סכום'] || row['amount'] || row['Amount'] || 0));
          const date = String(row['תאריך'] || row['date'] || new Date().toISOString().split('T')[0]);
          const category = (String(row['קטגוריה'] || row['category'] || 'שונות')) as Category;
          const payer = (String(row['משלם'] || row['payer'] || 'Shi')) as Payer;
          return { date, amount, category, type: 'expense' as const, payer, payment_method: 'אשראי' as const, expense_class: 'משתנה' as const, status: 'paid' as const, notes: String(row['הערות'] || row['notes'] || '') };
        }).filter((t) => t.amount && t.amount > 0);
        setPreview(txs);
        setSelected(new Set(txs.map((_, i) => i)));
        toast({ title: `נטענו ${txs.length} שורות מהקובץ` });
      } catch {
        toast({ title: 'שגיאה בקריאת הקובץ', variant: 'destructive' });
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const toggleSelect = (i: number) =>
    setSelected((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const openEdit = (e: React.MouseEvent, i: number) => {
    e.stopPropagation();
    setEditingIndex(i);
    setEditDraft({ ...preview[i] });
  };

  const cancelEdit = () => { setEditingIndex(null); setEditDraft(null); };

  const commitEdit = () => {
    if (editDraft === null || editingIndex === null) return;
    setPreview((prev) => prev.map((t, i) => i === editingIndex ? { ...editDraft, uncertain: false, needsClarification: false } : t));
    setSelected((prev) => { const n = new Set(prev); n.add(editingIndex); return n; });
    setEditingIndex(null);
    setEditDraft(null);
  };

  const toggleClarification = (e: React.MouseEvent, i: number) => {
    e.stopPropagation();
    setPreview((prev) => prev.map((t, idx) =>
      idx === i ? { ...t, needsClarification: !t.needsClarification, uncertain: false } : t
    ));
    // Deselect if marking for clarification
    setSelected((prev) => {
      const n = new Set(prev);
      if (!preview[i].needsClarification) n.delete(i); // marking → deselect
      return n;
    });
  };

  const setDraft = <K extends keyof WaTransaction>(k: K, v: WaTransaction[K]) =>
    setEditDraft((d) => d ? { ...d, [k]: v } : d);

  const clarificationCount = preview.filter((t) => t.needsClarification).length;
  const uncertainCount = preview.filter((t) => t.uncertain && !t.needsClarification).length;
  const selectedCount = selected.size;

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <h1 className="text-lg font-bold text-white">ייבוא עסקאות</h1>

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode('whatsapp')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
            mode === 'whatsapp' ? 'bg-green-500/20 border border-green-500/40 text-green-300' : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10'
          }`}
        >
          <MessageSquare className="w-4 h-4" /> WhatsApp
        </button>
        <button
          onClick={() => setMode('file')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
            mode === 'file' ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300' : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10'
          }`}
        >
          <Upload className="w-4 h-4" /> Excel / CSV
        </button>
      </div>

      {/* WhatsApp mode */}
      <AnimatePresence mode="wait">
        {mode === 'whatsapp' && (
          <motion.div key="wa" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-green-400" />
                  הדבק כאן טקסט מיצוא WhatsApp
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={"1/1/26, 10:57 - אורטלטל שלי - Ortal: סופרפארם 79.9₪\n1/1/26, 12:00 - Shai Tura: יוחננוף 245\n..."}
                  rows={6}
                  dir="rtl"
                  className="font-mono text-xs"
                />
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <span>✓ מזהה שי/אורטל אוטומטית</span>
                  <span>·</span>
                  <span>✓ מסנן שיחות</span>
                  <span>·</span>
                  <span>✓ מסווג לפי היסטוריה</span>
                </div>
                <Button onClick={parseWhatsApp} disabled={parsing || !text.trim()} className="w-full" variant="gradient">
                  {parsing ? <><Loader2 className="w-4 h-4 animate-spin" /> מפרסר...</> : <><MessageSquare className="w-4 h-4" /> פרסר WhatsApp</>}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {mode === 'file' && (
          <motion.div key="file" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card className="border-dashed border-white/20 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => fileRef.current?.click()}>
              <CardContent className="py-8 text-center">
                <Upload className="w-10 h-10 text-white/30 mx-auto mb-3" />
                <p className="text-sm text-white/60">לחץ לטעינת קובץ CSV / Excel</p>
                <p className="text-xs text-white/30 mt-1">עמודות: תאריך, סכום, קטגוריה, משלם, הערות</p>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview */}
      <AnimatePresence>
        {preview.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">

            {/* Clarification banner */}
            {clarificationCount > 0 && (
              <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-orange-400 shrink-0" />
                <p className="text-xs text-orange-300">
                  <span className="font-bold">{clarificationCount}</span> פריטים ממתינים לבירור — יישארו ברשימה לאחר השמירה
                </p>
              </div>
            )}

            {/* Header row */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium text-white">{preview.length} פריטים ברשימה</p>
                {uncertainCount > 0 && (
                  <p className="text-xs text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {uncertainCount} דורשים בדיקה — לא נבחרו אוטומטית
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setSelected(new Set(preview.map((_, i) => i).filter((i) => !preview[i].needsClarification)))} className="text-xs text-cyan-400 hover:text-cyan-300">בחר הכל</button>
                <button onClick={() => setSelected(new Set(preview.map((_, i) => i).filter((i) => !preview[i].uncertain && !preview[i].needsClarification)))} className="text-xs text-white/50 hover:text-white/70">רק ודאיים</button>
                <button onClick={() => setSelected(new Set())} className="text-xs text-white/30 hover:text-white/50">נקה</button>
              </div>
            </div>

            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
              {preview.map((tx, i) => (
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.015, 0.3) }}>

                  {/* ── View row ── */}
                  {editingIndex !== i && (
                    <div
                      onClick={() => !tx.needsClarification && toggleSelect(i)}
                      className={`rounded-xl border px-3 py-2.5 transition-all flex items-center gap-3 ${
                        tx.needsClarification
                          ? 'border-orange-500/40 bg-orange-500/8 cursor-default opacity-80'
                          : tx.uncertain
                            ? selected.has(i) ? 'border-amber-500/50 bg-amber-500/10 cursor-pointer' : 'border-amber-500/20 bg-amber-500/5 opacity-70 cursor-pointer'
                            : selected.has(i) ? 'border-cyan-500/40 bg-cyan-500/10 cursor-pointer' : 'border-white/10 bg-white/5 opacity-50 cursor-pointer'
                      }`}
                    >
                      {/* Checkbox / clarification icon */}
                      {tx.needsClarification ? (
                        <div className="w-5 h-5 rounded-full border-2 border-orange-400/60 flex items-center justify-center shrink-0">
                          <HelpCircle className="w-3 h-3 text-orange-400" />
                        </div>
                      ) : (
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          selected.has(i) ? (tx.uncertain ? 'border-amber-400 bg-amber-400' : 'border-cyan-500 bg-cyan-500') : 'border-white/30'
                        }`}>
                          {selected.has(i) && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm text-white truncate">{tx.notes || tx.category}</p>
                          <p className={`text-sm font-bold shrink-0 ${tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {tx.type === 'income' ? '+' : ''}{tx.amount ? formatCurrency(tx.amount) : '—'}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="text-xs text-white/40">{tx.date}</span>
                          {tx.payer && (
                            <span className={`text-[10px] border rounded-full px-1.5 py-0.5 font-medium ${PAYER_COLORS[tx.payer as Payer]}`}>
                              {PAYER_LABELS[tx.payer as Payer]}
                            </span>
                          )}
                          {tx.category && (
                            <Badge className="text-[10px] px-1.5 py-0" style={{ backgroundColor: categoryColor(tx.category) + '25', color: categoryColor(tx.category), borderColor: categoryColor(tx.category) + '40' }}>
                              {tx.category}
                            </Badge>
                          )}
                          {tx.type === 'income' && (
                            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full px-1.5 py-0.5">הכנסה</span>
                          )}
                          {tx.expense_class === 'קבועה' && (
                            <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full px-1.5 py-0.5">קבועה</span>
                          )}
                          {tx.installments && tx.installments > 1 && (
                            <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full px-1.5 py-0.5">{tx.installments} תשלומים</span>
                          )}
                          {tx.needsClarification && (
                            <span className="text-[10px] bg-orange-500/20 text-orange-300 border border-orange-500/30 rounded-full px-1.5 py-0.5 flex items-center gap-0.5">
                              <HelpCircle className="w-2.5 h-2.5" /> בירור נוסף
                            </span>
                          )}
                          {tx.uncertain && !tx.needsClarification && (
                            <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full px-1.5 py-0.5 flex items-center gap-0.5">
                              <AlertTriangle className="w-2.5 h-2.5" /> בדוק
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => openEdit(e, i)}
                          className="p-1.5 rounded-lg text-white/30 hover:text-cyan-400 hover:bg-white/10 transition-colors"
                          title="ערוך"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => toggleClarification(e, i)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            tx.needsClarification
                              ? 'text-orange-400 bg-orange-500/20 hover:bg-orange-500/10'
                              : 'text-white/30 hover:text-orange-400 hover:bg-white/10'
                          }`}
                          title={tx.needsClarification ? 'הסר סימון בירור' : 'דרוש בירור נוסף'}
                        >
                          <HelpCircle className="w-3.5 h-3.5" />
                        </button>
                        {selected.has(i) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleSelect(i); }}
                            className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/10 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Edit row ── */}
                  {editingIndex === i && editDraft && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl border border-cyan-500/50 bg-cyan-500/5 p-3 space-y-3"
                    >
                      {/* Type toggle */}
                      <div className="grid grid-cols-2 gap-2">
                        {(['expense', 'income'] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => {
                              setDraft('type', t);
                              setDraft('category', t === 'income' ? INCOME_CATEGORIES[0] : 'שונות');
                            }}
                            className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${
                              editDraft.type === t
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
                          <Input type="date" value={editDraft.date || ''} onChange={(e) => setDraft('date', e.target.value)} className="h-8 text-xs" />
                        </div>
                        <div>
                          <label className="text-[10px] text-white/50 block mb-1">סכום (₪)</label>
                          <Input type="number" value={editDraft.amount || ''} onChange={(e) => setDraft('amount', parseFloat(e.target.value) || 0)} className="h-8 text-xs" min="0" step="0.01" />
                        </div>
                      </div>

                      {/* Payer */}
                      <div>
                        <label className="text-[10px] text-white/50 block mb-1">משלם</label>
                        <div className="flex gap-1.5">
                          {(['Shi', 'Ortal', 'Joint'] as Payer[]).map((p) => (
                            <button
                              key={p}
                              onClick={() => setDraft('payer', p)}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                                editDraft.payer === p ? PAYER_COLORS[p] : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                              }`}
                            >
                              {PAYER_LABELS[p]}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Category */}
                      <div>
                        <label className="text-[10px] text-white/50 block mb-1">קטגוריה</label>
                        <select
                          value={editDraft.category || ''}
                          onChange={(e) => setDraft('category', e.target.value as Category | IncomeCategory)}
                          className="w-full h-8 rounded-lg border border-white/15 bg-white/5 px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                          dir="rtl"
                        >
                          {(editDraft.type === 'income' ? INCOME_CATEGORIES : CATEGORIES).map((c) => (
                            <option key={c} value={c} className="bg-slate-800">{c}</option>
                          ))}
                        </select>
                      </div>

                      {/* Expense class (only for expenses) */}
                      {editDraft.type === 'expense' && (
                        <div>
                          <label className="text-[10px] text-white/50 block mb-1">סוג הוצאה</label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {(['משתנה', 'קבועה'] as ExpenseClass[]).map((cls) => (
                              <button
                                key={cls}
                                onClick={() => setDraft('expense_class', cls)}
                                className={`py-1.5 rounded-lg text-xs font-medium transition-all border ${
                                  editDraft.expense_class === cls
                                    ? 'bg-purple-500/30 border-purple-500/60 text-purple-300'
                                    : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                                }`}
                              >
                                {cls === 'משתנה' ? '🔄 משתנה' : '📌 קבועה'}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Installments (only for expenses) */}
                      {editDraft.type === 'expense' && (
                        <div>
                          <label className="text-[10px] text-white/50 block mb-1">מספר תשלומים</label>
                          <Input
                            type="number"
                            min="1"
                            max="36"
                            value={editDraft.installments || 1}
                            onChange={(e) => setDraft('installments', parseInt(e.target.value) || 1)}
                            className="h-8 text-xs"
                          />
                        </div>
                      )}

                      {/* Notes */}
                      <div>
                        <label className="text-[10px] text-white/50 block mb-1">תיאור</label>
                        <Input
                          value={editDraft.notes || ''}
                          onChange={(e) => setDraft('notes', e.target.value)}
                          className="h-8 text-xs"
                          dir="rtl"
                          placeholder="שם הוצאה / הכנסה..."
                        />
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" onClick={commitEdit} className="flex-1 h-8 text-xs gap-1.5">
                          <Save className="w-3.5 h-3.5" /> שמור שינויים
                        </Button>
                        <button
                          onClick={cancelEdit}
                          className="px-3 h-8 rounded-lg text-xs text-white/50 hover:text-white/80 border border-white/10 hover:border-white/20 transition-colors"
                        >
                          ביטול
                        </button>
                      </div>
                    </motion.div>
                  )}

                </motion.div>
              ))}
            </div>

            <Button
              onClick={() => saveAll()}
              disabled={saving || selectedCount === 0}
              className="w-full"
              size="lg"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> שומר...</>
                : `💾 שמור ${selectedCount} עסקאות${clarificationCount > 0 ? ` (${clarificationCount} לבירור יישארו)` : ''}`}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
