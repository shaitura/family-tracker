import { useState, useCallback } from 'react';
import { WaTransaction } from '@/lib/base44Client';

export type PendingItem = WaTransaction & { _id: string; _addedAt: string };

const KEY = 'pending_clarifications';

function load(): PendingItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function persist(items: PendingItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function usePendingClarifications() {
  const [items, setItems] = useState<PendingItem[]>(load);

  const addItems = useCallback((incoming: WaTransaction[]) => {
    setItems((prev) => {
      const next = [
        ...prev,
        ...incoming.map((t) => ({ ...t, _id: crypto.randomUUID(), _addedAt: new Date().toISOString() })),
      ];
      persist(next);
      return next;
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => { const next = prev.filter((t) => t._id !== id); persist(next); return next; });
  }, []);

  const updateItem = useCallback((id: string, updates: Partial<WaTransaction>) => {
    setItems((prev) => {
      const next = prev.map((t) => (t._id === id ? { ...t, ...updates } : t));
      persist(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => { setItems([]); localStorage.removeItem(KEY); }, []);

  return { items, addItems, removeItem, updateItem, clearAll };
}
