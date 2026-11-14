import type { Asset } from '@/types';
import { CHILDREN } from '@/types';
import { groupAssetsByType, type AssetTypeGroup } from './assetGroups';

// Which section of the Assets page an asset belongs to. Before 15/11/2026 the
// page split on `asset_class !== 'נכס/השקעה'` = insurance, so a third class
// would have landed in the insurance list. Every read site goes through these
// three instead. A missing asset_class (older records) still means insurance,
// exactly as before.
export const isKidsSavings = (a: Asset) => a.asset_class === 'חיסכון ילדים';
export const isFamilyInvestment = (a: Asset) => a.asset_class === 'נכס/השקעה';
export const isInsurance = (a: Asset) => !isKidsSavings(a) && !isFamilyInvestment(a);

const isChild = (owner: string) => (CHILDREN as readonly string[]).includes(owner);

export interface KidSummary {
  owner: string;          // 'Yuval' | 'Aviv' | 'Ziv' | 'Joint'
  total: number;
  monthly: number;
  assets: Asset[];
  byType: AssetTypeGroup[];
}

export interface KidsSavingsSummary {
  total: number;
  monthly: number;
  /** Every child, even one with nothing saved yet, then 'Joint' if it has any. */
  kids: KidSummary[];
}

const num = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function summarizeKidsSavings(assets: Asset[]): KidsSavingsSummary {
  const kidsAssets = assets.filter(isKidsSavings);
  const owners: string[] = [...CHILDREN];
  if (kidsAssets.some((a) => a.owner === 'Joint')) owners.push('Joint');
  // An owner outside children+Joint (edited by hand, or a future owner) must
  // not vanish from the tab while still counting in the total.
  for (const a of kidsAssets) if (!owners.includes(a.owner)) owners.push(a.owner);

  const kids = owners.map((owner) => {
    const mine = kidsAssets.filter((a) => a.owner === owner);
    return {
      owner,
      total: mine.reduce((s, a) => s + num(a.balance), 0),
      monthly: mine.reduce((s, a) => s + num(a.monthly_deposit), 0),
      assets: mine,
      byType: groupAssetsByType(mine),
    };
  });
  return {
    total: kids.reduce((s, k) => s + k.total, 0),
    monthly: kids.reduce((s, k) => s + k.monthly, 0),
    kids,
  };
}

/**
 * Family investments owned by a child: entered before the children's tab
 * existed. They are not moved automatically (Shai's choice); the tab lists
 * them so he can move each one by editing it.
 */
export function childOwnedFamilyAssets(assets: Asset[]): Asset[] {
  return assets.filter((a) => isFamilyInvestment(a) && isChild(a.owner));
}
