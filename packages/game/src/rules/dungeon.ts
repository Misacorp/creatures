/**
 * Daily dungeon rules (docs/design/daily-dungeon.md): pure functions over `RULES.dungeon` and the
 * dungeon content. Randomness is injected (`Rng`): the server passes seeded streams of a run's seed
 * for the rooms, and its live crypto source for loot. Nothing here touches the engine.
 */
import { dungeonContent, dungeonFoe, roomModifier } from '../content/dungeon';
import type { DungeonFoeDef, DungeonFoeKind } from '../content/dungeon-schema';
import { content } from '../content';
import type { Element, ReactionDef, Role } from '../content/schema';
import { chance, int, pickWeighted, type Rng } from '../rng';
import { RULES } from './config';
import { rollDungeonItem, shardOf, type GearItem, type PartsBundle } from './gear';
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
  const byMark = new Map(reactions.map((r) => [r.markElement, r]));
  const out: RowReaction[] = [];
  let mark: { element: Element; by: number } | null = null;
  for (let round = 1; round <= rounds; round++) {
    for (const [slot, c] of row.entries()) {
      const reaction = mark === null ? undefined : byMark.get(mark.element);
      if (mark !== null && reaction !== undefined && reaction.triggerElement === c.element) {
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

/** One room of a run: what fills it and the modifier it rolled. */
export interface RoomPlan {
  index: number;
  kind: DungeonFoeKind;
  foeId: string;
  modifierId: string;
}

function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = int(rng, i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * The modifiers of a guild-local day, one for each room, all different. They come from their own
 * seed (never the run's), so the day's modifiers can be shown before anyone enters.
 */
export function rollDayModifiers(rng: Rng): string[] {
  return shuffled(
    rng,
    dungeonContent.modifiers.map((m) => m.id),
  ).slice(0, RULES.dungeon.rooms);
}

/**
 * The room boss of a landmark depth, or null when `depth` is not a landmark. The k-th landmark
 * (k = depth / `landmarkEvery`, from 1) takes the room bosses in content order and goes round again:
 * `(k - 1) mod count`, so with every 7th depth a landmark, depth 7 is the first boss, 14 the second.
 */
export function landmarkBossId(depth: number): string | null {
  if (!isLandmark(depth)) return null;
  const bosses = dungeonContent.foes.filter((f) => f.kind === 'boss');
  const k = depth / RULES.dungeon.landmarkEvery;
  return bosses[(k - 1) % bosses.length]?.id ?? null;
}

/**
 * The rooms of a run: normal foes (all different) for every room but the last, then a room boss,
 * each with the day's modifier for that room. Draws from the run's seeded stream in a fixed order.
 * At a landmark `depth` the boss room's foe is fixed (`landmarkBossId`) instead of drawn; the draw is
 * still made and dropped, so the stream is consumed exactly as on any other day.
 */
export function rollRooms(rng: Rng, modifierIds: readonly string[], depth: number): RoomPlan[] {
  const rooms = RULES.dungeon.rooms;
  if (modifierIds.length < rooms) throw new RangeError('not enough modifiers for the rooms');
  const normal = shuffled(
    rng,
    dungeonContent.foes.filter((f) => f.kind === 'foe'),
  );
  const bosses = dungeonContent.foes.filter((f) => f.kind === 'boss');
  const drawn = bosses[int(rng, bosses.length)];
  const fixedId = landmarkBossId(depth);
  const boss = fixedId === null ? drawn : bosses.find((b) => b.id === fixedId);
  if (boss === undefined) throw new Error('no room boss in the content');
  const plans: RoomPlan[] = [];
  for (let index = 0; index < rooms; index++) {
    const last = index === rooms - 1;
    const foe = last ? boss : normal[index];
    if (foe === undefined) throw new Error('not enough dungeon foes');
    plans.push({
      index,
      kind: foe.kind,
      foeId: foe.id,
      modifierId: modifierIds[index] as string,
    });
  }
  return plans;
}

/** Checks a room plan against the content (ids exist), for stored or client-sent plans. */
export function roomPlanValid(plan: RoomPlan): boolean {
  return dungeonFoe(plan.foeId) !== undefined && roomModifier(plan.modifierId) !== undefined;
}

// --- Rewards ---

/** The amounts a run pays that need no dice. Parts are scrap and glimmer; the shard and gear are rolled. */
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

/**
 * What a run pays for the rooms it cleared: each cleared room's Bait, Essence and scrap, then for a
 * full clear its Essence, and for a full clear of a landmark depth the landmark's extra.
 */
export function dungeonPayout(depth: number, roomsCleared: number): DungeonPayout {
  const rooms = RULES.dungeon.rooms;
  const cleared = Math.max(0, Math.min(rooms, Math.floor(roomsCleared)));
  const out: DungeonPayout = {
    bait: 0,
    essence: 0,
    scrap: 0,
    glimmer: 0,
    supplies: 0,
    landmark: false,
    fullClear: cleared === rooms,
    bossCleared: cleared === rooms,
  };
  for (let i = 0; i < cleared; i++) {
    const room = RULES.dungeon.perRoom[i];
    if (room === undefined) continue;
    out.bait += room.bait;
    out.essence += room.essence;
    out.scrap += room.scrap;
    out.supplies += room.supply;
  }
  if (out.fullClear) {
    out.essence += RULES.dungeon.fullClear.essence;
    if (isLandmark(depth)) {
      out.landmark = true;
      out.essence += RULES.dungeon.landmark.essence;
      out.scrap += RULES.dungeon.landmark.scrap;
      out.glimmer += RULES.dungeon.landmark.glimmer;
    }
  }
  return out;
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
  if (payout.bossCleared && chance(rng, RULES.dungeon.bossShardBp, 10_000)) {
    parts[shardOf(bossElement)] = 1;
  }
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
