import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, Shield, TrendingUp, Wallet, Loader2, Pencil } from 'lucide-react';
import { base44 } from '@/lib/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toaster';
import {
  Asset, ASSET_OWNERS, ASSET_INSURANCE_TYPES, ASSET_INVESTMENT_TYPES,
  AssetOwner, AssetType, AssetClass, RiskLevel,
} from '@/types';
import { formatCurrency, OWNER_LABELS } from '@/utils';

const RISK_LEVELS: RiskLevel[] = ['סולידי', 'מנייתי', 'כללי', 'נדל"ן'];

function assetIcon(type: string): string {
  if (type.includes('פנסיה') || type.includes('מנהלים')) return '🏦';
  if (type.includes('קרן')) return '📈';
  if (type.includes('ביטוח') || type.includes('בריאות') || type.includes('חיים') || type.includes('מחלות')) return '🛡️';
  if (type.includes('חיסכון')) return '💰';
  if (type.includes('משכנתא')) return '🏠';
  if (type.includes('רכב')) return '🚗';
  if (type.includes('שיניים')) return '🦷';
  if (type === 'ניירות ערך') return '📊';
  if (type === 'עו"ש') return '🏧';
  if (type === 'מט"ח') return '💱';
  if (type === 'קריפטו') return '₿';
  return '📋';
}

function emptyAsset(): Omit<Asset, 'id'> {
  return {
    owner: 'Shi',
    asset_class: 'ביטוח/קרן',
    type: 'פנסיה',
    provider: '',
    product_name: '',
    policy_number: '',
    start_date: '',
    end_date: '',
    monthly_premium: undefined,
    num_payments: undefined,
    annual_premium: undefined,
    balance: undefined,
    risk_level: undefined,
  };
}

