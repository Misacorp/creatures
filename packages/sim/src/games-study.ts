/**
 * The Valley Games study (`pnpm sim:games`; docs/design/valley-games.md): real rosters from the economy
 * sim at a few weeks, every player entering creatures by a policy, the day's events played with the
 * shipped engine. It measures the spec's targets per event (the strongest entrant wins 25-45%, a
 * bottom-half entrant reaches the podium in at least 15% of events, 20-50 s per event, a moment every 4 s
 * or more often) and a few more numbers for tuning.
 */
import {
  RULES,
  chooseLineup,
  creaturePower as statsPower,
  createSeededRng,
  fillGamesSay,
  gamesContent,
  gamesSayTemplate,
  type GamesEventDef,
  type Rng,
} from '@creatures/game';
import {
  gamesAptitude,
  gamesEntrantFrom,
  gamesGoodFit,
  runGamesEvent,
  type GamesEntrant,
  type GamesEventResult,
} from '@creatures/engine';
import { creaturePower, foldedCreature, speciesOf, type OwnedCreature } from './data';
import { runEconomy } from './economy';
import { journeyRoster } from './profiles';
import type { SimPlayer } from './state';
import { shuffle } from './util';

/**
 * How a player picks (no level in the Games, 2026-10-23): `fit` picks at random among its "Good fit"
 * creatures (`gamesGoodFit`), `best-level` sends its highest levels first, `random` anything.
 */
export const GAMES_POLICIES = ['fit', 'best-level', 'random'] as const;
export type GamesPolicy = (typeof GAMES_POLICIES)[number];

/** A creature as the study handles it: its entrant (no team yet), its power, level and roster rank. */
export interface Candidate {
  entrant: GamesEntrant;
  /** Its fight power (level, fusion and gear): what its roster rank and `best-level` read. */
  power: number;
  /** Its power as the Games see it (the species' base stats, `gamesPowerOf`). */
  gamesPower: number;
  /** The creature's level: the Games do not read it; the study checks it does not predict a win. */
  level: number;
  /** Its place in its owner's roster by power: 1 is the strongest. */
  rank: number;
}

/** The candidates of a player: every creature it owns, its gear's chance and trigger lines folded in. */
export function candidatesOf(player: Pick<SimPlayer, 'id' | 'creatures'>): Candidate[] {
  const list = player.creatures.map((c: OwnedCreature) => {
    const folded = foldedCreature(c);
    const species = speciesOf(c.speciesId);
    return {
      entrant: gamesEntrantFrom({
        id: c.id,
        playerId: player.id,
        name: species.name,
        species,
        mods: folded.mods,
      }),
      power: creaturePower(c),
      gamesPower: statsPower(species.baseStats),
      level: c.level,
      rank: 0,
    };
  });
  const order = [...list].sort(
    (a, b) => b.power - a.power || (a.entrant.id < b.entrant.id ? -1 : 1),
  );
  order.forEach((c, i) => {
    c.rank = i + 1;
  });
  return list;
}

/**
 * Which creatures a player enters in each event of a lineup (index by event), one creature per event
 * (a team event takes up to three), no creature twice, in lineup order (solo events first):
 * - `fit`: at random among the free creatures with the event's "Good fit" badge, then at random among
 *   the rest when it has no more;
 * - `best-level`: highest level first (then power);
 * - `random`: a random order.
 */
export function assignEntries(
  lineup: readonly GamesEventDef[],
  pool: readonly Candidate[],
  policy: GamesPolicy,
  rng: Rng,
): Candidate[][] {
  const out: Candidate[][] = lineup.map(() => []);
  const take = (order: readonly Candidate[]): void => {
    let i = 0;
    lineup.forEach((def, k) => {
      const want = def.team;
      while ((out[k] as Candidate[]).length < want && i < order.length) {
        (out[k] as Candidate[]).push(order[i] as Candidate);
        i += 1;
      }
    });
  };
  if (policy === 'best-level') {
    take(
      [...pool].sort(
        (a, b) => b.level - a.level || b.power - a.power || (a.entrant.id < b.entrant.id ? -1 : 1),
      ),
    );
    return out;
  }
  if (policy === 'random') {
    take(shuffle(rng, pool));
    return out;
  }
  const used = new Set<Candidate>();
  lineup.forEach((def, k) => {
    const free = pool.filter((c) => !used.has(c));
    const good = shuffle(
      rng,
      free.filter((c) => gamesGoodFit(def, c.entrant)),
    );
    const rest = shuffle(
      rng,
      free.filter((c) => !good.includes(c)),
    );
    const picks = [...good, ...rest].slice(0, def.team);
    for (const c of picks) used.add(c);
    out[k] = picks;
  });
  return out;
}

/** How many of a player's creatures are a good fit for an event (`gamesGoodFit`). */
export function goodFitCount(def: GamesEventDef, pool: readonly Candidate[]): number {
  return pool.filter((c) => gamesGoodFit(def, c.entrant)).length;
}

/** One team in one played event, for the metrics. */
export interface Entry {
  playerId: string;
  policy: GamesPolicy;
  /** Games power (`Candidate.gamesPower`, summed in a team): "strongest" and "bottom half" read it. */
  power: number;
  aptitude: number;
  level: number;
  /** The best roster rank among its members (`Candidate.rank`). */
  rank: number;
  place: number;
}

