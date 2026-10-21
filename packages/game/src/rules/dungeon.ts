/**
 * Daily dungeon rules (docs/design/daily-dungeon.md): pure functions over `RULES.dungeon` and the
 * dungeon content. Randomness is injected (`Rng`): the server passes seeded streams of a run's seed
 * for the rooms, and its live crypto source for loot. Nothing here touches the engine.
 */
import { dungeonContent } from '../content/dungeon';
import type { DungeonFoeDef } from '../content/dungeon-schema';
import { content } from '../content';
import type { Element, ReactionDef, Role } from '../content/schema';
import { chance, int, pickWeighted, type Rng } from '../rng';
import { RULES } from './config';
import { rollDungeonItem, type GearItem, type PartsBundle } from './gear';
import { SUPPLY_KINDS, type SupplyTier } from '../content/expedition-schema';

/** True when `depth` is a landmark: every `RULES.dungeon.landmarkEvery`-th depth. */
export function isLandmark(depth: number): boolean {
  const every = RULES.dungeon.landmarkEvery;
  return Number.isInteger(depth) && depth >= 1 && depth % every === 0;
}

// --- The row ---

/** Where a role likes to stand in the dungeon's row of three: 0 left, 1 middle, 2 right. */
const ROW_RANK: Readonly<Record<Role, number>> = { setter: 0, support: 0, guard: 1, payoff: 2 };

/** One creature as the row's order sees it: what it hits with in a reaction (its element) and what it does with a mark (its role). */
export interface RowCreature {
  role: Role;
  element: Element;
}

/** One reaction of a row: set off in `round` by the creature at `payoff` on the mark of the one at `marker` (slots from 0). */
export interface RowReaction {
  round: number;
  marker: number;
  payoff: number;
  /** The reaction's content id (`overload`, `steam`...). */
  reaction: string;
}

/**
 * How many rounds the order of a row is judged over: a normal room's length. The marks carry over
 * from round to round, so a row that cashes in every round shows it within the first two or three.
 */
const ORDER_ROUNDS = 6;

/**
 * The reactions a row sets off against any foe, with everyone left standing, as the engine plays the
 * marks. The dungeon always goes left to right, so slot 0 hits first, and the mark a hit leaves
 * stays on the foe until someone takes it off:
 *
 * - the first hit on a foe with no mark leaves the hitter's own element as the mark;
 * - a hit by the element a mark is cashed in by (the reaction table, from content) sets off that
 *   reaction and uses the mark up;
 * - otherwise only a Setter replaces the mark, and only with a different element;
 * - a mark that nobody can cash in stays, so a row can go round after round with no reaction at all.
 *
 * Pure and deterministic: no dice, no foe, no stats. The creature that set the mark up is the
 * `marker` of the reaction that follows.
 */
export function rowReactions(
  row: readonly RowCreature[],
  reactions: readonly ReactionDef[] = content.reactions,
  rounds: number = ORDER_ROUNDS,
): RowReaction[] {
  const out: RowReaction[] = [];
  let mark: { element: Element; by: number } | null = null;
  for (let round = 1; round <= rounds; round++) {
    for (const [slot, c] of row.entries()) {
      const marked = mark?.element;
      const reaction =
        marked === undefined
          ? undefined
          : reactions.find((r) => r.markElement === marked && r.triggerElement === c.element);
      if (mark !== null && reaction !== undefined) {
        out.push({ round, marker: mark.by, payoff: slot, reaction: reaction.id });
        mark = null;
      } else if (mark === null || (c.role === 'setter' && mark.element !== c.element)) {
        mark = { element: c.element, by: slot };
      }
    }
  }
  return out;
}

/** What a row is worth for its order: how many reactions it sets off (`rowReactions`). */
export function rowScore(
  row: readonly RowCreature[],
  reactions: readonly ReactionDef[] = content.reactions,
): number {
  return rowReactions(row, reactions).length;
}

/** Every arrangement of `count` things, each as the list of indexes in the order they stand. */
function arrangements(count: number): number[][] {
  if (count === 0) return [[]];
  const out: number[][] = [];
  for (const rest of arrangements(count - 1)) {
    for (let at = 0; at <= rest.length; at++) {
      out.push([...rest.slice(0, at), count - 1, ...rest.slice(at)]);
    }
  }
  return out;
}

