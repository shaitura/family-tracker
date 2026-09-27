// Harness replacement for @/hooks/useTransactions: the real hook reads Firestore
// through base44Client. This container has no Firestore credentials (rules are
// locked to two Google accounts), so the page is fed a deterministic seed
// instead. Everything downstream of the hook is the real, unmodified page code.
import { Transaction } from '@/types';

declare global { interface Window { __SEED__: Transaction[] } }

export function useRecurringRules() {
  return { data: [], isLoading: false } as any;
}

export function useTransactions() {
  const transactions = (window.__SEED__ ?? []) as Transaction[];
  return { transactions, realTransactions: transactions, rules: [], isLoading: false };
}
