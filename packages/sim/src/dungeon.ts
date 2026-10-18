import {
  RULES,
  abilitiesFor,
  addParts,
  createSeededRng,
  dungeonFoe,
  dungeonRowOrder,
  dungeonPayout,
  dungeonScrapPerRoom,
  mergeMods,
  rollDayModifiers,
  rollDungeonLoot,
  rollRooms,
  roomModifier,
  rowScore,
  scaledFoe,
  streakBonus,
  weatherBossAttacks,
  weatherSky,
  weatherLuck,
  weatherSheet,
  type Rng,
  type WeatherDay,
} from '@creatures/game';
import {
  dungeonBossEnrage,
  simulateDungeon,
  skyRunFields,
  type AbilityChoice,
  type DungeonRoomSpec,
  type DungeonRunInput,
  type FightSlot,
} from '@creatures/engine';
import {
  byPowerDesc,
  creaturePower,
  foldedCreature,
  pickTeam,
  TEAM_SIZE,
  type OwnedCreature,
} from './data';
import type { DungeonSkill } from './profiles';
import { shuffle } from './util';
import { neutralSupport, studyRules, type RoleStudy } from './role-study';
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
 *   every unlocked creature ability fires at its default round. (That is the profile skill `good`, today's
 *   behaviour; the journey profiles can also pick the best three by row score, strongest first, or at random:
 *   `chooseDungeonTeam`.)
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

/** The three creatures a player takes into the dungeon and whether the row is stood by the game's rule. */
export interface DungeonTeam {
  creatures: readonly OwnedCreature[];
  /** True: `dungeonRowOrder` stands them; false: they stand in the order given. */
  ordered: boolean;
}

/** Top creatures (by power) the `best` skill picks its three from. */
const BEST_POOL = 6;

/** Every way to take `size` of `items`, in order. */
function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i + size <= items.length; i++) {
    for (const rest of combinations(items.slice(i + 1), size - 1)) {
      out.push([items[i] as T, ...rest]);
    }
  }
  return out;
}

/**
 * The dungeon team of a player of a skill (`DungeonSkill`): `good` is today's (the strongest three, the
 * game's row order); `best` searches the player's top six for the three whose best row sets off the
 * most reactions (`rowScore`), then the most power; `reasonable` takes the strongest three strongest
 * first; `random` takes any three in a random order (drawn from `rng`, which the others never touch).
 */
export function chooseDungeonTeam(player: SimPlayer, skill: DungeonSkill, rng: Rng): DungeonTeam {
  if (skill === 'good') return { creatures: pickTeam(player.creatures), ordered: true };
  if (skill === 'reasonable') return { creatures: pickTeam(player.creatures), ordered: false };
  if (skill === 'random') {
    return { creatures: shuffle(rng, player.creatures).slice(0, TEAM_SIZE), ordered: false };
  }
  const pool = byPowerDesc(player.creatures).slice(0, BEST_POOL);
  let best: { team: OwnedCreature[]; score: number; power: number } | null = null;
  for (const team of combinations(pool, TEAM_SIZE)) {
    const row = dungeonRowOrder(team.map((c) => slotFor(player, c.id)));
    const score = rowScore(row);
    const power = team.reduce((n, c) => n + creaturePower(c), 0);
    if (best === null || score > best.score || (score === best.score && power > best.power)) {
      best = { team, score, power };
    }
  }
  return { creatures: best?.team ?? pickTeam(player.creatures), ordered: true };
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
  study: RoleStudy = {},
  chosen?: DungeonTeam,
  weather: WeatherDay | null = null,
): DungeonRunInput {
  const team = chosen?.creatures ?? pickTeam(player.creatures);
  // One row, left to right: the game's rule for a good order (`dungeonRowOrder`: the most reactions, then roles), strongest first.
  const slots = team.map((c): FightSlot => {
    const slot = { ...slotFor(player, c.id), ownerId: DUNGEON_PLAYER };
    const played =
      study.neutralSupports === true && slot.role === 'support' ? neutralSupport(slot) : slot;
    // The day's weather goes on every creature's sheet, as the worker's run builder puts it.
    const mods = mergeMods(played.mods, weatherSheet(weather, played));
    return mods === undefined ? played : { ...played, mods };
  });
  const row = chosen?.ordered === false ? slots : dungeonRowOrder(slots);
  const plans = rollRooms(createSeededRng(`${seed}:rooms`), modifiers, depth);
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
  // As live play builds it: the boss room enrages, and a landmark depth gives the room boss its
  // signature (both are part of the stored run input).
  const enrage = dungeonBossEnrage();
  // Between-room rest (a Scarf line), from the same folded gear rules as live play.
  const rest: Record<string, number> = {};
  for (const c of team) {
    const restBp = foldedCreature(c).rules.restBp;
    if (restBp > 0) rest[c.id] = restBp;
  }
  return {
    team: row,
    player: DUNGEON_PLAYER,
    rooms,
    abilities,
    luck: { ...weatherLuck(weather, RULES.combat.luck) },
    ...(weatherBossAttacks(weather, 1) > 1 ? { bossAttacks: weatherBossAttacks(weather, 1) } : {}),
    ...skyRunFields(weatherSky(weather)),
    ...(Object.keys(rest).length === 0 ? {} : { rest }),
    rules: studyRules(study),
    depth,
    ...(enrage === undefined ? {} : { enrage }),
  };
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
  study: RoleStudy = {},
  team?: DungeonTeam,
  weather: WeatherDay | null = null,
): DungeonLogEntry[] {
  if (player.creatures.length < RULES.dungeon.teamSize) return [];
  const d = player.dungeon;
  const first = d.firstDay === null || d.firstDay === day;
  const log: DungeonLogEntry[] = [];
  for (let attempt = 1; attempt <= (first ? 2 : 1); attempt++) {
    const depth = d.depth;
    const runSeed = `${seed}:${String(attempt)}`;
    const run = buildRun(player, depth, modifiers, runSeed, study, team, weather);
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
    const base = dungeonPayout(depth, result.roomsCleared);
    // Market Day: a scrap more for every room cleared.
    const payout = {
      ...base,
      scrap: base.scrap + dungeonScrapPerRoom(weather) * result.roomsCleared,
    };
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
    for (const id of drop.supplies) {
      player.supplies[id] = (player.supplies[id] ?? 0) + 1;
      player.stats.supplies_dungeon += 1;
    }
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