/**
 * The best order for a team of creatures in the dungeon's row, left to right. Every dungeon fight goes
 * left to right and a mark stays on the foe until it is replaced or cashed in, so the order decides
 * whether reactions happen at all (Splashet, Sproutle, Cindle never react: Tide marks and nobody has
 * Spark; Cindle, Sproutle, Splashet reacts every round). The order is picked in two steps:
 *
 * 1. Of all the orders, the ones that set off the most reactions (`rowScore`).
 * 2. Among those, the one that stands creatures by role: setters and supports on the left (a mark
 *    must be set before it is paid off), a Guard in the middle (it covers both neighbours, and a
 *    plain attack from the left lands on it), payoffs on the right. Still tied, the order given
 *    wins, so pass the creatures strongest first.
 *
 * Meant for a team of three (it tries every order). The simulator's players and the client's "Use my
 * strongest three" both stand teams this way; the player is free to choose any order.
 */
export function dungeonRowOrder<T extends RowCreature>(
  creatures: readonly T[],
  reactions: readonly ReactionDef[] = content.reactions,
): T[] {
  const lexicographic = (a: readonly number[], b: readonly number[]): number => {
    for (const [i, x] of a.entries()) if (x !== b[i]) return x - (b[i] as number);
    return 0;
  };
  const orders = arrangements(creatures.length).map((order) => {
    const row = order.map((i) => creatures[i] as T);
    return { row, order, score: rowScore(row, reactions), ranks: row.map((c) => ROW_RANK[c.role]) };
  });
  orders.sort(
    (x, y) =>
      y.score - x.score || lexicographic(x.ranks, y.ranks) || lexicographic(x.order, y.order),
  );
  return orders[0]?.row ?? [];
}

// --- Depth scaling ---

/**
 * The strength factor of a depth in basis points: 10000 at depth 1 and, for the depths above it
 * (`n` of them), `stepBp` for each plus `curveBp` for each square, so a gentle start can steepen
 * (`10000 + stepBp x n + curveBp x n x n`; with a curve of 0 the foes grow in a straight line). The
 * depth is floored and kept in 1..`maxScaledDepth`.
 */
export function depthFactorBp(depth: number, stepBp: number, curveBp = 0): number {
  const d = Math.max(1, Math.min(RULES.dungeon.maxScaledDepth, Math.floor(depth)));
  const n = d - 1;
  return 10_000 + stepBp * n + curveBp * n * n;
}

/**
 * A foe's HP and Attack at a depth: its content numbers times the dungeon's base strength
 * (`baseHpBp`, `baseAtkBp`) and the depth factors, floored at every step, at least 1.
 */
export function scaledFoe(
  foe: Pick<DungeonFoeDef, 'baseHp' | 'baseAtk'>,
  depth: number,
): { hp: number; atk: number } {
  const base = (value: number, bp: number): number => Math.floor((value * bp) / 10_000);
  const hp = base(
    base(foe.baseHp, RULES.dungeon.baseHpBp),
    depthFactorBp(depth, RULES.dungeon.hpStepBp, RULES.dungeon.hpCurveBp),
  );
  const atk = base(
    base(foe.baseAtk, RULES.dungeon.baseAtkBp),
    depthFactorBp(depth, RULES.dungeon.atkStepBp, RULES.dungeon.atkCurveBp),
  );
  return { hp: Math.max(1, hp), atk: Math.max(1, atk) };
}

// --- Rooms and modifiers ---

/**
 * The floor boss of a landmark depth, or null when `depth` is not a landmark. The k-th landmark
 * (k = depth / `landmarkEvery`, from 1) takes the floor bosses in content order and goes round again:
 * `(k - 1) mod count`, so with every 7th depth a landmark, depth 7 is the first boss, 14 the second.
 */
export function landmarkBossId(depth: number): string | null {
  if (!isLandmark(depth)) return null;
  const bosses = dungeonContent.foes.filter((f) => f.kind === 'boss');
  const k = depth / RULES.dungeon.landmarkEvery;
  return bosses[(k - 1) % bosses.length]?.id ?? null;
}

// --- Rewards ---

