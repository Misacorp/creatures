import {
  ELEMENTS,
  chance,
  content,
  createSeededRng,
  festivalCreatureFor,
  festivalGrantOutcome,
  int,
  nextRank,
  nextRankXp,
  placementRank,
  raidWeekPlan,
  type BossDef,
  type Element,
  type LuckConfig,
  type RaidStage,
  RULES,
  type Rng,
} from '@creatures/game';
import { ARCHETYPES, ARCHETYPE_CONFIG, type ArchetypeId, type ArchetypeMix } from './archetypes';
import { dayIncome, playerIncome, type IncomeModelId } from './income';
import { proxyArchetype, type PlayerProfile } from './profiles';
import {
  CATCHABLE,
  STARTERS,
  byPowerDesc,
  pickTeam,
  speciesOf,
  teamPower,
  type OwnedCreature,
} from './data';
import {
  bestSkillLevel,
  claimJobs,
  gearPowerOf,
  grantFinaleLoot,
  grantPhaseScrap,
  grantWelcomeKit,
  manageGear,
  startJobs,
} from './gear';
import { chooseDungeonTeam, dayModifiers, playDungeonDay, type DungeonLogEntry } from './dungeon';
import type { Setup } from './formations';
import { chooseTrainee, trainCost } from './policy';
import { openRaidWeek, playStage, summarizeRaid, type RaidSummary, type RaidWeek } from './raid';
import { clonePlayer, createPlayer, emptyWeek, type SimPlayer } from './state';
import {
  claimTrips,
  playerRankSum,
  rankOfCreature,
  sendTrips,
  slotsOfPlayer,
  type TripContext,
} from './trips';
import { median, shuffle } from './util';

const DAYS = 7;
/** Friday, Saturday and Sunday (Monday = 0) hold Phase 1, Phase 2 and the finale. */
const RAID_DAY = { phase1: 4, phase2: 5, finale: 6 } as const;

export interface EconomyOptions {
  seed: string;
  weeks: number;
  /** Today's archetypes by count. Either `mix` or `roster` is needed; `roster` wins when both are given. */
  mix?: ArchetypeMix;
  /** Players by profile (`profiles.ts`), in order: the journey simulator's way to set up a server. */
  roster?: readonly RosterEntry[];
  /** How Bait comes in (`income.ts`). Default `allowance`, the shipped income; `current` is the old leet-only pay. */
  income?: IncomeModelId;
  /** Called while the economy plays, for the journey log (`journey.ts`); it must not change the players. */
  observer?: EconomyObserver;
  /** Weeks (1-based) after which the rosters are snapshotted for the raid sweep. */
  snapshotWeeks: readonly number[];
  /**
   * The global week index of the first simulated week; it decides where the Festival weeks fall
   * (every 5th week of the global calendar). Absent: drawn from the seed, so a batch of servers
   * starts all over the season.
   */
  firstWeekIndex?: number;
  /** Luck of every fight; absent: the shipped rules (`RULES.combat.luck`). */
  luck?: LuckConfig;
  /** Model gear and crafting (default). `false` plays the economy as it was before gear existed. */
  gear?: boolean;
  /**
   * Model the daily dungeon (default: when gear is modelled, since its loot is gear and parts).
   * `false` plays the economy as it was before the dungeon existed.
   */
  dungeon?: boolean;
  /**
   * Behaviour knobs for fitting the sim to live data (`pnpm sim:live`); every one defaults to the
   * shipped behaviour, and a run without them draws exactly the same random numbers as before.
   */
  behaviour?: Behaviour;
  /**
   * Called when a raid week opens (Friday, before Phase 1) with the signed-up players as they stand,
   * the boss and the ranks. For studies that play a what-if beside the real week; it must not change
   * the players (clone them first) and the sim draws no random numbers for it.
   */
  onRaidOpen?: (info: RaidOpenInfo) => void;
}

/** One player of a roster: the dials to play by, and optionally the archetype label for the reports. */
export interface RosterEntry {
  profile: PlayerProfile;
  /** Label for the reports; absent: the closest archetype (`proxyArchetype`). It decides nothing. */
  archetype?: ArchetypeId;
}

