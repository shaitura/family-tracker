import type { Asset } from '@/types';

// Real estate and land: the holdings the "ללא נדל"ן" toggle on Assets → Summary
// → Investments takes out, so the remaining 100% is the financial assets alone.
export const REAL_ESTATE_TYPES: ReadonlySet<string> = new Set(['נדל"ן', 'קרקע']);

export const isRealEstate = (a: Asset) => REAL_ESTATE_TYPES.has(a.type);

/** The investments the summary is computed over, with or without real estate. */
export function summaryInvestments(assets: Asset[], excludeRealEstate: boolean): Asset[] {
  return excludeRealEstate ? assets.filter((a) => !isRealEstate(a)) : assets;
}