/** The parts of a run's payout that `rollDungeonLoot` reads: what was cleared decides which dice roll. */
export interface DungeonPayout {
  bait: number;
  essence: number;
  scrap: number;
  glimmer: number;
  /** Supplies the cleared rooms drop (each one's tier and kind are rolled by `rollDungeonLoot`). */
  supplies: number;
  /** The depth is a landmark and every room was cleared: the gear drop is guaranteed. */
  landmark: boolean;
  /** Every room was cleared. */
  fullClear: boolean;
  /** The boss room was cleared (it may drop a shard). */
  bossCleared: boolean;
}

/** The position (1-based) of a streak in its cycle: day 1 to `cycleDays`, then round again. */
export function streakCycleDay(streak: number): number {
  const cycle = RULES.dungeon.streak.cycleDays;
  return ((Math.max(1, Math.floor(streak)) - 1) % cycle) + 1;
}

export interface StreakBonus {
  /** The day of the cycle this bonus belongs to (3 or 7). */
  day: number;
  bait: number;
  essence: number;
  scrap: number;
  glimmer: number;
}

/** The bonus a run earns at this streak (the player's days in a row, counting this run), or null. */
export function streakBonus(streak: number): StreakBonus | null {
  const day = streakCycleDay(streak);
  const bonus = RULES.dungeon.streak.bonuses.find((b) => b.day === day);
  return bonus === undefined ? null : { ...bonus };
}

/** Gear odds (basis points) of a dungeon drop at a depth; the rest is common. */
export function dungeonGearOddsBp(
  depth: number,
  landmark: boolean,
): { rare: number; epic: number; common: number } {
  const { baseBp, perDepthBp, maxBp, landmarkBonusBp } = RULES.dungeon.gearOdds;
  const above = Math.max(0, Math.floor(depth) - 1);
  const bonus = landmark ? landmarkBonusBp : { rare: 0, epic: 0 };
  const rare = Math.min(
    maxBp.rare + bonus.rare,
    baseBp.rare + perDepthBp.rare * above + bonus.rare,
  );
  const epic = Math.min(
    maxBp.epic + bonus.epic,
    baseBp.epic + perDepthBp.epic * above + bonus.epic,
  );
  return { rare, epic, common: Math.max(0, 10_000 - rare - epic) };
}

/**
 * The tier odds (basis points) of a supply the dungeon drops at a depth: each better tier is closed
 * until its `fromDepth`, then rises with the depth up to its cap (`RULES.dungeon.supplyTiers`); the
 * rest is basic.
 */
export function dungeonSupplyOddsBp(depth: number): Record<SupplyTier, number> {
  const open = (t: {
    fromDepth: number;
    baseBp: number;
    perDepthBp: number;
    maxBp: number;
  }): number =>
    depth < t.fromDepth
      ? 0
      : Math.min(t.maxBp, t.baseBp + t.perDepthBp * (Math.floor(depth) - t.fromDepth));
  const { good, great } = RULES.dungeon.supplyTiers;
  const greatBp = open(great);
  const goodBp = Math.min(open(good), 10_000 - greatBp);
  return { basic: 10_000 - goodBp - greatBp, good: goodBp, great: greatBp };
}

/** The kinds the dungeon drops: every kind but the lure, which is made from Bait in the Workshop and nowhere else. */
const DROPPED_SUPPLY_KINDS = SUPPLY_KINDS.filter((k) => k !== 'lure');

/** One supply the dungeon drops at a depth: a tier by `dungeonSupplyOddsBp`, a kind drawn evenly (never a lure). Returns its content id. */
export function rollDungeonSupply(rng: Rng, depth: number): string {
  const odds = dungeonSupplyOddsBp(depth);
  const tier = pickWeighted<{ tier: SupplyTier; weight: number }>(rng, [
    { tier: 'basic', weight: odds.basic },
    { tier: 'good', weight: odds.good },
    { tier: 'great', weight: odds.great },
  ]).tier;
  const kind = DROPPED_SUPPLY_KINDS[int(rng, DROPPED_SUPPLY_KINDS.length)] as string;
  return `${kind}-${tier}`;
}

/** What a run's dice gave: parts, gear and supplies (the grant adds the scrap and glimmer of the payout). */
export interface DungeonLoot {
  parts: PartsBundle;
  gear: GearItem[];
  /** Supply content ids (`lure-good`), one per supply. */
  supplies: string[];
}

