import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, X, Pencil, Trash2, CreditCard, Image } from 'lucide-react';
import { base44 } from '@/lib/base44Client';
import { useToast } from '@/components/ui/toaster';
import { Subscription, SUB_CATEGORIES, SubCategory } from '@/types';

const fmt = (n: number) => `₪${Math.round(n).toLocaleString('he')}`;

type PayType = 'none' | 'monthly' | 'onetime';
const PAY_LABELS: Record<PayType, string> = { none: 'ללא תשלום', monthly: 'חודשי', onetime: 'חד-פעמי' };

/** Backward-compat: treat missing payment_type as monthly if fee>0, else none */
function payType(s: Pick<Subscription, 'payment_type' | 'monthly_fee'>): PayType {
  if (s.payment_type) return s.payment_type;
  return (s.monthly_fee ?? 0) > 0 ? 'monthly' : 'none';
}

function feeLabel(s: Subscription): string {
  const pt = payType(s);
  if (pt === 'none') return 'ללא תשלום';
  if (pt === 'monthly') return `${fmt(s.monthly_fee)}/חודש`;
  return `${fmt(s.monthly_fee)} חד-פעמי`;
}

const OWNER_META = {
  Shi:   { label: 'שי',    cls: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  Ortal: { label: 'אורטל', cls: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  Joint: { label: 'משותף', cls: 'bg-pink-500/20 text-pink-300 border-pink-500/30' },
};

const CAT_META: Record<SubCategory, { emoji: string }> = {
  'חנויות ולקוחות': { emoji: '🏬' },
  'פנאי וטבע':      { emoji: '🌿' },
  'בידור ומדיה':    { emoji: '📺' },
  'בריאות וספורט':  { emoji: '🏥' },
  'מזון ומשלוחים':  { emoji: '🍔' },
  'רכב ותחבורה':    { emoji: '🚗' },
  'חינוך':          { emoji: '🎓' },
  'שירותים':        { emoji: '🔧' },
  'אחר':            { emoji: '📦' },
};

function renewalBadge(date?: string) {
  if (!date) return null;
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (days < 0)   return { text: 'פג תוקף',             cls: 'text-red-400 bg-red-400/10 border-red-400/20' };
  if (days <= 30) return { text: `חידוש בעוד ${days}י׳`, cls: 'text-orange-400 bg-orange-400/10 border-orange-400/20' };
  if (days <= 90) return { text: `חידוש בעוד ${days}י׳`, cls: 'text-amber-400 bg-amber-400/10 border-amber-400/20' };
  const d = new Date(date);
  return {
    text: `חידוש ${d.toLocaleDateString('he-IL', { month: 'short', year: '2-digit' })}`,
    cls: 'text-white/30 bg-white/5 border-white/10',
  };
}

const EMPTY: Omit<Subscription, 'id'> = {
  name: '', provider: '', category: 'אחר', owner: 'Joint',
  payment_type: 'monthly', monthly_fee: 0,
  renewal_date: '', card_number: '', image_url: '', notes: '', is_active: true,
};

export default function Subscriptions() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [search, setSearch]           = useState('');
  const [catFilter, setCatFilter]     = useState<SubCategory | 'all'>('all');
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'Shi' | 'Ortal' | 'Joint'>('all');
  const [dialog, setDialog]           = useState<'add' | 'edit' | null>(null);
  const [form, setForm]               = useState<Omit<Subscription, 'id'>>(EMPTY);
  const [editId, setEditId]           = useState<string | null>(null);

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => base44.entities.Subscription.filter({}),
  });

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      if (editId) return base44.entities.Subscription.update(editId, form);
      return base44.entities.Subscription.create(form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
      setDialog(null);
      toast({ title: editId ? 'עודכן בהצלחה' : 'נוסף בהצלחה' });
    },
  });

  const { mutate: del } = useMutation({
    mutationFn: (id: string) => base44.entities.Subscription.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
      toast({ title: 'נמחק' });
    },
  });

  function openAdd() { setForm(EMPTY); setEditId(null); setDialog('add'); }
  function openEdit(s: Subscription) {
    const { id, ...rest } = s;
    setForm({ ...EMPTY, ...rest, payment_type: payType(s) });
    setEditId(id);
    setDialog('edit');
  }

  function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, image_url: reader.result as string }));
    reader.readAsDataURL(file);
  }

  function setPaymentType(pt: PayType) {
    setForm(f => ({ ...f, payment_type: pt, monthly_fee: pt === 'none' ? 0 : f.monthly_fee }));
  }

  const activeSubs   = useMemo(() => subs.filter(s => s.is_active), [subs]);
  const monthlyTotal = useMemo(() =>
    activeSubs.filter(s => payType(s) === 'monthly').reduce((acc, s) => acc + (s.monthly_fee || 0), 0),
  [activeSubs]);

  const filtered = useMemo(() => {
    let list = subs.filter(s => s.is_active);
    if (catFilter !== 'all')   list = list.filter(s => s.category === catFilter);
    if (ownerFilter !== 'all') list = list.filter(s => s.owner === ownerFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || (s.provider || '').toLowerCase().includes(q));
    }
    return list;
  }, [subs, catFilter, ownerFilter, search]);

  const grouped = useMemo(() => {
    const cats = catFilter !== 'all'
      ? [catFilter]
      : SUB_CATEGORIES.filter(c => filtered.some(s => s.category === c));
    return cats.map(cat => {
      const items = filtered.filter(s => s.category === cat);
      const monthlySum = items.filter(s => payType(s) === 'monthly').reduce((acc, s) => acc + (s.monthly_fee || 0), 0);
      const onetimeCount = items.filter(s => payType(s) === 'onetime').length;
      return { cat, items, monthlySum, onetimeCount };
    });
  }, [filtered, catFilter]);

  const currentPT = form.payment_type ?? 'monthly';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 pb-24 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">מנויים וכרטיסי לקוח</h1>
        <button onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-sm font-medium active:opacity-70">
          <Plus size={15} />הוסף
        </button>
      </div>

      {/* Summary */}
      {!isLoading && (
        <div className="grid grid-cols-3 gap-2">
          <div className="p-3 rounded-xl bg-white/5 border border-white/8 text-center">
            <div className="text-[10px] text-white/40 mb-1">פעילים</div>
            <div className="text-xl font-black text-white">{activeSubs.length}</div>
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/8 text-center">
            <div className="text-[10px] text-white/40 mb-1">חודשי</div>
            <div className="text-xl font-black text-emerald-400">{fmt(monthlyTotal)}</div>
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/8 text-center">
            <div className="text-[10px] text-white/40 mb-1">שנתי</div>
            <div className="text-xl font-black text-cyan-400">{fmt(monthlyTotal * 12)}</div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute top-1/2 -translate-y-1/2 right-3 text-white/30 pointer-events-none" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם או ספק..."
          className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pr-9 pl-8 text-sm text-white placeholder:text-white/30 outline-none focus:border-cyan-500/40" />
        {search && (
          <button onClick={() => setSearch('')} className="absolute top-1/2 -translate-y-1/2 left-3 text-white/30 hover:text-white/60">
            <X size={12} />
          </button>
        )}
      </div>

      {/* Category filter chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {(['all', ...SUB_CATEGORIES] as const).map(c => (
          <button key={c} onClick={() => setCatFilter(c)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              catFilter === c ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' : 'text-white/40 border-transparent hover:text-white/60'
            }`}>
            {c === 'all' ? 'הכל' : `${CAT_META[c].emoji} ${c}`}
          </button>
        ))}
      </div>

      {/* Owner filter */}
      <div className="flex gap-1.5">
        {(['all', 'Shi', 'Ortal', 'Joint'] as const).map(o => (
          <button key={o} onClick={() => setOwnerFilter(o)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              ownerFilter === o
                ? o === 'all'   ? 'bg-white/10 text-white border-white/20'
                : o === 'Shi'   ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                : o === 'Ortal' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                :                 'bg-pink-500/20 text-pink-300 border-pink-500/30'
                : 'text-white/40 border-transparent hover:text-white/60'
            }`}>
            {o === 'all' ? 'כולם' : OWNER_META[o].label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && <div className="text-center text-white/40 py-12">טוען...</div>}

      {/* Empty state */}
      {!isLoading && grouped.length === 0 && (
        <div className="text-center text-white/40 py-16">
          <CreditCard size={36} className="mx-auto mb-3 opacity-20" />
          <div className="text-sm">אין מנויים להצגה</div>
          <button onClick={openAdd} className="mt-4 text-xs text-cyan-400 underline underline-offset-2">הוסף מנוי ראשון</button>
        </div>
      )}

      {/* Grouped list */}
      <div className="space-y-5">
        {grouped.map(({ cat, items, monthlySum, onetimeCount }) => (
          <div key={cat} className="space-y-2">

            {/* Category header */}
            <div className="flex items-center justify-between px-1 border-b border-white/5 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-base">{CAT_META[cat].emoji}</span>
                <span className="text-sm font-semibold text-white/80">{cat}</span>
                <span className="text-xs text-white/25">{items.length} מנויים</span>
              </div>
              <div className="flex items-center gap-2 text-left">
                {monthlySum > 0 && (
                  <span className="text-xs font-medium text-emerald-400">{fmt(monthlySum)}<span className="text-white/30">/חודש</span></span>
                )}
                {onetimeCount > 0 && (
                  <span className="text-xs text-amber-400/70">{onetimeCount} חד-פעמי</span>
                )}
                {monthlySum === 0 && onetimeCount === 0 && (
                  <span className="text-xs text-white/25">ללא תשלום</span>
                )}
              </div>
            </div>

            {/* Cards */}
            {items.map(sub => {
              const rb = renewalBadge(sub.renewal_date);
              const om = OWNER_META[sub.owner as keyof typeof OWNER_META] ?? OWNER_META.Joint;
              const pt = payType(sub);
              return (
                <div key={sub.id} className="flex gap-3 p-3 rounded-xl bg-white/5 border border-white/8 active:bg-white/10 transition-colors">

                  {/* Thumbnail */}
                  <div className="shrink-0 w-12 h-12 rounded-xl overflow-hidden bg-white/8 flex items-center justify-center border border-white/8">
                    {sub.image_url
                      ? <img src={sub.image_url} alt={sub.name} className="w-full h-full object-cover" />
                      : <span className="text-xl">{CAT_META[sub.category as SubCategory]?.emoji ?? '📦'}</span>
                    }
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-white text-sm leading-tight">{sub.name}</div>
                        {sub.provider && <div className="text-xs text-white/40 mt-0.5">{sub.provider}</div>}
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        <button onClick={() => openEdit(sub)} className="text-white/25 hover:text-white/60 transition-colors p-1.5 rounded-lg hover:bg-white/5">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => { if (confirm(`למחוק את "${sub.name}"?`)) del(sub.id); }}
                          className="text-white/25 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${om.cls}`}>{om.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${
                        pt === 'monthly' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                        pt === 'onetime' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                        'bg-white/5 border-white/10 text-white/40'
                      }`}>{feeLabel(sub)}</span>
                      {rb && <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${rb.cls}`}>{rb.text}</span>}
                    </div>

                    {sub.notes && <div className="text-[10px] text-white/30 mt-1.5 leading-relaxed">{sub.notes}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── Add / Edit Dialog ──────────────────────────────────────────────── */}
      {dialog && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setDialog(null); }}>
          <div dir="rtl" className="w-full max-w-md bg-slate-900 border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">

            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">{dialog === 'add' ? 'הוספת מנוי חדש' : 'עריכת מנוי'}</h2>
              <button onClick={() => setDialog(null)} className="text-white/40 hover:text-white/70 p-1"><X size={18} /></button>
            </div>

            <div className="space-y-3">

              {/* Name */}
              <div>
                <label className="text-xs text-white/50 block mb-1">שם המנוי *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder='למשל: מטמון, H&M Club, Netflix'
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-cyan-500/40" />
              </div>

              {/* Provider + Card number */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-white/50 block mb-1">ספק / מנפיק</label>
                  <input value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                    placeholder='למשל: רשות הטבע'
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-cyan-500/40" />
                </div>
                <div>
                  <label className="text-xs text-white/50 block mb-1">מספר כרטיס/מנוי</label>
                  <input value={form.card_number || ''} onChange={e => setForm(f => ({ ...f, card_number: e.target.value }))}
                    placeholder='אופציונלי'
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-cyan-500/40" />
                </div>
              </div>

              {/* Category + Owner */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-white/50 block mb-1">קטגוריה</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as SubCategory }))}
                    className="w-full bg-slate-800 border border-white/10 rounded-xl p-2.5 text-sm text-white outline-none focus:border-cyan-500/40">
                    {SUB_CATEGORIES.map(c => <option key={c} value={c}>{CAT_META[c].emoji} {c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-white/50 block mb-1">של מי</label>
                  <select value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value as 'Shi' | 'Ortal' | 'Joint' }))}
                    className="w-full bg-slate-800 border border-white/10 rounded-xl p-2.5 text-sm text-white outline-none focus:border-cyan-500/40">
                    <option value="Shi">שי</option>
                    <option value="Ortal">אורטל</option>
                    <option value="Joint">משותף</option>
                  </select>
                </div>
              </div>

              {/* Payment type segmented control */}
              <div>
                <label className="text-xs text-white/50 block mb-1.5">סוג תשלום</label>
                <div className="flex rounded-xl border border-white/10 overflow-hidden">
                  {(['none', 'monthly', 'onetime'] as const).map(pt => (
                    <button key={pt} onClick={() => setPaymentType(pt)}
                      className={`flex-1 py-2.5 text-xs font-medium transition-colors border-l border-white/10 last:border-l-0 ${
                        currentPT === pt ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/40 hover:text-white/60 bg-white/2'
                      }`}>
                      {PAY_LABELS[pt]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fee amount — only when monthly or onetime */}
              {currentPT !== 'none' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-white/50 block mb-1">
                      {currentPT === 'monthly' ? 'סכום חודשי (₪)' : 'סכום תשלום (₪)'}
                    </label>
                    <input type="number" min="0" value={form.monthly_fee}
                      onChange={e => setForm(f => ({ ...f, monthly_fee: Number(e.target.value) }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-sm text-white outline-none focus:border-cyan-500/40" />
                  </div>
                  <div>
                    <label className="text-xs text-white/50 block mb-1">
                      {currentPT === 'monthly' ? 'תאריך חידוש' : 'תאריך תשלום'}
                    </label>
                    <input type="date" value={form.renewal_date || ''}
                      onChange={e => setForm(f => ({ ...f, renewal_date: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-sm text-white outline-none focus:border-cyan-500/40" />
                  </div>
                </div>
              )}

              {/* Renewal date only — when payment is none */}
              {currentPT === 'none' && (
                <div>
                  <label className="text-xs text-white/50 block mb-1">תאריך חידוש (אופציונלי)</label>
                  <input type="date" value={form.renewal_date || ''}
                    onChange={e => setForm(f => ({ ...f, renewal_date: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-sm text-white outline-none focus:border-cyan-500/40" />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs text-white/50 block mb-1">הערות</label>
                <textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder='הערות חופשיות...'
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-cyan-500/40 resize-none" />
              </div>

              {/* Image upload */}
              <div>
                <label className="text-xs text-white/50 block mb-1">תמונת כרטיס / מנוי</label>
                <div className="flex items-center gap-2.5">
                  {form.image_url && (
                    <div className="relative w-20 h-12 rounded-lg overflow-hidden border border-white/10 shrink-0">
                      <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => setForm(f => ({ ...f, image_url: '' }))}
                        className="absolute top-0.5 left-0.5 bg-black/70 rounded-md p-0.5">
                        <X size={10} className="text-white" />
                      </button>
                    </div>
                  )}
                  <button onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white/60 hover:text-white/80 transition-colors">
                    <Image size={13} />העלה תמונה
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-2.5">
                <button onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`relative w-10 h-5 rounded-full transition-colors ${form.is_active ? 'bg-cyan-500' : 'bg-white/20'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.is_active ? 'right-0.5' : 'left-0.5'}`} />
                </button>
                <span className="text-sm text-white/60">{form.is_active ? 'פעיל' : 'לא פעיל'}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setDialog(null)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm text-white/60 hover:text-white/80 transition-colors">
                ביטול
              </button>
              <button onClick={() => save()} disabled={!form.name || isPending}
                className="flex-1 py-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-sm font-medium disabled:opacity-40 transition-colors active:bg-cyan-500/30">
                {isPending ? 'שומר...' : dialog === 'add' ? 'הוסף' : 'שמור'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