/** The numbers of one event, summed over every time it was played. */
export interface EventTally {
  eventId: string;
  runs: number;
  ticks: number;
  seconds: number;
  moments: number;
  strongestWins: number;
  bottomPodium: number;
  /** Runs with at least 4 teams (where "bottom half" means something). */
  bottomRuns: number;
  winsByPolicy: Record<GamesPolicy, number>;
  entriesByPolicy: Record<GamesPolicy, number>;
  winsByBand: Record<string, number>;
  /**
   * Each entry's fair chance of the win (1 over the number of teams in its run), summed by band: a
   * band's share of these is the share of wins it would take if level made no difference, whatever
   * the field sizes (a week-1 server's small fields make every entry likelier to win).
   */
  entriesByBand: Record<string, number>;
  /** Solo events only: wins, podiums and entries by the creature's rank in its owner's roster. */
  winsByRank: Record<string, number>;
  podiumsByRank: Record<string, number>;
  entriesByRank: Record<string, number>;
  spearmanApt: number;
  spearmanPower: number;
  spearmanRuns: number;
  /** Mean over runs with eliminations: the spread of the out ticks (p10 to p90) over the length, and the biggest share out on one tick. */
  outSpread: number;
  outRuns: number;
  /** Runs of 8 or more where more than a quarter of the field left within 2 s, of such runs. */
  burstRuns: number;
  bigRuns: number;
  /** Runs of 12 or fewer: eliminations, and those the commentary named. */
  elimOuts: number;
  elimSaid: number;
  /** Runs with a stretch of more than 8 s without a moment, and the longest quiet stretch (s) summed. */
  deadRuns: number;
  quietMax: number;
  /** Per player and day the event was in the lineup: how many of the player's creatures were a good fit. */
  goodFits: number[];
}

export const LEVEL_BANDS = ['1-9', '10-19', '20-29', '30+'] as const;
export const ROSTER_RANKS = ['1st', '2nd', '3rd', '4th', '5th+'] as const;
function rankBucket(rank: number): string {
  return ROSTER_RANKS[Math.min(rank, 5) - 1] ?? '5th+';
}
function band(level: number): string {
  if (level < 10) return '1-9';
  if (level < 20) return '10-19';
  if (level < 30) return '20-29';
  return '30+';
}

export function emptyTally(eventId: string): EventTally {
  const z = (): Record<GamesPolicy, number> => ({ fit: 0, 'best-level': 0, random: 0 });
  const b = (): Record<string, number> => Object.fromEntries(LEVEL_BANDS.map((x) => [x, 0]));
  const r = (): Record<string, number> => Object.fromEntries(ROSTER_RANKS.map((x) => [x, 0]));
  return {
    eventId,
    runs: 0,
    ticks: 0,
    seconds: 0,
    moments: 0,
    strongestWins: 0,
    bottomPodium: 0,
    bottomRuns: 0,
    winsByPolicy: z(),
    entriesByPolicy: z(),
    winsByBand: b(),
    entriesByBand: b(),
    winsByRank: r(),
    podiumsByRank: r(),
    entriesByRank: r(),
    spearmanApt: 0,
    spearmanPower: 0,
    spearmanRuns: 0,
    outSpread: 0,
    outRuns: 0,
    burstRuns: 0,
    bigRuns: 0,
    elimOuts: 0,
    elimSaid: 0,
    deadRuns: 0,
    quietMax: 0,
    goodFits: [],
  };
}

/** Average ranks (1-based, ties share the mean rank) of values, highest first. */
function ranks(values: readonly number[]): number[] {
  const idx = values.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const out = new Array<number>(values.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && (idx[j + 1] as { v: number }).v === (idx[i] as { v: number }).v)
      j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[(idx[k] as { i: number }).i] = r;
    i = j + 1;
  }
  return out;
}

/** Spearman's rank correlation of two lists (Pearson on the ranks); 0 when either has no spread. */
export function spearman(xs: readonly number[], ys: readonly number[]): number {
  const rx = ranks(xs);
  const ry = ranks(ys);
  const n = rx.length;
  if (n < 2) return 0;
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (rx[i] as number) - mx;
    const dy = (ry[i] as number) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
}

