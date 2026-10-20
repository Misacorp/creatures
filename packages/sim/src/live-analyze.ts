/**
 * The live analysis behind `pnpm analyze` (plan: `docs/design/analytics.md`, "Phase 2 plan", and
 * `docs/design/balance-loop.md`). A pure function of the ops report and the text of the balance log:
 * no I/O, no clock, so the same input always gives the same output.
 *
 * It turns the report's counts into plain-English tables (resources first), pick rates, a dungeon and
 * a raid view, and **flags**. A flag is a thing to look at, never a verdict: a rate with few samples
 * (below `MIN_N`) can only be a "watch", and anything under `WATCH_FLOOR_N` samples raises nothing.
 * The report is data only; every id printed comes from the strict schema in `live-report.ts` (ids
 * match `[a-z0-9_.:-]`), and is shown in a code span.
 */
import {
  RULES,
  ELEMENTS,
  JOB_KINDS,
  basicAbilities,
  content,
  expeditionContent,
} from '@creatures/game';
import { DEAD_ELEMENT_PICK_RATE } from './analysis';
import { STARTERS } from './data';
import { RowSet, type Report } from './live-report';
import { TARGETS, checkTarget, describeRequirement, formatValue, type Target } from './targets';

// --- Thresholds (all in one place; tuned in docs/design/decisions.md) ---

/** Samples a rate needs before a problem with it is a "flag" instead of a "watch". */
export const MIN_N = 20;
/** Fewer samples than this raise nothing at all (too little to even watch). */
export const WATCH_FLOOR_N = 5;
/** A curated option with no picks is flagged when its group has at least this many picks (or offers). */
export const NOBODY_MIN_PICKS = 30;
/** ...and watched from this many. */
export const NOBODY_WATCH_PICKS = 10;
/** An option holding more than this share of all picks is "everybody picks it"... */
export const EVERYBODY_SHARE = 0.6;
/** ...but only in a group with at least this many options. */
export const EVERYBODY_MIN_OPTIONS = 4;
/** A dungeon depth wall: the clear rate drops by more than this many points between two depths... */
export const WALL_DROP_PTS = 40;
/** ...and both depths have at least this many runs (a flag needs `MIN_N`; fewer is a watch). */
export const WALL_MIN_RUNS = 10;
/** The finale win rate band per Boss Rank, in percent (the sim target `raid-finale-typical`). */
export const FINALE_BAND = { min: 40, max: 60 } as const;
/** A currency piles up when sources are at least this many times the sinks... */
export const PILE_RATIO = 3;
/** ...and the net gain per active player per day reaches the amount for its currency. */
export const PILE_NET_PER_PLAYER_DAY: Readonly<Record<string, number>> = {
  bait: 25,
  essence: 2,
  scrap: 5,
  'tide-shard': 2,
  'ember-shard': 2,
  'grove-shard': 2,
  'spark-shard': 2,
  'mire-shard': 2,
  'shard-any': 2,
  glimmer: 1,
  supplies: 3,
};
/** The amount used for a currency not in the table. */
export const PILE_NET_DEFAULT = 5;
/** Player-days (the sum of the daily active players) a resource flag needs to be a "flag". */
export const MIN_PLAYER_DAYS = 30;
/** A "typical group" (the sim's wording) has between these many players on average. */
export const TYPICAL_PARTY = { min: 5, max: 10 } as const;
/** Rows shown per side of a currency waterfall before the rest is folded into "other". */
const WATERFALL_ROWS = 6;
/** Rows shown for an open-ended pick group. */
const OPEN_GROUP_ROWS = 10;

/** Resources are shown in this order; others follow alphabetically. */
const RESOURCE_ORDER = [
  'bait',
  'essence',
  'scrap',
  'tide-shard',
  'ember-shard',
  'grove-shard',
  'spark-shard',
  'mire-shard',
  'shard-any',
  'glimmer',
  'supplies',
] as const;

/**
 * The sinks the game is built to have, per currency (ledger purposes and flow labels). A label here
 * with no use while its currency has sources is flagged. `workshop_` matches every workshop job.
 */
