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
  RULES,
  type Rng,
} from '@creatures/game';
import { baitForDay } from '../../../apps/worker/src/economy';
import { ARCHETYPES, ARCHETYPE_CONFIG, type ArchetypeId, type ArchetypeMix } from './archetypes';
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
import { dayModifiers, playDungeonDay, type DungeonLogEntry } from './dungeon';
import { POLICY, chooseTrainee, isTrainable, trainCost } from './policy';
import { openRaidWeek, playStage, summarizeRaid, type RaidSummary } from './raid';
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
  mix: ArchetypeMix;
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
}

/** Optional behaviour overrides (see `EconomyOptions.behaviour`). */
export interface Behaviour {
  /** Leet days per week by archetype, replacing `ARCHETYPE_CONFIG[a].leetDaysPerWeek`. */
  leetDaysPerWeek?: Partial<Record<ArchetypeId, number>>;
  /** Chance (percent, 0 to 100) that a check-in sends trips into the free slots. Default 100. */
  tripPercent?: number;
  /** Chance (percent, 0 to 100) that a check-in runs the dungeon. Default 100. */
  dungeonPercent?: number;
}

/** One row of a player's history: the state at the end of a week. */
export interface WeekRecord {
  week: number;
  baitEarned: number;
  baitConverted: number;
  baitSpentExpeditions: number;
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
}