/** Adds one played event to its tally. */
export function tallyEvent(
  tally: EventTally,
  def: GamesEventDef,
  result: GamesEventResult,
  entries: readonly Entry[],
): void {
  tally.runs += 1;
  tally.ticks += result.ticks;
  tally.seconds += (result.ticks * result.tickMs) / 1000;
  tally.moments += result.moments;
  const strongest = entries.reduce((b, e) => (e.power > b.power ? e : b), entries[0] as Entry);
  if (strongest.place === 1) tally.strongestWins += 1;
  if (entries.length >= 4) {
    tally.bottomRuns += 1;
    const byPower = [...entries].sort((a, b) => a.power - b.power);
    const bottom = byPower.slice(0, Math.floor(entries.length / 2));
    if (bottom.some((e) => e.place <= 3)) tally.bottomPodium += 1;
  }
  for (const e of entries) {
    if (def.team === 1) {
      const k = rankBucket(e.rank);
      tally.entriesByRank[k] = (tally.entriesByRank[k] ?? 0) + 1;
      if (e.place <= 3) tally.podiumsByRank[k] = (tally.podiumsByRank[k] ?? 0) + 1;
      if (e.place === 1) tally.winsByRank[k] = (tally.winsByRank[k] ?? 0) + 1;
    }
    tally.entriesByPolicy[e.policy] += 1;
    tally.entriesByBand[band(e.level)] =
      (tally.entriesByBand[band(e.level)] ?? 0) + 1 / entries.length;
    if (e.place === 1) {
      tally.winsByPolicy[e.policy] += 1;
      tally.winsByBand[band(e.level)] = (tally.winsByBand[band(e.level)] ?? 0) + 1;
    }
  }
  if (entries.length >= 3) {
    const placesUp = entries.map((e) => -e.place);
    tally.spearmanApt += spearman(
      entries.map((e) => e.aptitude),
      placesUp,
    );
    tally.spearmanPower += spearman(
      entries.map((e) => e.power),
      placesUp,
    );
    tally.spearmanRuns += 1;
  }
  const outs = result.outAt.filter((t): t is number => t !== null).sort((a, b) => a - b);
  if (outs.length >= 3 && def.kind !== 'swim') {
    const p10 = outs[Math.floor(outs.length * 0.1)] as number;
    const p90 = outs[Math.min(outs.length - 1, Math.floor(outs.length * 0.9))] as number;
    tally.outSpread += (p90 - p10) / Math.max(1, result.ticks);
    tally.outRuns += 1;
  }
  const n = result.actors.length;
  const ms = (ticks: number): number => ticks * result.tickMs;
  if (n >= 8) {
    tally.bigRuns += 1;
    const worst = Math.max(
      0,
      ...outs.map((t0) => outs.filter((t) => t >= t0 && ms(t - t0) < 2_000).length),
    );
    if (worst > n / 4) tally.burstRuns += 1;
  }
  if (n <= 12) {
    for (const b of result.beats) {
      if (b.k !== 'out') continue;
      tally.elimOuts += 1;
      const named = result.beats.some(
        (x) =>
          x.k === 'say' && (x.a === b.a || x.b === b.a) && ELIM_LINES.has(x.line) && x.t >= b.t,
      );
      if (named) tally.elimSaid += 1;
    }
  }
  const marks = [0, ...result.momentTicks, result.ticks];
  let quiet = 0;
  for (let i = 1; i < marks.length; i++) {
    quiet = Math.max(quiet, ms((marks[i] as number) - (marks[i - 1] as number)));
  }
  tally.quietMax += quiet / 1000;
  if (quiet > 8_000) tally.deadRuns += 1;
}

/** The lines that name a creature leaving its event. */
export const ELIM_LINES: ReadonlySet<string> = new Set([
  'endure.out',
  'chase.squash',
  'feast.burst',
  'swim.out',
  'shove.splash',
  'endure.out2',
  'chase.squash2',
  'feast.burst2',
  'swim.out2',
  'shove.splash2',
]);

export interface GamesStudySettings {
  seed: string;
  /** Players per server. */
  sizes: readonly number[];
  /** Weeks (1-based) at which rosters are snapshotted. */
  weeks: readonly number[];
  /** Days played per snapshot. */
  days: number;
}

export const DEFAULT_GAMES_SETTINGS: GamesStudySettings = {
  seed: 'games',
  sizes: [8, 15],
  weeks: [1, 4, 12, 30],
  days: 40,
};

export interface GamesStudy {
  settings: GamesStudySettings;
  events: EventTally[];
  /** Team events: the mean show length with 4 teams and with 15 (seconds), on the big server's rosters. */
  teamLengths: TeamLength[];
}

export interface TeamLength {
  eventId: string;
  at4: number;
  at15: number;
}

/** Shows per roster and field size in the team-length check. */
const TEAM_LENGTH_RUNS = 12;

/**
 * A team event's length must not grow with the field (Misa, 2026-10-23): everyone acts at once. Plays
 * each team event with the first 4 and the first 15 players' aptitude teams of every 15-player roster.
 */
function teamLengths(
  settings: GamesStudySettings,
  rosters: readonly { size: number; week: number; players: SimPlayer[] }[],
): TeamLength[] {
  return gamesContent.events
    .filter((def) => def.team === 3)
    .map((def) => {
      const sum = { 4: 0, 15: 0 };
      const runs = { 4: 0, 15: 0 };
      for (const roster of rosters) {
        if (roster.players.length < 15) continue;
        for (const teams of [4, 15] as const) {
          for (let k = 0; k < TEAM_LENGTH_RUNS; k++) {
            const rng = createSeededRng(
              `${settings.seed}:teamlen:${def.id}:${String(roster.week)}:${String(teams)}:${String(k)}`,
            );
            const entrants = roster.players
              .slice(0, teams)
              .flatMap((player) =>
                (assignEntries([def], candidatesOf(player), 'fit', rng)[0] ?? []).map(
                  (c) => c.entrant,
                ),
              );
            if (entrants.length === 0) continue;
            const r = runGamesEvent(def, entrants, rng);
            sum[teams] += (r.ticks * r.tickMs) / 1000;
            runs[teams] += 1;
          }
        }
      }
      return { eventId: def.id, at4: div(sum[4], runs[4]), at15: div(sum[15], runs[15]) };
    });
}