export const EXPECTED_SINKS: Readonly<Record<string, readonly string[]>> = {
  bait: ['training', 'expedition'],
  essence: ['evolution', 'gear'],
  scrap: ['upgrade', 'workshop_'],
  supplies: ['expedition'],
};

// --- Result types ---

export type Level = 'flag' | 'watch';
export type Area = 'resources' | 'picks' | 'dungeon' | 'raid' | 'targets';

export interface Flag {
  level: Level;
  area: Area;
  subject: string;
  message: string;
  /** The sample the flag rests on. */
  n: number;
}

export interface LabelAmount {
  label: string;
  amount: number;
  /** Share of its side (sources or sinks), 0 to 1. */
  share: number;
}

export interface ResourceFlow {
  currency: string;
  sources: number;
  sinks: number;
  net: number;
  /** Net per active player per day; null without player-days. */
  netPerPlayerDay: number | null;
  sourceLabels: LabelAmount[];
  sinkLabels: LabelAmount[];
  /** Change of the per-day amounts against the previous period, in percent; null without one. */
  sourcesChangePct: number | null;
  sinksChangePct: number | null;
}

export interface PickRow {
  option: string;
  picks: number;
  share: number;
  /** Times the option was offered (push-on goals only). */
  offered?: number;
}

export interface PickGroup {
  id: string;
  title: string;
  /** What a "pick" counts, in words. */
  unit: string;
  /** True when the options are a known list (a zero is then a real "nobody"). */
  curated: boolean;
  total: number;
  rows: PickRow[];
}

export interface DepthRow {
  depth: number;
  runs: number;
  share: number;
  cleared: number;
  clearRate: number | null;
}

export interface RateRow {
  label: string;
  total: number;
  wins: number;
  rate: number | null;
}

export type TargetStatus = 'in_band' | 'outside' | 'not_comparable' | 'no_data';

export interface TargetCheck {
  targetId: string;
  /** What the live number is, in words. */
  live: string;
  band: string;
  value: number | null;
  /** The value as the sim report prints it (for example "34.3%"). */
  display: string;
  n: number;
  status: TargetStatus;
  note: string;
}

export interface LogEntry {
  id: string;
  title: string;
  opened: string;
}

export interface LiveAnalysis {
  from: string;
  to: string;
  days: number;
  rolledDays: number;
  servers: { known: number; reporting: number };
  hasPrevious: boolean;
  engagement: {
    playerDays: number;
    dauPerDay: number;
    sessions: number;
    sessionsPerDau: number | null;
    newPlayers: number;
    dauChangePct: number | null;
    featureUserShare: { feature: string; share: number }[];
  };
  resources: ResourceFlow[];
  picks: PickGroup[];
  dungeon: {
    runs: number;
    clears: number;
    clearRate: number | null;
    retryShare: number | null;
    depths: DepthRow[];
  };
  raid: {
    phases: { phase: string; rows: RateRow[]; overall: RateRow }[];
    abilityModes: { mode: string; count: number; share: number }[];
    handFiredShare: number | null;
    liveWatchers: number;
    rosterPlaces: number;
  };
  targets: TargetCheck[];
  flags: Flag[];
  openLogEntries: LogEntry[];
}

// --- Small helpers ---

const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;
/** A whole number with thousands separators. */
export const fmt = (n: number): string =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const ratio = (a: number, b: number): number | null => (b === 0 ? null : a / b);

/** "flag" with enough samples, "watch" with some, nothing below `floor`. */
export function levelFor(
  n: number,
  minN: number = MIN_N,
  floor: number = WATCH_FLOOR_N,
): Level | null {
  if (n >= minN) return 'flag';
  if (n >= floor) return 'watch';
  return null;
}

function changePct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) * 100) / previous);
}

// --- Resources ---

function labelAmounts(list: readonly [string, number][], total: number): LabelAmount[] {
  return list
    .filter(([, amount]) => amount > 0)
    .map(([label, amount]) => ({ label, amount, share: total === 0 ? 0 : round4(amount / total) }));
}

