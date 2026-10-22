/**
 * The Valley Games study (`pnpm sim:games`; docs/design/valley-games.md): real rosters from the economy
 * sim at a few weeks, every player entering creatures by a policy, the day's events played with the
 * shipped engine. It measures the spec's targets per event (the strongest entrant wins 25-45%, a
 * bottom-half entrant reaches the podium in at least 15% of events, 20-50 s per event, a moment every 4 s
 * or more often) and a few more numbers for tuning.
 */
import {
  chooseLineup,
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
  runGamesEvent,
  type GamesEntrant,
  type GamesEventResult,
} from '@creatures/engine';
import { creaturePower, foldedCreature, speciesOf, type OwnedCreature } from './data';
import { runEconomy } from './economy';
import { journeyRoster } from './profiles';
import type { SimPlayer } from './state';
import { shuffle } from './util';

export const GAMES_POLICIES = ['best', 'aptitude', 'random'] as const;
export type GamesPolicy = (typeof GAMES_POLICIES)[number];

/** A creature as the study handles it: its entrant (no team yet), its power and its line. */
export interface Candidate {
  entrant: GamesEntrant;
  power: number;
}

/** The candidates of a player: every creature it owns, folded the way fights fold them. */
export function candidatesOf(player: Pick<SimPlayer, 'id' | 'creatures'>): Candidate[] {
  return player.creatures.map((c: OwnedCreature) => {
    const folded = foldedCreature(c);
    const species = speciesOf(c.speciesId);
    return {
      entrant: gamesEntrantFrom({
        id: c.id,
        playerId: player.id,
        name: species.name,
        species,
        level: c.level,
        stats: folded.stats,
        crit: folded.crit,
        mods: folded.mods,
      }),
      power: creaturePower(c),
    };
  });
}

/**
 * Which creatures a player enters in each event of a lineup (index by event), one creature per event
 * (a team event takes up to three), no creature twice:
 * - `best`: strongest by power first, in lineup order;
 * - `aptitude`: the solo events greedily by the creature's aptitude relative to the player's best for
 *   that event, then the team event by aptitude;
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
  if (policy === 'best') {
    take([...pool].sort((a, b) => b.power - a.power || (a.entrant.id < b.entrant.id ? -1 : 1)));
    return out;
  }
  if (policy === 'random') {
    take(shuffle(rng, pool));
    return out;
  }
  const used = new Set<Candidate>();
  const solo = lineup.flatMap((d, k) => (d.team === 1 ? [k] : []));
  const apt = new Map<string, number>();
  const aptOf = (k: number, c: Candidate): number => {
    const key = `${String(k)}|${c.entrant.id}`;
    let v = apt.get(key);
    if (v === undefined) {
      v = gamesAptitude(lineup[k] as GamesEventDef, c.entrant);
      apt.set(key, v);
    }
    return v;
  };
  const bestFor = new Map<number, number>(
    solo.map((k) => [k, Math.max(1, ...pool.map((c) => aptOf(k, c)))]),
  );
  const open = new Set(solo);
  while (open.size > 0 && used.size < pool.length) {
    let pick: { k: number; c: Candidate; v: number } | undefined;
    for (const k of open) {
      for (const c of pool) {
        if (used.has(c)) continue;
        const v = aptOf(k, c) / (bestFor.get(k) as number);
        if (pick === undefined || v > pick.v) pick = { k, c, v };
      }
    }
    if (pick === undefined) break;
    used.add(pick.c);
    open.delete(pick.k);
    (out[pick.k] as Candidate[]).push(pick.c);
  }
  lineup.forEach((def, k) => {
    if (def.team === 1) return;
    const left = pool
      .filter((c) => !used.has(c))
      .sort((a, b) => aptOf(k, b) - aptOf(k, a) || (a.entrant.id < b.entrant.id ? -1 : 1))
      .slice(0, def.team);
    for (const c of left) used.add(c);
    out[k] = left;
  });
  return out;
}

/** One team in one played event, for the metrics. */
interface Entry {
  playerId: string;
  policy: GamesPolicy;
  power: number;
  aptitude: number;
  level: number;
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
  entriesByBand: Record<string, number>;
  spearmanApt: number;
  spearmanPower: number;
  spearmanRuns: number;
  /** Mean over runs with eliminations: the spread of the out ticks (p10 to p90) over the length, and the biggest share out on one tick. */
  outSpread: number;
  outBurst: number;
  outRuns: number;
}