/** The players of each snapshot, by server size and week. */
export function gamesRosters(
  settings: GamesStudySettings,
): { size: number; week: number; players: SimPlayer[] }[] {
  const out: { size: number; week: number; players: SimPlayer[] }[] = [];
  const last = Math.max(...settings.weeks);
  for (const size of settings.sizes) {
    const econ = runEconomy({
      seed: `${settings.seed}:econ:${String(size)}`,
      weeks: last,
      roster: journeyRoster(size).map((profile) => ({ profile })),
      snapshotWeeks: settings.weeks,
    });
    for (const s of econ.snapshots) {
      out.push({
        size,
        week: s.week,
        players: s.players.filter((p) => p.joined && p.creatures.length > 0),
      });
    }
  }
  return out;
}

/** One played day: the lineup, each event's result and its entries, and each player's good-fit count. */
export interface PlayedEvent {
  def: GamesEventDef;
  result: GamesEventResult;
  entries: Entry[];
  goodFits: number[];
}

/**
 * Plays one day for a roster: the lineup (with the bonus event on the bonus day, `bonus`), every
 * player's entries by its policy, every event.
 */
export function playDay(
  players: readonly SimPlayer[],
  rng: Rng,
  policyOf: (player: SimPlayer) => GamesPolicy,
  bonus = false,
): PlayedEvent[] {
  const lineup = chooseLineup(
    gamesContent.events,
    rng,
    [],
    RULES.games.eventsPerDay,
    RULES.games.teamEventsPerDay,
    bonus,
  );
  const perEvent: {
    entrant: GamesEntrant;
    c: Candidate;
    player: SimPlayer;
    policy: GamesPolicy;
  }[][] = lineup.map(() => []);
  const goodFits: number[][] = lineup.map(() => []);
  for (const player of players) {
    const policy = policyOf(player);
    const pool = candidatesOf(player);
    lineup.forEach((def, k) => {
      (goodFits[k] as number[]).push(goodFitCount(def, pool));
    });
    const picks = assignEntries(lineup, pool, policy, rng);
    picks.forEach((cs, k) => {
      for (const c of cs)
        (perEvent[k] as unknown[]).push({ entrant: c.entrant, c, player, policy });
    });
  }
  const out: PlayedEvent[] = [];
  lineup.forEach((def, k) => {
    const list = perEvent[k] as {
      entrant: GamesEntrant;
      c: Candidate;
      player: SimPlayer;
      policy: GamesPolicy;
    }[];
    if (list.length === 0) return;
    const result = runGamesEvent(
      def,
      list.map((x) => x.entrant),
      rng,
    );
    const entries: Entry[] = result.standings.map((s) => {
      const members = s.actors.map((a) => list[a] as (typeof list)[number]);
      const first = members[0] as (typeof list)[number];
      return {
        playerId: first.player.id,
        policy: first.policy,
        power: members.reduce((n, m) => n + m.c.gamesPower, 0),
        aptitude: members.reduce((n, m) => n + gamesAptitude(def, m.entrant), 0),
        level: Math.max(...members.map((m) => m.c.level)),
        rank: Math.min(...members.map((m) => m.c.rank)),
        place: s.place,
      };
    });
    out.push({ def, result, entries, goodFits: goodFits[k] as number[] });
  });
  return out;
}

/** The study: every snapshot, `days` days each, the players' policies drawn per day. */
export function runGamesStudy(settings: GamesStudySettings): GamesStudy {
  const tallies = new Map<string, EventTally>(
    gamesContent.events.map((e) => [e.id, emptyTally(e.id)]),
  );
  const rosters = gamesRosters(settings);
  for (const roster of rosters) {
    for (let d = 0; d < settings.days; d++) {
      const rng = createSeededRng(
        `${settings.seed}:day:${String(roster.size)}:${String(roster.week)}:${String(d)}`,
      );
      const policies = new Map(
        roster.players.map((p) => [
          p.id,
          GAMES_POLICIES[rng.nextU32() % GAMES_POLICIES.length] as GamesPolicy,
        ]),
      );
      // Day 0 is a Monday: the bonus day (`RULES.games.bonus.weekday`) is one day in seven.
      const bonus = (d % 7) + 1 === RULES.games.bonus.weekday;
      for (const played of playDay(
        roster.players,
        rng,
        (p) => policies.get(p.id) ?? 'random',
        bonus,
      )) {
        const tally = tallies.get(played.def.id) as EventTally;
        tallyEvent(tally, played.def, played.result, played.entries);
        tally.goodFits.push(...played.goodFits);
      }
    }
  }
  return { settings, events: [...tallies.values()], teamLengths: teamLengths(settings, rosters) };
}

