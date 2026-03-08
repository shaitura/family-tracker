import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, Shield, TrendingUp, Wallet, Loader2, Pencil } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
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
  if (type === 'קרן השתלמות') return '📈';
  if (type.includes('קופת גמל')) return '🏺';
  if (type.includes('חיסכון לכל ילד')) return '👶';
  if (type.includes('ביטוח') || type.includes('בריאות') || type.includes('חיים') || type.includes('מחלות')) return '🛡️';
  if (type.includes('חיסכון')) return '💰';
  if (type.includes('משכנתא')) return '🏠';
  if (type === 'מבנה' || type === 'תכולה' || type === 'מבנה + תכולה') return '🏡';
  if (type.includes('רכב')) return '🚗';
  if (type.includes('שיניים')) return '🦷';
  if (type.includes('סיעוד')) return '🏥';
  if (type.includes('ריסק') || type.includes('אובדן כושר')) return '⚕️';
  if (type === 'ניירות ערך') return '📊';
  if (type === 'מניות RSU') return '🏢';
  if (type === 'חשבון מסחר עצמאי') return '💹';
  if (type === 'עו"ש') return '🏧';
  if (type === 'מט"ח') return '💱';
  if (type === 'קרקע') return '🌍';
  if (type === 'קריפטו') return '₿';
  if (type === 'אחר') return '🗂️';
  return '📋';
}

// Color per asset type — returns Tailwind classes for bg + text + border
function typeColorClass(type: string): string {
  // Investment types
  if (type === 'ניירות ערך' || type === 'מניות RSU' || type === 'חשבון מסחר עצמאי')
    return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
  if (type === 'קרן השתלמות')
    return 'bg-purple-500/20 text-purple-300 border border-purple-500/30';
  if (type.includes('קופת גמל') || type.includes('חיסכון לכל ילד'))
    return 'bg-pink-500/20 text-pink-300 border border-pink-500/30';
  if (type === 'עו"ש')
    return 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30';
  if (type === 'מט"ח')
    return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
  if (type === 'קרקע')
    return 'bg-orange-500/20 text-orange-300 border border-orange-500/30';
  if (type === 'קריפטו')
    return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30';

  // Insurance types
  if (type.includes('פנסיה') || type.includes('מנהלים'))
    return 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30';
  if (type.includes('ריסק') || type.includes('אובדן כושר') || type.includes('מחלות'))
    return 'bg-red-500/20 text-red-300 border border-red-500/30';
  if (type.includes('חיים'))
    return 'bg-rose-500/20 text-rose-300 border border-rose-500/30';
  if (type.includes('בריאות') || type.includes('שיניים') || type.includes('סיעוד') || type.includes('קופת חולים') || type.includes('אסותא'))
    return 'bg-teal-500/20 text-teal-300 border border-teal-500/30';
  if (type.includes('רכב'))
    return 'bg-slate-400/20 text-slate-300 border border-slate-400/30';
  if (type.includes('מבנה') || type.includes('תכולה'))
    return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
  if (type === 'משכנתא')
    return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';

  return 'bg-white/10 text-white/70 border border-white/15';
}

// Map known Israeli financial providers to their website domain
const PROVIDER_DOMAINS: Record<string, string> = {
  'כלל': 'klal.co.il',
  'מגדל': 'migdal.co.il',
  'הפניקס': 'fnx.co.il',
  'פניקס': 'fnx.co.il',
  'מנורה': 'menora-mivt.co.il',
  'הראל': 'harel-group.co.il',
  'אלטשולר': 'as-invest.co.il',
  'אלטשולר שחם': 'as-invest.co.il',
  'מיטב': 'meitav.co.il',
  'מיטב דש': 'meitav.co.il',
  'אנליסט': 'analyst.co.il',
  'ילין לפידות': 'yalinlapidot.co.il',
  'ילין': 'yalinlapidot.co.il',
  'פסגות': 'psagot.co.il',
  'אקסלנס': 'xnes.co.il',
  'ibi': 'ibi.co.il',
  'IBI': 'ibi.co.il',
  'לאומי': 'leumi.co.il',
  'הפועלים': 'bankhapoalim.co.il',
  'דיסקונט': 'discountbank.co.il',
  'מזרחי': 'mizrahi-tefahot.co.il',
  'בנק מזרחי': 'mizrahi-tefahot.co.il',
  'עמיתים': 'amitim.co.il',
  'מור': 'moreinvest.co.il',
  'הכשרה': 'hachshara.co.il',
  'איילון': 'ayalon.co.il',
  'הסתדרות': 'kupat-cholim.co.il',
  'ביטוח לאומי': 'btl.gov.il',
  'מכבי': 'maccabi.co.il',
  'כללית': 'clalit.co.il',
  'מאוחדת': 'meuhedet.co.il',
  'לאומית': 'leumit.co.il',
  'UBS': 'ubs.com',
  'ubs': 'ubs.com',
  'ביטוח ישיר': '555.co.il',
  'ישיר': '555.co.il',
  'ליברה': 'lbr.co.il',
};

