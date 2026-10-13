/**
 * Daily dungeon rules (docs/design/daily-dungeon.md): pure functions over `RULES.dungeon` and the
 * dungeon content. Randomness is injected (`Rng`): the server passes seeded streams of a run's seed
 * for the rooms, and its live crypto source for loot. Nothing here touches the engine.
 */
import { dungeonContent, dungeonFoe, roomModifier } from '../content/dungeon';
import type { DungeonFoeDef, DungeonFoeKind } from '../content/dungeon-schema';
import type { Element, Role } from '../content/schema';
import { chance, int, pickWeighted, type Rng } from '../rng';
import { RULES } from './config';
import { droppableBases, rollGear, shardOf, type GearRolls, type PartsBundle } from './gear';
import type { GearRarity } from '../content/gear-schema';

/** True when `depth` is a landmark: every `RULES.dungeon.landmarkEvery`-th depth. */
export function isLandmark(depth: number): boolean {
  const every = RULES.dungeon.landmarkEvery;
  return Number.isInteger(depth) && depth >= 1 && depth % every === 0;
}

// --- The row ---

/** Where a role likes to stand in the dungeon's row of three: 0 left, 1 middle, 2 right. */
const ROW_RANK: Readonly<Record<Role, number>> = { setter: 0, support: 0, guard: 1, payoff: 2 };

/**
 * A good order for a team of creatures in the dungeon's row, left to right: setters and supports on
 * the left (they act first when the foe goes left to right, and a mark must be set before it is
 * paid off), a Guard in the middle (it covers both neighbours, and a plain attack from the left
 * lands on it), payoffs on the right (the end the foe reaches last). Ties keep the order given, so
 * pass the creatures strongest first. The simulator's players and the client's "Use my strongest
 * three" both stand teams this way; the player is free to choose any order.
 */
export function dungeonRowOrder<T extends { role: Role }>(creatures: readonly T[]): T[] {
  return creatures
    .map((c, i) => ({ c, i }))
    .sort((a, b) => ROW_RANK[a.c.role] - ROW_RANK[b.c.role] || a.i - b.i)
    .map((x) => x.c);
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
 * The rooms of a run: normal foes (all different) for every room but the last, then a room boss,
 * each with the day's modifier for that room. Draws from the run's seeded stream in a fixed order.
 */
export function rollRooms(rng: Rng, modifierIds: readonly string[]): RoomPlan[] {
  const rooms = RULES.dungeon.rooms;
  if (modifierIds.length < rooms) throw new RangeError('not enough modifiers for the rooms');
  const normal = shuffled(
    rng,
    dungeonContent.foes.filter((f) => f.kind === 'foe'),
  );
  const bosses = dungeonContent.foes.filter((f) => f.kind === 'boss');
  const boss = bosses[int(rng, bosses.length)];
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

/** What a run's dice gave: parts and gear (the grant adds the scrap and glimmer of the payout). */
export interface DungeonLoot {
  parts: PartsBundle;
  gear: { baseId: string; rarity: GearRarity; rolls: GearRolls }[];
}

/**
 * Rolls the dice of a run's loot, always in the same order: the boss room's shard (a shard of the
 * boss's element, if the boss room was cleared), then, for a full clear, the gear chance (a landmark
 * ignores it, its drop is certain) and, if there is a drop, its rarity, base and rolls.
 */
export function rollDungeonLoot(
  rng: Rng,
  depth: number,
  payout: Pick<DungeonPayout, 'landmark' | 'fullClear' | 'bossCleared'>,
  bossElement: Element,
): DungeonLoot {
  const parts: PartsBundle = {};
  const gear: DungeonLoot['gear'] = [];
  if (payout.bossCleared && chance(rng, RULES.dungeon.bossShardBp, 10_000)) {
    parts[shardOf(bossElement)] = 1;
  }
  if (payout.fullClear) {
    const lucky = chance(rng, RULES.dungeon.fullClear.gearBp, 10_000);
    if (lucky || payout.landmark) {
      const odds = dungeonGearOddsBp(depth, payout.landmark);
      const rarity = pickWeighted<{ rarity: GearRarity; weight: number }>(rng, [
        { rarity: 'common', weight: odds.common },
        { rarity: 'rare', weight: odds.rare },
        { rarity: 'epic', weight: odds.epic },
      ]).rarity;
      const bases = droppableBases();
      const base = bases[int(rng, bases.length)];
      if (base === undefined) throw new Error('no gear bases to drop');
      gear.push({ baseId: base.id, rarity, rolls: rollGear(rng, base.id, rarity) });
    }
  }
  return { parts, gear };
}
