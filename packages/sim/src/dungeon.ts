import {
  RULES,
  abilitiesFor,
  addFightsCleared,
  addPack,
  addParts,
  campOffers,
  campRest,
  catchBreath,
  content,
  createSeededRng,
  dungeonKeepsake,
  dungeonKeepsakes,
  dungeonRowOrder,
  dungeonScrapPerRoom,
  dungeonEvent,
  drawMark,
  emptyPack,
  generateDungeonMap,
  generateUndercroftMap,
  int,
  isLandmark,
  keptOnDefeat,
  mapNode,
  mergeMods,
  nodeFoe,
  nodeLoot,
  reachableNodes,
  resolveEvent,
  roomSpecForNode,
  rollDungeonLoot,
  rollUndercroftChest,
  rowScore,
  streakBonus,
  undercroftBaseFloors,
  undercroftFloorCount,
  undercroftOpen,
  weatherBossAttacks,
  weatherSky,
  weatherLuck,
  weatherSheet,
  type DungeonEventDef,
  type DungeonMap,
  type DungeonRunPack,
  type Element,
  type EventOptionDef,
  type KeepsakeDef,
  strongAgainst,
  type GearItem,
  type MapNode,
  type NodeKind,
  type Rng,
  type UndercroftMark,
  type WeatherDay,
} from '@creatures/game';
import {
  dungeonBossEnrage,
  placeSlots,
  rowMaxHp,
  simulateDungeonRoom,
  skyRunFields,
  type AbilityChoice,
  type DungeonRoomSpec,
  type DungeonRunInput,
  type FightSlot,
} from '@creatures/engine';
import {
  byPowerDesc,
  creaturePower,
  foldKitsOf,
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
 * The daily dungeon in the simulator (docs/design/dungeon-paths.md, "Simulator"). Every rule comes from
 * `@creatures/game` and `@creatures/engine` (the map, the rooms, the pack, events, the camp, scaling,
 * payouts, streaks, loot, one fight at a time); this file holds what a player does with them:
 *
 * - A player with at least 3 creatures runs the dungeon once on every day they check in: casuals on
 *   their leet days, everybody else every day. The day's map is drawn once for the whole server
 *   (`dayMap`) and every player walks it. On the first day they ever ran, a run lost to a defeat may
 *   be tried once more (the worker's free retry); a run that headed home or cleared may not.
 * - The team is the player's 3 strongest creatures by power (gear included), stood in one row by
 *   `dungeonRowOrder`. There is no basic ability and every unlocked creature ability fires at its
 *   default round (the profile skill `good`; the journey profiles can also pick the best three by row
 *   score, strongest first, or at random: `chooseDungeonTeam`).
 * - The walk is a small policy (`routeScore`, `chooseOption`, `campPlan`): prefer the foe the row's
 *   elements beat, an elite only when the row is healthy, a mystery or a cache when hurt, the costly
 *   event option only above 60% HP, and at the camp swap in a fresh creature for a fallen one, else
 *   rest when hurt, else take a keepsake, and head home when two creatures are down or the row is
 *   worn out. `random` players choose everything at random; `best` looks one floor ahead and picks
 *   the better keepsake. `good` and `reasonable` play the plain policy.
 * - From depth 8 (`RULES.dungeon.undercroft.fromDepth`) the day's map may hold a carved door (the sim's
 *   maps are drawn with `{ doors: true }`, as the worker's are). The policy steps through a door when the
 *   route reaches it (it costs no fight, so no risk): it adds a room of a random kind (`drawMark`) to the
 *   Undercroft, and below depth 8 it is a quiet room that does nothing. When the main boss falls at depth
 *   8 or over, the chest is banked (its gear, shard and supply are paid for good), depth + 1 is locked and
 *   the player chooses (`wantsDescend`): home with the pack, or down into the Undercroft, if the row is
 *   healthy after catching its breath. Below, the walk is the same walk: rooms with twice the loot,
 *   epic fights, camps (the only place to head home, under the main camp's rule), then the keeper and its
 *   chest (gear rolled by `rollUndercroftChest`); a cracked floor offers the next level under the same
 *   rule. A defeat below keeps half of the pack but the depth stays.
 * - A run is paid as the worker pays it: the kept pack (all of it at home or when cleared, half
 *   rounded up after a defeat; Market Day's scrap is in the pack), the boss chest and its dice once the
 *   boss has fallen, the keepers' chests, the supply once a fight has been cleared (safe), experience
 *   per creature by the fights it stood in the row for (in the economy; the full clear bonus goes to the
 *   row that beat the main boss), the streak bonus, and the depth (a defeat below the boss keeps it).
 */
export const DUNGEON_PLAYER = 'p1';

/**
 * Supplies a run drops once its first fight is cleared (safe: never in the pack). The worker pays one;
 * the sim reads the old first-room number, `RULES.dungeon.perRoom[0].supply` (1), so the supplies study's
 * `dungeon.perRoom.0.supply=0` override still switches the dungeon's supply off.
 */
const suppliesPerRun = (): number => RULES.dungeon.perRoom[0]?.supply ?? 1;

export type DungeonOutcome = 'cleared' | 'home' | 'defeat';
export type CampChoice = 'rest' | 'swap' | 'keepsake' | 'home';

/** One run, for the analysis. */
export interface DungeonLogEntry {
  /** Day index since the sim start, and days since the player joined. */
  day: number;
  daysSinceJoin: number;
  depth: number;
  /** Fights cleared (the fight a defeat was lost in is not counted). */
  roomsCleared: number;
  /** Fights played, a lost one included. */
  fights: number;
  /** Beat the main room boss (depth + 1 is locked in, whatever happens below it). */
  cleared: boolean;
  /**
   * How the run ended, as the worker's `outcome`: a run that beat the main boss ends `cleared` when it
   * heads home or is done, `defeat` when it is lost in the Undercroft (half the pack, the depth stays).
   */
  outcome: DungeonOutcome;
  /** Elites cleared, keepsakes held at the end, and the camp choice (null: the run never reached the camp). */
  elites: number;
  keepsakes: number;
  camp: CampChoice | null;
  /** The row's average HP (0 to 1) as it reached the camp, and how many creatures were down; null if it never did. */
  campHp: number | null;
  campDown: number;
  /** The pack at the end (at risk) and what was kept of it. */
  packFound: DungeonRunPack;
  packKept: DungeonRunPack;
  /** Fights cleared by each creature that stood in the row for them: the experience is paid on these. */
  fightsBy: Record<string, number>;
  /** The creature ids in the row at the end. */
  finalRow: string[];
  /** The row that beat the main boss (the full clear's experience goes to these); empty when it did not. */
  fullClearRow: string[];
  /** Fights played before the Undercroft (`fights` minus the Undercroft's). */
  mainFights: number;
  /** The Undercroft: see `UndercroftRun`. */
  under: UndercroftRun;
}

/** What a run did below the room boss. */
export interface UndercroftRun {
  /** The main boss fell at a depth that opens the Undercroft with someone standing: the descent was offered. */
  offered: boolean;
  /** The player went down at least once. */
  descended: boolean;
  /** Levels entered, and keepers beaten. */
  entered: number;
  levels: number;
  /** Fights played down there (a lost one included), and the rooms a carved door added to the Undercroft. */
  fights: number;
  marks: UndercroftMark[];
  /** The choice made at the last Undercroft camp, null when the run reached none. */
  camp: CampChoice | null;
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

// --- The day's map ---

const mapCache = new Map<string, DungeonMap>();

/**
 * The map of a day: the same for every player of the server (drawn from a seed of the day, as the
 * worker draws it once per guild and day). Remembered, since every player of the day asks for it.
 */
export function dayMap(seed: string, day: number): DungeonMap {
  const key = `${seed}|${String(day)}`;
  let map = mapCache.get(key);
  if (map === undefined) {
    // With doors, as the worker draws the day's map: the door is drawn last, so a map without one is the
    // map the sim always drew.
    map = generateDungeonMap(createSeededRng(`${seed}:dungeon-map:${String(day)}`), undefined, {
      doors: true,
    });
    if (mapCache.size > 2_000) mapCache.clear();
    mapCache.set(key, map);
  }
  return map;
}

// --- The run input ---

/**
 * The run input of a team at a depth with no rooms yet (the worker's run builder, without storage): the
 * row (the game's order, or as given), the abilities, the gear's rest, the weather. The rooms are played
 * one at a time (`simulateDungeonRoom`), each with its own spec.
 */
export function buildRunInput(
  player: SimPlayer,
  depth: number,
  study: RoleStudy = {},
  chosen?: DungeonTeam,
  weather: WeatherDay | null = null,
): DungeonRunInput {
  const team = chosen?.creatures ?? pickTeam(player.creatures);
  const slots = team.map((c): FightSlot => {
    const slot = { ...slotFor(player, c.id), ownerId: DUNGEON_PLAYER };
    return study.neutralSupports === true && slot.role === 'support' ? neutralSupport(slot) : slot;
  });
  const ordered = chosen?.ordered === false ? slots : dungeonRowOrder(slots);
  // One row, left to right: the position lines of the gear see the neighbours and the ends of that line.
  const row = placeSlots(ordered, foldKitsOf(team), 'line').map((slot): FightSlot => {
    // The day's weather goes on every creature's sheet, as the worker's run builder puts it.
    const mods = mergeMods(slot.mods, weatherSheet(weather, slot));
    return mods === undefined ? slot : { ...slot, mods };
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
  // The boss room enrages (part of the stored run input).
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
    rooms: [],
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

// --- The policy ---

/** What the policy sees of a run: the row's health and which creatures are down. */
export interface RunView {
  /** Mean of hp / max HP over the row (a creature that is down counts 0). */
  avgHp: number;
  /** Creatures of the row that are knocked out. */
  down: number;
}

/** Health thresholds of the policy (shares of max HP, 0 to 1): kept in one place so tuning is one edit. */
export const POLICY = {
  /** An elite is taken only above this average HP with nobody down. */
  eliteHp: 0.7,
  /** A mystery room or a cache is preferred below this average HP. */
  safeRoomHp: 0.5,
  /** The costly or gamble option of an event is taken only above this average HP. */
  riskyEventHp: 0.6,
  /** A plain heal option is taken below this average HP. */
  healEventHp: 0.7,
  /** At the camp: rest below this average HP. */
  restHp: 0.6,
  /** After the camp choice: head home with this many creatures down, or below this average HP. */
  homeDown: 2,
  homeHp: 0.35,
  /**
   * The same after a defeat at this depth last time (the player knows the depth is a wall): any creature
   * still down, or an average HP below this, and the player takes the pack home.
   */
  wary: { homeDown: 1, homeHp: 0.75 },
  /**
   * The descent card (docs/design/dungeon-paths.md, "The Undercroft"): go down when, after catching its
   * breath (a fallen creature is back up at `reviveBp`), the row's average HP is over this. `best` looks at the length of the
   * level too: with `longFloors` floors or more and no camp among them it wants `longHp` instead.
   */
  descendHp: 0.5,
  longFloors: 4,
  longHp: 0.75,
} as const;

/** True when `attacker` deals 150% to `defender` (the element chart, from content). */
export function elementBeats(attacker: Element, defender: Element): boolean {
  return strongAgainst(content.elementChart, attacker).includes(defender);
}

/**
 * How the standing row's elements stand against a foe's, from -1 (every creature is beaten by it) to 1
 * (every creature beats it): beats minus beaten, over the row's size.
 */
export function elementAdvantage(row: readonly Element[], foe: Element): number {
  if (row.length === 0) return 0;
  let score = 0;
  for (const e of row) {
    if (elementBeats(e, foe)) score += 1;
    else if (elementBeats(foe, e)) score -= 1;
  }
  return score / row.length;
}

/** What a node is worth to the policy right now (higher is better); `-Infinity` for a room it will not enter. */
export function routeScore(
  node: MapNode,
  foe: Element | undefined,
  row: Element[],
  view: RunView,
): number {
  const adv = foe === undefined ? 0 : elementAdvantage(row, foe);
  const hurt = view.avgHp < POLICY.safeRoomHp;
  switch (node.kind) {
    case 'fight':
    case 'boss':
      return 2 + 1.5 * adv;
    case 'elite':
      return view.avgHp > POLICY.eliteHp && view.down === 0 ? 3 + adv : -10;
    case 'mystery':
      return hurt ? 4 : 1.5;
    case 'cache':
      return hurt ? 4.5 : 2;
    case 'epic':
      // Only a carved door's room can be one (a floor of one room: there is no choice to make).
      return view.avgHp > POLICY.eliteHp && view.down === 0 ? 3 + adv : -10;
    case 'door':
      // A carved door costs no fight, so it is no risk: taken when the route reaches it, ahead of a plain
      // fight (below depth 8 it is a quiet room, which costs nothing either).
      return 3.2;
    case 'camp':
      return 0;
  }
}

/** The kind of an event option for the policy: it can hurt (a cost or a gamble), heal, or be plain. */
export function optionKind(option: EventOptionDef): 'risky' | 'heal' | 'free' {
  if (option.effects.some((e) => e.op === 'gamble' || e.op === 'hurt')) return 'risky';
  if (option.effects.some((e) => e.op === 'heal')) return 'heal';
  return 'free';
}

/**
 * The option of an event the policy takes (0 or 1): a plain heal when hurt, the costly or gamble option
 * only above `POLICY.riskyEventHp`, otherwise a free one (a heal only when hurt).
 */
export function chooseOption(event: DungeonEventDef, view: RunView): number {
  const kinds = event.options.map(optionKind);
  const heal = kinds.indexOf('heal');
  if (heal >= 0 && view.avgHp < POLICY.healEventHp) return heal;
  const risky = kinds.indexOf('risky');
  if (risky >= 0 && view.avgHp > POLICY.riskyEventHp) return risky;
  const free = kinds.findIndex((k) => k === 'free');
  if (free >= 0) return free;
  return heal >= 0 ? heal : 0;
}

/** A simple worth for a keepsake, for the `best` skill: a flat boost beats a foe cut beats an element's Attack beats crits. */
export function keepsakeScore(k: KeepsakeDef, row: readonly Element[]): number {
  let score = 0;
  for (const e of k.effects) {
    if (e.op === 'team_stat') {
      const mine = e.element === undefined ? row.length : row.filter((x) => x === e.element).length;
      score +=
        (e.bp / 10_000) * 10 * (mine / Math.max(1, row.length)) * (e.stat === 'hp' ? 0.5 : 1);
    } else if (e.op === 'foe_stat') {
      score += (-e.bp / 10_000) * 8;
    } else {
      score += (e.chanceBp / 10_000) * 10;
    }
  }
  return score;
}

/**
 * The room the policy walks into from the choices `options` (node ids on the map). `random` picks at
 * random from `rng`; the others take the best `routeScore`, and `best` adds half of the best room each
 * one leads to (one floor ahead). Ties go to the first.
 */
export function pickRoute(
  map: DungeonMap,
  depth: number,
  options: readonly string[],
  view: RunView,
  row: Element[],
  skill: DungeonSkill,
  rng: Rng,
  level = 0,
): string {
  if (skill === 'random') return options[int(rng, options.length)] as string;
  const scoreOf = (node: MapNode): number =>
    routeScore(node, nodeFoe(node, depth, level)?.element, row, view);
  let best: { id: string; score: number } | null = null;
  for (const id of options) {
    const node = mapNode(map, id) as MapNode;
    let score = scoreOf(node);
    if (skill === 'best') {
      const ahead = node.next.map((n) => scoreOf(mapNode(map, n) as MapNode));
      if (ahead.length > 0) score += 0.5 * Math.max(...ahead);
    }
    if (best === null || score > best.score) best = { id, score };
  }
  return (best as { id: string; score: number }).id;
}

/**
 * What the policy does at the camp: swap in a fresh creature when one is down and one is available, else
 * rest below `POLICY.restHp` (or when no keepsake is on offer), else take a keepsake. `random` players pick
 * any of the choices open to them, heading home included.
 */
export function chooseCamp(
  view: RunView,
  open: { swap: boolean; keepsake: boolean },
  skill: DungeonSkill,
  rng: Rng,
): CampChoice {
  if (skill === 'random') {
    const choices: CampChoice[] = ['rest'];
    if (open.swap) choices.push('swap');
    if (open.keepsake) choices.push('keepsake');
    choices.push('home');
    return choices[int(rng, choices.length)] as CampChoice;
  }
  if (open.swap) return 'swap';
  if (view.avgHp < POLICY.restHp || !open.keepsake) return 'rest';
  return 'keepsake';
}

/**
 * True when the row, after the camp choice, is worn out and the policy takes the pack home: two
 * creatures down or an average HP under 35%; a `wary` player (they lost the last run at this depth) goes
 * home with any creature down or under 75%.
 */
export function wantsHome(after: RunView, wary: boolean): boolean {
  const limit = wary ? POLICY.wary : POLICY;
  return after.down >= limit.homeDown || after.avgHp < limit.homeHp;
}

/**
 * What the policy does at the descent card, with the row as it will be after catching its breath
 * (`after`; a fallen creature is already back up at `reviveBp`, so nobody is down): the Undercroft is
 * entered only when the row's average HP is over `POLICY.descendHp`. `plan` is the level it would open: its floors and whether a camp is among them (a carved
 * door can add one); `best` wants a healthier row for a long level with no camp. `random` players go
 * down or home with equal chance, whatever their health.
 */
export function wantsDescend(
  after: RunView,
  plan: { floors: number; camp: boolean },
  skill: DungeonSkill,
  rng: Rng,
): boolean {
  if (skill === 'random') return int(rng, 2) === 1;
  if (after.down > 0 || after.avgHp <= POLICY.descendHp) return false;
  if (skill === 'best' && plan.floors >= POLICY.longFloors && !plan.camp) {
    return after.avgHp > POLICY.longHp;
  }
  return true;
}

/**
 * What clearing a room puts in the pack, as the worker's `packLoot`: `nodeLoot` for the level, and for a
 * fight Market Day's scrap (doubled with the rest of a fight, elite or cache in the Undercroft).
 */
export function roomLoot(
  kind: NodeKind,
  level: number,
  weather: WeatherDay | null,
  fight: boolean,
): DungeonRunPack {
  const loot = nodeLoot(kind, level);
  const doubled =
    level > 0 && (kind === 'fight' || kind === 'elite' || kind === 'cache')
      ? RULES.dungeon.undercroft.lootMultiplier
      : 1;
  return { ...loot, scrap: loot.scrap + (fight ? dungeonScrapPerRoom(weather) * doubled : 0) };
}

// --- One run ---

/** What a run did. */
export interface RunResult {
  outcome: DungeonOutcome;
  /** The main boss was beaten (depth + 1 is locked in, whatever happens below it). */
  bossCleared: boolean;
  /** Fights cleared, played, elites cleared. */
  fightsCleared: number;
  fights: number;
  elites: number;
  keepsakes: string[];
  /** The main camp's choice (null: the run never reached it). */
  camp: CampChoice | null;
  /** The row's state as it reached the main camp (average HP 0 to 1, creatures down); null if it never did. */
  atCamp: RunView | null;
  /** The pack at the end, before a defeat halves it. */
  pack: DungeonRunPack;
  /** Fights cleared per creature id (the row at each fight's start). */
  fightsBy: Record<string, number>;
  /** The creature ids in the row at the end. */
  finalRow: string[];
  /** The row that stood when the main boss fell (empty when it did not). */
  fullClearRow: string[];
  /** The room boss's element (the shard of a clear is of it). */
  boss: { element: Element };
  /** What happened below the room boss. */
  under: UndercroftRun;
  /** The elements of the keepers beaten (each one's chest rolls gear of it). */
  keepers: Element[];
}

const percentOf = (
  hp: Readonly<Record<string, number>>,
  max: Readonly<Record<string, number>>,
  ids: readonly string[],
): RunView => {
  if (ids.length === 0) return { avgHp: 0, down: 0 };
  let total = 0;
  let down = 0;
  for (const id of ids) {
    const m = max[id] ?? 0;
    const now = hp[id] ?? m;
    if (now <= 0) down += 1;
    total += m <= 0 ? 0 : Math.min(1, Math.max(0, now / m));
  }
  return { avgHp: total / ids.length, down };
};

/**
 * Walks the day's map once with a team, at a depth, and returns what happened, the Undercroft included
 * (see the header). `seed` is the run's seed (the fights' dice come from it, one stream per fight);
 * everything else that is random (events, camp offers, an elite's keepsake, what a door adds, the
 * Undercroft's maps, a `random` player's choices) comes from a stream of it too. Nothing is paid here:
 * `playDungeonDay` pays.
 */
export function walkMap(options: {
  player: SimPlayer;
  map: DungeonMap;
  depth: number;
  seed: string;
  team: DungeonTeam;
  skill: DungeonSkill;
  /** The player lost their last run at this depth (`DungeonState.lostAt`): the camp sends them home sooner. */
  wary?: boolean;
  study?: RoleStudy;
  weather?: WeatherDay | null;
}): RunResult {
  const { player, map, depth, seed, skill } = options;
  const wary = options.wary === true;
  const study = options.study ?? {};
  const weather = options.weather ?? null;
  const rng = createSeededRng(`${seed}:walk`);
  const random = skill === 'random';

  let creatures: OwnedCreature[] = [...options.team.creatures];
  const ordered = options.team.ordered;
  let input = buildRunInput(player, depth, study, { creatures, ordered }, weather);
  let hp: Record<string, number> | null = null;
  const rowIds = (): string[] => input.team.map((s) => s.id);
  const rowElements = (): Element[] =>
    input.team.filter((s) => (hp?.[s.id] ?? 1) > 0).map((s) => s.element);
  /** Every creature that has stood in the row: one that left at a camp does not come back. */
  const everyone = new Set(rowIds());

  const held: KeepsakeDef[] = [];
  let pack = emptyPack();
  let tally: Record<string, number> = {};
  let at: string | null = null;
  let fights = 0;
  let fightsCleared = 0;
  let elites = 0;
  let camp: CampChoice | null = null;
  let atCamp: RunView | null = null;
  let outcome: DungeonOutcome | null = null;

  // The Undercroft: the map the run stands on (the day's, then the levels drawn on the way down).
  let current: DungeonMap = map;
  let level = 0;
  let bossCleared = false;
  let fullClearRow: string[] = [];
  const keepers: Element[] = [];
  const under: UndercroftRun = {
    offered: false,
    descended: false,
    entered: 0,
    levels: 0,
    fights: 0,
    marks: [],
    camp: null,
  };

  const bossNode = map.nodes.find((n) => n.kind === 'boss') as MapNode;
  const bossFoe = nodeFoe(bossNode, depth);
  if (bossFoe === undefined) throw new Error('the boss node holds no foe');
  /** A room with no modifier of its own and the keepsakes held: the max HP the row has outside a fight. */
  const neutralMax = (): Record<string, number> => {
    const room = roomSpecForNode(map, bossNode.id, depth, 0);
    return rowMaxHp(input, {
      ...room,
      modifier: { ...room.modifier, effects: [] },
      keepsakes: [...held],
    });
  };
  const view = (): RunView => {
    if (hp === null) return { avgHp: 1, down: 0 };
    return percentOf(hp, neutralMax(), rowIds());
  };
  const gain = (k: KeepsakeDef | undefined): void => {
    if (k !== undefined && !held.some((h) => h.id === k.id)) held.push(k);
  };

  const standingCount = (): number => rowIds().filter((id) => (hp?.[id] ?? 1) > 0).length;

  /** The way down after a boss: the level it would open, and the choice of the player. */
  const goesDown = (next: number): boolean => {
    const after = catchBreath(hp as Record<string, number>, neutralMax());
    const marks = next === 1 ? under.marks : [];
    const floors = undercroftBaseFloors(depth, next);
    const plan = {
      floors: undercroftFloorCount({ level: next, floors, marks }),
      camp: marks.includes('camp'),
    };
    if (!wantsDescend(percentOf(after, neutralMax(), rowIds()), plan, skill, rng)) return false;
    hp = after;
    current = generateUndercroftMap(rng, { level: next, floors, marks: [...marks] });
    level = next;
    at = null;
    under.descended = true;
    under.entered = next;
    return true;
  };

  while (outcome === null) {
    const options = reachableNodes(current, at);
    if (options.length === 0) break;
    const id = pickRoute(current, depth, options, view(), rowElements(), skill, rng, level);
    const node = mapNode(current, id) as MapNode;
    at = id;

    if (
      node.kind === 'fight' ||
      node.kind === 'elite' ||
      node.kind === 'epic' ||
      node.kind === 'boss'
    ) {
      const room: DungeonRoomSpec = {
        ...roomSpecForNode(current, id, depth, fights),
        ...(held.length === 0 ? {} : { keepsakes: [...held] }),
      };
      const standing = rowIds();
      const played = simulateDungeonRoom(input, room, hp, seed);
      fights += 1;
      if (level > 0) under.fights += 1;
      hp = { ...played.result.hpEnd };
      if (!played.cleared || (node.kind !== 'boss' && standingCount() === 0)) {
        outcome = 'defeat';
        break;
      }
      fightsCleared += 1;
      tally = addFightsCleared(tally, standing);
      pack = addPack(pack, roomLoot(node.kind, level, weather, true));
      if (node.kind === 'elite' || node.kind === 'epic') {
        if (node.kind === 'elite') elites += 1;
        const left = dungeonKeepsakes.filter((k) => !held.some((h) => h.id === k.id));
        gain(left[int(rng, left.length || 1)]);
      }
      if (node.kind === 'boss') {
        if (level === 0) {
          // The main boss: depth + 1 is won. Its full clear Essence and the landmark's extras come into the
          // pack with the boss's loot.
          bossCleared = true;
          fullClearRow = rowIds();
          const landmark = isLandmark(depth);
          pack = addPack(pack, {
            bait: 0,
            essence:
              RULES.dungeon.fullClear.essence + (landmark ? RULES.dungeon.landmark.essence : 0),
            scrap: landmark ? RULES.dungeon.landmark.scrap : 0,
          });
          if (!undercroftOpen(depth) || standingCount() === 0) {
            outcome = 'cleared';
            break;
          }
          under.offered = true;
          if (!goesDown(1)) outcome = 'cleared';
        } else {
          // A keeper: its chest rolls gear (paid in `playDungeonDay`); a cracked floor offers another level.
          under.levels = level;
          keepers.push(nodeFoe(node, depth, level)?.element ?? bossFoe.element);
          const deeper =
            current.crack === true &&
            level < RULES.dungeon.undercroft.maxLevels &&
            standingCount() > 0;
          if (!deeper || !goesDown(level + 1)) outcome = 'cleared';
        }
      }
    } else if (node.kind === 'cache') {
      pack = addPack(pack, roomLoot('cache', level, weather, false));
    } else if (node.kind === 'door') {
      // Below depth 8 a quiet room. From it, a room is added to the Undercroft, of a kind drawn now
      // (never more than `maxMarks`).
      if (undercroftOpen(depth) && under.marks.length < RULES.dungeon.undercroft.maxMarks) {
        under.marks.push(drawMark(rng));
      }
    } else if (node.kind === 'mystery') {
      const event = node.eventId === undefined ? undefined : dungeonEvent(node.eventId);
      if (event === undefined || hp === null) continue;
      const option = random ? int(rng, event.options.length) : chooseOption(event, view());
      const resolved = resolveEvent(
        event,
        option,
        { hp, hpMax: neutralMax(), keepsakes: held.map((k) => k.id) },
        rng,
      );
      hp = resolved.hp;
      pack = addPack(pack, resolved.packDelta);
      for (const kid of resolved.keepsakesGained) gain(dungeonKeepsake(kid));
    } else if (node.kind === 'camp' && hp !== null) {
      const offers = campOffers(
        rng,
        held.map((k) => k.id),
      )
        .map((kid) => dungeonKeepsake(kid))
        .filter((k): k is KeepsakeDef => k !== undefined);
      const rowNow = rowIds();
      const down = rowNow.filter((rid) => (hp?.[rid] ?? 1) <= 0);
      const fresh = byPowerDesc(player.creatures.filter((c) => !everyone.has(c.id)))[0];
      const v = view();
      if (level === 0) atCamp = v;
      const canSwap = down.length > 0 && fresh !== undefined;
      const choice = chooseCamp(v, { swap: canSwap, keepsake: offers.length > 0 }, skill, rng);
      const apply = (c: CampChoice): void => {
        if (c === 'rest') {
          hp = campRest(hp as Record<string, number>, neutralMax());
        } else if (c === 'keepsake') {
          const row = rowElements();
          const pick =
            skill === 'best'
              ? [...offers].sort((a, b) => keepsakeScore(b, row) - keepsakeScore(a, row))[0]
              : offers[0];
          gain(pick);
        } else if (c === 'swap' && fresh !== undefined && down[0] !== undefined) {
          const out = down[0];
          creatures = creatures.filter((x) => x.id !== out);
          creatures.push(fresh);
          everyone.add(fresh.id);
          const next = { ...(hp as Record<string, number>) };
          delete next[out];
          hp = next;
          input = buildRunInput(player, depth, study, { creatures, ordered }, weather);
        }
      };
      // Heading home keeps the whole pack: `home` before the main boss, `cleared` once it has fallen.
      const home = (): void => {
        if (level === 0) camp = 'home';
        else under.camp = 'home';
        outcome = bossCleared ? 'cleared' : 'home';
      };
      if (choice === 'home') {
        home();
        break;
      }
      apply(choice);
      if (level === 0) camp = choice;
      else under.camp = choice;
      const after = view();
      if (!random && wantsHome(after, wary)) {
        home();
        break;
      }
    }
  }
  return {
    outcome: outcome ?? 'defeat',
    bossCleared,
    fightsCleared,
    fights,
    elites,
    keepsakes: held.map((k) => k.id),
    camp,
    atCamp,
    pack,
    fightsBy: tally,
    finalRow: rowIds(),
    fullClearRow,
    boss: { element: bossFoe.element },
    under,
    keepers,
  };
}

// --- One day ---

/**
 * One player's dungeon day. Returns the runs made (none if the player has fewer than 3 creatures).
 * `seed` is the sim's seed for this player and day; `loot` the stream the gear, shard and supply rolls
 * use. `map` is the server's map of the day (`dayMap`).
 */
export function playDungeonDay(
  player: SimPlayer,
  day: number,
  map: DungeonMap,
  seed: string,
  loot: Rng,
  study: RoleStudy = {},
  team?: DungeonTeam,
  weather: WeatherDay | null = null,
  skill: DungeonSkill = 'good',
): DungeonLogEntry[] {
  if (player.creatures.length < RULES.dungeon.teamSize) return [];
  const d = player.dungeon;
  const first = d.firstDay === null || d.firstDay === day;
  const chosen = team ?? { creatures: pickTeam(player.creatures), ordered: true };
  const log: DungeonLogEntry[] = [];
  for (let attempt = 1; attempt <= (first ? 2 : 1); attempt++) {
    const depth = d.depth;
    const runSeed = `${seed}:${String(attempt)}`;
    const run = walkMap({
      player,
      map,
      depth,
      seed: runSeed,
      team: chosen,
      skill,
      // The retry of a lost first run is played as boldly as the run before it.
      wary: attempt === 1 && d.lostAt === depth,
      study,
      weather,
    });
    // The main boss was beaten: depth + 1 is won and stays, even if the Undercroft below is lost.
    const cleared = run.bossCleared;

    // Progress, the streak (days in a row), and the depth.
    if (d.firstDay === null) d.firstDay = day;
    const firstOfDay = d.lastDay !== day;
    d.streak = d.lastDay === day ? d.streak : d.lastDay === day - 1 ? d.streak + 1 : 1;
    d.lastDay = day;
    d.runs += 1;
    // A run lost below the boss is not lost at this depth (the depth was won): only a defeat before it is.
    d.lostAt = run.outcome === 'defeat' && !cleared ? depth : null;
    if (cleared) {
      d.clears += 1;
      d.depth += 1;
    }

    // Pay: the kept pack (Market Day's scrap, the boss chest's Essence and scrap and the keepers' are in
    // it), the chests' dice (the main boss's shard, gear and landmark glimmer, each keeper's gear), the
    // supply of the first fight cleared (safe), and the streak bonus on the first run of a day.
    const kept = run.outcome === 'defeat' ? keptOnDefeat(run.pack) : run.pack;
    const landmark = cleared && isLandmark(depth);
    const bait = kept.bait;
    const essence = kept.essence;
    const scrap = kept.scrap;
    const glimmer = landmark ? RULES.dungeon.landmark.glimmer : 0;
    const drop = rollDungeonLoot(
      loot,
      depth,
      {
        landmark,
        fullClear: cleared,
        bossCleared: cleared,
        supplies: run.fightsCleared >= 1 ? suppliesPerRun() : 0,
      },
      run.boss.element,
    );
    const gear: GearItem[] = [...drop.gear];
    for (const element of run.keepers) gear.push(...rollUndercroftChest(loot, depth, element));
    const parts = addParts({ scrap, glimmer }, drop.parts);
    player.bait += bait;
    player.essence += essence;
    const week = player.week;
    week.dungeonRuns += 1;
    week.dungeonClears += cleared ? 1 : 0;
    week.dungeonBait += bait;
    week.dungeonEssence += essence;
    week.dungeonScrap += parts.scrap ?? 0;
    week.dungeonItems += gear.length;
    grantDungeonLoot(player, parts, gear);
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
      roomsCleared: run.fightsCleared,
      fights: run.fights,
      cleared,
      outcome: run.outcome,
      elites: run.elites,
      keepsakes: run.keepsakes.length,
      camp: run.camp,
      campHp: run.atCamp === null ? null : run.atCamp.avgHp,
      campDown: run.atCamp === null ? 0 : run.atCamp.down,
      packFound: { ...run.pack },
      packKept: { ...kept },
      fightsBy: { ...run.fightsBy },
      finalRow: [...run.finalRow],
      fullClearRow: [...run.fullClearRow],
      mainFights: run.fights - run.under.fights,
      under: { ...run.under, marks: [...run.under.marks] },
    });
    // A retry is for a first run lost to a defeat only: a run that headed home or cleared is done.
    if (run.outcome !== 'defeat') break;
  }
  return log;
}
