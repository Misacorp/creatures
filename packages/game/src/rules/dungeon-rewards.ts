/**
 * How a combat v2 dungeon run's rewards grow with depth (Misa, 2026-11-04; first numbers, to tune; the
 * data is `RULES.dungeon.depthRewards`). Combat v1 never calls these: its spec is `SINGLE_ROLL` and its
 * resources and experience are at 1.0x. The numbers are hidden from players; the one export meant to
 * show is `dungeonRewardScalars`, for the future depth picker.
 */
import { RULES } from './config';
import { dungeonRewardSpec, type BestOfSpec } from './best-of';
import { dungeonGearOddsBp, undercroftDepth } from './dungeon';

/** The depth a run's rewards are paid at: the run's depth, or the Undercroft's (`undercroftDepth`) once it went down `level` levels. */
export function rewardDepth(depth: number, undercroftLevel = 0): number {
  return undercroftLevel > 0 ? undercroftDepth(depth, undercroftLevel) : depth;
}

/** The gear spec of a combat v2 dungeon chest at `depth` (already the Undercroft's depth when below ground). */
export function dungeonGearSpec(depth: number, undercroftLevel = 0): BestOfSpec {
  return dungeonRewardSpec({
    depth: Math.max(1, Math.floor(depth)),
    ...(undercroftLevel > 0 ? { undercroftLevel } : {}),
  });
}

function growthBp(depth: number, g: { perDepthBp: number; maxBp: number }): number {
  const above = Math.max(0, Math.floor(depth) - 1);
  return 10_000 + Math.min(g.maxBp, g.perDepthBp * above);
}

/** The multiplier (basis points, 10000 = 1.0x) of a v2 run's pack resources at a depth. */
export function dungeonResourceBp(depth: number): number {
  return growthBp(depth, RULES.dungeon.depthRewards.resources);
}

/** How many landmark depths (`isLandmark`) are at or below `depth`. */
export function landmarksReached(depth: number): number {
  return Math.floor(Math.max(0, depth) / RULES.dungeon.landmarkEvery);
}

/**
 * The multiplier (basis points, 10000 = 1.0x) of a v2 run's creature experience at a depth: a step of
 * `landmarkStepBp` for each landmark depth reached (Misa, 2026-11-05).
 */
export function dungeonXpBp(depth: number): number {
  return 10_000 + RULES.dungeon.depthRewards.xp.landmarkStepBp * landmarksReached(depth);
}

/**
 * The base experience a v2 run pays a creature that earned `earnedBase` at the room prices of `RULES.experience.dungeon`:
 * its share of the run's full base (`runBase`) of `perRun`, times the landmark steps at the paid `depth`, in one rounding.
 * The run's full base is the most any creature of the row earned (one that stood in every room), but never less than
 * `nominalBase`, so a run cut short by a defeat pays a share and a longer run (more rooms, a trip into the Undercroft)
 * still pays `perRun` to a creature that stood in every room. The room prices only set the shares.
 */
export function dungeonRunXp(earnedBase: number, depth: number, topEarnedBase: number): number {
  const runBase = Math.max(topEarnedBase, earnedBase, RULES.dungeon.depthRewards.xp.nominalBase);
  const num = earnedBase * RULES.dungeon.depthRewards.xp.perRun * dungeonXpBp(depth);
  return Math.floor((num + (runBase * 10_000) / 2) / (runBase * 10_000));
}

/** `n` times `bp` / 10000, rounded half up (whole amounts only). */
export function scaleBp(n: number, bp: number): number {
  return Math.floor((n * bp + 5_000) / 10_000);
}

/** The expected summed weight of the best `keep` of `rolls` pieces, by rarity odds in basis points. */
function expectedKept(
  rolls: number,
  keep: number,
  odds: { common: number; rare: number; epic: number },
  weight: { common: number; rare: number; epic: number },
): number {
  const p = { c: odds.common / 10_000, r: odds.rare / 10_000, e: odds.epic / 10_000 };
  const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1));
  let total = 0;
  for (let e = 0; e <= rolls; e++) {
    for (let r = 0; r <= rolls - e; r++) {
      const c = rolls - e - r;
      const prob = (fact(rolls) / (fact(e) * fact(r) * fact(c))) * p.e ** e * p.r ** r * p.c ** c;
      const ke = Math.min(e, keep);
      const kr = Math.min(r, keep - ke);
      const kc = Math.min(c, keep - ke - kr);
      total += prob * (ke * weight.epic + kr * weight.rare + kc * weight.common);
    }
  }
  return total;
}

/**
 * The expected loot of a gear chest at a depth: the expected number of kept pieces times the weight of a
 * kept piece (`rarityWeight`: common 1, rare 2, epic 4), summed exactly over the spec's rolls and keeps
 * (each drawn evenly in its range) and the depth's rarity odds. Item level is left out.
 */
export function dungeonGearValue(depth: number): number {
  const spec = dungeonGearSpec(depth);
  const odds = dungeonGearOddsBp(depth, false);
  const weight = RULES.dungeon.depthRewards.rarityWeight;
  let sum = 0;
  let n = 0;
  for (let r = spec.rolls.min; r <= spec.rolls.max; r++) {
    for (let k = spec.keep.min; k <= spec.keep.max; k++) {
      sum += expectedKept(r, Math.min(r, k), odds, weight);
      n += 1;
    }
  }
  return sum / n;
}

/**
 * What going to `depth` pays relative to depth 1, for the depth picker: `xp` is the experience
 * multiplier and `loot` is the gear chest's expected value (`dungeonGearValue`) over depth 1's.
 */
export function dungeonRewardScalars(depth: number): { xp: number; loot: number } {
  return {
    xp: dungeonXpBp(depth) / dungeonXpBp(1),
    loot: dungeonGearValue(depth) / dungeonGearValue(1),
  };
}
