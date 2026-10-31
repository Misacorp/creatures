import {
  LEDGER_PROFILES,
  exchangeRowsOf,
  forgeOf,
  growthOf,
  ledgerOf,
  priceTable,
  profileLabel,
  profilePlayers,
  serverOf,
  targetsOf,
  variantsOf,
  type ForgeRow,
  type ExchangeRow,
  type GrowthRow,
  type PriceRow,
  type ResourceLedger,
  type ServerRow,
  type TargetLine,
  type VariantRow,
} from './analysis';
import { RULES, type Rules } from './rules';
import { playersOf, type Results } from './scenarios';
import type { PlayerRun } from './sim';
import { rosterProfile, type RosterProfile } from './roster';
import { levelOf, medianOf, round, total } from './stats';
import { SLOW_FLOOR } from './servers';
import { THRESHOLDS } from './targets';
import { VISITOR_PROFILES, visitorOf, type VisitorData } from './visitorData';
import { median, sum } from './util';

/** The numbers behind the report (written as `report-data.json`, for charts). */
export interface ReportData {
  seeds: number;
  targets: TargetLine[];
  ledger: Record<string, ResourceLedger[]>;
  /** Where a daily player's scrap comes from and goes to, a week (median over seeds): the scale check for payouts not scaled with a piece's price. */
  scrapBySource: { source: string; kind: 'in' | 'out'; perWeek: number }[];
  prices: PriceRow[];
  growth: GrowthRow[];
  forge: ForgeRow[];
  servers: ServerRow[];
  fireByDial: Record<string, ServerRow | null>;
  /** The same with the old slow time floor under the fire (Q40 B dropped it; kept for comparison). */
  fireSlowFloor: Record<string, ServerRow | null>;
  variants: VariantRow[];
  /** The weekly visitor (V-VIS): rerolls and what they drain by week, piles with and without him, the best piece's lines, 4-of-5 epics. */
  visitor: VisitorData;
  /** A daily player's Forge by policy, with and without the shard exchange (weeks 2 to 12). */
  exchangeByPolicy: ExchangeRow[];
  /** A daily player's roster by week at the default arrival rate and at the docs' 2% an hour. */
  rosterByRate: {
    week: number;
    size: number;
    share: number;
    available: number;
    fastSize: number;
    fastShare: number;
  }[];
  roster: RosterProfile;
  journeys: Record<string, string[]>;
  cost: CostData;
}

export interface CostData {
  perVisit: { profile: string; creatures: number; reads: number; writes: number }[];
  perServerDay: {
    server: string;
    players: number;
    visits: number;
    reads: number;
    writes: number;
    budgetShare: number;
  }[];
}

const DAILY_BUDGET_ROWS = 5_000_000;

function costOf(results: Results): CostData {
  const profiles = ['daily', 'active', 'every-other-day', 'weekend-off', 'weekly', 'hoarder'];
  const perVisit = profiles.map((profile) => {
    const players = profilePlayers(results, profile);
    const per = (pick: (w: PlayerRun['weeks'][number]) => number): number =>
      medianOf(
        players,
        (p) =>
          total(p, 8, 12, pick) /
          Math.max(
            1,
            total(p, 8, 12, (w) => w.visits),
          ),
      );
    return {
      profile,
      creatures: medianOf(players, (p) => p.weeks[11]?.size ?? 0),
      reads: per((w) => w.rowsRead),
      writes: per((w) => w.rowsWritten),
    };
  });
  const perServerDay = ['mixed5', 'mixed8', 'mixed15', 'lone', 'hoarder'].flatMap((id) => {
    const result = results[id];
    if (!result) return [];
    const n = result.config.players.length;
    const perRun = result.runs.map((run) => {
      const days = 5 * 7;
      const reads =
        sum(run.players.map((p) => total(p, 8, 12, (w) => w.rowsRead))) / days + (n + 7);
      const writes =
        sum(run.players.map((p) => total(p, 8, 12, (w) => w.rowsWritten))) / days + (n + 1);
      const visits = sum(run.players.map((p) => total(p, 8, 12, (w) => w.visits))) / days;
      return { reads, writes, visits };
    });
    const reads = median(perRun.map((r) => r.reads));
    return [
      {
        server: id,
        players: n,
        visits: median(perRun.map((r) => r.visits)),
        reads,
        writes: median(perRun.map((r) => r.writes)),
        budgetShare: reads / DAILY_BUDGET_ROWS,
      },
    ];
  });
  return { perVisit, perServerDay };
}

// ---------- journeys ----------

function journey(
  players: readonly PlayerRun[],
  server: ServerRow | null,
  weeks: readonly number[],
): string[] {
  const at = (week: number, pick: (w: PlayerRun['weeks'][number]) => number): number =>
    median(players.flatMap((p) => (p.weeks[week - 1] ? [pick(p.weeks[week - 1]!)] : [])));
  return weeks.map((week) => {
    const n = (pick: (w: PlayerRun['weeks'][number]) => number, digits = 0): number =>
      round(at(week, pick), digits);
    const places = server?.levels[week - 1] ?? [];
    return (
      `Week ${week}: ${n((w) => w.size)} creatures, the best at level ${n((w) => levelOf(w, 1))} and the tenth at ${n((w) => levelOf(w, 10))}. ` +
      `${n((w) => w.scoutSeats)} scouts, ${n((w) => w.anvils)} anvils, ${n((w) => w.kit)} kit items. ` +
      `That week: ${n((w) => w.arrivals)} arrivals, ${n((w) => w.piecesMade)} pieces made, ${n((w) => w.gifts)} given to projects. ` +
      `Holding ${n((w) => w.stock[0] ?? 0)} Acorns, ${n((w) => w.stock[1] ?? 0)} scrap and ${n((w) => w.stock[2] ?? 0)} shards. ` +
      `Valley places at ${places.join('/') || '-'} (hearth, forge, signpost, paddock, school).`
    );
  });
}

/** Seconds each section of the report took (printed by the CLI, never part of the data: the data is deterministic). */
export type Timings = Record<string, number>;

/**
 * `server-coverage.json`: for each of the servers of 5, 8 and 15, by week, the share of the common, rare and epic species available
 * that at least one player owns. Separate from `roster-profile.json` so that file keeps the shape combat v2 reads.
 */
