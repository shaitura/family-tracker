import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Car, Plus, Trash2, ChevronDown, ChevronUp, Gauge,
  TrendingUp, TrendingDown, Info, Wallet, AlertTriangle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { base44 } from '@/lib/base44Client';
import { MileageSettings, MileageReading } from '@/types';
import { formatDate, formatCurrency } from '@/utils';
import { useToast } from '@/components/ui/toaster';
import {
  computeExcessPenalty, ExcessPenalty,
  PENALTY_FREE_KM, TIER_1_KM, TIER_1_RATE, TIER_2_RATE,
} from '@/lib/leasePenalty';

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function fmtKm(n: number): string {
  return Math.round(n).toLocaleString('he-IL');
}

// ── Excess-penalty UI ─────────────────────────────────────────────────────────

type PenaltyTone = 'ok' | 'warn' | 'danger';

const TONE_STYLES: Record<PenaltyTone, { box: string; text: string }> = {
  ok:     { box: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-400' },
  warn:   { box: 'bg-yellow-500/10 border-yellow-500/20',   text: 'text-yellow-400'  },
  danger: { box: 'bg-rose-500/10 border-rose-500/20',       text: 'text-rose-400'    },
};

/**
 * The tiered breakdown behind the number on the card face. The total alone can't
 * show that the 2,001st excess km costs 2.07× the 2,000th, so this spells out
 * how many km landed in each tier and what each one cost.
 */
function PenaltyBreakdown({ km, penalty, scopeLabel }: {
  km: number;
  penalty: ExcessPenalty;
  scopeLabel: string;
}) {
  return (
    <div className="space-y-2.5 text-right" dir="rtl">
      <p className="text-sm font-semibold text-white">איך מחושב הקנס</p>
      <p className="text-xs text-white/50 leading-relaxed">
        לפי סעיף 10.2 בפוליסת הליסינג, מעל {fmtKm(PENALTY_FREE_KM)} ק"מ בשנה התשלום מדורג — ולכן
        לא כל ק"מ חורג עולה אותו דבר.
      </p>

      <div className="bg-white/5 rounded-xl p-2.5 space-y-1.5 text-xs">
        <div className="flex justify-between gap-2">
          <span className="text-white/50">{scopeLabel}</span>
          <span className="text-white/80 font-medium">{fmtKm(km)} ק"מ</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-white/50">מעל {fmtKm(PENALTY_FREE_KM)}</span>
          <span className="text-white/80 font-medium">{fmtKm(penalty.excessKm)} ק"מ</span>
        </div>
      </div>

      {penalty.excessKm === 0 ? (
        <p className="text-xs text-emerald-400">אין חריגה — לא חל תשלום.</p>
      ) : (
        <div className="space-y-1.5 text-xs">
          {penalty.tier1Km > 0 && (
            <div className="flex justify-between gap-2">
              <span className="text-white/50">
                {fmtKm(penalty.tier1Km)} ק"מ × {TIER_1_RATE} ₪
              </span>
              <span className="text-white/80 font-medium">{formatCurrency(penalty.tier1Cost)}</span>
            </div>
          )}
          {penalty.tier2Km > 0 && (
            <div className="flex justify-between gap-2">
              <span className="text-white/50">
                {fmtKm(penalty.tier2Km)} ק"מ × {TIER_2_RATE} ₪
              </span>
              <span className="text-white/80 font-medium">{formatCurrency(penalty.tier2Cost)}</span>
            </div>
          )}
          <div className="flex justify-between gap-2 pt-1.5 border-t border-white/10">
            <span className="text-white/70 font-semibold">סה"כ</span>
            <span className="text-white font-bold">{formatCurrency(penalty.total)}</span>
          </div>
        </div>
      )}

      {penalty.excessKm === 0 ? (
        <p className="text-xs text-white/40 leading-relaxed">
          עוד {fmtKm(PENALTY_FREE_KM - km)} ק"מ עד שמתחיל החיוב, בתעריף {TIER_1_RATE} ₪ לק"מ.
        </p>
      ) : penalty.kmUntilTier2 > 0 ? (
        <p className="text-xs text-white/40 leading-relaxed">
          עוד {fmtKm(penalty.kmUntilTier2)} ק"מ ותיכנס למדרגת {TIER_2_RATE} ₪ לק"מ — יותר מכפול
          מ-{TIER_1_RATE} ₪.
        </p>
      ) : (
        <p className="text-xs text-white/40 leading-relaxed">
          כבר במדרגה השנייה — כל ק"מ נוסף עולה {TIER_2_RATE} ₪.
        </p>
      )}

      <p className="text-[11px] text-white/30 leading-relaxed border-t border-white/10 pt-2">
        {fmtKm(TIER_1_KM)} הק"מ החורגים הראשונים בכל שנה ב-{TIER_1_RATE} ₪, וכל ק"מ חריגה נוסף
        ב-{TIER_2_RATE} ₪ (לרכב בנזין ודיזל). המדרגות מתאפסות בכל שנת חוזה. הפוליסה מציינת
        שגובה התשלום ייבחן מעת לעת וישתנה לפי צורך.
      </p>
    </div>
  );
}

function PenaltyCard({ title, subtitle, km, penalty, scopeLabel, tone, icon, emptyText }: {
  title: string;
  subtitle: string;
  km: number;
  penalty: ExcessPenalty;
  scopeLabel: string;
  tone: PenaltyTone;
  icon: React.ReactNode;
  emptyText: string;
}) {
  const styles = TONE_STYLES[tone];

  return (
    <Card>
      <CardContent className="py-4 px-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${styles.box}`}>
              {icon}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wide">{title}</p>
              <p className="text-xs text-white/40">{subtitle}</p>
            </div>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`הסבר על חישוב הקנס — ${title}`}
                className="p-1.5 rounded-lg text-white/30 hover:text-cyan-400 hover:bg-cyan-400/10 transition-colors shrink-0"
              >
                <Info className="w-4 h-4" />
              </button>
            </PopoverTrigger>
            {/* Opaque backdrop: the shared `glass` popover is too translucent to read
                over the dense cards stacked behind it. `.glass` is declared after
                @tailwind utilities, so plain bg-* loses to it — hence the ! modifier. */}
            <PopoverContent
              align="end"
              className="w-80 max-w-[calc(100vw-2rem)] !bg-slate-900/95 !border-white/15"
            >
              <PenaltyBreakdown km={km} penalty={penalty} scopeLabel={scopeLabel} />
            </PopoverContent>
          </Popover>
        </div>

        <div className={`rounded-xl border p-3 ${styles.box}`}>
          <p className={`text-2xl font-bold ${styles.text}`}>{formatCurrency(penalty.total)}</p>
          <p className="text-xs text-white/40 mt-0.5">
            {penalty.excessKm === 0
              ? emptyText
              : `חריגה של ${fmtKm(penalty.excessKm)} ק"מ מעל ${fmtKm(PENALTY_FREE_KM)}`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Business logic ────────────────────────────────────────────────────────────

interface MileageStats {
  yearNum: number;
  yearStart: Date;
  nextYearStart: Date;
  daysInYear: number;
  daysElapsed: number;
  yearStartKm: number;
  /**
   * False when this contract year has no reading at or before its start, so
   * `kmUsed` silently falls back to the whole odometer instead of this year's
   * distance. Harmless for year 1 (the car starts near 0), misleading later.
   */
  hasYearBaseline: boolean;
  latestReading: MileageReading;
  kmUsed: number;
  kmRemaining: number;
  expectedKmByNow: number;
  paceDelta: number;
  projectedYearEnd: number;
  avgKmPerMonth: number;
}

function computeStats(
  settings: MileageSettings,
  readings: MileageReading[],
): MileageStats | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const receipt = parseLocalDate(settings.car_receipt_date);

  // Determine current contract year (up to year 3)
  let yearNum = 1;
  let yearStart = receipt;
  let nextYearStart = new Date(receipt.getFullYear() + 1, receipt.getMonth(), receipt.getDate());
  for (let y = 1; y <= 3; y++) {
    const yStart = new Date(receipt.getFullYear() + (y - 1), receipt.getMonth(), receipt.getDate());
    const yNext  = new Date(receipt.getFullYear() + y,       receipt.getMonth(), receipt.getDate());
    if (today >= yStart) {
      yearNum       = y;
      yearStart     = yStart;
      nextYearStart = yNext;
    }
  }

  const daysInYear  = Math.round((nextYearStart.getTime() - yearStart.getTime()) / 86400000);
  const daysElapsed = Math.max(1, Math.round((today.getTime() - yearStart.getTime()) / 86400000));

  const sorted = [...readings].sort((a, b) => a.reading_date.localeCompare(b.reading_date));
  const latestReading = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  if (!latestReading) return null;

  // year_start_km: latest reading recorded on or before the start of the current year
  const yearStartStr  = toDateInput(yearStart);
  const beforeYear    = sorted.filter((r) => r.reading_date <= yearStartStr);
  const yearStartKm   = beforeYear.length > 0 ? beforeYear[beforeYear.length - 1].odometer_km : 0;
  const hasYearBaseline = yearNum === 1 || beforeYear.length > 0;

  const kmUsed          = Math.max(0, latestReading.odometer_km - yearStartKm);
  const kmRemaining     = settings.yearly_km_limit - kmUsed;
  const expectedKmByNow = (daysElapsed / daysInYear) * settings.yearly_km_limit;
  const paceDelta       = kmUsed - expectedKmByNow;
  const projectedYearEnd = kmUsed * (daysInYear / daysElapsed);
  const avgKmPerMonth    = kmUsed / (daysElapsed / 30.44);

  return {
    yearNum, yearStart, nextYearStart,
    daysInYear, daysElapsed,
    yearStartKm, hasYearBaseline, latestReading,
    kmUsed, kmRemaining,
    expectedKmByNow, paceDelta, projectedYearEnd, avgKmPerMonth,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Mileage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const todayStr = toDateInput(new Date());

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: settingsList = [], isLoading: settingsLoading } = useQuery<MileageSettings[]>({
    queryKey: ['mileage_settings'],
    queryFn: () => base44.entities.MileageSettings.filter(),
  });
  const settings = settingsList[0] ?? null;

  const { data: readings = [] } = useQuery<MileageReading[]>({
    queryKey: ['mileage_readings'],
    queryFn: () => base44.entities.MileageReading.filter(),
  });

  // ── Local state ───────────────────────────────────────────────────────────────
  const [newForm, setNewForm] = useState({ reading_date: todayStr, odometer_km: '', note: '' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ car_receipt_date: '', yearly_km_limit: '20000' });
  const [onboardForm, setOnboardForm] = useState({ car_receipt_date: '', yearly_km_limit: '20000' });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Sync settingsForm when the settings dialog opens
  const wasSettingsOpenRef = useRef(false);
  useEffect(() => {
    if (settingsOpen && !wasSettingsOpenRef.current && settings) {
      setSettingsForm({
        car_receipt_date: settings.car_receipt_date,
        yearly_km_limit:  String(settings.yearly_km_limit),
      });
    }
    wasSettingsOpenRef.current = settingsOpen;
  }, [settingsOpen, settings]);

  // ── Computed ─────────────────────────────────────────────────────────────────
  const stats = useMemo(
    () => (settings ? computeStats(settings, readings) : null),
    [settings, readings],
  );

  const sortedReadings = useMemo(
    () => [...readings].sort((a, b) => b.reading_date.localeCompare(a.reading_date)),
    [readings],
  );

  // Excess-mileage penalty, on what has happened and on where the pace leads.
  const penalties = useMemo(
    () => (stats
      ? {
          actual:    computeExcessPenalty(stats.kmUsed),
          projected: computeExcessPenalty(stats.projectedYearEnd),
        }
      : null),
    [stats],
  );

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const { mutate: saveSettings, isPending: savingSettings } = useMutation({
    mutationFn: async (data: { car_receipt_date: string; yearly_km_limit: number }) => {
      if (settings) {
        await base44.entities.MileageSettings.update(settings.id, data);
      } else {
        await base44.entities.MileageSettings.create(data);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mileage_settings'] });
      toast({ title: 'ההגדרות נשמרו', variant: 'success' });
    },
  });

  const { mutate: addReading, isPending: addingReading } = useMutation({
    mutationFn: async () => {
      await base44.entities.MileageReading.create({
        reading_date: newForm.reading_date,
        odometer_km:  Number(newForm.odometer_km),
        ...(newForm.note ? { note: newForm.note } : {}),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mileage_readings'] });
      setNewForm({ reading_date: todayStr, odometer_km: '', note: '' });
      toast({ title: 'קריאה נשמרה', variant: 'success' });
    },
  });

  const { mutate: deleteReading } = useMutation({
    mutationFn: (id: string) => base44.entities.MileageReading.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mileage_readings'] });
      setDeleteConfirm(null);
      toast({ title: 'קריאה נמחקה', variant: 'default' });
    },
  });

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-8 h-8 border-2 border-white/20 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    );
  }

  // ── Onboarding: no contract settings yet ─────────────────────────────────────
  if (!settings) {
    return (
      <div className="max-w-md mx-auto px-4 py-10">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center mx-auto mb-3">
              <Car className="w-8 h-8 text-cyan-400" />
            </div>
            <h1 className="text-xl font-bold text-white">מעקב קילומטראז'</h1>
            <p className="text-sm text-white/50 mt-1">הגדר את פרטי חוזה הליסינג כדי להתחיל</p>
          </div>
          <Card>
            <CardContent className="py-5 space-y-4">
              <div>
                <label className="text-xs text-white/50 block mb-1.5">תאריך קבלת הרכב</label>
                <Input
                  type="date"
                  value={onboardForm.car_receipt_date}
                  onChange={(e) => setOnboardForm((f) => ({ ...f, car_receipt_date: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1.5">מגבלת ק"מ שנתית</label>
                <Input
                  type="number"
                  value={onboardForm.yearly_km_limit}
                  onChange={(e) => setOnboardForm((f) => ({ ...f, yearly_km_limit: e.target.value }))}
                  className="h-9 text-sm"
                  placeholder="20000"
                />
              </div>
              <Button
                className="w-full bg-cyan-500/80 hover:bg-cyan-500 text-white border-0"
                disabled={!onboardForm.car_receipt_date || savingSettings}
                onClick={() =>
                  saveSettings({
                    car_receipt_date: onboardForm.car_receipt_date,
                    yearly_km_limit:  Number(onboardForm.yearly_km_limit) || 20000,
                  })
                }
              >
                התחל מעקב
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // ── Progress bar color based on projection ────────────────────────────────────
  const limit       = settings.yearly_km_limit;
  const progressPct = stats ? Math.min(100, (stats.kmUsed / limit) * 100) : 0;
  const barColor    = !stats
    ? 'from-cyan-500 to-purple-500'
    : stats.projectedYearEnd > limit
    ? 'from-rose-500 to-rose-400'
    : stats.projectedYearEnd > limit * 0.9
    ? 'from-yellow-500 to-yellow-400'
    : 'from-emerald-500 to-emerald-400';

  // Penalty severity is measured against the policy's 20,000 km, not the personal
  // target in settings — the fine starts where the contract says it does.
  const projectedTone: PenaltyTone = !stats
    ? 'ok'
    : stats.projectedYearEnd > PENALTY_FREE_KM
    ? 'danger'
    : stats.projectedYearEnd > PENALTY_FREE_KM * 0.9
    ? 'warn'
    : 'ok';

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">

      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center shrink-0">
          <Car className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-base font-bold text-white">מעקב קילומטראז'</h1>
          <p className="text-xs text-white/40">ליסינג · שנה {stats?.yearNum ?? 1} מתוך 3</p>
        </div>
      </div>

      {/* ── Section 1: Current Status ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardContent className="py-4 px-4 space-y-3">
            {stats?.latestReading ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-white/40">מד קילומטר אחרון</p>
                  <p className="text-2xl font-bold text-white">
                    {fmtKm(stats.latestReading.odometer_km)}{' '}
                    <span className="text-sm font-normal text-white/50">ק"מ</span>
                  </p>
                  <p className="text-xs text-white/40">{formatDate(stats.latestReading.reading_date)}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                  <Gauge className="w-6 h-6 text-cyan-400" />
                </div>
              </div>
            ) : (
              <p className="text-sm text-white/40 text-center py-2">
                אין קריאות עדיין — הוסף את הקריאה הראשונה למטה
              </p>
            )}

            {stats && (
              <>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-white/60">{fmtKm(stats.kmUsed)} ק"מ השנה</span>
                  <span className="text-white/40">מגבלה: {fmtKm(limit)}</span>
                </div>
                <Progress value={progressPct} indicatorClassName={barColor} />
                <div className="flex items-center justify-between text-xs mt-0.5">
                  <span className={stats.kmRemaining >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {stats.kmRemaining >= 0
                      ? `נותרו ${fmtKm(stats.kmRemaining)} ק"מ`
                      : `חריגה של ${fmtKm(Math.abs(stats.kmRemaining))} ק"מ`}
                  </span>
                  <span className="text-white/30">{Math.round(progressPct)}%</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Section 2: Pace Analysis (only with ≥ 2 readings) ── */}
      {stats && readings.length >= 2 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card>
            <CardContent className="py-4 px-4 space-y-3">
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wide">ניתוח קצב</p>

              <div className="grid grid-cols-2 gap-3">
                {/* Avg km/month */}
                <div className="bg-white/5 rounded-xl p-3">
                  <p className="text-xs text-white/40 mb-1">ממוצע חודשי</p>
                  <p className="text-lg font-bold text-white">{fmtKm(stats.avgKmPerMonth)}</p>
                  <p className="text-xs text-white/40">ק"מ לחודש</p>
                </div>

                {/* Projected year-end */}
                <div
                  className={`rounded-xl p-3 ${
                    stats.projectedYearEnd > limit
                      ? 'bg-rose-500/10 border border-rose-500/20'
                      : stats.projectedYearEnd > limit * 0.9
                      ? 'bg-yellow-500/10 border border-yellow-500/20'
                      : 'bg-emerald-500/10 border border-emerald-500/20'
                  }`}
                >
                  <p className="text-xs text-white/40 mb-1">תחזית סוף שנה</p>
                  <p
                    className={`text-lg font-bold ${
                      stats.projectedYearEnd > limit
                        ? 'text-rose-400'
                        : stats.projectedYearEnd > limit * 0.9
                        ? 'text-yellow-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {fmtKm(stats.projectedYearEnd)}
                  </p>
                  <p className="text-xs text-white/40">
                    {stats.projectedYearEnd > limit ? 'חריגה צפויה' : 'בטווח המגבלה'}
                  </p>
                </div>
              </div>

              {/* Pace delta */}
              <div className="flex items-center gap-2 bg-white/5 rounded-xl p-3">
                {stats.paceDelta > 0 ? (
                  <TrendingUp className="w-4 h-4 text-rose-400 shrink-0" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <div>
                  <p className="text-xs text-white/40">קצב ביחס לצפי</p>
                  <p className={`text-sm font-medium ${stats.paceDelta > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {stats.paceDelta > 0
                      ? `${fmtKm(stats.paceDelta)} ק"מ קדימה מהקצב — יש להאט`
                      : `${fmtKm(Math.abs(stats.paceDelta))} ק"מ מתחת לקצב — בטווח טוב`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Section 2b: Excess-mileage penalty (policy §10.2) ── */}
      {stats && readings.length >= 2 && penalties && (
        <>
          {/* Actual: what has already been racked up this contract year */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}>
            <PenaltyCard
              title="קנס בפועל"
              subtitle={`לפי ${fmtKm(stats.kmUsed)} ק"מ שנסעת השנה`}
              km={stats.kmUsed}
              penalty={penalties.actual}
              scopeLabel="נסעת עד היום"
              tone={penalties.actual.excessKm > 0 ? 'danger' : 'ok'}
              icon={<Wallet className={`w-4 h-4 ${penalties.actual.excessKm > 0 ? 'text-rose-400' : 'text-emerald-400'}`} />}
              emptyText="טרם נצברה חריגה"
            />
          </motion.div>

          {/* Projected: where the current pace lands by year end */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }}>
            <PenaltyCard
              title="קנס צפוי"
              subtitle={`לפי תחזית של ${fmtKm(stats.projectedYearEnd)} ק"מ בסוף השנה`}
              km={stats.projectedYearEnd}
              penalty={penalties.projected}
              scopeLabel="תחזית סוף שנה"
              tone={projectedTone}
              icon={<AlertTriangle className={`w-4 h-4 ${TONE_STYLES[projectedTone].text}`} />}
              emptyText="הקצב הנוכחי לא צפוי לחרוג"
            />
          </motion.div>

          {!stats.hasYearBaseline && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-white/5 rounded-xl text-xs text-white/40">
              <Info className="w-4 h-4 shrink-0 text-yellow-400/60" />
              <span>
                אין קריאה מתחילת שנת החוזה, ולכן החישוב מסתמך על מד הקילומטר המלא — הוסף קריאה
                מתאריך {formatDate(toDateInput(stats.yearStart))} לדיוק מלא
              </span>
            </div>
          )}
        </>
      )}

      {/* Note: only 1 reading → prompt for more */}
      {stats && readings.length === 1 && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-white/5 rounded-xl text-xs text-white/40">
          <Info className="w-4 h-4 shrink-0 text-cyan-400/60" />
          <span>הוסף קריאה נוספת כדי לקבל ניתוח קצב ותחזית</span>
        </div>
      )}

      {/* ── Section 3: Log New Reading ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardContent className="py-4 px-4 space-y-3">
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wide">קריאה חדשה</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-white/40 block mb-1">מד קילומטר</label>
                <Input
                  type="number"
                  placeholder="למשל 45000"
                  value={newForm.odometer_km}
                  onChange={(e) => setNewForm((f) => ({ ...f, odometer_km: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">תאריך</label>
                <Input
                  type="date"
                  value={newForm.reading_date}
                  onChange={(e) => setNewForm((f) => ({ ...f, reading_date: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-white/40 block mb-1">הערה (אופציונלי)</label>
              <Input
                type="text"
                placeholder="למשל: אחרי טיול צפון"
                value={newForm.note}
                onChange={(e) => setNewForm((f) => ({ ...f, note: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <Button
              className="w-full bg-cyan-500/80 hover:bg-cyan-500 text-white border-0 h-9"
              disabled={!newForm.odometer_km || addingReading}
              onClick={() => addReading()}
            >
              <Plus className="w-4 h-4 ml-1" />
              {addingReading ? 'שומר...' : 'שמור קריאה'}
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Section 4: Reading History ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card>
          <CardContent className="py-4 px-4">
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-3">היסטוריית קריאות</p>
            {sortedReadings.length === 0 ? (
              <p className="text-sm text-white/30 text-center py-4">אין קריאות עדיין</p>
            ) : (
              <div className="space-y-0 max-h-72 overflow-y-auto">
                {sortedReadings.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-2 py-2.5 border-b border-white/5 last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-semibold text-white">{fmtKm(r.odometer_km)}</span>
                        <span className="text-xs text-white/40">ק"מ</span>
                      </div>
                      <p className="text-xs text-white/40">
                        {formatDate(r.reading_date)}
                        {r.note ? ` · ${r.note}` : ''}
                      </p>
                    </div>
                    {deleteConfirm === r.id ? (
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 text-xs px-2"
                          onClick={() => deleteReading(r.id)}
                        >
                          מחק
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2"
                          onClick={() => setDeleteConfirm(null)}
                        >
                          ביטול
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(r.id)}
                        className="p-1.5 rounded-lg text-white/30 hover:text-rose-400 hover:bg-rose-400/10 transition-colors shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Section 5: Contract Settings (collapsible) ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card>
          <CardContent className="py-3 px-4">
            <button
              className="w-full flex items-center justify-between"
              onClick={() => setSettingsOpen((o) => !o)}
            >
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wide">הגדרות חוזה</p>
              {settingsOpen
                ? <ChevronUp className="w-4 h-4 text-white/40" />
                : <ChevronDown className="w-4 h-4 text-white/40" />}
            </button>

            <AnimatePresence initial={false}>
              {settingsOpen && (
                <motion.div
                  key="settings-body"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-3 pt-3">
                    {/* Year info */}
                    {stats && (
                      <div className="bg-white/5 rounded-xl p-3 text-xs text-white/50 space-y-0.5">
                        <p className="font-medium text-white/70">שנה {stats.yearNum} מתוך 3</p>
                        <p>
                          {formatDate(toDateInput(stats.yearStart))}
                          {' — '}
                          {formatDate(toDateInput(new Date(stats.nextYearStart.getTime() - 86400000)))}
                        </p>
                      </div>
                    )}
                    <div>
                      <label className="text-xs text-white/40 block mb-1">תאריך קבלת הרכב</label>
                      <Input
                        type="date"
                        value={settingsForm.car_receipt_date}
                        onChange={(e) => setSettingsForm((f) => ({ ...f, car_receipt_date: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-white/40 block mb-1">מגבלת ק"מ שנתית</label>
                      <Input
                        type="number"
                        value={settingsForm.yearly_km_limit}
                        onChange={(e) => setSettingsForm((f) => ({ ...f, yearly_km_limit: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <Button
                      size="sm"
                      className="w-full bg-cyan-500/80 hover:bg-cyan-500 text-white border-0 h-8 text-xs"
                      disabled={savingSettings || !settingsForm.car_receipt_date}
                      onClick={() =>
                        saveSettings({
                          car_receipt_date: settingsForm.car_receipt_date,
                          yearly_km_limit:  Number(settingsForm.yearly_km_limit) || 20000,
                        })
                      }
                    >
                      {savingSettings ? 'שומר...' : 'שמור הגדרות'}
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