function providerLogoUrls(provider: string): string[] | null {
  const normalized = provider.trim().toLowerCase();
  for (const [key, domain] of Object.entries(PROVIDER_DOMAINS)) {
    if (normalized.includes(key.toLowerCase())) {
      return [
        `https://www.${domain}/apple-touch-icon.png`,
        `https://${domain}/apple-touch-icon.png`,
        `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
      ];
    }
  }
  return null;
}

function ProviderAvatar({ provider, isInvestment }: { provider: string; isInvestment: boolean }) {
  const urls = providerLogoUrls(provider);
  const initials = provider.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('');
  const gradient = isInvestment
    ? 'from-emerald-500/30 to-cyan-500/30'
    : 'from-cyan-500/30 to-purple-500/30';

  if (urls) {
    const tryNext = (img: HTMLImageElement, idx: number) => {
      if (idx < urls.length) {
        img.src = urls[idx];
      } else {
        img.style.display = 'none';
        const fb = img.nextElementSibling as HTMLElement | null;
        if (fb) fb.style.display = 'flex';
      }
    };
    return (
      <div className={`w-12 h-12 rounded-2xl bg-white/95 border border-white/20 flex items-center justify-center shrink-0 overflow-hidden p-1.5`}>
        <img
          src={urls[0]}
          alt={provider}
          className="w-full h-full object-contain"
          onError={(e) => {
            const img = e.currentTarget;
            const cur = urls.indexOf(img.src);
            tryNext(img, cur + 1);
          }}
        />
        <span className={`text-white font-bold text-sm hidden items-center justify-center w-full h-full bg-gradient-to-br ${gradient} rounded-2xl`}>
          {initials}
        </span>
      </div>
    );
  }

  return (
    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${gradient} border border-white/10 flex items-center justify-center shrink-0`}>
      <span className="text-white font-bold text-sm">{initials}</span>
    </div>
  );
}

// Hex colors for charts
function typeChartColor(type: string): string {
  if (type === 'ניירות ערך' || type === 'מניות RSU' || type === 'חשבון מסחר עצמאי' || type === 'משכנתא') return '#10b981';
  if (type === 'קרן השתלמות') return '#a855f7';
  if (type.includes('קופת גמל') || type.includes('חיסכון לכל ילד')) return '#ec4899';
  if (type === 'עו"ש') return '#06b6d4';
  if (type === 'מט"ח') return '#f59e0b';
  if (type === 'קרקע' || type === 'נדל"ן') return '#f97316';
  if (type === 'קריפטו') return '#eab308';
  if (type.includes('פנסיה') || type.includes('מנהלים')) return '#6366f1';
  if (type.includes('ריסק') || type.includes('אובדן כושר') || type.includes('מחלות')) return '#ef4444';
  if (type.includes('חיים')) return '#f43f5e';
  if (type.includes('בריאות') || type.includes('שיניים') || type.includes('סיעוד') || type.includes('קופת חולים') || type.includes('אסותא')) return '#14b8a6';
  if (type.includes('רכב')) return '#94a3b8';
  if (type.includes('מבנה') || type.includes('תכולה')) return '#f59e0b';
  return '#6b7280';
}

const OWNER_CHART_COLORS: Record<string, string> = {
  Shi: '#06b6d4', Ortal: '#ec4899', Yuval: '#a855f7', Aviv: '#10b981',
  Ziv: '#f59e0b', Joint: '#6366f1', Car_Private: '#94a3b8', Apt_Rent: '#f97316', Apt_Own: '#f97316',
};

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-white/15 rounded-lg px-3 py-2 text-xs" dir="rtl">
      <p className="text-white font-medium mb-0.5">{payload[0].name}</p>
      <p className="text-emerald-400 font-bold">{payload[0].value.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })}</p>
    </div>
  );
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

  // Chart data
  const byInvType: Record<string, number> = {};
  investmentAssets.forEach((a) => { byInvType[a.type] = (byInvType[a.type] ?? 0) + (a.balance ?? 0); });

  const invTypeChartData = Object.entries(byInvType)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value, color: typeChartColor(name) }));

  const invOwnerChartData = Object.entries(byInvOwner)
    .filter(([, { balance }]) => balance > 0)
    .sort(([, a], [, b]) => b.balance - a.balance)
    .map(([owner, { balance, count }]) => ({
      name: OWNER_LABELS[owner] || owner, value: balance, count,
      color: OWNER_CHART_COLORS[owner] || '#6b7280',
    }));

  const insTypeChartData = Object.entries(byInsType)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value, color: typeChartColor(name) }));

  const insOwnerChartData = Object.entries(byInsOwner)
    .filter(([, { monthly }]) => monthly > 0)
    .sort(([, a], [, b]) => b.monthly - a.monthly)
    .map(([owner, { monthly, count }]) => ({
      name: OWNER_LABELS[owner] || owner, value: monthly, count,
      color: OWNER_CHART_COLORS[owner] || '#6b7280',
    }));

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
            <div className="space-y-3">
              <p className="text-xs font-semibold text-emerald-400/80 px-1">📊 נכסים והשקעות</p>
              {investmentAssets.map((a, i) => (
                <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <Card className="border border-emerald-500/10">
                    <CardContent className="py-4 px-4">
                      <div className="flex gap-3 items-center">
                        {/* Provider logo / initials */}
                        <ProviderAvatar provider={a.provider} isInvestment={true} />

                        {/* Content */}
                        <div className="flex-1 min-w-0 text-right">
                          {/* Top row: product name + balance */}
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="text-left shrink-0">
                              {a.balance != null && (
                                <p className="text-base font-bold text-emerald-400 leading-tight">{formatCurrency(a.balance)}</p>
                              )}
                            </div>
                            <p className="text-base font-semibold text-white leading-tight truncate">{a.product_name}</p>
                          </div>

                          {/* Provider name + owner */}
                          <div className="flex items-center justify-end gap-1.5 mb-2">
                            <span className="text-sm text-white/60 font-medium">{a.provider}</span>
                            <span className="text-white/25">·</span>
                            <span className="text-xs text-white/40">{OWNER_LABELS[a.owner] || a.owner}</span>
                          </div>

                          {/* Badges row */}
                          <div className="flex gap-1.5 flex-wrap justify-end">
                            <Badge className={`text-xs gap-1 ${typeColorClass(a.type)}`}>
                              <span>{assetIcon(a.type)}</span>{a.type}
                            </Badge>
                            {a.risk_level && <Badge variant="secondary" className="text-xs">{a.risk_level}</Badge>}
                            {a.policy_number && <Badge variant="outline" className="text-xs">#{a.policy_number}</Badge>}
                          </div>
                        </div>

                        {/* Edit button */}
                        <button onClick={() => openEdit(a)} className="text-white/25 hover:text-white/70 transition-colors shrink-0 self-start">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}

          {insuranceAssets.length > 0 && (
            <div className="space-y-3">
              {investmentAssets.length > 0 && <p className="text-xs font-semibold text-cyan-400/80 px-1 mt-2">🛡️ ביטוחים וקרנות</p>}
              {insuranceAssets.map((a, i) => (
                <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <Card className="border border-cyan-500/10">
                    <CardContent className="py-4 px-4">
                      <div className="flex gap-3 items-center">
                        {/* Provider logo / initials */}
                        <ProviderAvatar provider={a.provider} isInvestment={false} />

                        {/* Content */}
                        <div className="flex-1 min-w-0 text-right">
                          {/* Top row: product name + premium */}
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="text-left shrink-0">
                              {a.monthly_premium != null && (
                                <p className="text-base font-bold text-cyan-400 leading-tight">{formatCurrency(a.monthly_premium)}<span className="text-xs font-normal text-white/40">/חודש</span></p>
                              )}
                            </div>
                            <p className="text-base font-semibold text-white leading-tight truncate">{a.product_name}</p>
                          </div>

                          {/* Provider name + owner */}
                          <div className="flex items-center justify-end gap-1.5 mb-2">
                            <span className="text-sm text-white/60 font-medium">{a.provider}</span>
                            <span className="text-white/25">·</span>
                            <span className="text-xs text-white/40">{OWNER_LABELS[a.owner] || a.owner}</span>
                          </div>

                          {/* Badges row */}
                          <div className="flex gap-1.5 flex-wrap justify-end">
                            <Badge className={`text-xs gap-1 ${typeColorClass(a.type)}`}>
                              <span>{assetIcon(a.type)}</span>{a.type}
                            </Badge>
                            {a.policy_number && <Badge variant="outline" className="text-xs">#{a.policy_number}</Badge>}
                            {a.start_date && <Badge variant="outline" className="text-xs">{a.start_date}</Badge>}
                          </div>
                        </div>

                        {/* Edit button */}
                        <button onClick={() => openEdit(a)} className="text-white/25 hover:text-white/70 transition-colors shrink-0 self-start">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
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

              {invTypeChartData.length > 0 && (
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="text-sm">חלוקה לפי סוג</CardTitle></CardHeader>
                  <CardContent className="pt-0">
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={invTypeChartData} cx="50%" cy="50%" innerRadius={52} outerRadius={80} dataKey="value" nameKey="name" strokeWidth={0}>
                          {invTypeChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5 mt-1" dir="rtl">
                      {invTypeChartData.map((entry) => {
                        const pct = totalInvestmentBalance > 0 ? (entry.value / totalInvestmentBalance) * 100 : 0;
                        return (
                          <div key={entry.name} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: entry.color }} />
                            <span className="text-xs text-white/80 flex-1">{entry.name}</span>
                            <div className="w-16 bg-white/5 rounded-full h-1.5 shrink-0">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: entry.color }} />
                            </div>
                            <span className="text-xs font-medium w-8 text-left shrink-0 text-white/50">{Math.round(pct)}%</span>
                            <span className="text-xs font-bold shrink-0" style={{ color: entry.color }}>{formatCurrency(entry.value)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {invOwnerChartData.length > 0 && (
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="text-sm">לפי בעלים</CardTitle></CardHeader>
                  <CardContent className="space-y-2 pt-0" dir="rtl">
                    {invOwnerChartData.map((entry) => {
                      const pct = totalInvestmentBalance > 0 ? (entry.value / totalInvestmentBalance) * 100 : 0;
                      return (
                        <div key={entry.name}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-bold" style={{ color: entry.color }}>{formatCurrency(entry.value)}</span>
                            <span className="text-white/70">{entry.name} · {entry.count} נכסים</span>
                          </div>
                          <div className="w-full bg-white/5 rounded-full h-2">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: entry.color }} />
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

              {Object.keys(byRisk).length > 0 && (
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="text-sm">לפי רמת סיכון</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5 pt-0" dir="rtl">
                    {Object.entries(byRisk).map(([risk, balance]) => {
                      const pct = totalInvestmentBalance > 0 ? (balance / totalInvestmentBalance) * 100 : 0;
                      return (
                        <div key={risk}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-bold text-emerald-400">{formatCurrency(balance)}</span>
                            <span className="text-white/70">{risk}</span>
                          </div>
                          <div className="w-full bg-white/5 rounded-full h-1.5">
                            <div className="h-full rounded-full bg-emerald-500/70 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
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

              {insTypeChartData.length > 0 && (
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="text-sm">חלוקה לפי סוג ביטוח</CardTitle></CardHeader>
                  <CardContent className="pt-0">
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={insTypeChartData} cx="50%" cy="50%" innerRadius={52} outerRadius={80} dataKey="value" nameKey="name" strokeWidth={0}>
                          {insTypeChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5 mt-1" dir="rtl">
                      {insTypeChartData.map((entry) => {
                        const pct = totalMonthlyPremium > 0 ? (entry.value / totalMonthlyPremium) * 100 : 0;
                        return (
                          <div key={entry.name} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: entry.color }} />
                            <span className="text-xs text-white/80 flex-1">{entry.name}</span>
                            <div className="w-16 bg-white/5 rounded-full h-1.5 shrink-0">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: entry.color }} />
                            </div>
                            <span className="text-xs font-medium w-8 text-left shrink-0 text-white/50">{Math.round(pct)}%</span>
                            <span className="text-xs font-bold shrink-0" style={{ color: entry.color }}>{formatCurrency(entry.value)}/חודש</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {insOwnerChartData.length > 0 && (
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="text-sm">לפי בעלים</CardTitle></CardHeader>
                  <CardContent className="space-y-2 pt-0" dir="rtl">
                    {insOwnerChartData.map((entry) => {
                      const pct = totalMonthlyPremium > 0 ? (entry.value / totalMonthlyPremium) * 100 : 0;
                      return (
                        <div key={entry.name}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-bold" style={{ color: entry.color }}>{formatCurrency(entry.value)}/חודש</span>
                            <span className="text-white/70">{entry.name} · {entry.count} פוליסות</span>
                          </div>
                          <div className="w-full bg-white/5 rounded-full h-2">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: entry.color }} />
                          </div>
                        </div>
                      );
                    })}
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