export interface CoverageRow {
  week: number;
  /** The unit of `common`, `rare` and `epic`: lines (a line's stage 1; scouts never find evolved forms). */
  unit: 'line';
  common: number;
  rare: number;
  epic: number;
  /** The same counted in forms (a line's evolved form counts once some player has evolved one). */
  forms: { common: number; rare: number; epic: number };
  /** The launch lines only (the 14 the scouts find from the start, per rarity): content drops do not make this dip. */
  launch: { common: number; rare: number; epic: number };
}

export function serverCoverage(data: ReportData): Record<string, CoverageRow[]> {
  return Object.fromEntries(
    data.servers
      .filter((s) => ['mixed5', 'mixed8', 'mixed15'].includes(s.id))
      .map((s) => [
        s.id,
        s.coverage.map((c, i) => ({
          week: i + 1,
          unit: 'line' as const,
          common: c[0] ?? 0,
          rare: c[1] ?? 0,
          epic: c[2] ?? 0,
          forms: {
            common: s.formCoverage[i]?.[0] ?? 0,
            rare: s.formCoverage[i]?.[1] ?? 0,
            epic: s.formCoverage[i]?.[2] ?? 0,
          },
          launch: {
            common: s.launchCoverage[i]?.[0] ?? 0,
            rare: s.launchCoverage[i]?.[1] ?? 0,
            epic: s.launchCoverage[i]?.[2] ?? 0,
          },
        })),
      ]),
  );
}

/** A daily player's scrap by source and sink, per week over the run (median over players). */
export function scrapBySourceOf(
  players: readonly PlayerRun[],
): { source: string; kind: 'in' | 'out'; perWeek: number }[] {
  const keys = new Set(players.flatMap((p) => Object.keys(p.sources)));
  const rows: { source: string; kind: 'in' | 'out'; perWeek: number }[] = [];
  for (const key of keys) {
    const [kind, resource, ...rest] = key.split(':');
    if (resource !== '1' || (kind !== 'in' && kind !== 'out')) continue;
    const weeks = Math.max(1, ...players.map((p) => p.weeks.length));
    rows.push({
      source: rest.join(':'),
      kind,
      perWeek: median(players.map((p) => p.sources[key] ?? 0)) / weeks,
    });
  }
  return rows.sort((a, b) => b.perWeek - a.perWeek);
}

export function buildReportData(
  results: Results,
  seeds: number,
  rules: Rules = RULES,
  timings: Timings = {},
): ReportData {
  const time = <T>(name: string, f: () => T): T => {
    const t = Date.now();
    const out = f();
    timings[name] = (timings[name] ?? 0) + (Date.now() - t) / 1000;
    return out;
  };
  const ledger: Record<string, ResourceLedger[]> = {};
  const growth: GrowthRow[] = [];
  const forge: ForgeRow[] = [];
  time('ledger, growth and Forge', () => {
    for (const id of LEDGER_PROFILES) {
      const players = profilePlayers(results, id);
      if (players.length === 0) continue;
      ledger[id] = ledgerOf(players);
      growth.push(growthOf(players, id));
      forge.push(forgeOf(players, id, rules));
    }
  });
  const servers = time('servers', () =>
    ['mixed5', 'mixed8', 'mixed15', 'lone', 'hoarder']
      .map((id) => serverOf(results, id))
      .filter((s): s is ServerRow => s !== null),
  );
  const mixed8 = servers.find((s) => s.id === 'mixed8') ?? null;
  const jw = [1, 2, 4, 8, 12, 24];
  return {
    seeds,
    targets: time('targets', () => targetsOf(results, rules)),
    ledger,
    scrapBySource: scrapBySourceOf(profilePlayers(results, 'daily')),
    prices: time('prices', () => priceTable(profilePlayers(results, 'daily'), rules)),
    growth,
    forge,
    servers,
    fireSlowFloor: time('servers', () => ({
      all: serverOf(results, 'mixed8-all-slowfloor'),
      half: serverOf(results, 'mixed8-slowfloor'),
      none: serverOf(results, 'mixed8-none-slowfloor'),
    })),
    fireByDial: time('servers', () => ({
      all: serverOf(results, 'mixed8-all'),
      half: serverOf(results, 'mixed8'),
      none: serverOf(results, 'mixed8-none'),
    })),
    variants: time('variants', () => variantsOf(results)),
    visitor: time('visitor', () => visitorOf(results)),
    exchangeByPolicy: time('exchange', () => exchangeRowsOf(results)),
    rosterByRate: Array.from({ length: 24 }, (_, i) => {
      const at = (id: string, pick: (w: PlayerRun['weeks'][number]) => number): number =>
        median(
          playersOf(results[id], 'daily').flatMap((p) => (p.weeks[i] ? [pick(p.weeks[i])] : [])),
        );
      const share = (w: PlayerRun['weeks'][number]): number =>
        w.available ? w.species / w.available : 0;
      return {
        week: i + 1,
        size: at('mixed8', (w) => w.size),
        share: at('mixed8', share),
        available: at('mixed8', (w) => w.available),
        fastSize: at('mixed8-creatures2', (w) => w.size),
        fastShare: at('mixed8-creatures2', share),
      };
    }),
    roster: time('roster profile', () => rosterProfile(results)),
    journeys: time('journeys', () => ({
      daily: journey(profilePlayers(results, 'daily'), mixed8, jw),
      weekly: journey(profilePlayers(results, 'weekly'), mixed8, jw),
    })),
    cost: time('cost', () => costOf(results)),
  };
}

// ---------- markdown ----------

const table = (
  head: readonly string[],
  rows: readonly (readonly (string | number)[])[],
): string[] => [
  `| ${head.join(' | ')} |`,
  `| ${head.map(() => '---').join(' | ')} |`,
  ...rows.map((r) => `| ${r.join(' | ')} |`),
];

const num = (x: number, digits = 0): string => String(round(x, digits));
const at = <T>(list: readonly T[], week: number): T | undefined => list[week - 1];