export const LEVEL_BANDS = ['1-9', '10-19', '20-29', '30+'] as const;
function band(level: number): string {
  if (level < 10) return '1-9';
  if (level < 20) return '10-19';
  if (level < 30) return '20-29';
  return '30+';
}

function emptyTally(eventId: string): EventTally {
  const z = (): Record<GamesPolicy, number> => ({ best: 0, aptitude: 0, random: 0 });
  const b = (): Record<string, number> => Object.fromEntries(LEVEL_BANDS.map((x) => [x, 0]));
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
    spearmanApt: 0,
    spearmanPower: 0,
    spearmanRuns: 0,
    outSpread: 0,
    outBurst: 0,
    outRuns: 0,
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
    tally.entriesByPolicy[e.policy] += 1;
    tally.entriesByBand[band(e.level)] = (tally.entriesByBand[band(e.level)] ?? 0) + 1;
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
    const perTick = new Map<number, number>();
    for (const t of outs) perTick.set(t, (perTick.get(t) ?? 0) + 1);
    tally.outSpread += (p90 - p10) / Math.max(1, result.ticks);
    tally.outBurst += Math.max(...perTick.values()) / result.actors.length;
    tally.outRuns += 1;
  }
}

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

/** One played day: the lineup, each event's result and its entries. */
export interface PlayedEvent {
  def: GamesEventDef;
  result: GamesEventResult;
  entries: Entry[];
}

/** Plays one day for a roster: the lineup, every player's entries by its policy, every event. */
export function playDay(
  players: readonly SimPlayer[],
  rng: Rng,
  policyOf: (player: SimPlayer) => GamesPolicy,
): PlayedEvent[] {
  const lineup = chooseLineup(gamesContent.events, rng);
  const perEvent: {
    entrant: GamesEntrant;
    c: Candidate;
    player: SimPlayer;
    policy: GamesPolicy;
  }[][] = lineup.map(() => []);
  for (const player of players) {
    const policy = policyOf(player);
    const picks = assignEntries(lineup, candidatesOf(player), policy, rng);
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
        power: members.reduce((n, m) => n + m.c.power, 0),
        aptitude: members.reduce((n, m) => n + gamesAptitude(def, m.entrant), 0),
        level: Math.max(...members.map((m) => m.entrant.level)),
        place: s.place,
      };
    });
    out.push({ def, result, entries });
  });
  return out;
}

/** The study: every snapshot, `days` days each, the players' policies drawn per day. */
export function runGamesStudy(settings: GamesStudySettings): GamesStudy {
  const tallies = new Map<string, EventTally>(
    gamesContent.events.map((e) => [e.id, emptyTally(e.id)]),
  );
  for (const roster of gamesRosters(settings)) {
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
      for (const played of playDay(roster.players, rng, (p) => policies.get(p.id) ?? 'best')) {
        tallyEvent(
          tallies.get(played.def.id) as EventTally,
          played.def,
          played.result,
          played.entries,
        );
      }
    }
  }
  return { settings, events: [...tallies.values()] };
}

/** The spec's targets. */
export const GAMES_TARGETS = {
  strongestWins: { min: 0.25, max: 0.45 },
  bottomPodium: { min: 0.15 },
  seconds: { min: 20, max: 50 },
  /** Moments per second (one every 4 s). */
  momentsPerSecond: { min: 0.25 },
} as const;

export interface EventRow {
  eventId: string;
  runs: number;
  ticks: number;
  seconds: number;
  momentsPer10s: number;
  strongestWins: number;
  bottomPodium: number;
  winAptitude: number;
  winBest: number;
  winRandom: number;
  spearmanApt: number;
  spearmanPower: number;
  outSpread: number | null;
  outBurst: number | null;
  bands: Record<string, { wins: number; entries: number }>;
  pass: { strongest: boolean; bottom: boolean; length: boolean; moments: boolean };
}

const div = (a: number, b: number): number => (b === 0 ? 0 : a / b);

