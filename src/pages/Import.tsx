import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Sparkles, Loader2, CheckCircle, FileText, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { base44 } from '@/lib/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toaster';
import { Transaction, CATEGORIES, Category, Payer } from '@/types';
import { formatCurrency, categoryColor } from '@/utils';

export default function Import() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<Partial<Transaction>[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { mutate: saveAll, isPending: saving } = useMutation({
    mutationFn: async () => {
      const toSave = preview.filter((_, i) => selected.has(i));
      await Promise.all(toSave.map((t) => base44.entities.Transaction.create({
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
      } as Omit<Transaction, 'id'>)));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      setPreview([]);
      setSelected(new Set());
      setText('');
      toast({ title: `${selected.size} עסקאות נוספו בהצלחה!`, variant: 'success' });
    },
  });

  const parseText = async () => {
    if (!text.trim()) return;
    setParsing(true);
    try {
      const res = await base44.integrations.Core.InvokeLLM({ prompt: text });
      const txs = res.transactions ?? [];
      setPreview(txs);
      setSelected(new Set(txs.map((_, i) => i)));
      if (txs.length === 0) toast({ title: 'לא נמצאו עסקאות בטקסט', variant: 'destructive' });
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
        const txs: Partial<Transaction>[] = rows.map((row) => {
          const amount = parseFloat(String(row['סכום'] || row['amount'] || row['Amount'] || 0));
          const date = String(row['תאריך'] || row['date'] || new Date().toISOString().split('T')[0]);
          const category = (String(row['קטגוריה'] || row['category'] || 'שונות')) as Category;
          return { date, amount, category: CATEGORIES.includes(category) ? category : 'שונות' as Category, type: 'expense' as const, payer: 'Shi' as const, payment_method: 'אשראי' as const, expense_class: 'משתנה' as const, status: 'paid' as const, notes: String(row['הערות'] || row['notes'] || '') };
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

  const toggleSelect = (i: number) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  };

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <h1 className="text-lg font-bold text-white">ייבוא עסקאות</h1>

      {/* WhatsApp text import */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <CardTitle className="text-sm">ייבוא מטקסט WhatsApp / AI</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`הדבק כאן טקסט עם עסקאות, לדוגמה:\n15/03 רמי לוי 340₪\n16/03 דלק פז 280 ש"ח\n17/03 קפה עלמא 45.50`}
            rows={5}
            dir="rtl"
          />
          <Button onClick={parseText} disabled={parsing || !text.trim()} className="w-full" variant="gradient">
            {parsing ? <><Loader2 className="w-4 h-4 animate-spin" /> מפרסר...</> : <><Sparkles className="w-4 h-4" /> פרסר עם AI</>}
          </Button>
        </CardContent>
      </Card>

      {/* File upload */}
      <Card className="border-dashed border-white/20 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => fileRef.current?.click()}>
        <CardContent className="py-6 text-center">
          <Upload className="w-8 h-8 text-white/30 mx-auto mb-2" />
          <p className="text-sm text-white/60">לחץ לטעינת קובץ CSV / Excel</p>
          <p className="text-xs text-white/30 mt-1">עמודות נדרשות: תאריך, סכום, קטגוריה</p>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
        </CardContent>
      </Card>

      {/* Preview */}
      <AnimatePresence>
        {preview.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white">תצוגה מקדימה ({preview.length} עסקאות)</p>
              <div className="flex gap-2">
                <button onClick={() => setSelected(new Set(preview.map((_, i) => i)))} className="text-xs text-cyan-400">בחר הכל</button>
                <button onClick={() => setSelected(new Set())} className="text-xs text-white/40">נקה</button>
              </div>
            </div>

            <div className="space-y-2">
              {preview.map((tx, i) => (
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                  <div
                    onClick={() => toggleSelect(i)}
                    className={`rounded-xl border px-4 py-3 cursor-pointer transition-all flex items-center gap-3 ${selected.has(i) ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-white/10 bg-white/5 opacity-60'}`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selected.has(i) ? 'border-cyan-500 bg-cyan-500' : 'border-white/30'}`}>
                      {selected.has(i) && <CheckCircle className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-2">
                        <p className="text-sm text-white truncate">{tx.notes || tx.category}</p>
                        <p className="text-sm font-bold text-rose-400 shrink-0">{tx.amount ? formatCurrency(tx.amount) : '—'}</p>
                      </div>
                      <div className="flex gap-1.5 mt-1">
                        <span className="text-xs text-white/40">{tx.date}</span>
                        {tx.category && (
                          <Badge className="text-[10px] px-1.5 py-0" style={{ backgroundColor: categoryColor(tx.category) + '25', color: categoryColor(tx.category), borderColor: categoryColor(tx.category) + '40' }}>
                            {tx.category}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <Button
              onClick={() => saveAll()}
              disabled={saving || selected.size === 0}
              className="w-full"
              size="lg"
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> שומר...</> : `💾 שמור ${selected.size} עסקאות`}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