/** The comments of `rules.ts` that start with a marker (`ASSUMPTION` or `TUNED 2026-10-30`), each with the line of data it sits on. */
function markedComments(source: string, marker: RegExp): { where: string; text: string }[] {
  const lines = source.split('\n');
  const out: { where: string; text: string }[] = [];
  const marked = /^\s*\/\/ (ASSUMPTION|TUNED [0-9-]+)( \([^)]*\))?:/;
  for (let i = 0; i < lines.length; i++) {
    const m = marker.exec(lines[i] ?? '');
    if (!m) continue;
    let text = m[m.length - 1] ?? '';
    let j = i + 1;
    while (/^\s*\/\/ /.test(lines[j] ?? '') && !marked.test(lines[j] ?? '')) {
      text += ' ' + (lines[j] ?? '').replace(/^\s*\/\/ /, '');
      j += 1;
    }
    // The name of the number the comment sits on (the key of the next line of data that is not another comment).
    while (marked.test(lines[j] ?? '') || /^\s*\/\//.test(lines[j] ?? '')) j += 1;
    const key =
      /^\s*([A-Za-z0-9_]+):/.exec(lines[j] ?? '')?.[1] ?? (lines[j] ?? '').trim().slice(0, 40);
    out.push({ where: key, text });
  }
  return out;
}

/** `// ASSUMPTION:` comments from `rules.ts` (the report lists them all). */
export const assumptionsFrom = (source: string): { where: string; text: string }[] =>
  markedComments(source, /^\s*\/\/ ASSUMPTION(?:\s*\(Q[0-9]+\))?: (.*)$/);

/** `// TUNED 2026-10-30:` comments from `rules.ts`: what the tuner moved and what it was before. */
export const tunedFrom = (source: string): { where: string; text: string }[] =>
  markedComments(source, /^\s*\/\/ TUNED [0-9-]+( \([^)]*\))?: (.*)$/);

export const SIMPLIFICATIONS: readonly string[] = [
  "Evolving costs 30 Essence here (`xp.evolveEssence`); the shipped content has 20 Essence for a common line at level 15. The lab's 30 came from tuning (T-9), so the shipped number and the lab's differ: change one or the other on purpose.",
  "Combat is not simulated. The dungeon pays 120 XP, 10 Acorns, 10 scrap and a little Essence per run (one pass a day, up to three stacked), the raid 490 XP per fighting creature for a week with a visit between Friday and Sunday, and its Essence depends on the server's boss dial (all, half or none). The three best creatures fight.",
  "A creature's post does not change how fast it grows (V-POST-3), so creatures are not tracked per post: the lab counts scout seats, anvils and communal seats as long as the player has creatures to stand on them (the first scout and anvil need two of the three starters).",
  "Fit is an average (a set-and-forget player's creatures fit about 30% of the time, an optimiser's 90%), not a per-creature draw; kit tilts are expected values; scrap, shards, Acorns and XP are expected values and only creatures, gear, blueprints, pages, keystones and rare finds are seeded draws.",
  "Modifier lines are minimal: a worn piece has 1, 3 or 5 lines by rarity, each only a pip tier (the top tier its item level allows with a fixed chance, else a lower one), rolled when the piece is worn and again at each reroll; the visitor's reroll redraws all of them and never keeps the old ones. Gear slots are open from level 1 (there are no slot unlock levels in the lab). A piece in the bag has no lines, and a worn piece is never moved to another creature.",
  'Mastery is counted per seat (the effective hours a seat has worked), not per creature, and a Master never moves on; the Master Scout perk (a blueprint at the Forge) is not modelled.',
  "The School and Paddock have levels, projects and warmth but no seats or output (the docs leave them open until combat v2 and `school.md`); push on, deep areas, opening hours of the Reef and the week's twist are not modelled.",
  'Gear is counts and item level only: three slots per creature, pieces at the fire\'s level, a slot is "weaker" when its item level is more than 6 below the fire. Gear stats, what a modifier line does, blueprint quality and the loupe\'s effect beyond a higher rare and epic share are not modelled; blueprints are counted, not required by orders.',
  "The scout pool is LINES: scouts find a line's stage 1, never an evolved form (evolving at level 15 gives the next form, for Essence: 20 for a common line and 40 for a rare one in the content, scaled by the tuned base). The content has 16 lines (34 forms); 14 can be found by scouts (8 common, 3 rare, 3 epic) and the two festival epics (Lanternfin, Hearthshell) cannot. A content drop adds 12 lines (6 common, 4 rare, 2 epic) every 4 weeks from week 4, a line having 3, 2 or 1 forms by rarity (assumed). Arrivals and duplicates use the lines available that week and weigh a line by rarity; places lean toward their element. A player keeps one creature of a line (duplicates become scrap) and so owns at most one evolved form of it: a line's two evolution branches are not both collected.",
  'The lab keeps 5 elements and 6 destinations. More elements will mean more kinds of shard (every Forge piece takes a shard of its element, so each new element is one more chain a player must cover with scouts) and more destinations to cover them; the shard stalls shown here would grow with them.',
  "Catch-up applies to idle XP only (not to fights). Its multiplier is fixed at each visit and holds until the next one (Q35 B), but never above the target it was fixed for: it fades as the creature closes the gap, so a player who visits less often cannot earn more of it than one who visits daily. A player who is away is not counted in the server's middle after seven days.",
  "Project gifts are chosen by weight among the open projects; a gift never exceeds what the project still needs, the rest stays with the giver. A project's cost is an Acorn part, a scrap part and a shard part (Q33), each filled by gifts from what a player has above a reserve for their own Forge; shards go to a project only as shards of the element tied to its place; Essence never goes to projects and journal pages are never spent. A find fills only its own collection socket; a spare melts into Essence. Sources of the sockets that are not keystones (dungeon landmarks, resident tokens, pages) use made-up rates.",
  "Ribbons are dropped (Misa): levels never stop. Honours (trials.md) replace them and gate nothing. Creatures are not tracked per post, so the lab places creatures on seats itself: a new seat takes a creature not at a post yet (fewest hours of work, then highest level), a set-and-forget player never moves anyone, and an optimiser moves a Master on and puts an unworked creature in its seat. A creature's hours of work, the dungeon and raid clears it was in and the finds it brought home tick its trial boxes. Combat is not simulated: a share of dungeon runs (an assumption) count as an Undercroft clear, and the raid party is the same team that fights; an optimiser gives the team's last place to the highest-level creature that still needs a fight box, a set-and-forget player does not.",
  "The cost estimate counts rows from the shape of a visit (one player row, the creature rows, seat rows, the valley's rows); it is not a measured query plan.",
  "T-5 (the best team differs across bosses) belongs to combat v2's lab.",
];

