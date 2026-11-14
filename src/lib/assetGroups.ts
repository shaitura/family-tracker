import type { Asset } from '@/types';

export interface AssetTypeGroup {
  type: string;
  total: number;
  assets: Asset[];
}

/**
 * Investment assets grouped by type, so holdings of the same kind (all the
 * קרנות השתלמות, all the קופות גמל) sit together and the spread is visible.
 * Groups run from the largest total down, and cards within a group from the
 * largest balance down. A missing balance counts as 0: the card still shows,
 * at the bottom of its group. Ties keep a stable order (type name, then
 * product name) so the list does not reshuffle between renders.
 */
export function groupAssetsByType(assets: Asset[]): AssetTypeGroup[] {
  const byType = new Map<string, Asset[]>();
  for (const a of assets) {
    const list = byType.get(a.type) ?? [];
    list.push(a);
    byType.set(a.type, list);
  }
  const bal = (a: Asset) => a.balance ?? 0;
  return [...byType.entries()]
    .map(([type, list]) => ({
      type,
      total: list.reduce((s, a) => s + bal(a), 0),
      assets: [...list].sort((x, y) => bal(y) - bal(x) || (x.product_name ?? '').localeCompare(y.product_name ?? '', 'he')),
    }))
    .sort((x, y) => y.total - x.total || x.type.localeCompare(y.type, 'he'));
}