function createPlayers(mix: ArchetypeMix): SimPlayer[] {
  const players: SimPlayer[] = [];
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

function planLeetDays(rng: Rng, archetype: ArchetypeId, behaviour: Behaviour): boolean[] {
  const perWeek =
    behaviour.leetDaysPerWeek?.[archetype] ?? ARCHETYPE_CONFIG[archetype].leetDaysPerWeek;
  const chosen = new Set(shuffle(rng, [0, 1, 2, 3, 4, 5, 6]).slice(0, perWeek));
  return Array.from({ length: DAYS }, (_, d) => chosen.has(d));
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
 * One check-in: claim trips (and take an end-of-trip goal), claim jobs, evolve, train with what the
 * supplies budget leaves, manage gear, send trips into the free slots and start jobs (see POLICY).
 */
export function checkIn(
  player: SimPlayer,
  medianTopLevel: number,
  ctx: TripContext,
  sendsTrips = true,
): void {
  const gear = ctx.gear;
  claimTrips(player, ctx);
  if (gear !== undefined) claimJobs(player, gear);
  evolveCreatures(player);

  // The Bait that supplies may use: what is held above the reserve (all of it when nothing can be trained).
  const hasTrainable = player.creatures.some(isTrainable);
  const budget = hasTrainable ? Math.max(0, player.bait - POLICY.supplyReserve) : player.bait;

  // Trips go first, with supplies bought from the budget; what is not spent on them trains creatures.
  if (gear !== undefined) manageGear(player);
  const spent = sendsTrips
    ? sendTrips(player, ctx, Math.min(budget, player.bait), explorerOrder(player))
    : 0;
  player.bait -= spent;
  player.week.baitSpentExpeditions += spent;

  for (;;) {
    const trainee = chooseTrainee(player.creatures);
    if (trainee === null) break;
    const cost = trainCost(trainee, medianTopLevel);
    if (cost > player.bait) break;
    player.bait -= cost;
    player.week.baitSpentTraining += cost;
    player.week.trainings += 1;
    trainee.level += 1;
  }

  if (gear !== undefined) {
    startJobs(player, gear, new Set(player.expeditions.map((e) => e.explorerId)));
  }
}

function record(player: SimPlayer, week: number): WeekRecord {
  const team = pickTeam(player.creatures);
  return {
    week,
    baitEarned: player.week.baitEarned,
    baitConverted: player.week.baitConverted,
    baitSpentExpeditions: player.week.baitSpentExpeditions,
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

/** Bosses rotate weekly in content order. */
export function bossForWeek(week: number): BossDef {
  const boss = content.bosses[(week - 1) % content.bosses.length];
  if (boss === undefined) throw new Error('content has no bosses');
  return boss;
}

/** Sign-up for a raid: casuals with their sign-up chance, everyone else always (in random order). */
export function chooseSignUps(active: readonly SimPlayer[], signup: Rng, order: Rng): SimPlayer[] {
  const yes = active.filter(
    (p) =>
      chance(signup, ARCHETYPE_CONFIG[p.archetype].signUpPercent, 100) && p.creatures.length > 0,
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
 * Simulates one server for `weeks` weeks. Each week, Monday to Sunday: leet credit (the game's
 * `baitForDay` for that day's leeter count), check-ins, then Phase 1 on Friday after the morning
 * check-in, Phase 2 on Saturday and the finale on Sunday. Everything random comes from streams
 * derived from `seed`, so a seed always gives the same result.
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
  };
  const behaviour = options.behaviour ?? {};
  const tripPercent = behaviour.tripPercent ?? 100;
  const dungeonPercent = behaviour.dungeonPercent ?? 100;
  const takesPart = (percent: number): boolean =>
    percent >= 100 || chance(rng.participation, percent, 100);
  const players = createPlayers(options.mix);
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
    for (const p of active) p.leetDays = planLeetDays(rng.leet, p.archetype, behaviour);
    const weekIndex = firstWeekIndex + week - 1;
    const boss = bossForWeek(weekIndex + 1);
    let raid: ReturnType<typeof openRaidWeek> | null = null;
    let plan: ReturnType<typeof raidWeekPlan> | null = null;

    for (let day = 0; day < DAYS; day++) {
      const globalDay = (week - 1) * DAYS + day;
      // Check-ins happen at 09:00 and 20:00 (casuals only in the morning, on their leet days).
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
      const morning = tripContext(9);
      const eveningCtx = tripContext(20);
      const leeters = active.filter((p) => p.leetDays[day] === true);
      const bait = baitForDay(leeters.length);
      for (const p of leeters) {
        p.bait += bait;
        p.week.baitEarned += bait;
      }
      const median = serverMedianTopLevel(active);
      for (const p of active) {
        const cfg = ARCHETYPE_CONFIG[p.archetype];
        if (cfg.checkIns === 'twice_daily' || p.leetDays[day] === true) {
          checkIn(p, median, morning, takesPart(tripPercent));
        }
      }

      // The daily dungeon: everybody who checked in runs it (casuals on their leet days).
      if (dungeonOn) {
        const modifiers = dayModifiers(seed, globalDay);
        for (const p of active) {
          const cfg = ARCHETYPE_CONFIG[p.archetype];
          if (cfg.checkIns !== 'twice_daily' && p.leetDays[day] !== true) continue;
          if (!takesPart(dungeonPercent)) continue;
          const runs = playDungeonDay(
            p,
            globalDay,
            modifiers,
            `${seed}:dungeon:${p.id}:${String(globalDay)}`,
            rng.dungeon,
          );
          history.get(p.id)?.dungeon.push(...runs);
        }
      }

      if (day === RAID_DAY.phase1) {
        const signed = chooseSignUps(active, rng.signup, rng.order);
        for (const p of signed) p.week.signedUp = true;
        if (signed.length > 0) {
          if (rank === null) {
            rank = placementRank(signed.flatMap((p) => pickTeam(p.creatures).map((c) => c.level)));
          }
          plan = raidWeekPlan(weekIndex, rank);
          raid = openRaidWeek(boss, signed, {
            rank: plan.effectiveRank,
            reward: { rank: plan.rank, festival: plan.festival },
            luck,
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
        }
      }

      const evening = serverMedianTopLevel(active);
      for (const p of active) {
        if (ARCHETYPE_CONFIG[p.archetype].checkIns === 'twice_daily') {
          checkIn(p, evening, eveningCtx, takesPart(tripPercent));
        }
        const h = history.get(p.id);
        const joined = p.gear.joinDay;
        if (gearOn && h !== undefined && joined !== null && globalDay - joined === 29) {
          h.bestSkillDay30 = bestSkillLevel(p);
        }
      }
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
