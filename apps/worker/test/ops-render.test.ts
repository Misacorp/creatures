import { describe, expect, it } from 'vitest';
import { expeditionContent } from '@creatures/game';
import type { DimValue, Period, Report, Row } from '../src/ops-aggregate';
import { FINALE_BAND, renderMarkdown } from '../src/ops-render';

const row = (metric: string, dims: Record<string, DimValue>, value: number): Row => ({
  metric,
  dims,
  value,
});

const period = (totals: Row[], over: Partial<Period> = {}): Period => ({
  from: '2027-01-11',
  to: '2027-01-17',
  days: 7,
  rolledDays: 14,
  totals,
  ...over,
});

const report = (totals: Row[], over: Partial<Report> = {}): Report => ({
  version: 1,
  ...period(totals),
  guilds: { known: 2, reporting: 2 },
  daily: {},
  byGuild: {},
  ...over,
});

const flow = (currency: string, dir: 'source' | 'sink', label: string, n: number): Row =>
  row('flow', { currency, dir, label }, n);

const finale = (rank: number, win: 0 | 1, n: number, festival: 0 | 1 = 0): Row =>
  row('raid.phase', { phase: 'finale', rank, festival, win }, n);

const SAMPLE: Row[] = [
  row('dau', {}, 28),
  row('sessions', {}, 60),
  row('new_players', {}, 4),
  flow('bait', 'source', 'leet', 800),
  flow('bait', 'source', 'dungeon', 200),
  flow('bait', 'sink', 'expedition', 600),
  flow('bait', 'sink', 'training', 300),
  flow('essence', 'source', 'raid', 40),
  flow('scrap', 'source', 'dungeon', 10),
  flow('scrap', 'sink', 'upgrade', 9),
  finale(1, 1, 3),
  finale(1, 0, 3),
  row('raid.phase', { phase: 'phase1', rank: 1, festival: 0, win: 1 }, 8),
  row('raid.phase', { phase: 'phase1', rank: 1, festival: 0, win: 0 }, 2),
  row('dungeon.run', { attempt: 1, cleared: 1 }, 10),
  row('dungeon.run', { attempt: 2, cleared: 0 }, 3),
  row('dungeon.depth', { depth: 1 }, 8),
  row('dungeon.clear_depth', { depth: 1 }, 8),
  row('dungeon.depth', { depth: 2 }, 5),
  row('expedition.send', { destination: 'unknown', length: 'short' }, 12),
  row('workshop.job_start', { job: 'craft' }, 2),
  row('workshop.job_claim', { job: 'craft' }, 1),
  row('gear.drop', { source: 'dungeon', rarity: 'rare' }, 4),
  row('raid.finale_ability', { practice: 0, mode: 'fired' }, 3),
  row('raid.finale_ability', { practice: 0, mode: 'default' }, 9),
  row('raid.finale_members', { practice: 0 }, 10),
  row('raid.live_watchers', {}, 6),
];

const section = (md: string, title: string): string => {
  const start = md.indexOf(`## ${title}`);
  expect(start, title).toBeGreaterThanOrEqual(0);
  const next = md.indexOf('\n## ', start + 1);
  return md.slice(start, next === -1 ? undefined : next);
};