export default function Assets() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Asset, 'id'>>(emptyAsset());

  const { data: assets = [] } = useQuery<Asset[]>({ queryKey: ['assets'], queryFn: () => base44.entities.Asset.filter() });

  const { mutate: addAsset, isPending: isAdding } = useMutation({
    mutationFn: () => base44.entities.Asset.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets'] }); closeDialog(); toast({ title: 'נכס נוסף בהצלחה!', variant: 'success' }); },
    onError: (e) => toast({ title: 'שגיאה בשמירה', description: String(e), variant: 'destructive' }),
  });

  const { mutate: updateAsset, isPending: isUpdating } = useMutation({
    mutationFn: () => base44.entities.Asset.update(editId!, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets'] }); closeDialog(); toast({ title: 'נכס עודכן בהצלחה!', variant: 'success' }); },
    onError: (e) => toast({ title: 'שגיאה בעדכון', description: String(e), variant: 'destructive' }),
  });

  const isPending = isAdding || isUpdating;

  function openAdd() {
    setEditId(null);
    setForm(emptyAsset());
    setOpen(true);
  }

  function openEdit(a: Asset) {
    setEditId(a.id);
    const { id, ...rest } = a;
    setForm(rest);
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setEditId(null);
    setForm(emptyAsset());
  }

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function switchClass(cls: AssetClass) {
    const defaultType = cls === 'ביטוח/קרן' ? 'פנסיה' : 'ניירות ערך';
    setForm((f) => ({
      ...f,
      asset_class: cls,
      type: defaultType as AssetType,
      monthly_premium: undefined,
      annual_premium: undefined,
      balance: undefined,
      risk_level: undefined,
      start_date: '',
      end_date: '',
    }));
  }

  function setMonthlyPremium(val: number | undefined) {
    setForm((f) => ({
      ...f,
      monthly_premium: val,
      annual_premium: val != null ? Math.round(val * 12) : undefined,
    }));
  }

  const isInsurance = form.asset_class !== 'נכס/השקעה';
  const typeList = isInsurance ? ASSET_INSURANCE_TYPES : ASSET_INVESTMENT_TYPES;

  const insuranceAssets = assets.filter((a) => a.asset_class !== 'נכס/השקעה');
  const investmentAssets = assets.filter((a) => a.asset_class === 'נכס/השקעה');

  // Investment summary
  const totalInvestmentBalance = investmentAssets.reduce((s, a) => s + (a.balance ?? 0), 0);
  const byInvOwner: Record<string, { balance: number; count: number }> = {};
  investmentAssets.forEach((a) => {
    if (!byInvOwner[a.owner]) byInvOwner[a.owner] = { balance: 0, count: 0 };
    byInvOwner[a.owner].balance += a.balance ?? 0;
    byInvOwner[a.owner].count++;
  });
  const byRisk: Record<string, number> = {};
  investmentAssets.forEach((a) => {
    const k = a.risk_level ?? 'לא מוגדר';
    byRisk[k] = (byRisk[k] ?? 0) + (a.balance ?? 0);
  });

  // Insurance summary
  const totalMonthlyPremium = insuranceAssets.reduce((s, a) => s + (a.monthly_premium ?? 0), 0);
  const byInsOwner: Record<string, { monthly: number; count: number }> = {};
  insuranceAssets.forEach((a) => {
    if (!byInsOwner[a.owner]) byInsOwner[a.owner] = { monthly: 0, count: 0 };
    byInsOwner[a.owner].monthly += a.monthly_premium ?? 0;
    byInsOwner[a.owner].count++;
  });
  const byInsType: Record<string, number> = {};
  insuranceAssets.forEach((a) => { byInsType[a.type] = (byInsType[a.type] ?? 0) + (a.monthly_premium ?? 0); });

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">נכסים וביטוחים</h1>
        <Button size="sm" onClick={openAdd}>
          <Plus className="w-4 h-4 ml-1" /> הוסף
        </Button>
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">רשימה</TabsTrigger>
          <TabsTrigger value="summary">סיכום</TabsTrigger>
        </TabsList>

        {/* List tab */}
        <TabsContent value="list" className="space-y-3">
          {assets.length === 0 && (
            <div className="text-center py-12 text-white/30">
              <p className="text-4xl mb-2">🛡️</p>
              <p>אין נכסים עדיין</p>
            </div>
          )}

          {investmentAssets.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-emerald-400/80 px-1">📊 נכסים והשקעות</p>
              {investmentAssets.map((a, i) => (
                <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <Card>
                    <CardContent className="py-3 px-4">
                      <div className="flex gap-3 items-start">
                        <button onClick={() => openEdit(a)} className="mt-1 text-white/30 hover:text-white/70 transition-colors shrink-0">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-white/10 flex items-center justify-center text-xl shrink-0">
                          {assetIcon(a.type)}
                        </div>
                        <div className="flex-1 min-w-0 text-right">
                          <div className="flex justify-between gap-2">
                            {a.balance != null && <p className="text-sm font-bold text-emerald-400 shrink-0">{formatCurrency(a.balance)}</p>}
                            <p className="text-sm font-semibold text-white truncate">{a.product_name}</p>
                          </div>
                          <p className="text-xs text-white/50 mt-0.5">{OWNER_LABELS[a.owner] || a.owner} · {a.provider}</p>
                          <div className="flex gap-1.5 mt-1.5 flex-wrap justify-end">
                            <Badge variant="purple" className="text-[10px]">{a.type}</Badge>
                            {a.risk_level && <Badge variant="secondary" className="text-[10px]">{a.risk_level}</Badge>}
                            {a.policy_number && <Badge variant="outline" className="text-[10px]">#{a.policy_number}</Badge>}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}

          {insuranceAssets.length > 0 && (
            <div className="space-y-2">
              {investmentAssets.length > 0 && <p className="text-xs font-semibold text-cyan-400/80 px-1 mt-3">🛡️ ביטוחים וקרנות</p>}
              {insuranceAssets.map((a, i) => (
                <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <Card>
                    <CardContent className="py-3 px-4">
                      <div className="flex gap-3 items-start">
                        <button onClick={() => openEdit(a)} className="mt-1 text-white/30 hover:text-white/70 transition-colors shrink-0">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-xl shrink-0">
                          {assetIcon(a.type)}
                        </div>
                        <div className="flex-1 min-w-0 text-right">
                          <div className="flex justify-between gap-2">
                            {a.balance != null && <p className="text-sm font-bold text-emerald-400 shrink-0">{formatCurrency(a.balance)}</p>}
                            <p className="text-sm font-semibold text-white truncate">{a.product_name}</p>
                          </div>
                          <p className="text-xs text-white/50 mt-0.5">{OWNER_LABELS[a.owner] || a.owner} · {a.provider}</p>
                          <div className="flex gap-1.5 mt-1.5 flex-wrap justify-end">
                            <Badge variant="purple" className="text-[10px]">{a.type}</Badge>
                            {a.monthly_premium != null && <Badge variant="secondary" className="text-[10px]">{formatCurrency(a.monthly_premium)}/חודש</Badge>}
                            {a.policy_number && <Badge variant="outline" className="text-[10px]">#{a.policy_number}</Badge>}
                            {a.start_date && <Badge variant="outline" className="text-[10px]">{a.start_date}</Badge>}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Summary tab */}
        <TabsContent value="summary">
          <Tabs defaultValue="investments">
            <TabsList className="w-full">
              <TabsTrigger value="investments" className="flex-1">📊 השקעות</TabsTrigger>
              <TabsTrigger value="insurance" className="flex-1">🛡️ ביטוחים</TabsTrigger>
            </TabsList>

            {/* Investments sub-tab */}
            <TabsContent value="investments" className="space-y-4 mt-3">
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <TrendingUp className="w-6 h-6 mx-auto mb-1 text-emerald-400" />
                  <p className="text-lg font-bold text-emerald-400">{formatCurrency(totalInvestmentBalance)}</p>
                  <p className="text-[11px] text-white/40 mt-0.5">סה"כ יתרות השקעה</p>
                </CardContent>
              </Card>

              {Object.keys(byInvOwner).length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">לפי בעלים</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {Object.entries(byInvOwner).map(([owner, { balance, count }]) => (
                      <div key={owner} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                        <p className="text-sm font-bold text-emerald-400">{formatCurrency(balance)}</p>
                        <div className="text-right">
                          <p className="text-sm text-white font-medium">{OWNER_LABELS[owner] || owner}</p>
                          <p className="text-xs text-white/40">{count} נכסים</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {Object.keys(byRisk).length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">לפי רמת סיכון</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {Object.entries(byRisk).map(([risk, balance]) => (
                      <div key={risk} className="flex justify-between py-1.5 border-b border-white/5 last:border-0">
                        <span className="text-sm font-medium text-emerald-400">{formatCurrency(balance)}</span>
                        <span className="text-sm text-white">{risk}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {investmentAssets.length === 0 && (
                <p className="text-center text-white/30 py-8 text-sm">אין נכסים/השקעות</p>
              )}
            </TabsContent>

            {/* Insurance sub-tab */}
            <TabsContent value="insurance" className="space-y-4 mt-3">
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <Shield className="w-6 h-6 mx-auto mb-1 text-cyan-400" />
                  <p className="text-lg font-bold text-cyan-400">{formatCurrency(totalMonthlyPremium)}/חודש</p>
                  <p className="text-[11px] text-white/40 mt-0.5">סה"כ פרמיה חודשית</p>
                </CardContent>
              </Card>

              {Object.keys(byInsOwner).length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">לפי בעלים</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {Object.entries(byInsOwner).map(([owner, { monthly, count }]) => (
                      <div key={owner} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                        <div className="text-left">
                          {monthly > 0 && <p className="text-sm font-bold text-cyan-400">{formatCurrency(monthly)}/חודש</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-white font-medium">{OWNER_LABELS[owner] || owner}</p>
                          <p className="text-xs text-white/40">{count} פוליסות</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {Object.keys(byInsType).length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">לפי סוג ביטוח</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {Object.entries(byInsType).map(([type, monthly]) => (
                      <div key={type} className="flex justify-between py-1.5 border-b border-white/5 last:border-0">
                        <span className="text-sm font-medium text-cyan-400">{formatCurrency(monthly)}/חודש</span>
                        <span className="text-sm text-white">{type}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {insuranceAssets.length === 0 && (
                <p className="text-center text-white/30 py-8 text-sm">אין ביטוחים/קרנות</p>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* Add / Edit dialog */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? 'עריכת נכס / ביטוח' : 'הוסף נכס / ביטוח'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">

            {/* Class toggle */}
            <div className="flex rounded-xl overflow-hidden border border-white/15">
              {(['ביטוח/קרן', 'נכס/השקעה'] as AssetClass[]).map((cls) => (
                <button
                  key={cls}
                  onClick={() => switchClass(cls)}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    form.asset_class === cls
                      ? cls === 'נכס/השקעה'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-cyan-600 text-white'
                      : 'bg-white/5 text-white/50 hover:bg-white/10'
                  }`}
                >
                  {cls === 'ביטוח/קרן' ? '🛡️ ביטוח / קרן' : '📊 נכס / השקעה'}
                </button>
              ))}
            </div>

            {/* Owner + Type */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block">בעלים</Label>
                <select value={form.owner} onChange={(e) => set('owner', e.target.value as AssetOwner)} className="w-full h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none" dir="rtl">
                  {ASSET_OWNERS.map((o) => <option key={o} value={o} className="bg-slate-800">{OWNER_LABELS[o] || o}</option>)}
                </select>
              </div>
              <div>
                <Label className="mb-1 block">סוג</Label>
                <select value={form.type} onChange={(e) => set('type', e.target.value as AssetType)} className="w-full h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none" dir="rtl">
                  {typeList.map((t) => <option key={t} value={t} className="bg-slate-800">{t}</option>)}
                </select>
              </div>
            </div>

            {/* Product name + provider */}
            <div>
              <Label className="mb-1 block">שם מוצר</Label>
              <Input value={form.product_name} onChange={(e) => set('product_name', e.target.value)} placeholder="שם המוצר / פוליסה" dir="rtl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block">חברה מנהלת</Label>
                <Input value={form.provider} onChange={(e) => set('provider', e.target.value)} placeholder="כלל, מגדל..." dir="rtl" />
              </div>
              <div>
                <Label className="mb-1 block">מספר פוליסה</Label>
                <Input value={form.policy_number ?? ''} onChange={(e) => set('policy_number', e.target.value)} placeholder="000000" />
              </div>
            </div>

            {/* ── ביטוח/קרן fields ── */}
            {isInsurance && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1 block">פרמיה חודשית (₪)</Label>
                    <Input
                      type="number"
                      value={form.monthly_premium ?? ''}
                      onChange={(e) => setMonthlyPremium(e.target.value ? parseFloat(e.target.value) : undefined)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block">פרמיה שנתית (₪)</Label>
                    <Input
                      type="number"
                      value={form.annual_premium ?? ''}
                      onChange={(e) => set('annual_premium', e.target.value ? parseFloat(e.target.value) : undefined)}
                      placeholder="מחושב אוטומטית ×12"
                      className="bg-white/3 text-white/60"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1 block">תאריך התחלה</Label>
                    <Input type="date" value={form.start_date ?? ''} onChange={(e) => set('start_date', e.target.value)} />
                  </div>
                  <div>
                    <Label className="mb-1 block">תאריך סיום</Label>
                    <Input type="date" value={form.end_date ?? ''} onChange={(e) => set('end_date', e.target.value)} />
                  </div>
                </div>
              </>
            )}

            {/* ── נכס/השקעה fields ── */}
            {!isInsurance && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block">יתרה נוכחית (₪)</Label>
                  <Input
                    type="number"
                    value={form.balance ?? ''}
                    onChange={(e) => set('balance', e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label className="mb-1 block">רמת סיכון</Label>
                  <select
                    value={form.risk_level ?? ''}
                    onChange={(e) => set('risk_level', (e.target.value as RiskLevel) || undefined)}
                    className="w-full h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:outline-none"
                    dir="rtl"
                  >
                    <option value="" className="bg-slate-800">— בחר —</option>
                    {RISK_LEVELS.map((r) => <option key={r} value={r} className="bg-slate-800">{r}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>ביטול</Button>
            <Button onClick={() => editId ? updateAsset() : addAsset()} disabled={isPending || !form.product_name || !form.provider}>
              {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> שומר...</> : 'שמור'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
