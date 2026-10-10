import { chance, type Rng } from '../rng';
import { RULES } from './config';

export type RaidStage = 'phase1' | 'phase2' | 'finale';

/** Raw contribution per player id: own damage + setup + support + guard credit. Integers >= 0. */
export type ContributionByPlayer = Readonly<Record<string, number>>;

/**
 * Loot weights from raw contributions, with the soft cap.
 *
 * A player's share of the total counts fully up to `softCap.shareBp` (35%) and at `aboveRateBp`
 * (half) above it, for loot weighting only. Weights are exact integers on a common scale of
 * 10^8 x contribution (so a player at or under the cap has weight c * 10^8); only their ratios
 * matter, pass them to `essenceForStage`. Throws if a weight would exceed 2^53 (contributions
 * above ~9 x 10^7). If nobody contributed, everyone gets the same weight.
 */
export function contributionWeights(perPlayer: ContributionByPlayer): Record<string, number> {
  const ids = Object.keys(perPlayer).sort();
  let total = 0n;
  for (const id of ids) total += toBigInt(perPlayer[id], id);
  const weights: Record<string, number> = {};
  if (total === 0n) {
    for (const id of ids) weights[id] = 1;
    return weights;
  }
  const { shareBp, aboveRateBp } = RULES.raid.softCap;
  const s = BigInt(shareBp);
  const r = BigInt(aboveRateBp);
  for (const id of ids) {
    const c = toBigInt(perPlayer[id], id);
    // Work in units of 1/(10000 * 10000) of the total: share-of-total scaled by 10000 (bp) and the
    // rate scaled by 10000 (bp), so every step is an exact integer.
    const cScaled = c * 10_000n; // c/T in bp, times T
    const capScaled = s * total; // cap in bp, times T
    const eff =
      cScaled <= capScaled ? cScaled * 10_000n : capScaled * 10_000n + (cScaled - capScaled) * r;
    weights[id] = Number(eff);
    if (!Number.isSafeInteger(weights[id])) throw new RangeError('contribution too large');
  }
  return weights;
}

function toBigInt(value: number | undefined, id: string): bigint {
  if (value === undefined || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`contribution of "${id}" must be a non-negative integer`);
  }
  return BigInt(value);
}

/**
 * Splits `total` over entries in proportion to their weights with the largest-remainder method, so
 * the parts are integers and sum to exactly `total`. Ties go to the smaller id. If every weight is
 * 0 the split is equal.
 */
export function splitByWeight(
  total: number,
  ids: readonly string[],
  weights: Readonly<Record<string, number>>,
): Record<string, number> {
  const sorted = [...ids].sort();
  const out: Record<string, number> = {};
  if (sorted.length === 0) return out;
  const w = sorted.map((id) => BigInt(Math.max(0, Math.floor(weights[id] ?? 0))));
  let sum = w.reduce((a, b) => a + b, 0n);
  if (sum === 0n) {
    w.fill(1n);
    sum = BigInt(sorted.length);
  }
  const t = BigInt(total);
  const parts = w.map((x, i) => ({ i, base: (t * x) / sum, rem: (t * x) % sum }));
  let left = t - parts.reduce((a, p) => a + p.base, 0n);
  const order = [...parts].sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  const extra = new Set<number>();
  for (const p of order) {
    if (left <= 0n) break;
    extra.add(p.i);
    left -= 1n;
  }
  for (const p of parts) {
    out[sorted[p.i] as string] = Number(p.base) + (extra.has(p.i) ? 1 : 0);
  }
  return out;
}

/**
 * Essence for one cleared stage: a flat amount for everyone signed up plus a contribution-weighted
 * pool (default 3/7 of the flat total, so about 70% flat and 30% by contribution), split with largest-remainder rounding so
 * the pool is paid out exactly. Guests are never in `signedUp`, so they earn nothing.
 */
export function essenceForStage(
  stage: RaidStage,
  signedUp: readonly string[],
  weights: Readonly<Record<string, number>>,
): Record<string, number> {
  const flat = RULES.raid.essence.flat[stage];
  const ids = [...new Set(signedUp)];
  const pool = Math.floor((flat * ids.length * RULES.raid.essence.poolBp) / 10_000);
  const shares = splitByWeight(pool, ids, weights);
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = flat + (shares[id] ?? 0);
  return out;
}

/**
 * Jackpot chance in basis points for a finale win, given how many earlier raids the player took
 * part in without a jackpot. 6% base; from the 6th raid without one it rises 8 points per raid; the
 * 10th raid without one is guaranteed.
 */
export function jackpotChanceBp(raidsWithoutJackpot: number): number {
  if (!Number.isInteger(raidsWithoutJackpot) || raidsWithoutJackpot < 0) {
    throw new RangeError('raidsWithoutJackpot must be an integer >= 0');
  }
  const { baseBp, softPityFromRaid, softPityStepBp, hardPityRaid } = RULES.raid.jackpot;
  const raid = raidsWithoutJackpot + 1; // the raid being rolled for
  if (raid >= hardPityRaid) return 10_000;
  if (raid < softPityFromRaid) return baseBp;
  return Math.min(10_000, baseBp + softPityStepBp * (raid - softPityFromRaid + 1));
}

/** Rolls the jackpot. The counter resets on a hit and grows by one otherwise. */
export function rollJackpot(rng: Rng, pityCounter: number): { hit: boolean; newCounter: number } {
  const bp = jackpotChanceBp(pityCounter);
  const hit = chance(rng, bp, 10_000);
  return { hit, newCounter: hit ? 0 : pityCounter + 1 };
}
