import { Transaction, RecurringRule } from '@/types';

// ────────────────────────────────────────────────────────────────────────────
// Recurrence projection (approach B): a RecurringRule is stored once and
// projected into virtual Transaction instances for every month in its range.
// Virtual instances are never persisted; they exist only in memory for display
// and for summing in the money screens. Touching a single month "materializes"
// it into a real Transaction (override) or a skip tombstone.
// ────────────────────────────────────────────────────────────────────────────

const VIRTUAL_PREFIX = 'rec:';

/** True when an id belongs to a projected (non-persisted) instance. */
export function isVirtualId(id: string): boolean {
  return typeof id === 'string' && id.startsWith(VIRTUAL_PREFIX);
}

/** Stable synthetic id for a rule's instance in a given month. */
export function virtualId(ruleId: string, month: string): string {
  return `${VIRTUAL_PREFIX}${ruleId}:${month}`;
}

/** 'YYYY-MM' of a date-ish string ('YYYY-MM-DD' or 'YYYY-MM'). */
export function monthKeyOf(date: string): string {
  return (date || '').slice(0, 7);
}

const MONTH_RE = /^\d{4}-\d{2}$/;

/** Inclusive list of 'YYYY-MM' from start to end (across year boundaries). */
export function monthsInRange(start: string, end: string): string[] {
  if (!MONTH_RE.test(start) || !MONTH_RE.test(end)) return [];
  const out: string[] = [];
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7));
  const ey = Number(end.slice(0, 4));
  const em = Number(end.slice(5, 7));
  // 600-iteration cap (50y) — backstop against a malformed rule, never hit in practice.
  for (let i = 0; i < 600; i++) {
    if (y > ey || (y === ey && m > em)) break;
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

function lastDayOfMonth(year: number, month1: number): number {
  // month1 is 1-based; day 0 of the next month == last day of this month.
  return new Date(year, month1, 0).getDate();
}

/** Current 'YYYY-MM' (browser clock). Passed explicitly in tests for determinism. */
export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Build the virtual Transaction for one rule in one month. */
export function ruleToVirtual(rule: RecurringRule, month: string, nowMonth: string): Transaction {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const dd = Math.min(Math.max(rule.day_of_month || 1, 1), lastDayOfMonth(y, m));
  return {
    id: virtualId(rule.id, month),
    date: `${month}-${String(dd).padStart(2, '0')}`,
    type: rule.type,
    category: rule.category,
    sub_category: rule.sub_category,
    amount: rule.amount,
    payer: rule.payer,
    payment_method: rule.payment_method,
    expense_class: 'קבועה',
    notes: rule.notes,
    status: month > nowMonth ? 'future' : 'paid',
    recurrence_id: rule.id,
    recurrence_month: month,
    is_virtual: true,
  };
}

/**
 * Merge real transactions with projected recurring instances.
 *  - Any (rule, month) that already has a materialized real row (override) OR a
 *    skip tombstone is NOT projected — the stored row is the source of truth.
 *  - Skip tombstones are removed from the visible output entirely.
 * Result is the list every money screen and the transactions list should render.
 */
export function projectRecurring(
  real: Transaction[],
  rules: RecurringRule[],
  nowMonth: string = currentMonthKey(),
): Transaction[] {
  const overridden = new Set<string>();
  for (const t of real) {
    if (t.recurrence_id && t.recurrence_month) {
      overridden.add(`${t.recurrence_id}|${t.recurrence_month}`);
    }
  }

  const virtuals: Transaction[] = [];
  for (const rule of rules) {
    if (!rule || rule.active === false) continue;
    for (const month of monthsInRange(rule.start_month, rule.end_month)) {
      if (overridden.has(`${rule.id}|${month}`)) continue;
      virtuals.push(ruleToVirtual(rule, month, nowMonth));
    }
  }

  const realVisible = real.filter((t) => !t.recurrence_skip);
  return [...realVisible, ...virtuals];
}