/** What the observer is told at the end of a simulated day. */
export interface DayInfo {
  /** Week (1-based), day index since the start of the sim, and day of the week (Monday = 0). */
  week: number;
  day: number;
  dayOfWeek: number;
  /** Players who have joined. */
  active: readonly SimPlayer[];
  /** Who opened the game that day, who leeted, and how many check-ins each made. */
  loggedIn: ReadonlySet<string>;
  leeted: ReadonlySet<string>;
  checkIns: ReadonlyMap<string, number>;
}

/** Hooks for a recorder. Everything it is given is live state: read it, do not change it. */
export interface EconomyObserver {
  /** A raid stage has just been played (and its loot paid). */
  onRaidStage?(info: { week: number; day: number; stage: RaidStage; raid: RaidWeek }): void;
  onDayEnd?(info: DayInfo): void;
}

/** What `EconomyOptions.onRaidOpen` is told. */
export interface RaidOpenInfo {
  week: number;
  boss: BossDef;
  /** The server's rank, the rank the boss fights at (eased in a Festival week) and the Festival flag. */
  rank: number;
  effectiveRank: number;
  festival: boolean;
  signed: readonly SimPlayer[];
}

/** Optional behaviour overrides (see `EconomyOptions.behaviour`). */
export interface Behaviour {
  /** Leet days per week by archetype, replacing `ARCHETYPE_CONFIG[a].leetDaysPerWeek`. */
  leetDaysPerWeek?: Partial<Record<ArchetypeId, number>>;
  /** Chance (percent, 0 to 100) that a check-in sends trips into the free slots. Default 100. */
  tripPercent?: number;
  /** Chance (percent, 0 to 100) that a check-in runs the dungeon. Default 100. */
  dungeonPercent?: number;
  /** Chance (percent, 0 to 100) that any player signs up for the raid, replacing the archetypes' own. */
  signUpPercent?: number;
}

/** One row of a player's history: the state at the end of a week. */
export interface WeekRecord {
  week: number;
  baitEarned: number;
  baitConverted: number;
  baitSpentTraining: number;
  bait: number;
  speciesOwned: number;
  top3Power: number;
  top3Levels: number[];
  maxLevel: number;
  evolved: number;
  essence: number;
  essenceEarned: number;
  jackpots: number;
  pity: number;
  signedUp: boolean;
  /** Power the worn gear adds to the team (gear included in `top3Power`). */
  gearPower: number;
  /** Upgrade levels on the team's items. */
  gearLevels: number;
  /** Crafts claimed so far. */
  crafted: number;
  /** Essence spent on gear upgrades during the week. */
  essenceSpentGear: number;
  /** Highest Crafting level on any creature. */
  skillLevel: number;
  scrap: number;
  /** The depth the next dungeon run fights at, and what the week's runs did and paid. */
  dungeonDepth: number;
  dungeonRuns: number;
  dungeonClears: number;
  dungeonBait: number;
  dungeonEssence: number;
  dungeonScrap: number;
  dungeonItems: number;
  /** The sum of the explorer ranks above 1 over all creatures, and the expedition slots it gives. */
  rankSum: number;
  slots: number;
  /** Trips finished so far. */
  trips: number;
}

export interface PlayerHistory {
  id: string;
  archetype: ArchetypeId;
  joinWeek: number;
  weeks: WeekRecord[];
  maxPity: number;
  raids: number;
  /** Days after joining until the first craft was claimed; null if none. */
  firstCraftAfterDays: number | null;
  /** Best Crafting level 30 days after joining; null if the sim ended before. */
  bestSkillDay30: number | null;
  /** Every dungeon run the player made, in order. */
  dungeon: DungeonLogEntry[];
  /** Days after joining that slots 2 to 5 opened; null while closed. */
  slotDays: (number | null)[];
  /** Trips finished by length, and the other counters of the player's expeditions. */
  tripsByLength: Record<string, number>;
  tripStats: Record<string, number>;
  /** Species caught per place (distinct stars at the end are in the report). */
  journal: number;
}