/**
 * Rolls the dice of a run's loot, always in the same order: the boss room's shard (a shard of the
 * boss's element, if the boss room was cleared), then, for a full clear, the gear chance (a landmark
 * ignores it, its drop is certain) and, if there is a drop, its rarity, base and rolls, and last the
 * supplies of the cleared rooms (tier, then kind, each). The supplies come last so the dice above
 * are drawn as they were before the dungeon dropped supplies.
 */
export function rollDungeonLoot(
  rng: Rng,
  depth: number,
  payout: Pick<DungeonPayout, 'landmark' | 'fullClear' | 'bossCleared' | 'supplies'>,
  bossElement: Element,
): DungeonLoot {
  const parts: PartsBundle = {};
  const gear: DungeonLoot['gear'] = [];
  const supplies: string[] = [];
  if (payout.fullClear) {
    const lucky = chance(rng, RULES.dungeon.fullClear.gearBp, 10_000);
    if (lucky || payout.landmark) {
      const odds = dungeonGearOddsBp(depth, payout.landmark);
      const rarity = pickWeighted<{ rarity: 'common' | 'rare' | 'epic'; weight: number }>(rng, [
        { rarity: 'common', weight: odds.common },
        { rarity: 'rare', weight: odds.rare },
        { rarity: 'epic', weight: odds.epic },
      ]).rarity;
      gear.push(rollDungeonItem(rng, rarity, depth, payout.landmark, bossElement));
    }
  }
  for (let i = 0; i < payout.supplies; i++) supplies.push(rollDungeonSupply(rng, depth));
  return { parts, gear, supplies };
}

// --- The Undercroft (docs/design/dungeon-paths.md) ---

/** True when a run at `depth` may go down into the Undercroft (`RULES.dungeon.undercroft.fromDepth`). */
export function undercroftOpen(depth: number): boolean {
  return Number.isInteger(depth) && depth >= RULES.dungeon.undercroft.fromDepth;
}

/**
 * The floors of a run's first Undercroft before the keeper (marks not counted): `baseFloors`, plus
 * `perLandmark` for every landmark passed after the first, at most `maxFloors`. A deeper level (cracked
 * floor) has `deeperFloors`. The landmarks passed by a run at `depth` are those below it.
 */
export function undercroftBaseFloors(depth: number, level: number): number {
  const u = RULES.dungeon.undercroft;
  if (level > 1) return u.deeperFloors;
  const passed = Math.floor((Math.max(1, Math.floor(depth)) - 1) / RULES.dungeon.landmarkEvery);
  return Math.min(u.maxFloors, u.baseFloors + u.perLandmark * Math.max(0, passed - 1));
}

/** The depth an Undercroft level's foes are scaled at: the run's depth, plus `depthBonus` for each level. */
export function undercroftDepth(depth: number, level: number): number {
  return depth + RULES.dungeon.undercroft.depthBonus * Math.max(0, level);
}

/** Gear odds (basis points) of the keeper's chest: the dungeon's own at this depth, plus the chest's bonuses on rare and epic. */
export function undercroftGearOddsBp(depth: number): {
  rare: number;
  epic: number;
  common: number;
} {
  const base = dungeonGearOddsBp(depth, false);
  const c = RULES.dungeon.undercroft.chest;
  const rare = base.rare + c.rareBonusBp;
  const epic = base.epic + c.epicBonusBp;
  return { rare, epic, common: Math.max(0, 10_000 - rare - epic) };
}

/**
 * The gear dice of a keeper's chest: a `gearBp` chance of one piece (rarity by `undercroftGearOddsBp`,
 * item level `itemLevelBonus` above the dungeon's), the keeper's element as its tag. Drawn in a fixed
 * order from `rng` (the worker's live gear source).
 */
export function rollUndercroftChest(rng: Rng, depth: number, element: Element): GearItem[] {
  const c = RULES.dungeon.undercroft.chest;
  if (!chance(rng, c.gearBp, 10_000)) return [];
  const odds = undercroftGearOddsBp(depth);
  const rarity = pickWeighted<{ rarity: 'common' | 'rare' | 'epic'; weight: number }>(rng, [
    { rarity: 'common', weight: odds.common },
    { rarity: 'rare', weight: odds.rare },
    { rarity: 'epic', weight: odds.epic },
  ]).rarity;
  return [rollDungeonItem(rng, rarity, depth, false, element, c.itemLevelBonus)];
}
