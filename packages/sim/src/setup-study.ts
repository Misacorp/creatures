import { RULES, content, createSeededRng, type BossDef } from '@creatures/game';
import { sweepRank } from './sweep-rank';
import { chooseSignUps, type Snapshot } from './economy';
import { pickTeam } from './data';
import { protection } from './formations';
import { openRaidWeek, playWholeWeek, summarizeRaid, type RaidSummary } from './raid';
import { clonePlayer, type SimPlayer } from './state';
import { mean, round } from './util';

/**
 * The setup study (`pnpm sim`'s "Setups" section) and the high-rank check ("Boss Rank"): the same
 * raid weeks played again with the row arranged differently, or against a boss of another rank.
 *
 * Everything is paired, as in `roles.ts`: an arm plays the same rosters, sign-ups and fight dice as
 * its reference (the sweep's own seeds), so the difference is the arrangement and little else. Only
 * typical groups (5 to 10 signed up) count, and the shipped bosses fight at the rank the sweep uses
 * unless the check sets one.
 */

/** Server sizes whose groups can fall in 5 to 10 signed up. */
const TYPICAL_COUNTS: readonly number[] = [5, 10];

/** The arrangements: the shipped default row (`autoPlace`, reference) and the two setups of `formations.ts`. */
export const SETUPS = [
  { id: 'auto', label: 'Default (autoPlace)' },
  { id: 'greedy', label: 'Greedy' },
  { id: 'protected', label: 'Protected' },
] as const;
export type SetupId = (typeof SETUPS)[number]['id'];

export interface SetupResult {
  id: SetupId;
  label: string;
  /** Boss Ranks above the rank the sweep fights at (0: the shipped bosses as calibrated). */
  rankOffset: number;
  /** Finales played (typical groups). */
  runs: number;
  winRate: number | null;
  phase1ClearRate: number | null;
  /** Share of the boss's HP left when the finale began, mean (lower: the setup hit harder before). */
  finaleStartShare: number | null;
  /** Reactions per round over the whole week, mean. */
  reactionsPerRound: number | null;
  /** Share of the row's payoffs that stand beside a Guard (in their own zone), over all weeks. */
  guardedPayoffShare: number | null;
  /** Share of the finale's creatures knocked out: all finales, the won ones, the lost ones. */
  koShare: number | null;
  koShareWon: number | null;
  koShareLost: number | null;
  /** Standard deviation of the knock-out share from finale to finale, in points. */
  koShareSd: number | null;
  /** Share of the lost finales that ended with more than half the row knocked out. */
  lostMajorityDownShare: number | null;
  /** Share of the won finales that were won with more than half the row knocked out. */
  wonMajorityDownShare: number | null;
  /** Share of all finales that reached enrage. */
  enrageShare: number | null;
  /**
   * Swing between weeks: the standard deviation, in points, of the finale win rate over the cells
   * (server size, boss, roster week).
   */
  cellWinRateSd: number | null;
  /** Win rate minus the default row's, in points. */
  deltaPoints: number | null;
}

export interface SetupStudyResult {
  setups: SetupResult[];
}

export interface StudyOptions {
  seed: string;
  /** Weeks per player count and boss (the sweep's `runsPerCell`). */
  runs: number;
  /** Server sizes to play; only 5 and 10 give typical groups. */
  counts: readonly number[];
  snapshots: ReadonlyMap<number, readonly Snapshot[]>;
}

interface PlayedWeek {
  cell: string;
  summary: RaidSummary;
  /** Reactions per round over the whole week. */
  reactionsPerRound: number;
  /** Payoffs standing beside a Guard, and payoffs in the row. */
  guardedPayoffs: number;
  payoffs: number;
}

/** Standard deviation (population), or null for fewer than two values. */
function sd(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values) as number;
  return Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / values.length);
}

interface Slot {
  count: number;
  boss: BossDef;
  snap: Snapshot;
  base: string;
  signUps: () => SimPlayer[];
}