/** The spec's targets, and the lead's (2026-10-22, round 2: the bench must be worth entering). */
export const GAMES_TARGETS = {
  /**
   * The strongest entrant (by Games power: its species' base stats) wins between these shares of an
   * event's runs; the floor is not for an event that favours small creatures (2026-10-23).
   */
  strongestWins: { min: 0.05, max: 0.45 },
  bottomPodium: { min: 0.15 },
  seconds: { min: 20, max: 50 },
  /** Moments per second (one every 4 s). */
  momentsPerSecond: { min: 0.25 },
  /** Results still follow the fit: aptitude against place, and good-fit picks win this many times as often as random ones. */
  /**
   * Floe Sumo is the chaos event. Pepper Panic and Pumpkin Push are luck-heavy too, and with no level
   * every creature of one species ties on aptitude, which caps the rank correlation (2026-10-23).
   */
  spearmanApt: {
    min: 0.6,
    byEvent: { 'floe-sumo': 0.45, 'pepper-panic': 0.5, 'pumpkin-push': 0.5 } as Readonly<
      Record<string, number>
    >,
  },
  fitOverRandom: { min: 1.5 },
  /** Per event: the median number of good fits in a player's roster (the badge's calibration). */
  goodFits: { min: 2, max: 4 },
  /** Solo events, all together: creatures 4th or lower in their own roster take this share of the wins. */
  benchWins: { min: 0.15 },
  /**
   * Solo events: level no longer predicts a win (no level in the Games, 2026-10-23). Level 1-9
   * creatures' share of wins over their fair share of entries within these bounds, and level 30+ at
   * most this (below is fine: the old creatures are the starters' common lines, the young ones
   * include the rare and epic catches; that is species, not level).
   */
  lowLevelRatio: { min: 0.8, max: 1.2 },
  highLevelRatio: { max: 1.2 },
  /** Solo events: highest-level-first picks win at most this many times as often as random ones. */
  bestLevelOverRandom: { max: 1.2 },
  /** Shows of 12 or fewer: the share of eliminations the commentary names. */
  elimLines: { min: 0.7 },
  /** At most this share of shows has a stretch of more than 8 s without a moment. */
  deadShows: { max: 0.1 },
  /** At most this share of shows (8+ entrants) has more than a quarter of the field leaving within 2 s. */
  burstShows: { max: 0.05 },
  /** Team events: the mean length with 15 teams within this share of the length with 4. */
  teamLength: { maxDiff: 0.1 },
} as const;

export interface EventRow {
  eventId: string;
  team: boolean;
  runs: number;
  ticks: number;
  seconds: number;
  momentsPer10s: number;
  strongestWins: number;
  bottomPodium: number;
  winFit: number;
  winBestLevel: number;
  winRandom: number;
  /** Median good fits per player's roster (`gamesGoodFit`), and the middle half (p25 to p75). */
  goodFits: number;
  goodFitsP25: number;
  goodFitsP75: number;
  spearmanApt: number;
  spearmanPower: number;
  /** Solo events: the share of wins taken by creatures 4th or lower in their roster. */
  benchWins: number | null;
  outSpread: number | null;
  /** Share of shows of 8+ with a quarter of the field out within 2 s. */
  outBurst: number | null;
  elimLines: number | null;
  deadShows: number;
  quietMax: number;
  bands: Record<string, { wins: number; entries: number }>;
  pass: {
    strongest: boolean;
    bottom: boolean;
    length: boolean;
    moments: boolean;
    spearman: boolean;
    fit: boolean;
    goodFits: boolean;
    elim: boolean;
    pacing: boolean;
    burst: boolean;
  };
}

/** Solo events added up: wins, podiums and entries by roster rank and by level band. */
export interface SoloSummary {
  ranks: Record<string, { wins: number; podiums: number; entries: number }>;
  bands: Record<string, { wins: number; entries: number }>;
  benchWins: number;
  lowLevelRatio: number;
  highLevelRatio: number;
  /** Win rate of `best-level` picks over `random` ones, solo events together. */
  bestLevelOverRandom: number;
  pass: { bench: boolean; low: boolean; high: boolean; bestLevel: boolean };
}

const div = (a: number, b: number): number => (b === 0 ? 0 : a / b);
const total = (r: Record<string, number>): number => Object.values(r).reduce((a, b) => a + b, 0);
const BENCH = ['4th', '5th+'];

/** Whether an event favours small creatures (its favours say so). */
function favoursSmall(eventId: string): boolean {
  return gamesContent.events.find((e) => e.id === eventId)?.favours.includes('small') === true;
}

/** The value at share `q` (0 to 1) of a list (nearest rank); 0 for an empty list. */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;
}

