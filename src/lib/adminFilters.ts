import { Transaction, CHILD_TAGS } from '@/types';
import { CHILD_LABELS } from '@/utils';

// ────────────────────────────────────────────────────────────────────────────
// Admin table filtering. Extracted from Admin.tsx so the matching rules are
// unit-testable — a false positive here is invisible in the UI (the row simply
// looks like it belongs) and only shows up as "why is this row in my filter?".
// ────────────────────────────────────────────────────────────────────────────

/** '' is a real, selectable child value meaning "no child assigned". */
export const NO_CHILD = '';
/** Sentinel for the child column-filter dropdown, where '' already means "all". */
export const FILTER_NO_CHILD = '__none__';
export const CHILD_COL_OPTIONS: string[] = [NO_CHILD, ...CHILD_TAGS];

/** Display labels for enum values stored in English. */
export const OPTION_LABELS: Record<string, Record<string, string>> = {
  type:   { expense: 'הוצאה',  income: 'הכנסה' },
  payer:  { Shi: 'שי', Ortal: 'אורטל', Joint: 'משותפת' },
  status: { paid: 'שולם', pending: 'ממתין', future: 'עתידי' },
  child:  { [NO_CHILD]: 'ללא שיוך', ...CHILD_LABELS },
};

export function displayLabel(field: string, value: string): string {
  return OPTION_LABELS[field]?.[value] ?? value;
}

/**
 * Fields whose column filter is driven by a closed option list. These MUST match
 * exactly: a substring test can only ever produce false positives, because the
 * category list contains genuine substring pairs —
 *   'ילדים' ⊂ 'קצבת ילדים' · 'הוצאות עבודה' ⊂ 'החזר הוצאות עבודה'
 * — so filtering for the short one silently drags the long one in.
 */
export const EXACT_MATCH_FILTER_FIELDS = new Set([
  'expense_class', 'payer', 'payment_method', 'category', 'type', 'status', 'child',
]);

/** Free-text search across every visible field. Substring by design. */
export function matchesSearch(t: Transaction, q: string): boolean {
  const s = q.toLowerCase();
  return [
    t.date, t.sub_category ?? '', t.category, t.notes ?? '',
    t.payer, OPTION_LABELS.payer?.[t.payer] ?? '',
    t.payment_method, t.expense_class ?? '',
    t.type, OPTION_LABELS.type?.[t.type] ?? '',
    t.status, OPTION_LABELS.status?.[t.status] ?? '',
    t.child ?? '', CHILD_LABELS[t.child ?? ''] ?? '',
    String(t.amount),
  ].some((v) => v.toLowerCase().includes(s));
}

/** Per-column filters. Exact for option-list columns, substring for free text. */
export function matchesColFilters(t: Transaction, colFilters: Record<string, string>): boolean {
  for (const [key, val] of Object.entries(colFilters)) {
    if (!val) continue;

    if (key === 'child') {
      const cv = String(t.child ?? '');
      if (val === FILTER_NO_CHILD ? cv !== '' : cv !== val) return false;
      continue;
    }

    const tv = String(t[key as keyof Transaction] ?? '');
    if (EXACT_MATCH_FILTER_FIELDS.has(key)) {
      if (tv !== val) return false;
      continue;
    }
    if (!tv.toLowerCase().includes(val.toLowerCase())) return false;
  }
  return true;
}
