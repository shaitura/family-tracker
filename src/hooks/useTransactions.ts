import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/lib/base44Client';
import { Transaction, RecurringRule } from '@/types';
import { projectRecurring } from '@/lib/recurrence';

/** Raw recurring rules (source of truth), no projection. */
export function useRecurringRules() {
  return useQuery<RecurringRule[]>({
    queryKey: ['recurringRules'],
    queryFn: () => base44.entities.RecurringRule.filter(),
  });
}

/**
 * Money screens + the transactions list read through this hook so every one of
 * them sees the SAME merged view: real transactions + projected recurring
 * instances. Admin/Import intentionally keep reading the raw Transaction entity
 * (real rows only) — they edit persisted data, not projections.
 */
export function useTransactions() {
  const realQ = useQuery<Transaction[]>({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.filter(),
  });
  const rulesQ = useRecurringRules();

  const real = realQ.data ?? [];
  const rules = rulesQ.data ?? [];

  const transactions = useMemo(() => projectRecurring(real, rules), [real, rules]);

  return {
    transactions,               // merged: real (minus skip tombstones) + virtual
    realTransactions: real,     // persisted rows only
    rules,
    isLoading: realQ.isLoading || rulesQ.isLoading,
  };
}
