import { useSyncExternalStore } from 'react';
import { formatCurrency } from '@/utils';

// "הצגה באחוזים" — a presentation mode for going over the numbers with someone
// outside the family: every amount is replaced by its share of a whole, so the
// proportions are visible and the shekel figures are not.
//
// Built as the base for every page, wired into Assets first (14/11/2026). A page
// joins by calling usePercentMode() and routing each amount through
// moneyOrShare(); the toggle should only move to the global header once every
// page that renders money has joined, or it would read as "on" while Home still
// shows real figures.
//
// Persisted on the device on purpose: a refresh in front of a guest must not
// bring the numbers back.

const STORAGE_KEY = 'ft.percentMode';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPercentMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked (private window): the mode still works for this page view.
    memoryFallback = on;
  }
  listeners.forEach((l) => l());
}

let memoryFallback = false;

function snapshot(): boolean {
  return read() || memoryFallback;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  // Another tab switching the mode should switch this one too.
  const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) cb(); };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

export function usePercentMode(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, snapshot, () => false);
  return [on, setPercentMode];
}

/**
 * A value's share of a whole, as a short label. A non-zero share under 1% reads
 * "<1%" rather than "0%", which would claim the item is worth nothing; a whole
 * of zero or less has no meaningful share and reads "—".
 */
export function formatShare(value: number, total: number): string {
  if (!(total > 0) || !Number.isFinite(value)) return '—';
  const pct = (value / total) * 100;
  if (pct > 0 && pct < 0.5) return LESS_THAN_ONE;
  return `${Math.round(pct)}%`;
}

// U+200E (left-to-right mark) in front: inside the app's RTL text the bare
// "<1%" is reordered and reads "1%>" (seen on a phone, 15/11). The mark pins
// the run left-to-right; it is invisible.
export const LESS_THAN_ONE = '\u200E<1%';

/** The amount in normal mode, its share of `total` in percent mode. */
export function moneyOrShare(percentMode: boolean, value: number, total: number): string {
  return percentMode ? formatShare(value, total) : formatCurrency(value);
}
