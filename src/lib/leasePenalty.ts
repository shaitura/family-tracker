/**
 * Lease excess-mileage penalty — company leasing policy §10.2 ("מסלול Vanilla").
 *
 * The policy caps the Vanilla track at 20,000 km per contract year and charges a
 * *tiered* rate on the excess, reckoned per year (the tiers reset each contract year):
 *   · 0.85 ₪ for each of the first 2,000 excess km
 *   · 1.76 ₪ for every excess km beyond that (petrol and diesel vehicles)
 *
 * The tier boundary more than doubles the marginal price, so the total alone hides
 * the shape of the cost — callers render `tier1Km`/`tier2Km` to explain it.
 *
 * §10.2 also states the rates are reviewed periodically and may change; they live
 * here as named constants so a policy update is a one-line edit.
 */

/** Free allowance per contract year, before any penalty applies (§10.2). */
export const PENALTY_FREE_KM = 20_000;

/** Excess km charged at the lower rate before the tier steps up (§10.2). */
export const TIER_1_KM = 2_000;

/** ₪ per excess km, first 2,000 (§10.2). */
export const TIER_1_RATE = 0.85;

/** ₪ per excess km beyond the first 2,000 — petrol/diesel (§10.2). */
export const TIER_2_RATE = 1.76;

export interface ExcessPenalty {
  /** Km above the 20,000 allowance. 0 when within the allowance. */
  excessKm: number;
  /** Excess km billed at TIER_1_RATE (capped at 2,000). */
  tier1Km: number;
  /** Excess km billed at TIER_2_RATE. */
  tier2Km: number;
  /** ₪ from the first tier. */
  tier1Cost: number;
  /** ₪ from the second tier. */
  tier2Cost: number;
  /** Total ₪ penalty. */
  total: number;
  /** Km still available before the 1.76 tier kicks in; 0 once already in it. */
  kmUntilTier2: number;
}

/**
 * Penalty for driving `km` in a single contract year.
 *
 * Accepts the projected year-end figure just as readily as the actual to-date one —
 * it is a pure function of km, so the caller decides which question it answers.
 */
export function computeExcessPenalty(km: number): ExcessPenalty {
  const excessKm = Math.max(0, km - PENALTY_FREE_KM);

  const tier1Km = Math.min(excessKm, TIER_1_KM);
  const tier2Km = Math.max(0, excessKm - TIER_1_KM);

  const tier1Cost = tier1Km * TIER_1_RATE;
  const tier2Cost = tier2Km * TIER_2_RATE;

  return {
    excessKm,
    tier1Km,
    tier2Km,
    tier1Cost,
    tier2Cost,
    total: tier1Cost + tier2Cost,
    kmUntilTier2: Math.max(0, PENALTY_FREE_KM + TIER_1_KM - km),
  };
}
