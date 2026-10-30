import {
  LEDGER_PROFILES,
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
import { THRESHOLDS } from './targets';
import { median, sum } from './util';

/** The numbers behind the report (written as `report-data.json`, for charts). */
export interface ReportData {
  seeds: number;
  targets: TargetLine[];
  ledger: Record<string, ResourceLedger[]>;
  prices: PriceRow[];
  growth: GrowthRow[];
  forge: ForgeRow[];
  servers: ServerRow[];
  fireByDial: Record<string, ServerRow | null>;
  variants: VariantRow[];
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
      `Holding ${n((w) => w.stock[0] ?? 0)} Acorns, ${n((w) => w.stock[1] ?? 0)} scrap and ${n((w) => w.stock[3] ?? 0, 1)} glimmer. ` +
      `Valley places at ${places.join('/') || '-'} (hearth, forge, signpost, paddock, school).`
    );
  });
}

/** Seconds each section of the report took (printed by the CLI, never part of the data: the data is deterministic). */
export type Timings = Record<string, number>;

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
    prices: time('prices', () => priceTable(profilePlayers(results, 'daily'), rules)),
    growth,
    forge,
    servers,
    fireByDial: time('servers', () => ({
      all: serverOf(results, 'mixed8-all'),
      half: serverOf(results, 'mixed8'),
      none: serverOf(results, 'mixed8-none'),
    })),
    variants: time('variants', () => variantsOf(results)),
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

/** `// ASSUMPTION:` comments from `rules.ts`, each with the line of data it sits on (the report lists them all). */
export function assumptionsFrom(source: string): { where: string; text: string }[] {
  const lines = source.split('\n');
  const out: { where: string; text: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*\/\/ ASSUMPTION: (.*)$/.exec(lines[i] ?? '');
    if (!m) continue;
    let text = m[1] ?? '';
    let j = i + 1;
    while (/^\s*\/\/ /.test(lines[j] ?? '') && !/ASSUMPTION:/.test(lines[j] ?? '')) {
      text += ' ' + (lines[j] ?? '').replace(/^\s*\/\/ /, '');
      j += 1;
    }
    // The name of the number the comment sits on (the key of the next line of data).
    const key =
      /^\s*([A-Za-z0-9_]+):/.exec(lines[j] ?? '')?.[1] ?? (lines[j] ?? '').trim().slice(0, 40);
    out.push({ where: key, text });
  }
  return out;
}

