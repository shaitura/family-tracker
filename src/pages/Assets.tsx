import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, Shield, TrendingUp, Wallet, Loader2 } from 'lucide-react';
import { base44 } from '@/lib/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toaster';
import { Asset, ASSET_OWNERS, ASSET_TYPES, AssetOwner, AssetType } from '@/types';
import { formatCurrency, OWNER_LABELS } from '@/utils';

function assetIcon(type: string): string {
  if (type.includes('פנסיה') || type.includes('מנהלים')) return '🏦';
  if (type.includes('קרן')) return '📈';
  if (type.includes('ביטוח') || type.includes('בריאות') || type.includes('חיים') || type.includes('מחלות')) return '🛡️';
  if (type.includes('חיסכון')) return '💰';
  if (type.includes('משכנתא')) return '🏠';
  if (type.includes('רכב')) return '🚗';
  if (type.includes('שיניים')) return '🦷';
  return '📋';
}

function emptyAsset(): Omit<Asset, 'id'> {
  return { owner: 'Shi', type: 'פנסיה', provider: '', product_name: '', policy_number: '', start_date: '', end_date: '', monthly_premium: undefined, num_payments: undefined, annual_premium: undefined, balance: undefined };
}

export default function Assets() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Omit<Asset, 'id'>>(emptyAsset());

  const { data: assets = [] } = useQuery<Asset[]>({ queryKey: ['assets'], queryFn: () => base44.entities.Asset.filter() });

  const { mutate: addAsset, isPending } = useMutation({
    mutationFn: () => base44.entities.Asset.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets'] }); setOpen(false); setForm(emptyAsset()); toast({ title: 'נכס נוסף בהצלחה!', variant: 'success' }); },
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Summary calculations
  const totalBalance = assets.reduce((s, a) => s + (a.balance ?? 0), 0);
  const totalMonthlyPremium = assets.reduce((s, a) => s + (a.monthly_premium ?? 0), 0);
  const totalAnnualPremium = assets.reduce((s, a) => s + (a.annual_premium ?? 0), 0);

  const byOwner: Record<string, { balance: number; monthly: number; count: number }> = {};
  assets.forEach((a) => {
    if (!byOwner[a.owner]) byOwner[a.owner] = { balance: 0, monthly: 0, count: 0 };
    byOwner[a.owner].balance += a.balance ?? 0;
    byOwner[a.owner].monthly += a.monthly_premium ?? 0;
    byOwner[a.owner].count++;
  });

  const insuranceTypes = ['ביטוח חיים', 'בריאות', 'רכב חובה', 'רכב מקיף', "צד ג'", 'מחלות קשות', 'שיניים', 'סיעוד', 'מבנה', 'תכולה', 'מבנה+תכולה', 'אסותא', 'כללית'];
  const byType: Record<string, number> = {};
  assets.filter((a) => insuranceTypes.includes(a.type)).forEach((a) => {
    byType[a.type] = (byType[a.type] ?? 0) + (a.monthly_premium ?? 0);
  });

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">נכסים וביטוחים</h1>
        <Button size="sm" onClick={() => setOpen(true)}>
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
          {assets.map((a, i) => (
            <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card>
                <CardContent className="py-3 px-4">
                  <div className="flex gap-3 items-start">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-xl shrink-0">
                      {assetIcon(a.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-2">
                        <p className="text-sm font-semibold text-white truncate">{a.product_name}</p>
                        {a.balance != null && <p className="text-sm font-bold text-emerald-400 shrink-0">{formatCurrency(a.balance)}</p>}
                      </div>
                      <p className="text-xs text-white/50 mt-0.5">{a.provider} · {OWNER_LABELS[a.owner] || a.owner}</p>
                      <div className="flex gap-1.5 mt-1.5 flex-wrap">
                        <Badge variant="purple" className="text-[10px]">{a.type}</Badge>
                        {a.monthly_premium && <Badge variant="secondary" className="text-[10px]">{formatCurrency(a.monthly_premium)}/חודש</Badge>}
                        {a.policy_number && <Badge variant="outline" className="text-[10px]">#{a.policy_number}</Badge>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </TabsContent>

        {/* Summary tab */}
        <TabsContent value="summary" className="space-y-4">
          {/* Totals */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: TrendingUp, label: 'יתרות', value: formatCurrency(totalBalance), color: 'text-emerald-400' },
              { icon: Shield, label: 'פרמיה חודשית', value: formatCurrency(totalMonthlyPremium), color: 'text-cyan-400' },
              { icon: Wallet, label: 'פרמיה שנתית', value: formatCurrency(totalAnnualPremium), color: 'text-purple-400' },
            ].map(({ icon: Icon, label, value, color }) => (
              <Card key={label}>
                <CardContent className="pt-3 pb-3 text-center">
                  <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
                  <p className={`text-sm font-bold ${color}`}>{value}</p>
                  <p className="text-[10px] text-white/40 mt-0.5">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* By owner */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">לפי בעלים</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(byOwner).map(([owner, { balance, monthly, count }]) => (
                <div key={owner} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                  <div>
                    <p className="text-sm text-white font-medium">{OWNER_LABELS[owner] || owner}</p>
                    <p className="text-xs text-white/40">{count} נכסים</p>
                  </div>
                  <div className="text-left">
                    {balance > 0 && <p className="text-sm font-bold text-emerald-400">{formatCurrency(balance)}</p>}
                    {monthly > 0 && <p className="text-xs text-cyan-400">{formatCurrency(monthly)}/חודש</p>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Insurance by type */}
          {Object.keys(byType).length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">ביטוחים לפי סוג</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(byType).map(([type, monthly]) => (
                  <div key={type} className="flex justify-between py-1.5 border-b border-white/5 last:border-0">
                    <span className="text-sm text-white">{type}</span>
                    <span className="text-sm font-medium text-cyan-400">{formatCurrency(monthly)}/חודש</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Add dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הוסף נכס / ביטוח</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
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
                  {ASSET_TYPES.map((t) => <option key={t} value={t} className="bg-slate-800">{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label className="mb-1 block">שם מוצר</Label>
              <Input value={form.product_name} onChange={(e) => set('product_name', e.target.value)} placeholder="שם המוצר/פוליסה" dir="rtl" />
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block">פרמיה חודשית (₪)</Label>
                <Input type="number" value={form.monthly_premium ?? ''} onChange={(e) => set('monthly_premium', e.target.value ? parseFloat(e.target.value) : undefined)} placeholder="0" />
              </div>
              <div>
                <Label className="mb-1 block">יתרה (₪)</Label>
                <Input type="number" value={form.balance ?? ''} onChange={(e) => set('balance', e.target.value ? parseFloat(e.target.value) : undefined)} placeholder="0" />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
            <Button onClick={() => addAsset()} disabled={isPending || !form.product_name || !form.provider}>
              {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> שומר...</> : 'שמור'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