/** The typical-group weeks of the sweep: its rosters, sign-ups and seeds. */
function* typicalWeeks(options: StudyOptions): Generator<Slot> {
  for (const count of options.counts.filter((c) => TYPICAL_COUNTS.includes(c))) {
    const snaps = options.snapshots.get(count) ?? [];
    if (snaps.length === 0) continue;
    for (const boss of content.bosses) {
      for (let i = 0; i < options.runs; i++) {
        const snap = snaps[i % snaps.length] as Snapshot;
        const base = `${options.seed}:sweep:${count}:${boss.id}:${i}`;
        const signUps = (): SimPlayer[] =>
          chooseSignUps(
            snap.players.map(clonePlayer),
            createSeededRng(`${base}:signup`),
            createSeededRng(`${base}:order`),
          );
        const size = signUps().length;
        if (size < 5 || size > 10) continue;
        yield { count, boss, snap, base, signUps };
      }
    }
  }
}

function protectionOf(row: Parameters<typeof protection>[0]): {
  guardedPayoffs: number;
  payoffs: number;
} {
  const p = protection(row);
  return { guardedPayoffs: p.guardedPayoffs, payoffs: p.payoffs };
}

function playWeek(
  slot: Slot,
  options: { formation?: SetupId; rank?: number; rankOffset?: number },
): PlayedWeek & { rank: number } {
  const signUps = slot.signUps();
  // The rank the sweep would use (`sweepRank` of the creatures brought), moved by the offset.
  const rank =
    options.rank ??
    sweepRank(signUps.flatMap((p) => pickTeam(p.creatures).map((c) => c.level))) +
      (options.rankOffset ?? 0);
  const week = openRaidWeek(slot.boss, signUps, {
    luck: RULES.combat.luck,
    rank,
    ...(options.formation === undefined ? {} : { formation: options.formation }),
  });
  playWholeWeek(week, createSeededRng(`${slot.base}:fight`), createSeededRng(`${slot.base}:loot`));
  const summary = summarizeRaid(week);
  return {
    cell: `${slot.count}:${slot.boss.id}:${slot.snap.week}`,
    summary,
    reactionsPerRound: summary.rounds === 0 ? 0 : summary.reactions / summary.rounds,
    ...protectionOf(week.row),
    rank: week.rank,
  };
}

/** The share of a list that satisfies `f`, or null for an empty list. */
function share<T>(items: readonly T[], f: (item: T) => boolean): number | null {
  return items.length === 0 ? null : items.filter(f).length / items.length;
}

function koShareOf(weeks: readonly PlayedWeek[]): number | null {
  const creatures = weeks.reduce((a, w) => a + w.summary.finale.creatures, 0);
  return creatures === 0
    ? null
    : weeks.reduce((a, w) => a + w.summary.finale.knockedOut, 0) / creatures;
}

const majorityDown = (w: PlayedWeek): boolean =>
  w.summary.finale.knockedOut * 2 > w.summary.finale.creatures;

/** Summary numbers of a list of played weeks (shared by the setup study and the rank check). */
export function summarizeWeeks(
  weeks: readonly PlayedWeek[],
): Omit<SetupResult, 'id' | 'label' | 'rankOffset' | 'deltaPoints'> {
  const won = weeks.filter((w) => w.summary.finaleWon);
  const lost = weeks.filter((w) => !w.summary.finaleWon);
  const cells = new Map<string, boolean[]>();
  for (const w of weeks) {
    const list = cells.get(w.cell) ?? [];
    list.push(w.summary.finaleWon);
    cells.set(w.cell, list);
  }
  const cellRates = [...cells.values()].map((l) => l.filter(Boolean).length / l.length);
  const koSd = sd(
    weeks.map((w) =>
      w.summary.finale.creatures === 0
        ? 0
        : w.summary.finale.knockedOut / w.summary.finale.creatures,
    ),
  );
  const cellSd = sd(cellRates);
  return {
    runs: weeks.length,
    winRate: share(weeks, (w) => w.summary.finaleWon),
    phase1ClearRate: share(weeks, (w) => w.summary.phase1Cleared),
    finaleStartShare: mean(weeks.map((w) => w.summary.finale.startShare)),
    reactionsPerRound: mean(weeks.map((w) => w.reactionsPerRound)),
    guardedPayoffShare: (() => {
      const payoffs = weeks.reduce((a, w) => a + w.payoffs, 0);
      return payoffs === 0 ? null : weeks.reduce((a, w) => a + w.guardedPayoffs, 0) / payoffs;
    })(),
    koShare: koShareOf(weeks),
    koShareWon: koShareOf(won),
    koShareLost: koShareOf(lost),
    koShareSd: koSd === null ? null : koSd * 100,
    lostMajorityDownShare: share(lost, majorityDown),
    wonMajorityDownShare: share(won, majorityDown),
    enrageShare: share(weeks, (w) => w.summary.finale.enraged),
    cellWinRateSd: cellSd === null ? null : cellSd * 100,
  };
}

