import { describe, it, expect } from 'vitest';
import { matchesSearch, matchesColFilters, FILTER_NO_CHILD } from './adminFilters';
import { Transaction, Category } from '@/types';

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 'id', date: '2026-03-01', type: 'expense', category: 'שונות',
    amount: 100, payer: 'Shi', payment_method: 'אשראי',
    expense_class: 'משתנה', status: 'paid', ...over,
  };
}

// The row behind the real report: its description contains "לילדים", so every
// free-text filter for "ילדים" pulls in all ~18 monthly instances of it.
const MOR = tx({
  category: 'השקעה', sub_category: 'קופת גמל להשקעה - השקעה לילדים (מור)',
  notes: 'מור בית השקעות', payment_method: 'הוראת קבע',
  expense_class: 'קבועה', amount: 600, payer: 'Joint',
});

const KIDS = tx({
  category: 'ילדים', sub_category: 'חוג ריקוד יובל - היכל התרבות (ספטמבר עד יולי)',
  notes: 'ילדים - תשלום 2/11', amount: 370, child: 'Yuval',
});

const CHILD_ALLOWANCE = tx({ type: 'income', category: 'קצבת ילדים' as Category, amount: 500 });

describe('matchesSearch', () => {
  it('is substring by design — "ילדים" matches a description containing "לילדים"', () => {
    // Documented, not a bug: free text has to be loose. The precise tool is the
    // category column filter, which must NOT behave this way (see below).
    expect(matchesSearch(MOR, 'ילדים')).toBe(true);
  });

  it('matches on the child tag label', () => {
    expect(matchesSearch(KIDS, 'יובל')).toBe(true);
    expect(matchesSearch(MOR, 'יובל')).toBe(false);
  });
});

describe('matchesColFilters — option-list columns are exact', () => {
  it('category "ילדים" does not drag in an unrelated row that merely mentions ילדים', () => {
    expect(matchesColFilters(MOR, { category: 'ילדים' })).toBe(false);
  });

  it('category "ילדים" does not match the income category "קצבת ילדים"', () => {
    // The substring bug: 'קצבת ילדים'.includes('ילדים') === true
    expect(matchesColFilters(CHILD_ALLOWANCE, { category: 'ילדים' })).toBe(false);
  });

  it('category "הוצאות עבודה" does not match "החזר הוצאות עבודה"', () => {
    const refund = tx({ type: 'income', category: 'החזר הוצאות עבודה' as Category });
    expect(matchesColFilters(refund, { category: 'הוצאות עבודה' })).toBe(false);
  });

  it('still matches the row it should', () => {
    expect(matchesColFilters(KIDS, { category: 'ילדים' })).toBe(true);
    expect(matchesColFilters(MOR, { payment_method: 'הוראת קבע', expense_class: 'קבועה' })).toBe(true);
  });
});

describe('matchesColFilters — free-text columns stay substring', () => {
  it('matches a partial description', () => {
    expect(matchesColFilters(KIDS, { sub_category: 'חוג' })).toBe(true);
    expect(matchesColFilters(MOR, { sub_category: 'חוג' })).toBe(false);
  });
});

describe('matchesColFilters — child column', () => {
  it('filters to a specific child', () => {
    expect(matchesColFilters(KIDS, { child: 'Yuval' })).toBe(true);
    expect(matchesColFilters(KIDS, { child: 'Aviv' })).toBe(false);
  });

  it('filters to untagged rows only', () => {
    expect(matchesColFilters(MOR, { child: FILTER_NO_CHILD })).toBe(true);
    expect(matchesColFilters(KIDS, { child: FILTER_NO_CHILD })).toBe(false);
  });

  it('treats a cleared (null) tag as untagged', () => {
    const cleared = tx({ child: null as unknown as Transaction['child'] });
    expect(matchesColFilters(cleared, { child: FILTER_NO_CHILD })).toBe(true);
  });

  it('combines with other filters', () => {
    expect(matchesColFilters(KIDS, { category: 'ילדים', child: 'Yuval' })).toBe(true);
    expect(matchesColFilters(KIDS, { category: 'ילדים', child: 'Ziv' })).toBe(false);
  });
});