describe('renderMarkdown', () => {
  it('puts Resources first, then the summary, the feature sections and the alerts', () => {
    const md = renderMarkdown(report(SAMPLE));
    const order = [
      '# Leet Creatures report',
      '## Resources',
      '## Summary',
      '## Workshop',
      '## Expeditions',
      '## Dungeon',
      '## Gear',
      '## Raid',
      '## Alerts',
    ].map((heading) => md.indexOf(heading));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('shows what each currency comes from and goes to, with shares', () => {
    const md = renderMarkdown(report(SAMPLE));
    const resources = section(md, 'Resources');
    expect(resources).toContain('| `bait` | 1,000 | 900 | +100 |');
    expect(resources).toContain('comes from `leet` 80%, `dungeon` 20%');
    expect(resources).toContain('goes to `expedition` 67%, `training` 33%');
    // Resources are listed in the fixed order.
    expect(resources.indexOf('`bait`')).toBeLessThan(resources.indexOf('`essence`'));
    expect(resources.indexOf('`essence`')).toBeLessThan(resources.indexOf('`scrap`'));
  });

  it('summarises the numbers Misa reads first', () => {
    const summary = section(renderMarkdown(report(SAMPLE)), 'Summary');
    expect(summary).toContain('**4.0**'); // 28 over 7 days
    expect(summary).toContain('Sessions: **60**');
    expect(summary).toContain('New players: **4**');
    expect(summary).toContain('Raid clear rate (all stages): **68.8%** of 16');
    expect(summary).toContain('Finale win rate: **50.0%** of 6');
    expect(summary).toContain('Dungeon runs: **13**');
  });

  it('flags a finale win rate outside the band, only with enough fights', () => {
    const low = renderMarkdown(report([finale(2, 1, 1), finale(2, 0, 9)]));
    expect(section(low, 'Alerts')).toContain(
      `Finale win rate at rank 2 is 10.0% over 10 fights, outside ${String(FINALE_BAND.min)}-${String(FINALE_BAND.max)}%.`,
    );
    const high = renderMarkdown(report([finale(3, 1, 9), finale(3, 0, 1, 0)]));
    expect(section(high, 'Alerts')).toContain('rank 3 is 90.0%');
    const inside = renderMarkdown(report([finale(1, 1, 5), finale(1, 0, 5)]));
    expect(section(inside, 'Alerts')).not.toContain('Finale win rate');
    const tooFew = renderMarkdown(report([finale(1, 1, 1), finale(1, 0, 2)]));
    expect(section(tooFew, 'Alerts')).not.toContain('Finale win rate');
    // A Festival week is judged apart from the regular weeks of the same rank.
    const festival = renderMarkdown(
      report([finale(1, 0, 6, 1), finale(1, 1, 3, 0), finale(1, 0, 3, 0)]),
    );
    expect(section(festival, 'Alerts')).toContain('rank 1 (Festival) is 0.0%');
    expect(section(festival, 'Alerts')).not.toContain('rank 1 is');
  });

  it('flags a currency with sources but no sinks, and the reverse, and a pile-up', () => {
    const md = renderMarkdown(
      report([
        flow('glimmer', 'source', 'dungeon', 5),
        flow('essence', 'sink', 'gear', 4),
        flow('bait', 'source', 'leet', 900),
        flow('bait', 'sink', 'training', 100),
        flow('scrap', 'source', 'dungeon', 10),
        flow('scrap', 'sink', 'upgrade', 9),
      ]),
    );
    const alerts = section(md, 'Alerts');
    expect(alerts).toContain('`glimmer`: 5 came in and nothing was spent');
    expect(alerts).toContain('`essence`: 4 was spent but nothing came in');
    expect(alerts).toContain('`bait`: in 900, out 100: it is piling up');
    expect(alerts).not.toContain('`scrap`');
  });

  it('flags a dungeon wall, an unvisited destination and an empty range', () => {
    const md = renderMarkdown(
      report(
        [
          row('dungeon.depth', { depth: 5 }, 6),
          row('expedition.send', { destination: 'tide-pools', length: 'short' }, 20),
        ],
        { rolledDays: 0 },
      ),
    );
    const alerts = section(md, 'Alerts');
    expect(alerts).toContain('Dungeon depth 5: 6 runs and none cleared');
    expect(alerts).toContain('No rolled-up days');
    const others = expeditionContent.destinations.filter((d) => d.id !== 'tide-pools');
    expect(others.length).toBeGreaterThan(0);
    for (const d of others) expect(alerts).toContain(`Nobody sent an expedition to \`${d.id}\``);
  });

  it('reports servers that did not answer and failed posts', () => {
    const md = renderMarkdown(
      report([row('post.result', { result: 'failed', error: 'forbidden' }, 2)], {
        guilds: { known: 3, reporting: 1 },
      }),
    );
    const alerts = section(md, 'Alerts');
    expect(alerts).toContain('2 of 3 servers did not answer');
    expect(alerts).toContain('2 Discord posts failed for good');
  });

  it('adds week-over-week changes when there is a previous period', () => {
    const current = [
      flow('bait', 'source', 'leet', 150),
      flow('bait', 'sink', 'training', 50),
      row('dau', {}, 14),
      finale(1, 1, 3),
      finale(1, 0, 3),
    ];
    const before = [
      flow('bait', 'source', 'leet', 100),
      flow('bait', 'sink', 'training', 100),
      row('dau', {}, 28),
      finale(1, 1, 1),
      finale(1, 0, 3),
    ];
    const md = renderMarkdown(
      report(current, {
        previous: period(before, { from: '2027-01-04', to: '2027-01-10' }),
      }),
    );
    expect(md).toContain('Compared with 2027-01-04 to 2027-01-10');
    expect(section(md, 'Resources')).toContain('150 (↑ +50%)');
    expect(section(md, 'Resources')).toContain('50 (↓ -50%)');
    const summary = section(md, 'Summary');
    expect(summary).toContain('(↓ -50%)'); // daily active players halved
    expect(summary).toContain('50.0%** of 6 (↑ +25.0 pts)');
    expect(section(md, 'Alerts')).toContain('Daily active players fell from 4.0 to 2.0');
    // Without a previous period there are no changes.
    expect(renderMarkdown(report(current))).not.toContain('↑');
  });

  it('shows the rows read per day and the top sources, and flags a day near the free limit', () => {
    const reads = (source: string, n: number): Row => row('db.rows_read', { source }, n);
    const totals = [
      reads('request:state', 3_000_000),
      reads('alarm', 1_500_000),
      reads('start', 500),
    ];
    const md = renderMarkdown(
      report(totals, {
        daily: {
          '2027-01-11': [reads('request:state', 1_000_000), reads('alarm', 500_000)],
          '2027-01-12': [reads('request:state', 2_000_000), reads('alarm', 1_000_000)],
        },
      }),
    );
    const reads_ = section(md, 'Database reads');
    expect(reads_).toContain('Rows read in total: **4,500,500**');
    expect(reads_).toContain('| 2027-01-11 | 1,500,000 | 30.0% |');
    expect(reads_).toContain('| 2027-01-12 | 3,000,000 | 60.0% |');
    // The sources are listed biggest first, in code spans.
    expect(reads_.indexOf('`request:state`')).toBeLessThan(reads_.indexOf('`alarm`'));
    expect(reads_).toContain('| `request:state` | 3,000,000 | 66.7% |');
    // Under 80% of the free day: no alert yet.
    expect(section(md, 'Alerts')).not.toContain('database rows read');
    const high = renderMarkdown(
      report(totals, { daily: { '2027-01-12': [reads('request:state', 4_100_000)] } }),
    );
    expect(section(high, 'Alerts')).toContain('2027-01-12: 4,100,000 database rows read, 82.0%');
    expect(section(renderMarkdown(report([])), 'Database reads')).toContain('No rows read');
  });

  it('renders an empty report without failing', () => {
    const md = renderMarkdown(report([], { rolledDays: 0, guilds: { known: 0, reporting: 0 } }));
    expect(md).toContain('_No resource flow recorded in this range._');
    expect(md).toContain('_No data._');
    expect(section(md, 'Alerts')).toContain('No rolled-up days');
  });

  it('shows ids only in code spans, so nothing a row holds can change the formatting', () => {
    const md = renderMarkdown(
      report([
        flow('bait', 'source', 'leet', 3),
        row('gear.drop', { source: 'weird_source*x', rarity: 'rare' }, 2),
      ]),
    );
    expect(md).toContain('`weird_source*x`');
  });
});
