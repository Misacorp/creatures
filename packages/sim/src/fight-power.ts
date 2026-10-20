import {
  RULES,
  abilitiesFor,
  bossAtRank,
  bossAttacksAtRank,
  content,
  createSeededRng,
  luckAtRank,
} from '@creatures/game';
import {
  autoPlace,
  compactRow,
  liveEffects,
  liveFightRules,
  placeSlots,
  raidEnrage,
  scaleBoss,
  simulateFight,
  type AbilityChoice,
  type FightInput,
  type FightSlot,
} from '@creatures/engine';
import { DEFAULT_SERVER_SIZE } from './archetypes';
import { activeTalentsOf, foldKitsOf, pickTeam, wornOf, type OwnedCreature } from './data';
import { slotOfCreature } from './raid';

/**
 * Fight-scored power (docs/design/gear-and-creatures-v2.md, build step 1).
 *
 * `statsPower` (Attack + floor(HP / 10)) cannot see crits, reactions, Guards, Supports or a modifier
 * sheet, so it cannot say what gear or a talent is worth. This score plays the creatures instead:
 *
 * 1. The raid team (the three strongest creatures, `pickTeam`) stands in one line in the order the
 *    raid's default placement gives it (`autoPlace`: Guards left, Payoffs right), each beside the
 *    next, and plays a full finale (live rules, live luck and boss attacks at the
 *    rank, the creature abilities of level 10 and up, overtime) against each of the shipped bosses, at
 *    the Boss Rank given, with a boss whose pool cannot run out. The boss's Attack is a typical
 *    group's share (its Attack over the group size), since the raid spreads its hits over many more creatures.
 * 2. Each fight uses its own fixed seed, so the same team and rank always score the same, and a
 *    change to a creature changes the score through the fight only (paired seeds).
 * 3. The score is the damage the team dealt before it fell, per round of the finale's length
 *    (averaged over the bosses and seeds), so a team that dies early or never lands a reaction
 *    scores less. `survivalBp` is the share of the team's HP left at the end, as a guide.
 */

export interface FightPower {
  /** Mean damage per finale round over the reference fights (integer, higher is better). */
  power: number;
  /** The team's HP left at the end of the fights, in basis points of its maximum (mean). */
  survivalBp: number;
  /** Fights played. */
  fights: number;
}

export interface FightPowerOptions {
  /** Seeds played against each boss (default `DEFAULT_SEEDS`). More is steadier and slower. */
  seeds?: number;
  /** Seed text, to draw another set of fights (default fixed). */
  seed?: string;
  /**
   * The size of the group whose creatures share the boss's attention (default the typical server,
   * `DEFAULT_SERVER_SIZE`): the reference boss's Attack is divided by it, because three creatures
   * alone would take every hit that a whole raid spreads over three times as many.
   */
  group?: number;
}

/** Seeds per boss: 5 bosses x 3 seeds is 15 fights of 12 to 15 rounds for a score. */
export const DEFAULT_SEEDS = 3;

/** The boss pool of a reference fight: it cannot run out, so the score is damage, not a win. */
const UNBEATABLE = 1_000_000_000_000;

/** Alias of the one player the team belongs to in a reference fight. */
const PLAYER = 'fight-power';

/**
 * The creatures of the team as a row, placed as the raid's default rule places them (Guards left,
 * Payoffs right, Supports in the middle).
 */
export function referenceRow(team: readonly OwnedCreature[]): FightSlot[] {
  const slots = team.map((c) => slotOfCreature(c, PLAYER));
  const row = compactRow(
    autoPlace(new Array<FightSlot | null>(slots.length).fill(null), new Map([[PLAYER, slots]])),
  );
  // One line of three (as in the dungeon): the position lines of the gear see the neighbours and the ends.
  return placeSlots(row, foldKitsOf(team), 'line');
}