export interface Snapshot {
  week: number;
  players: SimPlayer[];
}

/** The ladder state of one raid week of a simulated server. */
export interface LadderWeek {
  /** The server's rank when the week started (placement at the first raid week). */
  rank: number;
  /** The rank the boss fought at (eased in a Festival week). */
  effectiveRank: number;
  festival: boolean;
  won: boolean;
  /** The rank for the next week. */
  nextRank: number;
}

export interface EconomyResult {
  players: PlayerHistory[];
  raids: { week: number; summary: RaidSummary; ladder: LadderWeek }[];
  snapshots: Snapshot[];
  /** The week index the first simulated week had. */
  firstWeekIndex: number;
}

interface Streams {
  leet: Rng;
  catches: Rng;
  signup: Rng;
  fight: Rng;
  loot: Rng;
  order: Rng;
  gear: Rng;
  dungeon: Rng;
  trip: Rng;
  taste: Rng;
  /** Only drawn from when a behaviour percent is below 100. */
  participation: Rng;
  /** Draws of the profiles' own dials (fractional day counts, craft chance, spread training, the random dungeon team). Never drawn for today's archetypes. */
  profile: Rng;
}

function createPlayers(options: EconomyOptions): SimPlayer[] {
  const players: SimPlayer[] = [];
  if (options.roster !== undefined) {
    const counts = new Map<string, number>();
    for (const entry of options.roster) {
      const n = players.length + 1;
      const k = (counts.get(entry.profile.id) ?? 0) + 1;
      counts.set(entry.profile.id, k);
      players.push(
        createPlayer(
          `p${String(n).padStart(2, '0')}`,
          `${entry.profile.label} ${k}`,
          entry.archetype ?? proxyArchetype(entry.profile),
          entry.profile.joinWeek,
          entry.profile,
        ),
      );
    }
    return players;
  }
  const mix = options.mix;
  if (mix === undefined) throw new Error('runEconomy needs a mix or a roster');
  for (const archetype of ARCHETYPES) {
    for (let k = 1; k <= mix[archetype]; k++) {
      const n = players.length + 1;
      players.push(
        createPlayer(
          `p${String(n).padStart(2, '0')}`,
          `${ARCHETYPE_CONFIG[archetype].label} ${k}`,
          archetype,
          ARCHETYPE_CONFIG[archetype].joinWeek,
        ),
      );
    }
  }
  return players;
}

/** Picks the starter whose element the server owns least (ties: content order). */
function chooseStarter(joined: readonly SimPlayer[]): (typeof STARTERS)[number] {
  const counts = new Map<Element, number>();
  for (const p of joined) {
    for (const c of p.creatures) {
      const e = speciesOf(c.speciesId).element;
      counts.set(e, (counts.get(e) ?? 0) + 1);
    }
  }
  let best = STARTERS[0];
  if (best === undefined) throw new Error('content has no starters');
  for (const s of STARTERS) {
    if ((counts.get(s.element) ?? 0) < (counts.get(best.element) ?? 0)) best = s;
  }
  return best;
}

function join(player: SimPlayer, all: readonly SimPlayer[], taste: Rng): void {
  const starter = chooseStarter(all.filter((p) => p.joined));
  player.joined = true;
  // A liking for each element between 0.8 and 1.2 (in tenths), so players explore different places.
  for (const element of ELEMENTS) player.taste[element] = (8 + int(taste, 5)) / 10;
  player.creatures.push({
    id: `${player.id}/${starter.line}`,
    line: starter.line,
    speciesId: starter.id,
    level: 1,
    fusionCount: 0,
  });
}

/** A day count that may be fractional: the whole part, plus one more day with the chance of the fraction. */
function wholeDays(count: number, rng: Rng): number {
  const whole = Math.floor(count);
  const fraction = count - whole;
  return fraction > 0 && chance(rng, Math.round(fraction * 1_000), 1_000) ? whole + 1 : whole;
}

