import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Category } from '@/types';

// ── Navigation ──────────────────────────────────────────────────────────────
const PAGE_ROUTES: Record<string, string> = {
  Home: '/',
  Import: '/import',
  AddTransaction: '/add-transaction',
  Reports: '/reports',
  MonthlyReports: '/monthly-reports',
  Assets: '/assets',
  Settings: '/settings',
  Transactions: '/transactions',
};

export function createPageUrl(page: string): string {
  return PAGE_ROUTES[page] ?? '/';
}

// ── Formatters ───────────────────────────────────────────────────────────────
export function formatCurrency(amount: number): string {
  return `₪${Math.abs(amount).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;
}

export function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'dd בMMM yyyy', { locale: he });
  } catch {
    return dateStr;
  }
}

export function formatMonth(dateStr: string): string {
  try {
    return format(new Date(dateStr + '-01'), 'MMMM yyyy', { locale: he });
  } catch {
    return dateStr;
  }
}

export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ── Category colours ─────────────────────────────────────────────────────────
const CAT_COLORS: Record<Category, string> = {
  מזון:     '#22d3ee',
  סופר:     '#a855f7',
  מסעדות:   '#ec4899',
  דיור:     '#f97316',
  רכב:      '#eab308',
  דלק:      '#84cc16',
  ילדים:    '#06b6d4',
  ביגוד:    '#8b5cf6',
  בריאות:   '#10b981',
  פנאי:     '#f43f5e',
  ביטוחים:  '#64748b',
  תקשורת:   '#0ea5e9',
  חשבונות:  '#fb923c',
  מתנות:    '#d946ef',
  השקעה:    '#34d399',
  שונות:    '#94a3b8',
};

const EXTRA_COLORS = [
  '#fb923c', '#34d399', '#60a5fa', '#f472b6', '#a3e635',
  '#38bdf8', '#c084fc', '#fbbf24', '#4ade80', '#f87171',
];

export function categoryColor(cat: string): string {
  if (CAT_COLORS[cat as Category]) return CAT_COLORS[cat as Category];
  // Deterministic color for unknown categories based on string hash
  let hash = 0;
  for (let i = 0; i < cat.length; i++) hash = (hash * 31 + cat.charCodeAt(i)) & 0xffff;
  return EXTRA_COLORS[hash % EXTRA_COLORS.length];
}

export const PAYER_LABELS: Record<string, string> = {
  Shi: 'שי',
  Ortal: 'אורטל',
  Joint: 'משותף',
};

export const OWNER_LABELS: Record<string, string> = {
  Shi: 'שי',
  Ortal: 'אורטל',
  Yuval: 'יובל',
  Aviv: 'אביב',
  Ziv: 'זיו',
  Joint: 'משותף',
  Car_Private: 'רכב פרטי',
  Apt_Rent: 'דירה שכורה',
  Apt_Own: 'נדל"ן',
};