/** The table rows of a study. */
export function gamesRows(study: GamesStudy): EventRow[] {
  return study.events
    .filter((t) => t.runs > 0)
    .map((t) => {
      const seconds = div(t.seconds, t.runs);
      const mps = div(t.moments, t.seconds);
      const strongest = div(t.strongestWins, t.runs);
      const bottom = div(t.bottomPodium, t.bottomRuns);
      const totalWins = total(t.winsByBand);
      const totalEntries = total(t.entriesByBand);
      const rankWins = total(t.winsByRank);
      const winFit = div(t.winsByPolicy.fit, t.entriesByPolicy.fit);
      const winRandom = div(t.winsByPolicy.random, t.entriesByPolicy.random);
      const goodFits = quantile(t.goodFits, 0.5);
      const spearmanApt = div(t.spearmanApt, t.spearmanRuns);
      return {
        eventId: t.eventId,
        team: rankWins === 0 && total(t.entriesByRank) === 0,
        runs: t.runs,
        ticks: div(t.ticks, t.runs),
        seconds,
        momentsPer10s: mps * 10,
        strongestWins: strongest,
        bottomPodium: bottom,
        winFit,
        winBestLevel: div(t.winsByPolicy['best-level'], t.entriesByPolicy['best-level']),
        winRandom,
        goodFits,
        goodFitsP25: quantile(t.goodFits, 0.25),
        goodFitsP75: quantile(t.goodFits, 0.75),
        spearmanApt,
        spearmanPower: div(t.spearmanPower, t.spearmanRuns),
        benchWins:
          rankWins === 0
            ? null
            : div(
                BENCH.reduce((n, k) => n + (t.winsByRank[k] ?? 0), 0),
                rankWins,
              ),
        outSpread: t.outRuns === 0 ? null : t.outSpread / t.outRuns,
        outBurst: t.bigRuns === 0 ? null : t.burstRuns / t.bigRuns,
        elimLines: t.elimOuts < 20 ? null : t.elimSaid / t.elimOuts,
        deadShows: div(t.deadRuns, t.runs),
        quietMax: div(t.quietMax, t.runs),
        bands: Object.fromEntries(
          LEVEL_BANDS.map((b) => [
            b,
            {
              wins: div(t.winsByBand[b] ?? 0, totalWins),
              entries: div(t.entriesByBand[b] ?? 0, totalEntries),
            },
          ]),
        ),
        pass: {
          // The floor is not for an event that favours small creatures: the strongest by base stats is
          // a grown one there, and the young are meant to beat it.
          strongest:
            (favoursSmall(t.eventId) || strongest >= GAMES_TARGETS.strongestWins.min) &&
            strongest <= GAMES_TARGETS.strongestWins.max,
          bottom: bottom >= GAMES_TARGETS.bottomPodium.min,
          length: seconds >= GAMES_TARGETS.seconds.min && seconds <= GAMES_TARGETS.seconds.max,
          moments: mps >= GAMES_TARGETS.momentsPerSecond.min,
          spearman:
            spearmanApt >=
            (GAMES_TARGETS.spearmanApt.byEvent[t.eventId] ?? GAMES_TARGETS.spearmanApt.min),
          // Too few eliminations to judge (a race where almost nobody is knocked out) pass.
          elim: t.elimOuts < 20 || t.elimSaid / t.elimOuts >= GAMES_TARGETS.elimLines.min,
          pacing: div(t.deadRuns, t.runs) <= GAMES_TARGETS.deadShows.max,
          burst: t.bigRuns === 0 || t.burstRuns / t.bigRuns <= GAMES_TARGETS.burstShows.max,
          fit: winFit >= GAMES_TARGETS.fitOverRandom.min * winRandom,
          goodFits:
            goodFits >= GAMES_TARGETS.goodFits.min && goodFits <= GAMES_TARGETS.goodFits.max,
        },
      };
    });
}

/** The solo events of a study added up (team events have no roster rank: three creatures share a result). */
export function soloSummary(study: GamesStudy): SoloSummary {
  const solo = study.events.filter((t) => total(t.entriesByRank) > 0);
  const sumOf = (pick: (t: EventTally) => Record<string, number>, key: string): number =>
    solo.reduce((n, t) => n + (pick(t)[key] ?? 0), 0);
  const ranks = Object.fromEntries(
    ROSTER_RANKS.map((k) => [
      k,
      {
        wins: sumOf((t) => t.winsByRank, k),
        podiums: sumOf((t) => t.podiumsByRank, k),
        entries: sumOf((t) => t.entriesByRank, k),
      },
    ]),
  );
  const bandsRaw = Object.fromEntries(
    LEVEL_BANDS.map((b) => [
      b,
      { wins: sumOf((t) => t.winsByBand, b), entries: sumOf((t) => t.entriesByBand, b) },
    ]),
  );
  const wins = Object.values(bandsRaw).reduce((n, x) => n + x.wins, 0);
  const entries = Object.values(bandsRaw).reduce((n, x) => n + x.entries, 0);
  const bands = Object.fromEntries(
    LEVEL_BANDS.map((b) => [
      b,
      { wins: div(bandsRaw[b]?.wins ?? 0, wins), entries: div(bandsRaw[b]?.entries ?? 0, entries) },
    ]),
  );
  const rankWins = Object.values(ranks).reduce((n, x) => n + x.wins, 0);
  const benchWins = div(
    BENCH.reduce((n, k) => n + (ranks[k]?.wins ?? 0), 0),
    rankWins,
  );
  const ratio = (b: string): number => div(bands[b]?.wins ?? 0, bands[b]?.entries ?? 0);
  const lowLevelRatio = ratio('1-9');
  const highLevelRatio = ratio('30+');
  const rate = (p: GamesPolicy): number =>
    div(
      solo.reduce((n, t) => n + t.winsByPolicy[p], 0),
      solo.reduce((n, t) => n + t.entriesByPolicy[p], 0),
    );
  const bestLevelOverRandom = div(rate('best-level'), rate('random'));
  const within = (v: number, b: { min: number; max: number }): boolean => v >= b.min && v <= b.max;
  return {
    ranks,
    bands,
    benchWins,
    lowLevelRatio,
    highLevelRatio,
    bestLevelOverRandom,
    pass: {
      bench: benchWins >= GAMES_TARGETS.benchWins.min,
      low: within(lowLevelRatio, GAMES_TARGETS.lowLevelRatio),
      high: highLevelRatio <= GAMES_TARGETS.highLevelRatio.max,
      bestLevel: bestLevelOverRandom <= GAMES_TARGETS.bestLevelOverRandom.max,
    },
  };
}