function currenciesOf(rows: RowSet): string[] {
  const seen = new Set(rows.by('flow', 'currency').map(([c]) => c));
  return [
    ...RESOURCE_ORDER.filter((c) => seen.has(c)),
    ...[...seen]
      .filter((c) => !(RESOURCE_ORDER as readonly string[]).includes(c))
      .sort((a, b) => a.localeCompare(b)),
  ];
}

function resourceFlows(
  rows: RowSet,
  playerDays: number,
  days: number,
  prior: { rows: RowSet; days: number } | null,
): ResourceFlow[] {
  return currenciesOf(rows).map((currency) => {
    const sources = rows.total('flow', { currency, dir: 'source' });
    const sinks = rows.total('flow', { currency, dir: 'sink' });
    const net = sources - sinks;
    const before =
      prior === null
        ? null
        : {
            sources: prior.rows.total('flow', { currency, dir: 'source' }) / prior.days,
            sinks: prior.rows.total('flow', { currency, dir: 'sink' }) / prior.days,
          };
    return {
      currency,
      sources,
      sinks,
      net,
      netPerPlayerDay: playerDays === 0 ? null : round4(net / playerDays),
      sourceLabels: labelAmounts(rows.by('flow', 'label', { currency, dir: 'source' }), sources),
      sinkLabels: labelAmounts(rows.by('flow', 'label', { currency, dir: 'sink' }), sinks),
      sourcesChangePct: before === null ? null : changePct(sources / days, before.sources),
      sinksChangePct: before === null ? null : changePct(sinks / days, before.sinks),
    };
  });
}

function resourceFlags(flows: readonly ResourceFlow[], playerDays: number): Flag[] {
  const out: Flag[] = [];
  const level = levelFor(playerDays, MIN_PLAYER_DAYS);
  if (level === null) return out;
  for (const f of flows) {
    const subject = `\`${f.currency}\``;
    const perDay = f.netPerPlayerDay;
    const threshold = PILE_NET_PER_PLAYER_DAY[f.currency] ?? PILE_NET_DEFAULT;
    if (
      f.sources > 0 &&
      f.sources >= PILE_RATIO * f.sinks &&
      perDay !== null &&
      perDay >= threshold
    ) {
      out.push({
        level,
        area: 'resources',
        subject,
        n: playerDays,
        message: `piling up: ${fmt(f.sources)} came in, ${fmt(f.sinks)} went out (at least ${String(PILE_RATIO)} times more in than out), net +${perDay.toFixed(1)} per active player per day (threshold ${String(threshold)}).`,
      });
    }
    if (f.sinks > f.sources) {
      out.push({
        level,
        area: 'resources',
        subject,
        n: playerDays,
        message: `running dry: ${fmt(f.sinks)} went out and only ${fmt(f.sources)} came in (net ${fmt(f.net)}).`,
      });
    }
    for (const expected of EXPECTED_SINKS[f.currency] ?? []) {
      const used = f.sinkLabels.some((s) =>
        expected.endsWith('_') ? s.label.startsWith(expected) : s.label === expected,
      );
      if (!used && f.sources > 0) {
        out.push({
          level,
          area: 'resources',
          subject,
          n: playerDays,
          message: `the sink \`${expected}\` had no use while ${fmt(f.sources)} came in.`,
        });
      }
    }
  }
  return out;
}

// --- Pick rates ---

interface PickGroupDef {
  id: string;
  title: string;
  unit: string;
  metric: string;
  dim: string;
  /** The known options, or null when the group is open-ended (only what was seen is listed). */
  options: readonly string[] | null;
  /** For push-on goals: the metric that counts how often each option was offered. */
  offeredMetric?: string;
}