/** The finale's fight input against `bossId` at `rank` for a row (the boss's pool cannot run out). */
export function referenceFight(
  row: readonly FightSlot[],
  team: readonly OwnedCreature[],
  bossId: string,
  rank: number,
  group: number = DEFAULT_SERVER_SIZE,
): FightInput {
  const boss = content.bosses.find((b) => b.id === bossId);
  if (boss === undefined) throw new Error(`unknown boss "${bossId}"`);
  const bossAttacks = bossAttacksAtRank(rank);
  const enrage = raidEnrage('finale');
  const abilities: AbilityChoice[] = abilitiesFor(team, (c) => c.level).map((a) => ({
    playerId: PLAYER,
    abilityId: a.abilityId,
    key: `${a.creatureId}:ability`,
    creatureId: a.creatureId,
  }));
  return {
    boss: bossAtRank(boss, rank),
    bossAtk: Math.max(1, Math.floor(scaleBoss(boss, 1, rank).atk / group)),
    phase: 'finale',
    bossHpPool: { max: UNBEATABLE, current: UNBEATABLE },
    adaptation: null,
    row: [...row],
    // One line of three, each creature beside the next (as in the dungeon): the team's Guards,
    // Supports and position lines count, which a row of three one-slot zones would never let them.
    guardReach: 'adjacent',
    players: [PLAYER],
    finaleAbilities: abilities,
    ...(bossAttacks > 1 ? { bossAttacks } : {}),
    luck: luckAtRank(RULES.combat.luck, rank),
    rules: liveFightRules(),
    ...liveEffects(),
    ...(enrage === undefined ? {} : { enrage }),
  };
}

/** Everything the score depends on, as a cache key. */
function keyOf(
  team: readonly OwnedCreature[],
  rank: number,
  seeds: number,
  seed: string,
  group: number,
): string {
  return JSON.stringify([
    rank,
    seeds,
    seed,
    group,
    team.map((c) => [
      c.id,
      c.speciesId,
      c.level,
      c.fusionCount,
      c.items === undefined
        ? null
        : wornOf(c).map((i) => [i.baseId, i.rarity, i.itemLevel, i.lines]),
      c.mods ?? null,
      activeTalentsOf(c),
    ]),
  ]);
}

const CACHE = new Map<string, FightPower>();
const CACHE_LIMIT = 20_000;

/**
 * The fight-scored power of a team of creatures (their own three strongest, when more are given)
 * against the reference bosses at `rank`. Deterministic: the same creatures, rank and options always
 * give the same score. It does not read or change any other state.
 */
export function fightPower(
  creatures: readonly OwnedCreature[],
  rank: number,
  options: FightPowerOptions = {},
): FightPower {
  const seeds = options.seeds ?? DEFAULT_SEEDS;
  const seed = options.seed ?? 'fight-power';
  if (!Number.isInteger(seeds) || seeds < 1) throw new RangeError('seeds must be an integer >= 1');
  const team = pickTeam(creatures);
  const group = options.group ?? DEFAULT_SERVER_SIZE;
  if (!Number.isInteger(group) || group < 1) throw new RangeError('group must be an integer >= 1');
  const key = keyOf(team, rank, seeds, seed, group);
  const cached = CACHE.get(key);
  if (cached !== undefined) return cached;

  const row = referenceRow(team);
  let damage = 0;
  let rounds = 0;
  let hpLeft = 0;
  let hpMax = 0;
  let fights = 0;
  for (const boss of content.bosses) {
    const input = referenceFight(row, team, boss.id, rank, group);
    for (let k = 0; k < seeds; k++) {
      const result = simulateFight(
        input,
        createSeededRng(`${seed}:${boss.id}:${String(rank)}:${String(k)}`),
      );
      damage += result.bossHpStart - result.bossHpEnd;
      rounds += boss.finaleRounds;
      for (const slot of row) {
        hpLeft += result.hpEnd[slot.id] ?? 0;
        hpMax += result.hpMax[slot.id] ?? 0;
      }
      fights += 1;
    }
  }
  const out: FightPower = {
    power: rounds === 0 ? 0 : Math.floor(damage / rounds),
    survivalBp: hpMax === 0 ? 0 : Math.floor((hpLeft * 10_000) / hpMax),
    fights,
  };
  if (CACHE.size >= CACHE_LIMIT) CACHE.clear();
  CACHE.set(key, out);
  return out;
}