/**
 * The week's login days and leet days of a player (Monday = 0). One shuffled order of the week decides
 * both (as it always decided the leet days): the leet days are its first days and the login days a
 * longer stretch of it, so a leet is always a login. Players who open the game only to leet (login
 * days not above leet days, like the casual) log in on exactly their leet days. A raid-day bias moves
 * Friday to Sunday up the order first. Today's archetypes draw exactly what they always drew.
 */
function planDays(
  rng: Rng,
  dice: Rng,
  player: SimPlayer,
  behaviour: Behaviour,
): { login: boolean[]; leet: boolean[] } {
  const profile = player.profile;
  const perWeek = behaviour.leetDaysPerWeek?.[player.archetype] ?? profile.leetDays;
  let order = shuffle(rng, [0, 1, 2, 3, 4, 5, 6]);
  if (profile.raidDayBias > 0) {
    const front = order.filter(
      (d) => d >= RAID_DAY.phase1 && chance(dice, profile.raidDayBias, 100),
    );
    order = [...front, ...order.filter((d) => !front.includes(d))];
  }
  const leetCount = wholeDays(perWeek, dice);
  const loginCount =
    profile.loginDays <= profile.leetDays
      ? leetCount
      : Math.max(wholeDays(profile.loginDays, dice), leetCount);
  const leet = new Set(order.slice(0, leetCount));
  const login = new Set(order.slice(0, loginCount));
  return {
    login: Array.from({ length: DAYS }, (_, d) => login.has(d)),
    leet: Array.from({ length: DAYS }, (_, d) => leet.has(d)),
  };
}

/** Median over joined players of their highest creature level (the server's median top level). */
export function serverMedianTopLevel(players: readonly SimPlayer[]): number {
  const tops = players
    .filter((p) => p.joined && p.creatures.length > 0)
    .map((p) => Math.max(...p.creatures.map((c) => c.level)));
  return median(tops) ?? 1;
}

/** Evolves creatures that reached their evolution level while the player has the Essence. */
function evolveCreatures(player: SimPlayer): void {
  for (const c of byPowerDesc(player.creatures)) {
    const species = speciesOf(c.speciesId);
    const evo = species.evolvesTo;
    if (evo === undefined || c.level < evo.level || player.essence < evo.essence) continue;
    player.essence -= evo.essence;
    c.speciesId = evo.species;
    player.week.evolutions += 1;
  }
}

function elementGapScore(player: SimPlayer, element: Element): number {
  const owned = new Set(player.creatures.map((c) => c.line));
  return CATCHABLE.filter((s) => s.element === element && !owned.has(s.line)).length;
}

/**
 * The creatures an explorer is picked from, best first. Until one creature has the rank that opens the
 * 24 hour trip, the highest rank goes first (concentrate to unlock the places and trips); after that
 * the creature that is closest to its next rank goes first (spread the XP: slots come from the ranks of
 * all the creatures, and a creature at the top rank goes last). The element gap and the id break ties.
 */