function pickGroupDefs(): PickGroupDef[] {
  return [
    {
      id: 'starters',
      title: 'Starter creatures',
      unit: 'starters chosen',
      metric: 'starters',
      dim: 'species',
      options: STARTERS.map((s) => s.id),
    },
    {
      id: 'destinations',
      title: 'Expedition destinations',
      unit: 'trips sent',
      metric: 'expedition.send',
      dim: 'destination',
      options: expeditionContent.destinations.map((d) => d.id),
    },
    {
      id: 'lengths',
      title: 'Expedition lengths',
      unit: 'trips sent',
      metric: 'expedition.send',
      dim: 'length',
      options: Object.keys(RULES.expeditions.lengths),
    },
    {
      id: 'supplies',
      title: 'Supplies carried',
      unit: 'supplies carried',
      metric: 'expedition.supply_used',
      dim: 'supply',
      options: expeditionContent.supplies.map((s) => s.id),
    },
    {
      id: 'pushon-goals',
      title: 'Push-on goals',
      unit: 'goals chosen',
      metric: 'pushon.chosen',
      dim: 'goal',
      options: expeditionContent.goals.map((g) => g.id),
      offeredMetric: 'pushon.goal_offered',
    },
    {
      id: 'pushon-risks',
      title: 'Push-on risk levels chosen',
      unit: 'push-ons chosen',
      metric: 'pushon.chosen',
      dim: 'risk',
      options: null,
    },
    {
      id: 'dungeon-species',
      title: 'Dungeon team species',
      unit: 'team slots',
      metric: 'dungeon.team_species',
      dim: 'species',
      options: null,
    },
    {
      id: 'dungeon-roles',
      title: 'Dungeon team roles',
      unit: 'team slots',
      metric: 'dungeon.team_role',
      dim: 'role',
      options: [...new Set(content.creatures.map((c) => c.role))],
    },
    {
      id: 'raid-species',
      title: 'Raid team species',
      unit: 'team slots',
      metric: 'raid.team_species',
      dim: 'species',
      options: null,
    },
    {
      id: 'raid-abilities',
      title: 'Finale abilities picked',
      unit: 'picks',
      metric: 'raid.ability_pick',
      dim: 'ability',
      options: basicAbilities().map((a) => a.id),
    },
    {
      id: 'workshop-jobs',
      title: 'Workshop jobs',
      unit: 'jobs started',
      metric: 'workshop.job_start',
      dim: 'job',
      options: [...JOB_KINDS],
    },
  ];
}

function pickGroup(def: PickGroupDef, rows: RowSet): PickGroup {
  const seen = new Map(rows.by(def.metric, def.dim));
  const offered =
    def.offeredMetric === undefined ? null : new Map(rows.by(def.offeredMetric, def.dim));
  const ids = new Set([...(def.options ?? []), ...seen.keys()]);
  const total = [...seen.values()].reduce((a, b) => a + b, 0);
  const list: PickRow[] = [...ids]
    .map((option) => {
      const picks = seen.get(option) ?? 0;
      const row: PickRow = { option, picks, share: total === 0 ? 0 : round4(picks / total) };
      if (offered !== null) row.offered = offered.get(option) ?? 0;
      return row;
    })
    .sort((a, b) => b.picks - a.picks || a.option.localeCompare(b.option));
  return {
    id: def.id,
    title: def.title,
    unit: def.unit,
    curated: def.options !== null,
    total,
    rows: list,
  };
}

function pickFlags(groups: readonly PickGroup[]): Flag[] {
  const out: Flag[] = [];
  for (const g of groups) {
    if (g.total === 0) continue;
    if (g.curated) {
      // One flag per group and level, listing every option nobody picked.
      for (const level of ['flag', 'watch'] as const) {
        const none = g.rows
          .filter((row) => row.picks === 0)
          .map((row) => {
            // Push-on goals are judged against how often they were offered, not all choices.
            const n = row.offered ?? g.total;
            const rowLevel: Level | null =
              n >= NOBODY_MIN_PICKS ? 'flag' : n >= NOBODY_WATCH_PICKS ? 'watch' : null;
            return { option: row.option, n, rowLevel, offered: row.offered !== undefined };
          })
          .filter((row) => row.rowLevel === level);
        if (none.length === 0) continue;
        const n = Math.min(...none.map((row) => row.n));
        const names = none.map((row) => `\`${row.option}\``).join(', ');
        out.push({
          level,
          area: 'picks',
          subject: g.title,
          n,
          message: `nobody picks ${names} (${String(none.length)} of ${String(g.rows.length)} options, none in ${fmt(n)} ${
            none[0]?.offered === true ? 'times offered' : g.unit
          }).`,
        });
      }
    }
    const top = g.rows[0];
    if (
      top !== undefined &&
      g.rows.length >= EVERYBODY_MIN_OPTIONS &&
      top.share > EVERYBODY_SHARE
    ) {
      const level = levelFor(g.total);
      if (level !== null) {
        out.push({
          level,
          area: 'picks',
          subject: g.title,
          n: g.total,
          message: `everybody picks \`${top.option}\` (${pct(top.share)} of ${fmt(g.total)} ${g.unit}, ${String(g.rows.length)} options).`,
        });
      }
    }
  }
  return out;
}