export function renderReport(data: ReportData, rules: Rules, rulesSource: string): string {
  const out: string[] = [];
  const push = (...lines: string[]): void => void out.push(...lines);
  push(
    '# The economy lab report',
    '',
    '> Generated by `pnpm --filter @creatures/econ report` from `packages/econ`. Never edit by hand: change `src/rules.ts` and run it again.',
    `> ${data.seeds} seeds per scenario, 24 weeks, hour by hour. Numbers are medians over seeds and players; a bracket (a-b) is the 10th to 90th percentile.`,
    '> Combat is not simulated: the dungeon and raid pay fixed inputs (see the appendix). Every rate is an example from the system docs unless the appendix says otherwise.',
    '',
    '## 1. The targets',
    '',
  );
  for (const t of data.targets)
    push(
      `- **${t.info ? 'INFO' : t.pass ? 'PASS' : 'FAIL'}** ${t.id}: ${t.measured}. Target: ${t.target}.`,
    );
  push('', "(T-5, that the best team differs across bosses, is checked in combat v2's lab.)", '');

  // 2. The ledger.
  push(
    '## 2. The resource ledger',
    '',
    'Per spendable resource, in the mixed server of 8 (a daily and a weekly player shown; every profile is in `report-data.json`). "In" and "out" are per week; stock is at the end of weeks 1, 2, 4, 8, 12 and 24; waste is what a full store did not pick up over 24 weeks; "days to next" is how long until the player can afford the next thing worth buying (median over weeks 2 to 12; "-" means there was nothing to buy that week); choices is the things a player could do at a visit, counted under each resource it needs. A resource is flagged "dead" when its stock rises for 4 or more weeks running and the pile is at least 4 weeks of what the resource is spent on (its spending over those weeks, counted as at least a quarter of its income, so a resource nothing takes is dead once the pile is a week of income; the report shows the week it starts); "starved" when it sits at zero on more than 25% of days.',
    '',
  );
  const ledgerRows = (id: string): string[][] =>
    (data.ledger[id] ?? []).map((l) => [
      l.resource,
      `${num(l.inn[3] ?? 0)} / ${num(l.inn[11] ?? 0)} / ${num(l.inn[23] ?? 0)}`,
      `${num(l.out[3] ?? 0)} / ${num(l.out[11] ?? 0)} / ${num(l.out[23] ?? 0)}`,
      [1, 2, 4, 8, 12, 24].map((w) => num(at(l.stock, w)?.median ?? 0)).join(' / '),
      num(sum(l.waste)),
      l.noNextShare > 0.5 ? '-' : num(l.nextDays, 1),
      num(l.choices, 1),
      [
        l.dead !== null
          ? `DEAD from week ${l.dead} (pile = ${num(l.pileWeeks, 1)} weeks of spending)`
          : '',
        l.starved ? `STARVED (${num(l.zeroShare * 100)}% of days at zero)` : '',
      ]
        .filter(Boolean)
        .join(', ') || 'ok',
    ]);
  for (const id of ['daily', 'weekly']) {
    push(`### ${profileLabel(id)}`, '');
    push(
      ...table(
        [
          'Resource',
          'In /wk (wk 4 / 12 / 24)',
          'Out /wk',
          'Stock (wk 1 / 2 / 4 / 8 / 12 / 24)',
          'Waste',
          'Days to next',
          'Choices /visit',
          'Flag',
        ],
        ledgerRows(id),
      ),
      '',
    );
  }
  push(
    "### Where a daily player's scrap comes from and goes",
    '',
    `A week, median over seeds, averaged over the run. The shipped game's payouts that are not scaled with a piece's price (the dungeon's ${RULES.fights.dungeon.scrap} scrap a run, ${RULES.scouts.duplicateCreatureScrap} for a duplicate creature, the welcome scrap) were left at their sizes while the piece's price went up to ${RULES.forge.scrap}; what a dismantled piece gives back was scaled with it. These are the shares they end up with:`,
    '',
  );
  push(
    ...table(
      ['Where', 'Scrap a week'],
      data.scrapBySource.map((r) => [
        `${r.kind === 'in' ? 'in: ' : 'out: '}${r.source}`,
        num(r.perWeek, 1),
      ]),
    ),
    '',
  );
  push('### Flags for every profile', '');
  const flagRows = Object.entries(data.ledger).flatMap(([id, ledgers]) =>
    ledgers
      .filter((l) => l.dead !== null || l.starved)
      .map((l) => [
        profileLabel(id),
        l.resource,
        l.dead !== null
          ? `dead from week ${l.dead}, pile = ${num(l.pileWeeks, 1)} weeks of spending`
          : '',
        l.starved ? `starved (${num(l.zeroShare * 100)}% of days at zero)` : '',
      ]),
  );
  push(
    ...table(
      ['Profile', 'Resource', 'Dead', 'Starved'],
      flagRows.length ? flagRows : [['-', '-', '-', '-']],
    ),
    '',
  );
  push(
    "### What things cost, in hours of a daily player's idle income",
    '',
    'Each price is divided by what a daily player earns of that resource an hour (weeks 4 to 12). Players never see this number; it keeps prices consistent with each other.',
    '',
  );
  push(
    ...table(
      ['Resource', 'Thing', 'Price', 'Hours of idle income'],
      data.prices.map((p) => [p.resource, p.what, num(p.price), num(p.hours, 1)]),
    ),
    '',
  );

  // 3. Growth.
  push(
    '## 3. Growth',
    '',
    'Levels of the 1st / 3rd / 10th / 20th creature (medians) at the end of the week; a creature that is not owned yet shows the lowest owned level. New players are counted in weeks since joining. The full week-by-week table is in `report-data.json`.',
    '',
  );
  const wk = [1, 2, 4, 8, 12, 16, 24];
  push(
    ...table(
      ['Profile', ...wk.map((w) => `Week ${w}`)],
      data.growth.map((g) => [
        profileLabel(g.profile),
        ...wk.map((w) =>
          at(g.first, w)
            ? `${num(at(g.first, w)?.median ?? 0)}/${num(at(g.third, w)?.median ?? 0)}/${num(at(g.tenth, w)?.median ?? 0)}/${num(at(g.twentieth, w)?.median ?? 0)}`
            : '-',
        ),
      ]),
    ),
    '',
  );
  push(
    'Roster size (creatures owned; in brackets the kinds owned and their share of the species available that week, as new content drops lift the pool: 34 at the start, +12 every 4 weeks from week 4):',
    '',
  );
  push(
    ...table(
      ['Profile', ...wk.map((w) => `Week ${w}`)],
      data.growth.map((g) => [
        profileLabel(g.profile),
        ...wk.map((w) =>
          at(g.size, w)
            ? `${num(at(g.size, w)?.median ?? 0)} (${num(at(g.species, w)?.median ?? 0)} lines, ${num(at(g.forms, w)?.median ?? 0)} forms; ${num((at(g.speciesShare, w)?.median ?? 0) * 100)}% of ${num(at(g.available, w)?.median ?? 0)} lines)`
            : '-',
        ),
      ]),
    ),
    '',
  );
  push(
    `A daily player's roster at the default arrival rate (${num(RULES.scouts.perHour.creatures * 100, 2)}% an hour per scout, tuned from the 0.75% the first draft used) and at the docs' table (2% an hour): creatures owned, and the share of the lines available that week:`,
    '',
  );
  push(
    ...table(
      [
        'Week',
        'Species available',
        'Default: creatures',
        'Default: share of species',
        '2% an hour: creatures',
        '2% an hour: share of species',
      ],
      data.rosterByRate
        .filter((r) => wk.includes(r.week))
        .map((r) => [
          r.week,
          num(r.available),
          num(r.size),
          `${num(r.share * 100)}%`,
          num(r.fastSize),
          `${num(r.fastShare * 100)}%`,
        ]),
    ),
    '',
  );
  push(
    "The week a player owns 10 lines, all 14 of today's lines and 30 lines, and duplicates arriving per visit (a duplicate takes the Recommended answer and pays a little scrap):",
    '',
  );
  push(
    ...table(
      ['Profile', '10 lines', "14 lines (all of today's)", '30 lines', 'Duplicates /visit'],
      data.growth.map((g) => [
        profileLabel(g.profile),
        ...g.speciesWeeks.map((w) => (w === null ? 'not by the end' : `week ${w}`)),
        num(g.duplicatesPerVisit, 2),
      ]),
    ),
    '',
  );
  push(
    'XP by source over weeks 1 to 12 (median per player; "lost" is XP above an evolution wait that a creature could not bank):',
    '',
  );
  push(
    ...table(
      ['Profile', 'Idle', 'Catch-up bonus', 'Dungeon', 'Raid', 'Lost'],
      data.growth.map((g) => [
        profileLabel(g.profile),
        num(g.xp.idle),
        num(g.xp.catchUp),
        num(g.xp.dungeon),
        num(g.xp.raid),
        num(g.xp.lost),
      ]),
    ),
    '',
  );
  push(
    'The day (counted from joining) the 1st, 3rd and 10th creature reach level 30 (median of the players that did; how many did):',
    '',
  );
  const d30 = (g: GrowthRow, k: number): string => {
    const d = g.day30[k];
    return d && d.median !== null
      ? `day ${num(d.median)} (${d.reached}/${d.of})`
      : `not by week 24 (0/${d?.of ?? 0})`;
  };
  push(
    ...table(
      ['Profile', '1st', '3rd', '10th'],
      data.growth.map((g) => [profileLabel(g.profile), d30(g, 0), d30(g, 1), d30(g, 2)]),
    ),
    '',
  );
  const back = data.growth.find((g) => g.profile === 'returner')?.catchUpDays;
  push(
    'Honours (trials.md; they gate nothing). The share of the roster holding Bronze / Silver / Gold at the end of the week (median):',
    '',
  );
  const hw = [4, 8, 12, 24];
  push(
    ...table(
      ['Profile', ...hw.map((w) => `Week ${w}`)],
      data.growth.map((g) => [
        profileLabel(g.profile),
        ...hw.map((w) =>
          at(g.first, w)
            ? [0, 1, 2]
                .map((h) => `${num((g.honours[h]?.[w - 1]?.median ?? 0) * 100)}%`)
                .join(' / ')
            : '-',
        ),
      ]),
    ),
    '',
  );
  push(
    'Lines owned by rarity (Q38): common / rare / epic, in brackets the lines available of each rarity that week, then the forms owned out of the forms available (a line plus the form it evolved into; median):',
    '',
  );
  push(
    ...table(
      ['Profile', ...hw.filter((w) => w !== 8).map((w) => `Week ${w}`)],
      data.growth.map((g) => [
        profileLabel(g.profile),
        ...hw
          .filter((w) => w !== 8)
          .map((w) =>
            at(g.first, w)
              ? `${[0, 1, 2].map((k) => num(g.byRarity.owned[k]?.[w - 1]?.median ?? 0)).join(' / ')} (of ${[0, 1, 2].map((k) => num(g.byRarity.available[k]?.[w - 1]?.median ?? 0)).join(' / ')}); ${num(at(g.forms, w)?.median ?? 0)} of ${num(at(g.availableForms, w)?.median ?? 0)} forms`
              : '-',
          ),
      ]),
    ),
    '',
  );
  push(
    `A returner (away weeks 5 to 8) is within ${THRESHOLDS.agreeWithin} levels of the server's middle ${back === null || back === undefined ? 'never within the run' : `after ${num(back, 1)} days of visits`}.`,
    '',
  );

  // 4. The Forge.
  push(
    '## 4. The Forge',
    '',
    'The share of anvil-hours (weeks 2 to 12, effective hours) by what the anvil did: making a piece, or tinkering for want of scrap, for want of a shard of the element the team needs, because the Forge floor was full, or with nothing to make (no slot weaker than the fire allows). "Worst week" is the highest median share in any week (T-4).',
    '',
  );
  push(
    ...table(
      [
        'Profile',
        'Making',
        'No scrap',
        'No shard',
        'Floor full',
        'Nothing to make',
        'Worst week: scrap / shard / floor',
        'Pieces /wk',
        'Worn (24 wk)',
        'Dismantled',
        'Bag at wk 12 / 24',
        'Bag would fill (never dismantling)',
      ],
      data.forge.map((f) => [
        profileLabel(f.profile),
        `${num((f.share.work ?? 0) * 100)}%`,
        `${num((f.share.scrap ?? 0) * 100)}%`,
        `${num((f.share.shard ?? 0) * 100)}%`,
        `${num((f.share.floor ?? 0) * 100)}%`,
        `${num((f.share.nothing ?? 0) * 100)}%`,
        `${num((f.worst.scrap ?? 0) * 100)}% / ${num((f.worst.shard ?? 0) * 100)}% / ${num((f.worst.floor ?? 0) * 100)}%`,
        num(f.piecesPerWeek, 1),
        num(f.worn),
        num(f.dismantled),
        `${num(f.bag12)} / ${num(f.bag24)}`,
        f.bagFillsWeek === null ? 'not by week 24' : `week ${f.bagFillsWeek}`,
      ]),
    ),
    '',
  );

  push(
    '### Shard stalls by policy, with and without the exchange (a daily player, weeks 2 to 12)',
    '',
    'The shard exchange (Q34 B) trades 3 shards of any other element for 1 of the one needed. "Waiting for a shard" is the share of anvil-hours the anvils tinkered for want of a shard of the element the team needs; "waiting to evolve" counts creatures held at level 15 at week 12 for want of Essence.',
    '',
  );
  push(
    ...table(
      [
        'Policy',
        'Exchange',
        'Making pieces',
        'Waiting for a shard (mean)',
        '... worst week',
        'Creatures waiting to evolve, week 12',
        'XP lost, weeks 1 to 12',
        'Exchanges a week',
      ],
      data.exchangeByPolicy.map((e) => [
        e.policy,
        e.exchange ? 'yes' : 'no',
        `${num(e.making * 100)}%`,
        `${num(e.shardStallMean * 100)}%`,
        `${num(e.shardStallWorst * 100)}%`,
        num(e.waitingEvolve12, 1),
        num(e.xpLost),
        num(e.exchangesPerWeek, 1),
      ]),
    ),
    '',
  );

  // 5. The server.
  push(
    '## 5. The server',
    '',
    'Place levels (hearth / forge / signpost / paddock / school; median over seeds) at the end of each week, the fire (the item level cap) and collections.',
    '',
  );
  const sw = [1, 2, 3, 4, 6, 8, 12, 16, 24];
  for (const s of data.servers) {
    push(`### ${s.label}`, '');
    push(
      ...table(
        ['Week', 'Place levels', 'Fire', 'Keystones', 'Collections done'],
        sw.map((w) => [
          w,
          (s.levels[w - 1] ?? []).map((l) => num(l)).join('/'),
          num(s.fire[w - 1] ?? 0),
          num(s.keystones[w - 1] ?? 0),
          num(s.collections[w - 1] ?? 0),
        ]),
      ),
      '',
    );
    push(
      `- First place level-up on day ${s.firstLevelDay === null ? 'never' : num(s.firstLevelDay, 1)}; ${num(s.levelUpsByWeek12)} level-ups by week 12. First collection ${s.firstCollectionWeek === null ? 'not done in the run' : `in week ${s.firstCollectionWeek}`}; ${num(s.collections[11] ?? 0)} done by week 12.`,
      `- The first three projects took ${s.projectDays.map((d) => `${num(d, 1)} days`).join(', ')} from opening to done.`,
      `- Share of income given to projects: ${num(s.givingShare * 100)}%; the top giver gave ${num(s.topGiverShare * 100)}% of all gifts; communal seats made ${num(s.communalShare * 100)}% of project progress.`,
      '',
    );
  }
  push('### What warmed the fire by week 24 (median)', '');
  push(
    ...table(
      [
        'Server',
        'Place levels',
        'Forge levels',
        'Collections',
        'Boss kills',
        'Master titles',
        'Cosmetic',
      ],
      data.servers.map((s) => [
        s.label,
        num(s.warmth.places ?? 0),
        num(s.warmth.forge ?? 0),
        num(s.warmth.collections ?? 0),
        num(s.warmth.bosses ?? 0),
        num(s.warmth.masters ?? 0),
        num(s.warmth.cosmetic ?? 0),
      ]),
    ),
    '',
  );
  push(
    "### The Forge's fire by boss kills, with no time floor and with a slow one (mixed server of 8)",
    '',
    `Kill chance a week: all ${rules.fights.raid.bossKillChance.all}, half ${rules.fights.raid.bossKillChance.half}, none ${rules.fights.raid.bossKillChance.none}. There is no time floor (Q40 B: only building, collections and boss kills drive the fire; the fire floor is ${rules.fire.floorPerWeek} levels a week); "slow floor" is the same server with the old Q37 B floor of ${SLOW_FLOOR} levels a week, kept for comparison. Thresholds ${rules.fire.thresholds.join(', ')} are where lines of 2, 3, 4 and 5 pips unlock (gear.md).`,
    '',
  );
  const dials = ['all', 'half', 'none'] as const;
  push(
    ...table(
      [
        'Week',
        ...dials.map((d) => `No floor, bosses ${d}`),
        ...dials.map((d) => `Slow floor, bosses ${d}`),
      ],
      [1, 2, 4, 8, 12, 16, 20, 24].map((w) => [
        w,
        ...dials.map((d) => num(data.fireByDial[d]?.fire[w - 1] ?? 0)),
        ...dials.map((d) => num(data.fireSlowFloor[d]?.fire[w - 1] ?? 0)),
      ]),
    ),
    '',
  );
  push(
    ...table(
      [
        'Threshold',
        ...dials.map((d) => `Opens in week: no floor, ${d}`),
        ...dials.map((d) => `Slow floor, ${d}`),
      ],
      rules.fire.thresholds.map((t, i) => [
        t,
        ...[data.fireByDial, data.fireSlowFloor].flatMap((set) =>
          dials.map((d) => {
            const w = set[d]?.thresholds[i];
            return w === null || w === undefined ? 'not by week 24' : num(w);
          }),
        ),
      ]),
    ),
    '',
  );

  push(
    '### Variants of the mixed server of 8',
    '',
    "Projects are built from Acorns, scrap and shards (Q33), and players give their share of each by the generosity dial (a third by default). The rows change one thing at a time: the away curve (A instead of B), no communal seats, every player a set-and-forget player or an optimiser, no shard exchange, the scouts' creature chance at the docs' 2% an hour, catch-up also on fight XP, and everyone giving 10% or 60% of income.",
    '',
  );
  push(
    ...table(
      [
        'Variant',
        'First level-up (day)',
        'Level-ups by week 12',
        'Place levels, week 12 (hearth/forge/signpost/paddock/school)',
        'Fire, week 12',
        'Collections, week 12',
        'T-1 spread at week 4',
        "Daily player's best, week 12",
        'Weekend-off share of idle growth',
        'Weekly share',
      ],
      data.variants.map((v) => [
        v.label,
        v.firstLevelDay === null ? 'never' : num(v.firstLevelDay, 1),
        num(v.levelUpsByWeek12),
        v.levelsWeek12.map((l) => num(l)).join('/'),
        num(v.fireWeek12),
        num(v.collectionsWeek12),
        num(v.spreadWeek4, 1),
        num(v.dailyBestWeek12),
        `${num(v.weekendShare * 100)}%`,
        `${num(v.weeklyShare * 100)}%`,
      ]),
    ),
    '',
  );

  push(
    '### Server coverage of the creatures (Q38)',
    '',
    "Players pool their creatures in the raid, so a boss card may sometimes want a rare one. The share of each rarity's available LINES (a line's stage 1: scouts never find evolved forms) that at least one player on the server owns (median over seeds). In brackets the same share of the launch lines only (the lines the scouts find from the start), which does not dip when content drops. The same counted in forms, and the launch share, are in `server-coverage.json`.",
    '',
  );
  const coverageWeeks = [4, 8, 12, 24];
  push(
    ...table(
      ['Server', 'Rarity', ...coverageWeeks.map((w) => `Week ${w}`)],
      data.servers
        .filter((s) => ['mixed5', 'mixed8', 'mixed15'].includes(s.id))
        .flatMap((s) =>
          ['common', 'rare', 'epic'].map((name, r) => [
            `${s.label}`,
            name,
            ...coverageWeeks.map(
              (w) =>
                `${num((s.coverage[w - 1]?.[r] ?? 0) * 100)}% (launch lines ${num((s.launchCoverage[w - 1]?.[r] ?? 0) * 100)}%)`,
            ),
          ]),
        ),
    ),
    '',
  );

  // The weekly visitor.
  const vis = data.visitor;
  const profileName = (id: string): string => profileLabel(id);
  push(
    '### The weekly visitor (V-VIS)',
    '',
    `He is in the valley from Thursday 00:00 to the raid's finale on Sunday evening; a player meets him only on a visit in that window. He rerolls every modifier line of a worn piece for Acorns and scrap: ${rules.visitor.acorns} Acorns and ${rules.visitor.scrap} scrap at item level ${rules.visitor.baseLevel}, linear in the piece's item level, times ${rules.visitor.growth} for each reroll that player already made that week (reset weekly), and one rotating rare blueprint for ${rules.visitor.blueprintAcorns} Acorns and ${rules.visitor.blueprintShards} shards of any element (from the most-stocked elements first), so the shard pile has a sink too. A set-and-forget player rerolls once a week, on the best epic it wears, keeping ${rules.visitor.reserveAcorns} Acorns and ${rules.visitor.reserveScrap} scrap; an optimiser rerolls epics, then rares, until the next price would pass its reserves or its pieces are good (an epic with ${rules.visitor.goodTop[2]} of its ${rules.gear.lines[2]} lines at the top pip, a rare with ${rules.visitor.goodTop[1]} of ${rules.gear.lines[1]}). The lab does not model what a line does: a piece has ${rules.gear.lines.join(' / ')} lines by rarity, each a pip tier from what its item level allows (the top tier with chance ${rules.gear.topPipChance}).`,
    '',
    'Rerolls a week and what they drain, median over seeds and players of a kind (mixed server of 8), averaged over the weeks shown:',
    '',
  );
  const visWeeks: [string, number, number][] = [
    ['weeks 1 to 8', 0, 8],
    ['weeks 9 to 16', 8, 16],
    ['weeks 17 to 24', 16, 24],
  ];
  const avg = (xs: readonly number[] | undefined, a: number, b: number): number =>
    sum((xs ?? []).slice(a, b)) / Math.max(1, b - a);
  push(
    ...table(
      [
        'Player',
        'Met him (weeks of 24)',
        ...visWeeks.map(([label]) => `Rerolls a week, ${label}`),
        'Acorns a week, weeks 9 to 24',
        'Scrap a week, weeks 9 to 24',
      ],
      VISITOR_PROFILES.filter((id) => vis.rerolls[id]).map((id) => [
        profileName(id),
        num(vis.met[id] ?? 0),
        ...visWeeks.map(([, a, b]) => num(avg(vis.rerolls[id], a, b), 1)),
        num(avg(vis.acorns[id], 8, 24)),
        num(avg(vis.scrap[id], 8, 24)),
      ]),
    ),
    '',
    'Piles in weeks of spending (never counting spending below a quarter of income), with and without him (the same servers run again with no visitor):',
    '',
  );
  push(
    ...table(
      [
        'Player',
        'Resource',
        ...vis.piles[0]!.weeks.map((w) => `Week ${w}, with / without`),
        'Dead from week, with / without',
      ],
      vis.piles.map((r) => [
        profileName(r.profile),
        r.resource,
        ...r.weeks.map((_, i) => `${num(r.on[i] ?? 0, 1)} / ${num(r.off[i] ?? 0, 1)}`),
        `${r.deadOn ?? '-'} / ${r.deadOff ?? '-'}`,
      ]),
    ),
    '',
    "The best worn piece's lines (the piece with the most pips in all): pips and their share of what its level allows, with and without him, and epics worn:",
    '',
  );
  const lineWeeks = [4, 8, 12, 24];
  push(
    ...table(
      [
        'Player',
        ...lineWeeks.map((w) => `Week ${w}: best pips (share), without`),
        'Epics worn, week 12 / 24',
      ],
      VISITOR_PROFILES.filter((id) => vis.linesOn[id]).map((id) => [
        profileName(id),
        ...lineWeeks.map((w) => {
          const a = vis.linesOn[id];
          const b = vis.linesOff[id];
          return `${num(a?.bestPips[w - 1] ?? 0, 1)} (${num((a?.share[w - 1] ?? 0) * 100)}%), ${num(b?.bestPips[w - 1] ?? 0, 1)} (${num((b?.share[w - 1] ?? 0) * 100)}%)`;
        }),
        `${num(vis.linesOn[id]?.epics[11] ?? 0, 1)} / ${num(vis.linesOn[id]?.epics[23] ?? 0, 1)}`,
      ]),
    ),
    '',
    `The share of servers (runs) where some player wears an epic with 4 or more top-pip lines (the panel guessed about 55% of ten-player servers by week 10, with about 30 rerolls over 10 weeks; here the servers of 5, 8 and 15 make ${vis.rerollsByWeek10.map((r) => `${num(r.rerolls)} (${r.players} players)`).join(', ')} in weeks 1 to 10):`,
    '',
  );
  push(
    ...table(
      ['Server', 'Week 8, with / without', 'Week 10', 'Week 12', 'Week 24'],
      vis.fourOfFive.map((r) => [
        r.label,
        ...[8, 10, 12, 24].map(
          (w) =>
            `${num((r.on[w - 1] ?? 0) * 100)}%${r.off ? ` / ${num((r.off[w - 1] ?? 0) * 100)}%` : ''}`,
        ),
      ]),
    ),
    '',
  );

  // 6. Roster.
  push(
    '## 6. The roster profile for combat v2',
    '',
    'The full table is `roster-profile.json` (the shape of `RosterProfile` in `packages/lab/src/roster.ts` on branch `combat-v2-track`). Levels of the 1st / 3rd / 10th / 20th creature, and creatures owned:',
    '',
  );
  const rw = [1, 4, 8, 12, 24];
  const rosterRow = (label: string, list: RosterProfile['daily']): string[] => [
    label,
    ...rw.map((w) => {
      const r = list[w - 1];
      return r ? `${r.first}/${r.third}/${r.tenth}/${r.twentieth}, ${r.size}` : '-';
    }),
  ];
  push(
    ...table(
      ['Kind', ...rw.map((w) => `Week ${w}`)],
      [
        rosterRow('daily', data.roster.daily),
        rosterRow('weekly', data.roster.weekly),
        rosterRow('new (weeks since joining)', data.roster.newPlayer),
      ],
    ),
    '',
  );

  // 7. Journeys.
  push(
    '## 7. Journeys',
    '',
    'Medians by week for a daily and a weekly player in the mixed server of 8, to check the pace feels right.',
    '',
  );
  for (const id of ['daily', 'weekly']) {
    push(`### ${profileLabel(id)}`, '');
    for (const line of data.journeys[id] ?? []) push(`- ${line}`);
    push('');
  }

  // 8. Cost.
  push(
    '## 8. Cost estimate',
    '',
    `Rows touched, from the shape of a visit (the player row, one row per creature, seat and anvil, the valley's place and project rows, and the server-middle and fire rows), weeks 8 to 12. The free tier allows ${DAILY_BUDGET_ROWS.toLocaleString('en-US')} rows read a day (\`docs/design/database-reads.md\`); a server also pays a daily job (one read per player, a few valley rows).`,
    '',
  );
  push(
    ...table(
      ['Profile', 'Creatures', 'Rows read /visit', 'Rows written /visit'],
      data.cost.perVisit.map((c) => [
        profileLabel(c.profile),
        num(c.creatures),
        num(c.reads),
        num(c.writes),
      ]),
    ),
    '',
  );
  push(
    ...table(
      [
        'Server',
        'Players',
        'Visits /day',
        'Rows read /day',
        'Rows written /day',
        'Share of the daily read budget',
      ],
      data.cost.perServerDay.map((c) => [
        c.server,
        c.players,
        num(c.visits, 1),
        num(c.reads),
        num(c.writes),
        `${num(c.budgetShare * 100, 2)}%`,
      ]),
    ),
    '',
  );

  // Appendix.
  push(
    '## Appendix: assumptions and simplifications',
    '',
    '### Assumptions (from `src/rules.ts`, each marked `// ASSUMPTION:` there)',
    '',
  );
  for (const a of assumptionsFrom(rulesSource)) push(`- \`${a.where}\`: ${a.text}`);
  push('', '### Simplifications', '');
  for (const s of SIMPLIFICATIONS) push(`- ${s}`);
  push(
    '',
    '### Tuned values (from `src/rules.ts`, each marked `// TUNED` there)',
    '',
    "The tuner (`pnpm --filter @creatures/econ tune`) moved these from the docs' example numbers so that every target in `src/targets.ts` passes; each says what it was before. Change them with the tuner, not by hand.",
    '',
  );
  for (const t of tunedFrom(rulesSource)) push(`- \`${t.where}\`: ${t.text}`);
  push(
    '',
    '### Policies',
    '',
    '- **Set-and-forget** places a catch once, keeps its first kit, rotates "for my team" orders through the elements the shelf can supply, tidies the bag only when it nears full, and never reaches. **Optimiser** re-tilts every seat each visit to what it needs (scrap, a missing shard, a new species), keeps the kit that suits, reaches for rarity with spare Essence and bulk-dismantles every visit.',
    '- **The shard exchange (Q34 B)** trades 3 shards of any other element for 1 of the one needed (a 10% chance of 2). An optimiser exchanges at every visit for what its orders need; a set-and-forget player only when an anvil is waiting on a shard at that visit (the one-tap fix).',
    "- Both buy seats and anvils as soon as the place's level and the Acorns allow, then kit with Acorns to spare (a set-and-forget player buys two items, an optimiser all five), give their share of income and spend Essence on evolutions first.",
    '',
  );
  return out.join('\n');
}