export const SIMPLIFICATIONS: readonly string[] = [
  "Combat is not simulated. The dungeon pays 120 XP, 10 Acorns, 10 scrap and a little Essence per run (one pass a day, up to three stacked), the raid 490 XP per fighting creature for a week with a visit between Friday and Sunday, and its Essence depends on the server's boss dial (all, half or none). The three best creatures fight.",
  "A creature's post does not change how fast it grows (V-POST-3), so creatures are not tracked per post: the lab counts scout seats, anvils and communal seats as long as the player has creatures to stand on them (the first scout and anvil need two of the three starters).",
  "Fit is an average (a set-and-forget player's creatures fit about 30% of the time, an optimiser's 90%), not a per-creature draw; kit tilts are expected values; scrap, shards, Acorns and XP are expected values and only creatures, gear, blueprints, glimmer, pages, keystones and rare finds are seeded draws.",
  'Mastery is counted per seat (the effective hours a seat has worked), not per creature, and a Master never moves on; the Master Scout perk (a blueprint at the Forge) is not modelled.',
  "The School and Paddock have levels, projects and warmth but no seats or output (the docs leave them open until combat v2 and `school.md`); push on, deep areas, opening hours of the Reef and the week's twist are not modelled.",
  'Gear is counts and item level only: three slots per creature, pieces at the fire\'s level, a slot is "weaker" when its item level is more than 6 below the fire. Gear stats, modifier lines, blueprint quality and the loupe\'s effect beyond a higher rare and epic share are not modelled; blueprints are counted, not required by orders.',
  "The species pool starts at today's 34 forms and grows by content drops (assumed +12 every 4 weeks from week 4, toward Misa's 100 or more); arrivals and duplicates use the pool available that week, all species alike, places lean toward their element. Evolution only lifts a first stage's level cap and costs Essence. Rarity of species is not modelled.",
  'The lab keeps 5 elements and 6 destinations. More elements will mean more kinds of shard (every ribbon and piece takes a shard of its element, so each new element is one more chain a player must cover with scouts) and more destinations to cover them; the shard stalls shown here would grow with them.',
  "Catch-up applies to idle XP only (not to fights). A player who is away is not counted in the server's middle after seven days.",
  'Project gifts are chosen by weight among the open projects; a gift never exceeds what the project still needs, the rest stays with the giver. By default only Acorns are given (variants: scrap and shards too; Essence to the Paddock and School). A find fills only its own collection socket; a spare melts into Essence. Sources of the sockets that are not keystones (dungeon landmarks, resident tokens, pages) use made-up rates.',
  'Silver ribbons ask only for scrap, shards and glimmer: the docs\' replacement for "5 finished trips" (hours of work at posts) is not modelled.',
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
    'Per spendable resource, in the mixed server of 8 (a daily and a weekly player shown; every profile is in `report-data.json`). "In" and "out" are per week; stock is at the end of weeks 1, 2, 4, 8, 12 and 24; waste is what a full store did not pick up over 24 weeks; "days to next" is how long until the player can afford the next thing worth buying (median over weeks 2 to 12; "-" means there was nothing to buy that week); choices is the things a player could do at a visit, counted under each resource it needs. A resource is flagged "dead" when its stock rises for 4 or more weeks running and the pile is at least 4 weeks of that week\'s income (the report shows the week it starts); "starved" when it sits at zero on more than 25% of days.',
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
          ? `DEAD from week ${l.dead} (pile = ${num(l.pileWeeks, 1)} weeks of income)`
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
  push('### Flags for every profile', '');
  const flagRows = Object.entries(data.ledger).flatMap(([id, ledgers]) =>
    ledgers
      .filter((l) => l.dead !== null || l.starved)
      .map((l) => [
        profileLabel(id),
        l.resource,
        l.dead !== null
          ? `dead from week ${l.dead}, pile = ${num(l.pileWeeks, 1)} weeks of income`
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
            ? `${num(at(g.size, w)?.median ?? 0)} (${num(at(g.species, w)?.median ?? 0)} kinds, ${num((at(g.speciesShare, w)?.median ?? 0) * 100)}% of ${num(at(g.available, w)?.median ?? 0)})`
            : '-',
        ),
      ]),
    ),
    '',
  );
  push(
    "A daily player's roster at the default arrival rate (0.75% an hour per scout) and at the docs' table (2% an hour): creatures owned, and the share of the species available that week:",
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
    "The week a player owns 20, 34 (all of today's forms) and 60 kinds, and duplicates arriving per visit (a duplicate takes the Recommended answer and pays a little scrap):",
    '',
  );
  push(
    ...table(
      ['Profile', '20 kinds', '34 kinds', '60 kinds', 'Duplicates /visit'],
      data.growth.map((g) => [
        profileLabel(g.profile),
        ...g.speciesWeeks.map((w) => (w === null ? 'not by the end' : `week ${w}`)),
        num(g.duplicatesPerVisit, 2),
      ]),
    ),
    '',
  );
  push(
    'XP by source over weeks 1 to 12 (median per player; "lost" is XP above a ribbon gate or an evolution wait that a creature could not bank):',
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
    "### The Forge's fire by boss kills (mixed server of 8)",
    '',
    `Kill chance a week: all ${rules.fights.raid.bossKillChance.all}, half ${rules.fights.raid.bossKillChance.half}, none ${rules.fights.raid.bossKillChance.none}. Thresholds ${rules.fire.thresholds.join(', ')} are where lines of 2, 3, 4 and 5 pips unlock (gear.md).`,
    '',
  );
  const dials = ['all', 'half', 'none'] as const;
  push(
    ...table(
      ['Week', ...dials.map((d) => `Fire, bosses killed: ${d}`)],
      [1, 2, 4, 8, 12, 16, 20, 24].map((w) => [
        w,
        ...dials.map((d) => num(data.fireByDial[d]?.fire[w - 1] ?? 0)),
      ]),
    ),
    '',
  );
  push(
    ...table(
      ['Threshold', ...dials.map((d) => `Opens in week (${d})`)],
      rules.fire.thresholds.map((t, i) => [
        t,
        ...dials.map((d) => {
          const w = data.fireByDial[d]?.thresholds[i];
          return w === null || w === undefined ? 'not by week 24' : num(w);
        }),
      ]),
    ),
    '',
  );

  push(
    '### Variants of the mixed server of 8',
    '',
    "**Default gifts are Acorns only**, because commons.md's own example is Acorns only (8 daily players each giving a third of about 50 Acorns a day, about 150 a day into projects). Counting scrap and shards as gifts as well (\"everything counts\") roughly doubles what a server gives, because scouts bring far more scrap than the sinks use, and builds the valley out in about half the time; both are shown. The other rows change one thing at a time: the away curve (A instead of B), no communal seats, every player a set-and-forget player or an optimiser, Essence to the Paddock and School, the scouts' creature chance at the docs' 2% an hour, and everyone giving 10% or 60% of income (the generosity dial; the default is a third).",
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
    '### Policies',
    '',
    '- **Set-and-forget** places a catch once, keeps its first kit, rotates "for my team" orders through the elements the shelf can supply, tidies the bag only when it nears full, and never reaches. **Optimiser** re-tilts every seat each visit to what it needs (scrap, a missing shard, a new species), keeps the kit that suits, reaches for rarity with spare Essence and bulk-dismantles every visit.',
    "- Both buy seats and anvils as soon as the place's level and the Acorns allow, then kit with Acorns to spare (a set-and-forget player buys two items, an optimiser all five), give their share of income, spend Essence on evolutions first and buy ribbons as soon as they are affordable.",
    '',
  );
  return out.join('\n');
}