/** Share of raid team slots by element (species ids are looked up in the content). */
function elementShares(rows: RowSet): { element: string; picks: number; share: number }[] {
  const byId = new Map(content.creatures.map((c) => [c.id, c.element]));
  const counts = new Map<string, number>(ELEMENTS.map((e) => [e, 0]));
  for (const [species, n] of rows.by('raid.team_species', 'species')) {
    const element = byId.get(species);
    if (element !== undefined) counts.set(element, (counts.get(element) ?? 0) + n);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return [...counts].map(([element, picks]) => ({
    element,
    picks,
    share: total === 0 ? 0 : round4(picks / total),
  }));
}

// --- Dungeon ---

function dungeonView(rows: RowSet): { view: LiveAnalysis['dungeon']; flags: Flag[] } {
  const runs = rows.total('dungeon.run');
  const clears = rows.total('dungeon.run', { cleared: 1 });
  const byDepth = rows
    .by('dungeon.depth', 'depth')
    .map(([depth, n]) => [Number(depth), n] as const)
    .sort((a, b) => a[0] - b[0]);
  const depths: DepthRow[] = byDepth.map(([depth, n]) => {
    const cleared = rows.total('dungeon.clear_depth', { depth });
    return {
      depth,
      runs: n,
      share: runs === 0 ? 0 : round4(n / runs),
      cleared,
      clearRate: ratio(cleared, n) === null ? null : round4(cleared / n),
    };
  });
  const flags: Flag[] = [];
  for (let i = 0; i + 1 < depths.length; i++) {
    const a = depths[i];
    const b = depths[i + 1];
    if (a === undefined || b === undefined || b.depth !== a.depth + 1) continue;
    if (a.clearRate === null || b.clearRate === null) continue;
    const n = Math.min(a.runs, b.runs);
    const level = levelFor(n, MIN_N, WALL_MIN_RUNS);
    const drop = (a.clearRate - b.clearRate) * 100;
    if (level !== null && drop > WALL_DROP_PTS) {
      flags.push({
        level,
        area: 'dungeon',
        subject: `depth ${String(a.depth)} to ${String(b.depth)}`,
        n,
        message: `a wall: the clear rate falls ${drop.toFixed(0)} points (${pct(a.clearRate)} to ${pct(b.clearRate)}, ${String(a.runs)} and ${String(b.runs)} runs).`,
      });
    }
  }
  for (const d of depths) {
    const level = levelFor(d.runs, MIN_N, WALL_MIN_RUNS);
    if (level !== null && d.cleared === 0) {
      flags.push({
        level,
        area: 'dungeon',
        subject: `depth ${String(d.depth)}`,
        n: d.runs,
        message: `${String(d.runs)} runs and none cleared.`,
      });
    }
  }
  const retries = rows.total('dungeon.run', { attempt: 2 });
  return {
    view: {
      runs,
      clears,
      clearRate: ratio(clears, runs) === null ? null : round4(clears / runs),
      retryShare: ratio(retries, runs) === null ? null : round4(retries / runs),
      depths,
    },
    flags,
  };
}

// --- Raid ---

function rateRow(label: string, total: number, wins: number): RateRow {
  return { label, total, wins, rate: total === 0 ? null : round4(wins / total) };
}

function raidView(rows: RowSet): { view: LiveAnalysis['raid']; flags: Flag[] } {
  const flags: Flag[] = [];
  const phases = ['phase1', 'phase2', 'finale'].map((phase) => {
    const ranks = [
      ...new Set(
        rows.rows
          .filter((r) => r.metric === 'raid.phase' && r.dims['phase'] === phase)
          .map((r) => `${String(r.dims['rank'])}:${String(r.dims['festival'])}`),
      ),
    ]
      .map((key) => {
        const [rank = '0', festival = '0'] = key.split(':');
        return { rank: Number(rank), festival: festival === '1' };
      })
      .sort((a, b) => a.rank - b.rank || Number(a.festival) - Number(b.festival));
    const list = ranks.map(({ rank, festival }) => {
      const where = { phase, rank, festival: festival ? 1 : 0 };
      return {
        row: rateRow(
          `rank ${String(rank)}${festival ? ' (Festival)' : ''}`,
          rows.total('raid.phase', where),
          rows.total('raid.phase', { ...where, win: 1 }),
        ),
        festival,
      };
    });
    if (phase === 'finale') {
      for (const { row, festival } of list) {
        const level = levelFor(row.total);
        if (festival || level === null || row.rate === null) continue;
        const value = row.rate * 100;
        if (value < FINALE_BAND.min || value > FINALE_BAND.max) {
          flags.push({
            level,
            area: 'raid',
            subject: `finale at ${row.label}`,
            n: row.total,
            message: `win rate ${pct(row.rate)} is outside ${String(FINALE_BAND.min)}-${String(FINALE_BAND.max)}% (${String(row.wins)} of ${String(row.total)}).`,
          });
        }
      }
    }
    return {
      phase,
      rows: list.map((l) => l.row),
      overall: rateRow(
        'all ranks, no Festival',
        rows.total('raid.phase', { phase, festival: 0 }),
        rows.total('raid.phase', { phase, festival: 0, win: 1 }),
      ),
    };
  });
  const modes = rows.by('raid.finale_ability', 'mode', { practice: 0 });
  const modeTotal = modes.reduce((s, [, n]) => s + n, 0);
  const fired = modes.find(([m]) => m === 'fired')?.[1] ?? 0;
  return {
    view: {
      phases,
      abilityModes: modes.map(([mode, count]) => ({
        mode,
        count,
        share: modeTotal === 0 ? 0 : round4(count / modeTotal),
      })),
      handFiredShare: modeTotal === 0 ? null : round4(fired / modeTotal),
      liveWatchers: rows.total('raid.live_watchers'),
      rosterPlaces: rows.total('raid.finale_members', { practice: 0 }),
    },
    flags,
  };
}

// --- Sim targets with a clean live equivalent ---

interface LiveValue {
  value: number;
  n: number;
  comparable: boolean;
  note: string;
}

interface TargetCtx {
  rows: RowSet;
  playerDays: number;
  /** Average players per fight of a phase, over all fights (null without fights). */
  avgParty(phase: string): number | null;
  elements: { element: string; picks: number; share: number }[];
}

interface LiveTarget {
  targetId: string;
  /** What the live number is, in words. */
  live: string;
  value(ctx: TargetCtx): LiveValue | null;
}

function typicalRate(phase: string, win: 0 | 1, festival: 0 | 1) {
  return (ctx: TargetCtx): LiveValue | null => {
    const where = { phase, festival };
    const total = ctx.rows.total('raid.phase', where);
    if (total === 0) return null;
    const rate = ctx.rows.total('raid.phase', { ...where, win }) / total;
    const party = ctx.avgParty(phase);
    const typical =
      festival === 1 ||
      (party !== null && party >= TYPICAL_PARTY.min && party <= TYPICAL_PARTY.max);
    return {
      value: rate,
      n: total,
      comparable: typical,
      note:
        typical || party === null
          ? ''
          : `average group ${party.toFixed(1)} players, the sim target is for ${String(TYPICAL_PARTY.min)}-${String(TYPICAL_PARTY.max)}`,
    };
  };
}

/**
 * The only sim targets that have a clean live equivalent, and how to read that live value from a
 * report. Everything else in `targets.json` needs data rollups do not carry (levels, holdings,
 * contribution shares, timings), so it is not mapped. `n` is the sample behind the value.
 */
export const LIVE_TARGETS: readonly LiveTarget[] = [
  {
    targetId: 'raid-phase1-typical',
    live: 'Phase 1 clear rate (no Festival)',
    value: typicalRate('phase1', 1, 0),
  },
  {
    targetId: 'raid-phase2-typical',
    live: 'Phase 2 clear rate (no Festival)',
    value: typicalRate('phase2', 1, 0),
  },
  {
    targetId: 'raid-finale-typical',
    live: 'Finale win rate (no Festival)',
    value: typicalRate('finale', 1, 0),
  },
  {
    targetId: 'longrun-festival-win',
    live: 'Finale win rate in Festival weeks',
    value: typicalRate('finale', 1, 1),
  },
  {
    targetId: 'dungeon-first-week-clear',
    live: 'Dungeon depth 1 clear rate (all players, not only the first week)',
    value: (ctx) => {
      const runs = ctx.rows.total('dungeon.depth', { depth: 1 });
      if (runs === 0) return null;
      return {
        value: ctx.rows.total('dungeon.clear_depth', { depth: 1 }) / runs,
        n: runs,
        comparable: true,
        note: '',
      };
    },
  },
  {
    targetId: 'dungeon-essence-share',
    live: 'Share of Essence coming in that is from the dungeon',
    value: (ctx) => {
      const all = ctx.rows.total('flow', { currency: 'essence', dir: 'source' });
      if (all === 0) return null;
      return {
        value:
          ctx.rows.total('flow', { currency: 'essence', dir: 'source', label: 'dungeon' }) / all,
        n: ctx.playerDays,
        comparable: true,
        note: '',
      };
    },
  },
  ...(
    [
      ['choice-element-min', 'Smallest element share of raid team slots', 'min'],
      ['choice-element-max', 'Largest element share of raid team slots', 'max'],
      [
        'choice-dead-elements',
        `Elements under ${String(DEAD_ELEMENT_PICK_RATE * 100)}% of raid team slots`,
        'dead',
      ],
    ] as const
  ).map(([targetId, live, kind]): LiveTarget => ({
    targetId,
    live,
    value: (ctx) => {
      const total = ctx.elements.reduce((s, e) => s + e.picks, 0);
      if (total === 0) return null;
      const shares = ctx.elements.map((e) => e.share);
      const value =
        kind === 'min'
          ? Math.min(...shares)
          : kind === 'max'
            ? Math.max(...shares)
            : shares.filter((s) => s < DEAD_ELEMENT_PICK_RATE).length;
      return { value, n: total, comparable: true, note: '' };
    },
  })),
];

function targetChecks(ctx: TargetCtx): { checks: TargetCheck[]; flags: Flag[] } {
  const checks: TargetCheck[] = [];
  const flags: Flag[] = [];
  for (const mapping of LIVE_TARGETS) {
    const target: Target | undefined = TARGETS.find((t) => t.id === mapping.targetId);
    if (target === undefined)
      throw new Error(`live target map names a missing target "${mapping.targetId}"`);
    const band = describeRequirement(target);
    const live = mapping.value(ctx);
    if (live === null) {
      checks.push({
        targetId: target.id,
        live: mapping.live,
        band,
        value: null,
        display: 'n/a',
        n: 0,
        status: 'no_data',
        note: '',
      });
      continue;
    }
    const inBand = checkTarget(target, live.value);
    const status: TargetStatus = !live.comparable
      ? 'not_comparable'
      : inBand
        ? 'in_band'
        : 'outside';
    checks.push({
      targetId: target.id,
      live: mapping.live,
      band,
      value: round4(live.value),
      display: formatValue(live.value, target.unit),
      n: live.n,
      status,
      note: live.note,
    });
    const level = levelFor(live.n);
    if (status === 'outside' && level !== null) {
      flags.push({
        level,
        area: 'targets',
        subject: `\`${target.id}\``,
        n: live.n,
        message: `live value (${mapping.live}) is ${formatValue(live.value, target.unit)}, outside the sim target (${band}).`,
      });
    }
  }
  return { checks, flags };
}

// --- The balance log ---

/**
 * The open entries of `docs/balance/log.md`: a `### B-NNN: title (open|closed)` heading whose status
 * is not "closed" and whose Outcome field is empty or still the template's "filled in later". The
 * template entry `B-000` is skipped.
 */
export function openLogEntries(logText: string): LogEntry[] {
  const out: LogEntry[] = [];
  const parts = logText.split(/^### (?=B-\d+)/m).slice(1);
  for (const part of parts) {
    const lines = part.split('\n');
    const heading = /^(B-\d+):\s*(.*?)\s*(?:\((open|closed)\))?\s*$/.exec(lines[0] ?? '');
    if (heading === null) continue;
    const [, id = '', title = '', status = 'open'] = heading;
    if (id === 'B-000' || status === 'closed') continue;
    let outcome: string | null = null;
    let opened = 'unknown';
    let current: 'outcome' | 'other' = 'other';
    for (const line of lines.slice(1)) {
      const field = /^- \*\*([A-Za-z-]+):\*\*\s*(.*)$/.exec(line);
      if (field !== null) {
        const [, name = '', rest = ''] = field;
        current = name === 'Outcome' ? 'outcome' : 'other';
        if (name === 'Outcome') outcome = rest;
        if (name === 'Opened') opened = /\d{4}-\d{2}-\d{2}/.exec(rest)?.[0] ?? 'unknown';
      } else if (current === 'outcome' && outcome !== null && line.trim() !== '') {
        outcome += ` ${line.trim()}`;
      }
    }
    const text = (outcome ?? '').trim();
    if (text === '' || /^(filled in later|pending|tbd|open|not yet)/i.test(text)) {
      out.push({ id, title, opened });
    }
  }
  return out;
}

// --- The whole analysis ---

function pct(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

/** Analyses a report. `logText` is the balance log (null: not available). */
export function analyse(report: Report, logText: string | null): LiveAnalysis {
  const rows = new RowSet(report.totals);
  const prior =
    report.previous === undefined
      ? null
      : { rows: new RowSet(report.previous.totals), days: report.previous.days };
  const days = Math.max(1, report.days);
  const playerDays = rows.total('dau');
  const sessions = rows.total('sessions');
  const dauPerDay = playerDays / days;
  const priorDau = prior === null ? null : prior.rows.total('dau') / prior.days;

  const engagement: LiveAnalysis['engagement'] = {
    playerDays,
    dauPerDay: round4(dauPerDay),
    sessions,
    sessionsPerDau: ratio(sessions, playerDays) === null ? null : round4(sessions / playerDays),
    newPlayers: rows.total('new_players'),
    dauChangePct: priorDau === null ? null : changePct(dauPerDay, priorDau),
    featureUserShare: rows
      .by('users', 'feature')
      .map(([feature, n]) => ({ feature, share: playerDays === 0 ? 0 : round4(n / playerDays) }))
      .sort((a, b) => b.share - a.share || a.feature.localeCompare(b.feature)),
  };

  const resources = resourceFlows(rows, playerDays, days, prior);
  const picks = pickGroupDefs().map((def) => pickGroup(def, rows));
  const dungeon = dungeonView(rows);
  const raid = raidView(rows);
  const elements = elementShares(rows);
  const checks = targetChecks({
    rows,
    playerDays,
    elements,
    avgParty: (phase) => {
      const fights = rows.total('raid.phase', { phase });
      return fights === 0 ? null : rows.total('raid.party_size_sum', { phase }) / fights;
    },
  });

  const flags = [
    ...resourceFlags(resources, playerDays),
    ...pickFlags(picks),
    ...dungeon.flags,
    ...raid.flags,
    ...checks.flags,
  ];
  const order: Record<Level, number> = { flag: 0, watch: 1 };
  flags.sort(
    (a, b) =>
      order[a.level] - order[b.level] ||
      a.area.localeCompare(b.area) ||
      a.subject.localeCompare(b.subject) ||
      a.message.localeCompare(b.message),
  );

  return {
    from: report.from,
    to: report.to,
    days: report.days,
    rolledDays: report.rolledDays,
    servers: report.guilds,
    hasPrevious: prior !== null,
    engagement,
    resources,
    picks,
    dungeon: dungeon.view,
    raid: raid.view,
    targets: checks.checks,
    flags,
    openLogEntries: logText === null ? [] : openLogEntries(logText),
  };
}

export { OPEN_GROUP_ROWS, WATERFALL_ROWS, pct };