const pct = (v: number): string => `${(v * 100).toFixed(0)}%`;
const mark = (ok: boolean): string => (ok ? 'PASS' : 'FAIL');

/** Every target check of a study: the events' and the solo summary's. */
export function gamesChecks(study: GamesStudy): boolean[] {
  return [
    ...gamesRows(study).flatMap((r) => Object.values(r.pass)),
    ...Object.values(soloSummary(study).pass),
    ...study.teamLengths.map(teamLengthPass),
  ];
}

/** Whether a team event's length with 15 teams is within `teamLength.maxDiff` of its length with 4. */
export function teamLengthPass(t: TeamLength): boolean {
  return Math.abs(t.at15 - t.at4) <= GAMES_TARGETS.teamLength.maxDiff * Math.max(t.at4, 1e-9);
}

/** The study as a plain-text report (markdown tables). */
export function gamesReport(study: GamesStudy): string {
  const rows = gamesRows(study);
  const sum = soloSummary(study);
  const s = study.settings;
  const lines: string[] = [];
  lines.push(`# Valley Games study`);
  lines.push('');
  lines.push(
    `Seed \`${s.seed}\`; servers of ${s.sizes.join(' and ')} players; rosters at weeks ${s.weeks.join(', ')}; ${String(s.days)} days each; every player's policy (fit, best-level, random) drawn each day.`,
  );
  lines.push(
    'Targets per event: strongest by Games power (base stats) wins at most 45%, and at least 5% where the event does not favour small creatures; a bottom-half entrant on the podium in at least 15% of events (4+ teams); 20-50 s; at least 2.5 moments per 10 s; Spearman aptitude vs result at least 0.6 (Floe Sumo, the chaos event: 0.45); 70% of eliminations named by the commentary (12 or fewer entrants); at most 10% of shows with more than 8 s without a moment; at most 5% of shows (8+) with a quarter of the field out within 2 s; good-fit picks win at least 1.5x as often as random ones; a median of 2 to 4 good fits per roster. Solo events together: the bench (4th or lower in its roster) takes at least 15% of wins; level 1-9 and level 30+ win shares within 0.8-1.2x their entry shares; highest-level picks win at most 1.2x as often as random ones.',
  );
  lines.push('');
  lines.push(
    '| Event | Runs | Seconds | Moments/10 s | Strongest wins | Bottom half podium | Bench wins | Win: fit / best-level / random | Good fits (p25-p75) | Spearman apt / power | Outs named | Quiet >8 s (longest) | Out spread / 25%-in-2 s |',
  );
  lines.push(
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  );
  for (const r of rows) {
    lines.push(
      `| ${r.eventId} | ${String(r.runs)} | ${r.seconds.toFixed(1)} ${mark(r.pass.length)} | ${r.momentsPer10s.toFixed(1)} ${mark(r.pass.moments)} | ${pct(r.strongestWins)} ${mark(r.pass.strongest)} | ${pct(r.bottomPodium)} ${mark(r.pass.bottom)} | ${r.benchWins === null ? '-' : pct(r.benchWins)} | ${pct(r.winFit)} / ${pct(r.winBestLevel)} / ${pct(r.winRandom)} ${mark(r.pass.fit)} | ${String(r.goodFits)} (${String(r.goodFitsP25)}-${String(r.goodFitsP75)}) ${mark(r.pass.goodFits)} | ${r.spearmanApt.toFixed(2)} ${mark(r.pass.spearman)} / ${r.spearmanPower.toFixed(2)} | ${r.elimLines === null ? '-' : pct(r.elimLines)} ${mark(r.pass.elim)} | ${pct(r.deadShows)} (${r.quietMax.toFixed(1)} s) ${mark(r.pass.pacing)} | ${r.outSpread === null ? '-' : pct(r.outSpread)} / ${r.outBurst === null ? '-' : pct(r.outBurst)} ${mark(r.pass.burst)} |`,
    );
  }
  lines.push('');
  lines.push("Solo events by the creature's rank in its own roster (by power):");
  lines.push('');
  lines.push('| Rank | Share of wins | Share of podiums | Share of entries |');
  lines.push('| --- | ---: | ---: | ---: |');
  const rw = Object.values(sum.ranks).reduce((n, x) => n + x.wins, 0);
  const rp = Object.values(sum.ranks).reduce((n, x) => n + x.podiums, 0);
  const re = Object.values(sum.ranks).reduce((n, x) => n + x.entries, 0);
  for (const k of ROSTER_RANKS) {
    const x = sum.ranks[k] ?? { wins: 0, podiums: 0, entries: 0 };
    lines.push(
      `| ${k} | ${pct(div(x.wins, rw))} | ${pct(div(x.podiums, rp))} | ${pct(div(x.entries, re))} |`,
    );
  }
  lines.push('');
  lines.push(
    `Bench (4th+) share of solo wins: ${pct(sum.benchWins)} ${mark(sum.pass.bench)}. Level 1-9 wins/entries: ${sum.lowLevelRatio.toFixed(2)}x ${mark(sum.pass.low)}. Level 30+: ${sum.highLevelRatio.toFixed(2)}x ${mark(sum.pass.high)}. Highest level first wins ${sum.bestLevelOverRandom.toFixed(2)}x as often as random ${mark(sum.pass.bestLevel)}.`,
  );
  lines.push('');
  lines.push(
    'Wins by level band (share of wins / share of entries), solo events together and per event:',
  );
  lines.push('');
  lines.push(`| Event | ${LEVEL_BANDS.join(' | ')} |`);
  lines.push(`| --- | ${LEVEL_BANDS.map(() => '---:').join(' | ')} |`);
  lines.push(
    `| all solo | ${LEVEL_BANDS.map((b) => `${pct(sum.bands[b]?.wins ?? 0)} / ${pct(sum.bands[b]?.entries ?? 0)}`).join(' | ')} |`,
  );
  for (const r of rows) {
    lines.push(
      `| ${r.eventId} | ${LEVEL_BANDS.map((b) => `${pct(r.bands[b]?.wins ?? 0)} / ${pct(r.bands[b]?.entries ?? 0)}`).join(' | ')} |`,
    );
  }
  lines.push('');
  lines.push(
    'Team events: mean length with 4 teams and with 15 (the field must not make a show longer; within 10%):',
  );
  lines.push('');
  lines.push('| Event | 4 teams | 15 teams | Difference |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const t of study.teamLengths) {
    lines.push(
      `| ${t.eventId} | ${t.at4.toFixed(1)} s | ${t.at15.toFixed(1)} s | ${pct(div(t.at15 - t.at4, t.at4))} ${mark(teamLengthPass(t))} |`,
    );
  }
  const checks = gamesChecks(study);
  lines.push('');
  lines.push(
    `Targets passed: ${String(checks.filter((c) => c).length)} of ${String(checks.length)}.`,
  );
  return lines.join('\n');
}