/** The table rows of a study. */
export function gamesRows(study: GamesStudy): EventRow[] {
  return study.events
    .filter((t) => t.runs > 0)
    .map((t) => {
      const seconds = div(t.seconds, t.runs);
      const mps = div(t.moments, t.seconds);
      const strongest = div(t.strongestWins, t.runs);
      const bottom = div(t.bottomPodium, t.bottomRuns);
      const totalWins = Object.values(t.winsByBand).reduce((a, b) => a + b, 0);
      const totalEntries = Object.values(t.entriesByBand).reduce((a, b) => a + b, 0);
      return {
        eventId: t.eventId,
        runs: t.runs,
        ticks: div(t.ticks, t.runs),
        seconds,
        momentsPer10s: mps * 10,
        strongestWins: strongest,
        bottomPodium: bottom,
        winAptitude: div(t.winsByPolicy.aptitude, t.entriesByPolicy.aptitude),
        winBest: div(t.winsByPolicy.best, t.entriesByPolicy.best),
        winRandom: div(t.winsByPolicy.random, t.entriesByPolicy.random),
        spearmanApt: div(t.spearmanApt, t.spearmanRuns),
        spearmanPower: div(t.spearmanPower, t.spearmanRuns),
        outSpread: t.outRuns === 0 ? null : t.outSpread / t.outRuns,
        outBurst: t.outRuns === 0 ? null : t.outBurst / t.outRuns,
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
          strongest:
            strongest >= GAMES_TARGETS.strongestWins.min &&
            strongest <= GAMES_TARGETS.strongestWins.max,
          bottom: bottom >= GAMES_TARGETS.bottomPodium.min,
          length: seconds >= GAMES_TARGETS.seconds.min && seconds <= GAMES_TARGETS.seconds.max,
          moments: mps >= GAMES_TARGETS.momentsPerSecond.min,
        },
      };
    });
}

const pct = (v: number): string => `${(v * 100).toFixed(0)}%`;
const mark = (ok: boolean): string => (ok ? 'PASS' : 'FAIL');

/** The study as a plain-text report (a markdown table). */
export function gamesReport(study: GamesStudy): string {
  const rows = gamesRows(study);
  const s = study.settings;
  const lines: string[] = [];
  lines.push(`# Valley Games study`);
  lines.push('');
  lines.push(
    `Seed \`${s.seed}\`; servers of ${s.sizes.join(' and ')} players; rosters at weeks ${s.weeks.join(', ')}; ${String(s.days)} days each; every player's policy (best, aptitude, random) drawn each day.`,
  );
  lines.push(
    'Targets: strongest wins 25-45%; a bottom-half entrant on the podium in at least 15% of events (4+ teams); 20-50 s; at least 2.5 moments per 10 s.',
  );
  lines.push('');
  lines.push(
    '| Event | Runs | Ticks | Seconds | Moments/10 s | Strongest wins | Bottom half podium | Win: aptitude / best / random | Spearman apt / power | Out spread / burst |',
  );
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const r of rows) {
    lines.push(
      `| ${r.eventId} | ${String(r.runs)} | ${r.ticks.toFixed(0)} | ${r.seconds.toFixed(1)} ${mark(r.pass.length)} | ${r.momentsPer10s.toFixed(1)} ${mark(r.pass.moments)} | ${pct(r.strongestWins)} ${mark(r.pass.strongest)} | ${pct(r.bottomPodium)} ${mark(r.pass.bottom)} | ${pct(r.winAptitude)} / ${pct(r.winBest)} / ${pct(r.winRandom)} | ${r.spearmanApt.toFixed(2)} / ${r.spearmanPower.toFixed(2)} | ${r.outSpread === null ? '-' : pct(r.outSpread)} / ${r.outBurst === null ? '-' : pct(r.outBurst)} |`,
    );
  }
  lines.push('');
  lines.push('Wins by level band (share of wins / share of entries):');
  lines.push('');
  lines.push(`| Event | ${LEVEL_BANDS.join(' | ')} |`);
  lines.push(`| --- | ${LEVEL_BANDS.map(() => '---:').join(' | ')} |`);
  for (const r of rows) {
    lines.push(
      `| ${r.eventId} | ${LEVEL_BANDS.map((b) => `${pct(r.bands[b]?.wins ?? 0)} / ${pct(r.bands[b]?.entries ?? 0)}`).join(' | ')} |`,
    );
  }
  const checks = rows.flatMap((r) => Object.values(r.pass));
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
