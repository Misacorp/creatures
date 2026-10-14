import {
  RULES,
  abilitiesFor,
  addParts,
  createSeededRng,
  dungeonFoe,
  dungeonRowOrder,
  dungeonPayout,
  rollDayModifiers,
  rollDungeonLoot,
  rollRooms,
  roomModifier,
  scaledFoe,
  streakBonus,
  type Rng,
} from '@creatures/game';
import {
  simulateDungeon,
  type AbilityChoice,
  type DungeonRoomSpec,
  type DungeonRunInput,
  type FightSlot,
} from '@creatures/engine';
import { pickTeam } from './data';
import { grantDungeonLoot } from './gear';
import { slotFor } from './raid';
import type { SimPlayer } from './state';

/**
 * The daily dungeon in the simulator (docs/design/daily-dungeon.md). Every rule comes from
 * `@creatures/game` and `@creatures/engine` (rooms, scaling, payouts, streaks, loot, the chain of
 * fights); this file holds what a player does with them:
 *
 * - A player with at least 3 creatures runs the dungeon once on every day they check in: casuals on
 *   their leet days, everybody else every day. On the first day they ever ran, a lost run may be
 *   tried once more (the worker's free retry).
 * - The team is the player's 3 strongest creatures by power (gear included), stood in one row by
 *   `dungeonRowOrder` (the order that sets off the most reactions left to right; ties go setters and supports left, a Guard in the middle, payoffs right). There is no basic ability and
 *   every unlocked creature ability fires at its default round.
 * - The day's modifiers are shared by everybody (drawn from a seed of the day), the rooms from the
 *   run's seed, and the rewards are paid as the worker pays them.
 */
export const DUNGEON_PLAYER = 'p1';

/** One run, for the analysis. */
export interface DungeonLogEntry {
  /** Day index since the sim start, and days since the player joined. */
  day: number;
  daysSinceJoin: number;
  depth: number;
  roomsCleared: number;
  cleared: boolean;
}

/** The modifiers of a day: the same for every player of the server. */
export function dayModifiers(seed: string, day: number): string[] {
  return rollDayModifiers(createSeededRng(`${seed}:dungeon-day:${String(day)}`));
}

/** The run input of a player's team at a depth, with the day's modifiers (the worker's `runIn`, without storage). */
export function buildRun(
  player: SimPlayer,
  depth: number,
  modifiers: readonly string[],
  seed: string,
): DungeonRunInput {
  const team = pickTeam(player.creatures);
  // One row, left to right: the game's rule for a good order (`dungeonRowOrder`: the most reactions, then roles), strongest first.
  const row = dungeonRowOrder(
    team.map((c): FightSlot => ({ ...slotFor(player, c.id), ownerId: DUNGEON_PLAYER })),
  );
  const plans = rollRooms(createSeededRng(`${seed}:rooms`), modifiers);
  const rooms: DungeonRoomSpec[] = plans.map((plan) => {
    const foe = dungeonFoe(plan.foeId);
    const modifier = roomModifier(plan.modifierId);
    if (foe === undefined || modifier === undefined) throw new Error('rolled room not in content');
    const { hp, atk } = scaledFoe(foe, depth);
    return { index: plan.index, foe, modifier, hp, atk };
  });
  const abilities: AbilityChoice[] = [];
  const unlocked = abilitiesFor(
    row.map((s) => ({ id: s.id, speciesId: s.speciesId, level: s.level })),
    (c) => c.level,
  );
  for (const [i, a] of unlocked.entries()) {
    abilities.push({
      playerId: DUNGEON_PLAYER,
      abilityId: a.abilityId,
      key: `${DUNGEON_PLAYER}:c${String(i)}`,
      creatureId: a.creatureId,
    });
  }
  return { team: row, player: DUNGEON_PLAYER, rooms, abilities, luck: { ...RULES.combat.luck } };
}

/**
 * One player's dungeon day. Returns the runs made (none if the player has fewer than 3 creatures).
 * `seed` is the sim's seed for this player and day; `loot` the stream the gear and shard rolls use.
 */
export function playDungeonDay(
  player: SimPlayer,
  day: number,
  modifiers: readonly string[],
  seed: string,
  loot: Rng,
): DungeonLogEntry[] {
  if (player.creatures.length < RULES.dungeon.teamSize) return [];
  const d = player.dungeon;
  const first = d.firstDay === null || d.firstDay === day;
  const log: DungeonLogEntry[] = [];
  for (let attempt = 1; attempt <= (first ? 2 : 1); attempt++) {
    const depth = d.depth;
    const runSeed = `${seed}:${String(attempt)}`;
    const run = buildRun(player, depth, modifiers, runSeed);
    const result = simulateDungeon(run, runSeed);

    // Progress, the streak (days in a row), and the depth.
    if (d.firstDay === null) d.firstDay = day;
    const firstOfDay = d.lastDay !== day;
    d.streak = d.lastDay === day ? d.streak : d.lastDay === day - 1 ? d.streak + 1 : 1;
    d.lastDay = day;
    d.runs += 1;
    if (result.cleared) {
      d.clears += 1;
      d.depth += 1;
    }

    // Pay: the rooms, the loot dice, and the streak bonus on the first run of a day.
    const payout = dungeonPayout(depth, result.roomsCleared);
    const boss = run.rooms.at(-1);
    const drop = rollDungeonLoot(loot, depth, payout, boss?.foe.element ?? 'tide');
    const parts = addParts({ scrap: payout.scrap, glimmer: payout.glimmer }, drop.parts);
    player.bait += payout.bait;
    player.essence += payout.essence;
    const week = player.week;
    week.dungeonRuns += 1;
    week.dungeonClears += result.cleared ? 1 : 0;
    week.dungeonBait += payout.bait;
    week.dungeonEssence += payout.essence;
    week.dungeonScrap += parts.scrap ?? 0;
    week.dungeonItems += drop.gear.length;
    grantDungeonLoot(player, parts, drop.gear);
    const bonus = firstOfDay ? streakBonus(d.streak) : null;
    if (bonus !== null) {
      player.bait += bonus.bait;
      player.essence += bonus.essence;
      week.dungeonBait += bonus.bait;
      week.dungeonEssence += bonus.essence;
      week.dungeonScrap += bonus.scrap;
      grantDungeonLoot(player, { scrap: bonus.scrap, glimmer: bonus.glimmer }, []);
    }

    log.push({
      day,
      daysSinceJoin: day - (player.gear.joinDay ?? day),
      depth,
      roomsCleared: result.roomsCleared,
      cleared: result.cleared,
    });
    // A retry is for a lost first run only.
    if (result.cleared) break;
  }
  return log;
}
