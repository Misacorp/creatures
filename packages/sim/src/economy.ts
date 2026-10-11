import {
  applyCatchToCollection,
  chance,
  content,
  createSeededRng,
  expeditionRolls,
  festivalCreatureFor,
  festivalGrantOutcome,
  int,
  nextRank,
  placementRank,
  raidWeekPlan,
  rollCatches,
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
  POLICY,
  chooseTrainee,
  collectionComplete,
  isTrainable,
  planExpeditions,
  trainCost,
} from './policy';
import { openRaidWeek, playStage, summarizeRaid, type RaidSummary } from './raid';
import { clonePlayer, createPlayer, emptyWeek, type SimPlayer } from './state';
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
}

export interface PlayerHistory {
  id: string;
  archetype: ArchetypeId;
  joinWeek: number;
  weeks: WeekRecord[];
  maxPity: number;
  raids: number;
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

function join(player: SimPlayer, all: readonly SimPlayer[]): void {
  const starter = chooseStarter(all.filter((p) => p.joined));
  player.joined = true;
  player.creatures.push({
    id: `${player.id}/${starter.line}`,
    line: starter.line,
    speciesId: starter.id,
    level: 1,
    fusionCount: 0,
  });
}

function planLeetDays(rng: Rng, archetype: ArchetypeId): boolean[] {
  const chosen = new Set(
    shuffle(rng, [0, 1, 2, 3, 4, 5, 6]).slice(0, ARCHETYPE_CONFIG[archetype].leetDaysPerWeek),
  );
  return Array.from({ length: DAYS }, (_, d) => chosen.has(d));
}

/** Median over joined players of their highest creature level (the server's median top level). */
export function serverMedianTopLevel(players: readonly SimPlayer[]): number {
  const tops = players
    .filter((p) => p.joined && p.creatures.length > 0)
    .map((p) => Math.max(...p.creatures.map((c) => c.level)));
  return median(tops) ?? 1;
}

function claimExpeditions(player: SimPlayer, rng: Rng): void {
  const pending = player.expeditions;
  player.expeditions = [];
  for (const exp of pending) {
    const explorer = player.creatures.find((c) => c.id === exp.explorerId);
    if (explorer === undefined) continue;
    const { results, dupeStreak } = rollCatches(rng, expeditionRolls(exp.duration), {
      content,
      supplies: exp.supplies,
      explorerElement: speciesOf(explorer.speciesId).element,
      ownedLines: new Set(player.creatures.map((c) => c.line)),
      dupeStreak: player.dupeStreak,
      firstExpedition: !player.firstExpeditionDone,
    });
    player.dupeStreak = dupeStreak;
    player.firstExpeditionDone = true;
    for (const caught of results) {
      const existing = player.creatures.find((c) => c.line === caught.species.line);
      const outcome = applyCatchToCollection(
        existing === undefined ? undefined : { fusionCount: existing.fusionCount, shiny: false },
        caught,
      );
      if (outcome.kind === 'new') {
        player.creatures.push({
          id: `${player.id}/${caught.species.line}`,
          line: caught.species.line,
          speciesId: caught.species.id,
          level: 1,
          fusionCount: 0,
        });
      } else if (outcome.kind === 'fused') {
        if (existing !== undefined) existing.fusionCount = outcome.newFusionCount;
      } else {
        player.bait += outcome.bait;
        player.week.baitConverted += outcome.bait;
      }
    }
  }
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

/** One check-in: claim, evolve, plan expeditions, train, send the expeditions (see POLICY). */
export function checkIn(player: SimPlayer, medianTopLevel: number, catchRng: Rng): void {
  claimExpeditions(player, catchRng);
  evolveCreatures(player);

  const slots = Math.min(POLICY.expeditionSlots, player.creatures.length);
  const plan = collectionComplete(player.creatures)
    ? []
    : planExpeditions(player.bait, slots, player.creatures.some(isTrainable));
  let reserved = 0;
  for (const o of plan) reserved += o.cost;

  for (;;) {
    const trainee = chooseTrainee(player.creatures);
    if (trainee === null) break;
    const cost = trainCost(trainee, medianTopLevel);
    if (cost > player.bait - reserved) break;
    player.bait -= cost;
    player.week.baitSpentTraining += cost;
    player.week.trainings += 1;
    trainee.level += 1;
  }

  const explorers = [...player.creatures].sort((a, b) => {
    const gap =
      elementGapScore(player, speciesOf(b.speciesId).element) -
      elementGapScore(player, speciesOf(a.speciesId).element);
    return gap !== 0 ? gap : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  plan.forEach((option, i) => {
    const explorer = explorers[i];
    if (explorer === undefined) return;
    player.bait -= option.cost;
    player.week.baitSpentExpeditions += option.cost;
    player.expeditions.push({
      explorerId: explorer.id,
      duration: option.duration,
      supplies: option.supplies,
    });
  });
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
  };
  const players = createPlayers(options.mix);
  const history = new Map<string, PlayerHistory>(
    players.map((p) => [
      p.id,
      { id: p.id, archetype: p.archetype, joinWeek: p.joinWeek, weeks: [], maxPity: 0, raids: 0 },
    ]),
  );
  const raids: EconomyResult['raids'] = [];
  const snapshots: Snapshot[] = [];
  const firstWeekIndex =
    options.firstWeekIndex ??
    int(createSeededRng(`${seed}:calendar`), RULES.progression.seasonWeeks);
  const luck = options.luck ?? RULES.combat.luck;
  let rank: number | null = null;

  for (let week = 1; week <= weeks; week++) {
    for (const p of players) {
      if (!p.joined && p.joinWeek <= week) join(p, players);
      p.week = emptyWeek();
    }
    const active = players.filter((p) => p.joined);
    for (const p of active) p.leetDays = planLeetDays(rng.leet, p.archetype);
    const weekIndex = firstWeekIndex + week - 1;
    const boss = bossForWeek(weekIndex + 1);
    let raid: ReturnType<typeof openRaidWeek> | null = null;
    let plan: ReturnType<typeof raidWeekPlan> | null = null;

    for (let day = 0; day < DAYS; day++) {
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
          checkIn(p, median, rng.catches);
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
        if (day === RAID_DAY.phase1) playStage(raid, 'phase1', rng.fight, rng.loot);
        if (day === RAID_DAY.phase2) playStage(raid, 'phase2', rng.fight, rng.loot);
        if (day === RAID_DAY.finale) playStage(raid, 'finale', rng.fight, rng.loot);
      }

      const evening = serverMedianTopLevel(active);
      for (const p of active) {
        if (ARCHETYPE_CONFIG[p.archetype].checkIns === 'twice_daily') {
          checkIn(p, evening, rng.catches);
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
    }
    if (options.snapshotWeeks.includes(week)) {
      snapshots.push({ week, players: active.map(clonePlayer) });
    }
  }

  return { players: [...history.values()], raids, snapshots, firstWeekIndex };
}