function explorerOrder(player: SimPlayer): (idle: OwnedCreature[]) => OwnedCreature[] {
  const dayRank = RULES.expeditions.lengths.day.minRank;
  const unlocked = player.creatures.some((c) => rankOfCreature(player, c.id) >= dayRank);
  const toNext = (c: OwnedCreature): number => {
    const rank = rankOfCreature(player, c.id);
    const next = nextRankXp(rank);
    return next === null ? Number.POSITIVE_INFINITY : next - (player.explorerXp[c.id] ?? 0);
  };
  return (idle) =>
    [...idle].sort((a, b) => {
      const primary = unlocked
        ? toNext(a) - toNext(b)
        : rankOfCreature(player, b.id) - rankOfCreature(player, a.id);
      if (primary !== 0 && Number.isFinite(primary)) return primary;
      const gap =
        elementGapScore(player, speciesOf(b.speciesId).element) -
        elementGapScore(player, speciesOf(a.speciesId).element);
      return gap !== 0 ? gap : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/**
 * One check-in: claim trips (and take an end-of-trip goal), claim jobs, evolve, manage gear, send trips
 * into the free slots, train and start jobs (see `policy.ts`). The player's profile sets the dials:
 * whom to train, and whether the gear is worked at this check-in. `dice` is the stream of the
 * profile's own random choices (spread training, the craft chance); today's archetypes never draw
 * from it.
 */
export function checkIn(
  player: SimPlayer,
  medianTopLevel: number,
  ctx: TripContext,
  sendsTrips = true,
  dice: Rng = createSeededRng(`check-in:${player.id}:${String(ctx.hour)}`),
): void {
  const gear = ctx.gear;
  const profile = player.profile;
  claimTrips(player, ctx);
  if (gear !== undefined) claimJobs(player, gear);
  evolveCreatures(player);

  // Trips are free and supplies cannot be bought: a trip carries what is in stock.
  const worksGear = profile.craftPercent >= 100 || chance(dice, profile.craftPercent, 100);
  if (gear !== undefined) manageGear(player, worksGear);
  if (sendsTrips) sendTrips(player, ctx, explorerOrder(player));

  const plan = { focus: profile.trainFocus, evolutionPush: profile.evolutionPush };
  for (;;) {
    // Someone who trains whatever they fancy picks among the creatures they can pay for.
    const candidates =
      plan.focus === 'spread'
        ? player.creatures.filter((c) => trainCost(c, medianTopLevel) <= player.bait)
        : player.creatures;
    const trainee = chooseTrainee(candidates, plan, dice);
    if (trainee === null) break;
    const cost = trainCost(trainee, medianTopLevel);
    if (cost > player.bait) break;
    player.bait -= cost;
    player.week.baitSpentTraining += cost;
    player.week.trainings += 1;
    trainee.level += 1;
  }

  if (gear !== undefined && worksGear) {
    startJobs(player, gear, new Set(player.expeditions.map((e) => e.explorerId)));
  }
}

function record(player: SimPlayer, week: number): WeekRecord {
  const team = pickTeam(player.creatures);
  return {
    week,
    baitEarned: player.week.baitEarned,
    baitConverted: player.week.baitConverted,
    baitSpentTraining: player.week.baitSpentTraining,
    bait: player.bait,
    speciesOwned: player.creatures.filter((c) => !speciesOf(c.speciesId).festival).length,
    top3Power: teamPower(player.creatures),
    top3Levels: team.map((c: OwnedCreature) => c.level),
    maxLevel: Math.max(0, ...player.creatures.map((c) => c.level)),
    evolved: player.creatures.filter((c) => speciesOf(c.speciesId).stage === 2).length,
    essence: player.essence,
    essenceEarned: player.week.essenceEarned,
    jackpots: player.jackpots,
    pity: player.pity,
    signedUp: player.week.signedUp,
    gearPower: team.reduce((n, c) => n + gearPowerOf(c), 0),
    gearLevels: team.reduce((n, c) => n + (c.item?.level ?? 0), 0),
    crafted: player.gear.crafted,
    essenceSpentGear: player.week.essenceSpentGear,
    skillLevel: bestSkillLevel(player),
    scrap: player.gear.parts.scrap,
    dungeonDepth: player.dungeon.depth,
    dungeonRuns: player.week.dungeonRuns,
    dungeonClears: player.week.dungeonClears,
    dungeonBait: player.week.dungeonBait,
    dungeonEssence: player.week.dungeonEssence,
    dungeonScrap: player.week.dungeonScrap,
    dungeonItems: player.week.dungeonItems,
    rankSum: playerRankSum(player),
    slots: slotsOfPlayer(player),
    trips: player.stats.trips_finished,
  };
}

/** The hour of the day at which the raid is signed up for and its stage played. */
const RAID_HOUR = 12;

/** The signed-up players who arrange their own raid row, grouped by setup (greedy first, then protected). */
function arrangedGroups(
  signed: readonly SimPlayer[],
): { setup: Setup; playerIds: ReadonlySet<string> }[] {
  const out: { setup: Setup; playerIds: ReadonlySet<string> }[] = [];
  for (const setup of ['greedy', 'protected'] as const) {
    const ids = signed.filter((p) => p.profile.raidRow === setup).map((p) => p.id);
    if (ids.length > 0) out.push({ setup, playerIds: new Set(ids) });
  }
  return out;
}

/** Bosses rotate weekly in content order. */
export function bossForWeek(week: number): BossDef {
  const boss = content.bosses[(week - 1) % content.bosses.length];
  if (boss === undefined) throw new Error('content has no bosses');
  return boss;
}

/** Sign-up for a raid: each player with the sign-up chance of their profile (in random order). */
export function chooseSignUps(
  active: readonly SimPlayer[],
  signup: Rng,
  order: Rng,
  /** Study: every player signs up with this chance (percent) instead of the profile's own. */
  percent?: number,
): SimPlayer[] {
  const yes = active.filter(
    (p) => chance(signup, percent ?? p.profile.signUpPercent, 100) && p.creatures.length > 0,
  );
  return shuffle(order, yes);
}

/**
 * A Festival win grants every participant the season's Festival creature through the collection's
 * duplicate rules: new (level 1), fused (+1 fusion) or converted to Bait.
 */
function grantFestivalCreature(players: readonly SimPlayer[], weekIndex: number): void {
  const species = festivalCreatureFor(weekIndex);
  if (species === null) return;
  for (const p of players) {
    const existing = p.creatures.find((c) => c.line === species.line);
    const outcome = festivalGrantOutcome(
      existing === undefined ? undefined : { fusionCount: existing.fusionCount, shiny: false },
      species,
    );
    if (outcome.kind === 'new') {
      p.creatures.push({
        id: `${p.id}/${species.line}`,
        line: species.line,
        speciesId: species.id,
        level: 1,
        fusionCount: 0,
      });
    } else if (outcome.kind === 'fused') {
      if (existing !== undefined) existing.fusionCount = outcome.newFusionCount;
    } else {
      p.bait += outcome.bait;
      p.week.baitConverted += outcome.bait;
    }
  }
}

/**
 * Simulates one server for `weeks` weeks. Each week, Monday to Sunday: income (the income model's pay
 * for that day's logins and leeters; `current`: the game's `baitForDay` for the leeters), then the day
 * by the hour: check-ins of the players who opened the game (each player's `checkInHours`), the
 * dungeon at a player's first check-in, and at 12:00 sign-up and Phase 1 on Friday, Phase 2 on
 * Saturday and the finale on Sunday. Today's archetypes check in at 09:00 and 20:00. Everything random
 * comes from streams derived from `seed`, so a seed always gives the same result.
 *
 * Boss Rank ladder: the first raid week places the server (`placementRank` of the creatures its
 * players bring), then a finale win adds a rank, a Festival week (every 5th week of the global
 * calendar) fights an eased boss for bonus Essence, grants the Festival creature on a win and eases
 * the rank afterwards (`nextRank`).
 */
export function runEconomy(options: EconomyOptions): EconomyResult {
  const { seed, weeks } = options;
  const rng: Streams = {
    leet: createSeededRng(`${seed}:leet`),
    catches: createSeededRng(`${seed}:catches`),
    signup: createSeededRng(`${seed}:signup`),
    fight: createSeededRng(`${seed}:fight`),
    loot: createSeededRng(`${seed}:loot`),
    order: createSeededRng(`${seed}:order`),
    gear: createSeededRng(`${seed}:gear`),
    dungeon: createSeededRng(`${seed}:dungeon`),
    trip: createSeededRng(`${seed}:trip`),
    taste: createSeededRng(`${seed}:taste`),
    participation: createSeededRng(`${seed}:participation`),
    profile: createSeededRng(`${seed}:profile`),
  };
  const behaviour = options.behaviour ?? {};
  const dungeonPercent = behaviour.dungeonPercent ?? 100;
  const takesPart = (percent: number): boolean =>
    percent >= 100 || chance(rng.participation, percent, 100);
  const incomeModel = options.income ?? 'allowance';
  const players = createPlayers(options);
  const history = new Map<string, PlayerHistory>(
    players.map((p) => [
      p.id,
      {
        id: p.id,
        archetype: p.archetype,
        joinWeek: p.joinWeek,
        weeks: [],
        maxPity: 0,
        raids: 0,
        firstCraftAfterDays: null,
        bestSkillDay30: null,
        dungeon: [],
        slotDays: [null, null, null, null],
        tripsByLength: {},
        tripStats: {},
        journal: 0,
      },
    ]),
  );
  const raids: EconomyResult['raids'] = [];
  const snapshots: Snapshot[] = [];
  const firstWeekIndex =
    options.firstWeekIndex ??
    int(createSeededRng(`${seed}:calendar`), RULES.progression.seasonWeeks);
  const luck = options.luck ?? RULES.combat.luck;
  const gearOn = options.gear !== false;
  const dungeonOn = gearOn && options.dungeon !== false;
  let rank: number | null = null;

  for (let week = 1; week <= weeks; week++) {
    for (const p of players) {
      if (!p.joined && p.joinWeek <= week) {
        join(p, players, rng.taste);
        if (gearOn) grantWelcomeKit(p, rng.gear, (week - 1) * DAYS);
      }
      p.week = emptyWeek();
    }
    const active = players.filter((p) => p.joined);
    // The week's login days (a leet is always a login), kept here: they are not part of a player's state.
    const loginDays = new Map<string, boolean[]>();
    for (const p of active) {
      const days = planDays(rng.leet, rng.profile, p, behaviour);
      p.leetDays = days.leet;
      loginDays.set(p.id, days.login);
    }
    const loggedBeforeRaid = new Set<string>();
    const weekIndex = firstWeekIndex + week - 1;
    const boss = bossForWeek(weekIndex + 1);
    let raid: ReturnType<typeof openRaidWeek> | null = null;
    let plan: ReturnType<typeof raidWeekPlan> | null = null;

    for (let day = 0; day < DAYS; day++) {
      const globalDay = (week - 1) * DAYS + day;
      const tripContext = (hourOfDay: number): TripContext => ({
        hour: globalDay * 24 + hourOfDay,
        day: globalDay,
        weekIndex,
        catches: rng.catches,
        trip: rng.trip,
        ...(gearOn
          ? { gear: { rng: rng.gear, hour: globalDay * 24 + hourOfDay, day: globalDay } }
          : {}),
      });
      const loggedIn = active.filter((p) => loginDays.get(p.id)?.[day] === true);
      const leeters = active.filter((p) => p.leetDays[day] === true);
      const loggedSet = new Set(loggedIn.map((p) => p.id));
      const leetSet = new Set(leeters.map((p) => p.id));
      if (day <= RAID_DAY.phase1) for (const id of loggedSet) loggedBeforeRaid.add(id);
      // Income, credited when the day starts: the allowance for opening the game and the leet pay.
      const income = dayIncome(incomeModel, leeters.length);
      for (const p of active) {
        const earned = playerIncome(income, loggedSet.has(p.id), leetSet.has(p.id));
        if (earned > 0) {
          p.bait += earned;
          p.week.baitEarned += earned;
        }
      }
      const checkIns = new Map<string, number>();
      const dungeonDone = new Set<string>();
      // The day runs by the hour: each hour at which somebody checks in, then the raid at midday.
      const hours = [
        ...new Set([RAID_HOUR, ...loggedIn.flatMap((p) => p.profile.checkInHours)]),
      ].sort((a, b) => a - b);
      for (const hour of hours) {
        const ctx = tripContext(hour);
        const present = loggedIn.filter((p) => p.profile.checkInHours.includes(hour));
        if (present.length > 0) {
          const median = serverMedianTopLevel(active);
          for (const p of present) {
            checkIn(
              p,
              median,
              ctx,
              takesPart(behaviour.tripPercent ?? p.profile.tripPercent),
              rng.profile,
            );
            checkIns.set(p.id, (checkIns.get(p.id) ?? 0) + 1);
          }
          // The daily dungeon: everybody who checked in runs it once, at their first check-in of the day.
          if (dungeonOn) {
            const modifiers = dayModifiers(seed, globalDay);
            for (const p of present) {
              if (dungeonDone.has(p.id)) continue;
              dungeonDone.add(p.id);
              if (!takesPart(dungeonPercent)) continue;
              const runs = playDungeonDay(
                p,
                globalDay,
                modifiers,
                `${seed}:dungeon:${p.id}:${String(globalDay)}`,
                rng.dungeon,
                {},
                chooseDungeonTeam(p, p.profile.dungeon, rng.profile),
              );
              history.get(p.id)?.dungeon.push(...runs);
            }
          }
        }
        if (hour !== RAID_HOUR) continue;

        if (day === RAID_DAY.phase1) {
          const eligible = active.filter(
            (p) => !p.profile.signUpNeedsLogin || loggedBeforeRaid.has(p.id),
          );
          const signed = chooseSignUps(eligible, rng.signup, rng.order, behaviour.signUpPercent);
          for (const p of signed) p.week.signedUp = true;
          if (signed.length > 0) {
            if (rank === null) {
              rank = placementRank(
                signed.flatMap((p) => pickTeam(p.creatures).map((c) => c.level)),
              );
            }
            plan = raidWeekPlan(weekIndex, rank);
            options.onRaidOpen?.({
              week,
              boss,
              rank: plan.rank,
              effectiveRank: plan.effectiveRank,
              festival: plan.festival,
              signed,
            });
            const arranged = arrangedGroups(signed);
            raid = openRaidWeek(boss, signed, {
              rank: plan.effectiveRank,
              reward: { rank: plan.rank, festival: plan.festival },
              luck,
              ...(arranged.length === 0 ? {} : { arranged }),
            });
          }
        }
        if (raid !== null) {
          const stage =
            day === RAID_DAY.phase1
              ? 'phase1'
              : day === RAID_DAY.phase2
                ? 'phase2'
                : day === RAID_DAY.finale
                  ? 'finale'
                  : null;
          if (stage !== null) {
            playStage(raid, stage, rng.fight, rng.loot);
            if (gearOn && plan !== null && raid.stages[stage]?.cleared === true) {
              if (stage === 'finale') {
                const festival = plan.festival ? festivalCreatureFor(weekIndex) : null;
                grantFinaleLoot(
                  raid.players,
                  plan.rank,
                  festival === null ? null : festival.element,
                  rng.gear,
                );
              } else {
                grantPhaseScrap(raid.players, stage);
              }
            }
            options.observer?.onRaidStage?.({ week, day: globalDay, stage, raid });
          }
        }
      }

      for (const p of active) {
        const h = history.get(p.id);
        const joined = p.gear.joinDay;
        if (gearOn && h !== undefined && joined !== null && globalDay - joined === 29) {
          h.bestSkillDay30 = bestSkillLevel(p);
        }
      }
      options.observer?.onDayEnd?.({
        week,
        day: globalDay,
        dayOfWeek: day,
        active,
        loggedIn: loggedSet,
        leeted: leetSet,
        checkIns,
      });
    }
    if (raid !== null && plan !== null && rank !== null) {
      const summary = summarizeRaid(raid);
      const next = nextRank(rank, weekIndex, summary.finaleWon);
      if (summary.finaleWon && plan.festival) grantFestivalCreature(raid.players, weekIndex);
      raids.push({
        week,
        summary,
        ladder: {
          rank,
          effectiveRank: plan.effectiveRank,
          festival: plan.festival,
          won: summary.finaleWon,
          nextRank: next,
        },
      });
      rank = next;
    }

    for (const p of active) {
      const h = history.get(p.id);
      if (h === undefined) continue;
      h.weeks.push(record(p, week));
      h.maxPity = p.maxPity;
      h.raids = p.raids;
      h.firstCraftAfterDays = p.gear.firstCraftAfterDays;
      const joinedDay = p.gear.joinDay ?? 0;
      h.slotDays = p.slotDays.map((d) => (d === null ? null : d - joinedDay));
      h.tripsByLength = { ...p.tripsByLength };
      h.tripStats = { ...p.stats };
      h.journal = p.journal.length;
    }
    if (options.snapshotWeeks.includes(week)) {
      snapshots.push({ week, players: active.map(clonePlayer) });
    }
  }

  return { players: [...history.values()], raids, snapshots, firstWeekIndex };
}
