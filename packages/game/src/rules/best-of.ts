/**
 * The best-of gear roller (Misa, 2026-11-04): "roll X to Y pieces of gear and select N to M of the best
 * ones to reward to the player", all values variable, hidden from players. Pure; the dice are the
 * injected `Rng` (the server's live source for rewards). Nothing here is shown to a player.
 *
 * A spec is data (`BestOfSpec`). `adjustSpec` moves it by a context (depth, Undercroft level, Boss
 * Rank ...) with the steps in `RULES.dungeon.depthRewards`. A spec of rolls 1, keep 1 draws nothing of
 * its own and calls `rollOne` once, so a path that uses it with that spec consumes the rng exactly as a
 * plain roll does (this is how combat v1 stays unchanged).
 */
import type { GearRarity } from '../content/gear-schema';
import { int, type Rng } from '../rng';
import { RULES } from './config';
import type { GearItem } from './gear-items';

/** An inclusive range of whole numbers. */
export interface IntRange {
  min: number;
  max: number;
}

/** How many pieces to roll and how many of the best to keep. */
export interface BestOfSpec {
  rolls: IntRange;
  keep: IntRange;
}

/** What can move a spec. Every key is optional: a missing one moves nothing. */
export interface BestOfContext {
  depth?: number;
  undercroftLevel?: number;
  bossRank?: number;
}

/** One data-driven step: add `add` to `field` for every `every` of `by` past `from`, never above `cap`. */
export interface BestOfStep {
  field: 'rolls.min' | 'rolls.max' | 'keep.min' | 'keep.max';
  by: keyof BestOfContext;
  from: number;
  every: number;
  add: number;
  cap: number;
}

/** The plain single roll: rolls 1, keep 1. Combat v1 always uses it. */
export const SINGLE_ROLL: BestOfSpec = {
  rolls: { min: 1, max: 1 },
  keep: { min: 1, max: 1 },
};

const RARITY_RANK: Readonly<Record<GearRarity, number>> = { common: 0, rare: 1, epic: 2 };

function bounded(spec: BestOfSpec): BestOfSpec {
  const clampRange = (r: IntRange, lo: number): IntRange => {
    const min = Math.max(lo, Math.floor(r.min));
    return { min, max: Math.max(min, Math.floor(r.max)) };
  };
  return { rolls: clampRange(spec.rolls, 1), keep: clampRange(spec.keep, 1) };
}

/**
 * The spec moved by a context: from `base`, every step whose `by` value is in the context adds
 * `add * floor((value - from) / every)` to its field, capped. Whole numbers, min never above max.
 */
export function adjustSpec(
  base: BestOfSpec,
  steps: readonly BestOfStep[],
  ctx: BestOfContext,
): BestOfSpec {
  const out = { rolls: { ...base.rolls }, keep: { ...base.keep } };
  for (const step of steps) {
    const value = ctx[step.by];
    if (value === undefined || !(step.every > 0)) continue;
    const times = Math.max(0, Math.floor((value - step.from) / step.every));
    const [group, end] = step.field.split('.') as ['rolls' | 'keep', 'min' | 'max'];
    out[group][end] = Math.min(
      Math.max(out[group][end], step.cap),
      out[group][end] + step.add * times,
    );
  }
  return bounded(out);
}

/** The spec of a combat v2 dungeon reward at a context (`RULES.dungeon.depthRewards`). */
export function dungeonRewardSpec(ctx: BestOfContext): BestOfSpec {
  const d = RULES.dungeon.depthRewards;
  return adjustSpec(
    { rolls: { ...d.base.rolls }, keep: { ...d.base.keep } },
    d.steps as readonly BestOfStep[],
    ctx,
  );
}

/** The sum of the tiers of an item's rolled lines (the last tie-break of "best"). */
function tierSum(item: GearItem): number {
  return item.lines.reduce((sum, l) => sum + l.tier, 0);
}

/** Orders two pieces best first: rarity, then item level, then the sum of the lines' tiers. 0 on a tie. */
export function compareGear(a: GearItem, b: GearItem): number {
  return (
    RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] ||
    b.itemLevel - a.itemLevel ||
    tierSum(b) - tierSum(a)
  );
}

function draw(rng: Rng, range: IntRange): number {
  return range.min === range.max ? range.min : range.min + int(rng, range.max - range.min + 1);
}

/**
 * Rolls R pieces (R drawn in `rolls`), orders them best first (`compareGear`; a tie keeps the roll
 * order) and keeps K of them (K drawn in `keep`, at most R). The draws run in a fixed order: R (only if
 * the range is not a single number), K (same), then `rollOne` R times. Returns the kept pieces, best first.
 */
export function rollBestOf(
  rng: Rng,
  spec: BestOfSpec,
  rollOne: (rng: Rng) => GearItem,
): GearItem[] {
  const s = bounded(spec);
  const rolls = draw(rng, s.rolls);
  const keep = Math.min(rolls, draw(rng, s.keep));
  const pieces: GearItem[] = [];
  for (let i = 0; i < rolls; i++) pieces.push(rollOne(rng));
  // Array.prototype.sort is stable, so equal pieces stay in roll order.
  return pieces.sort(compareGear).slice(0, keep);
}