/**
 * Boss Ranks above the sweep's own that the study plays: 0 is the shipped calibration (a typical
 * group wins about 93%, so little is left to lose), +1 and +2 are what a server that keeps winning
 * faces next (HP x1.4 and Attack x1.2 per rank), where the arrangements have something to decide.
 */
export const SETUP_RANK_OFFSETS: readonly number[] = [0, 1, 2];

export function runSetupStudy(options: StudyOptions): SetupStudyResult {
  const slots = [...typicalWeeks(options)];
  const out: SetupResult[] = [];
  for (const rankOffset of SETUP_RANK_OFFSETS) {
    const played = new Map<SetupId, PlayedWeek[]>(SETUPS.map((x) => [x.id, []]));
    for (const slot of slots) {
      for (const x of SETUPS)
        played.get(x.id)?.push(playWeek(slot, { formation: x.id, rankOffset }));
    }
    const reference = summarizeWeeks(played.get('auto') ?? []).winRate;
    for (const x of SETUPS) {
      const stats = summarizeWeeks(played.get(x.id) ?? []);
      out.push({
        id: x.id,
        label: x.label,
        rankOffset,
        ...stats,
        deltaPoints:
          stats.winRate === null || reference === null
            ? null
            : round((stats.winRate - reference) * 100, 2),
      });
    }
  }
  return { setups: out };
}

/** The Boss Ranks of the high-rank check. */
export const RANK_CHECK_RANKS: readonly number[] = [1, 3, 5, 7, 9, 11];

export interface RankResult {
  rank: number;
  /** The roster week the groups come from (the economy snapshots). */
  rosterWeek: number;
  runs: number;
  winRate: number | null;
  phase1ClearRate: number | null;
  phase2ClearRate: number | null;
  finaleStartShare: number | null;
  koShare: number | null;
  enrageShare: number | null;
  /** Share of the lost finales that ended with more than half the row knocked out. */
  lostMajorityDownShare: number | null;
}

export interface RankCheckResult {
  rows: RankResult[];
}

/**
 * The high-rank check: typical groups on each roster week play every boss at Boss Ranks 1, 3, 5, 7,
 * 9 and 11, with the shipped rank curves (`RULES.raid.scaling`), to see where wins collapse.
 */
export function runRankCheck(options: StudyOptions): RankCheckResult {
  const rows: RankResult[] = [];
  const weeks = new Map<number, Slot[]>();
  for (const slot of typicalWeeks(options)) {
    const list = weeks.get(slot.snap.week) ?? [];
    list.push(slot);
    weeks.set(slot.snap.week, list);
  }
  for (const [rosterWeek, slots] of [...weeks.entries()].sort((a, b) => a[0] - b[0])) {
    for (const rank of RANK_CHECK_RANKS) {
      const played = slots.map((slot) => playWeek(slot, { rank }));
      const stats = summarizeWeeks(played);
      rows.push({
        rank,
        rosterWeek,
        runs: stats.runs,
        winRate: stats.winRate,
        phase1ClearRate: stats.phase1ClearRate,
        phase2ClearRate: share(played, (w) => w.summary.phase2Cleared),
        finaleStartShare: stats.finaleStartShare,
        koShare: stats.koShare,
        enrageShare: stats.enrageShare,
        lostMajorityDownShare: stats.lostMajorityDownShare,
      });
    }
  }
  return { rows };
}