/** One event's timeline as readable text: who did what when, and the commentary filled in. */
export function showScript(
  def: GamesEventDef,
  result: GamesEventResult,
  withMoves = false,
): string {
  const name = (a: number | undefined): string =>
    a === undefined ? '?' : `${result.actors[a]?.name ?? '?'}#${String(a)}`;
  const lines: string[] = [];
  lines.push(
    `${def.name} (${def.kind}, ${String(result.actors.length)} entrants, ${String(result.ticks)} ticks = ${((result.ticks * result.tickMs) / 1000).toFixed(1)} s, ${String(result.moments)} moments)`,
  );
  lines.push(
    `Actors: ${result.actors.map((a) => `${name(a.a)} [${a.element}, ${a.playerId}]`).join(', ')}`,
  );
  for (const b of result.beats) {
    const at = `${String(b.t).padStart(4)} ${((b.t * result.tickMs) / 1000).toFixed(1).padStart(5)}s`;
    switch (b.k) {
      case 'say': {
        const tpl = gamesSayTemplate(gamesContent, def, b.line) ?? b.line;
        const args: { a?: string; b?: string; n?: number } = {};
        if (b.a !== undefined) args.a = name(b.a);
        if (b.b !== undefined) args.b = name(b.b);
        if (b.n !== undefined) args.n = b.n;
        lines.push(`${at}  SAY  "${fillGamesSay(tpl, args)}"`);
        break;
      }
      case 'fx':
        lines.push(`${at}  fx   ${b.fx}${b.a === undefined ? '' : ` on ${name(b.a)}`}`);
        break;
      case 'out':
        lines.push(`${at}  OUT  ${name(b.a)} (${b.cause})`);
        break;
      case 'state':
        if (withMoves) lines.push(`${at}  is   ${name(b.a)} ${b.s}`);
        break;
      case 'pos':
        if (withMoves) lines.push(`${at}  pos  ${name(b.a)} ${String(b.x)},${String(b.y)}`);
        break;
      case 'meter':
        if (withMoves) lines.push(`${at}  bar  ${name(b.a)} ${String(b.v)}`);
        break;
      case 'score':
        if (withMoves) lines.push(`${at}  scr  ${name(b.a)} ${String(b.v)}`);
        break;
      case 'prop':
        if (withMoves)
          lines.push(
            `${at}  prop ${b.p} ${String(b.x)},${String(b.y)}${b.f === undefined ? '' : ` f=${String(b.f)}`}`,
          );
        break;
    }
  }
  lines.push('Standings:');
  for (const s of result.standings) {
    lines.push(`  ${String(s.place)}. ${s.actors.map(name).join(' + ')} score ${String(s.score)}`);
  }
  return lines.join('\n');
}
