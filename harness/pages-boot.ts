import { buildSeed } from './seed.mjs';
// The reports seed plus one stored row from before the "required" fields
// existed — the shape that used to blank the Expenses page on the first
// search keystroke. It keeps a category: without one the list itself crashes
// (categoryColor), and the live list renders, so live rows do have one.
// ?nobroken=1 drops it, to compare against a clean seed.
const seed: any[] = buildSeed();
if (!new URLSearchParams(location.search).has('nobroken')) {
  seed.push({ id: 'legacy-row', date: '2026-08-14', type: 'expense', category: 'שונות', amount: 77, notes: 'שורה ישנה' });
}
(window as any).__SEED__ = seed;
import('./pages-main');
