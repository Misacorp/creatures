import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LOG_FILE, analysisFiles, main, readLog, type Io } from '../src/analyze-cli';
import {
  LIVE_TARGETS,
  MIN_N,
  NOBODY_MIN_PICKS,
  NOBODY_WATCH_PICKS,
  WALL_DROP_PTS,
  WATCH_FLOOR_N,
  analyse,
  levelFor,
  openLogEntries,
  type Flag,
} from '../src/live-analyze';
import { renderLive } from '../src/live-render';
import { repoRoot } from '../src/scalars-cli';
import { TARGETS } from '../src/targets';
import { fixtureReport, fixtureText, makeReport, row } from './live-helpers';

const dir = mkdtempSync(join(tmpdir(), 'sim-analyze-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function capture(): { io: Io; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (t) => out.push(t), err: (t) => err.push(t) }, out, err };
}

const flagsOf = (a: ReturnType<typeof analyse>, area: Flag['area']): Flag[] =>
  a.flags.filter((f) => f.area === area);

describe('levelFor', () => {
  it('flags with enough samples, watches with some, and is quiet with few', () => {
    expect(levelFor(MIN_N)).toBe('flag');
    expect(levelFor(MIN_N - 1)).toBe('watch');
    expect(levelFor(5)).toBe('watch');
    expect(levelFor(4)).toBeNull();
    expect(levelFor(12, 20, 10)).toBe('watch');
    expect(levelFor(9, 20, 10)).toBeNull();
  });
});

describe('the fixture analysis', () => {
  const analysis = analyse(fixtureReport(), null);
  const md = renderLive(analysis);

  it('is deterministic', () => {
    expect(renderLive(analyse(fixtureReport(), null))).toBe(md);
    expect(JSON.stringify(analyse(fixtureReport(), null))).toBe(JSON.stringify(analysis));
  });

  it('starts with the title and puts Resources first', () => {
    expect(md.startsWith('# Live balance report: 2026-10-12\n')).toBe(true);
    const sections = md.split('\n').filter((l) => l.startsWith('## '));
    expect(sections[0]).toBe('## Resources');
    expect(sections).toContain('## Anomaly flags');
    expect(sections).toContain('## Open balance log entries');
    expect(sections.at(-1)).toBe('## Not available yet');
  });

  it('writes a waterfall with sources, sinks and the net', () => {
    expect(md).toContain('### `essence`');
    expect(md).toContain('| + | `raid` | 900 | 60.0% |');
    expect(md).toContain('| - | `evolution` | -250 | 67.6% |');
    expect(md).toContain('| = | **net** | **+1,130** |  |');
    expect(md).toContain('net +1,130, +6.7 per active player per day');
    // The previous period is in the report, so the week-over-week change shows.
    expect(md).toContain('In 1,500 (up 11%), out 370 (up 11%), net +1,130.');
  });

  it('says that holdings statistics are not available', () => {
    expect(md).toContain('Gini, median and p90 holdings are not available from rollups yet');
  });

  it('raises the planted anomalies and nothing for the healthy parts', () => {
    const text = (f: Flag): string => `${f.level} ${f.area} ${f.subject} ${f.message}`;
    const all = analysis.flags.map(text);
    expect(all.some((t) => t.startsWith('flag resources `essence` piling up'))).toBe(true);
    expect(all.some((t) => t.startsWith('flag resources `ember-shard` running dry'))).toBe(true);
    expect(all.some((t) => t.includes('the sink `upgrade` had no use'))).toBe(true);
    expect(all.some((t) => t.startsWith('flag dungeon depth 3 to 4 a wall'))).toBe(true);
    expect(all.some((t) => t.startsWith('flag raid finale at rank 2 win rate 20.8%'))).toBe(true);
    expect(all.some((t) => t.includes('nobody picks `festival-grounds`'))).toBe(true);
    expect(all.some((t) => t.startsWith('watch raid finale at rank 1'))).toBe(true);
    // Bait is balanced and nothing is wrong with the starters.
    expect(all.some((t) => t.includes('`bait`'))).toBe(false);
    expect(all.some((t) => t.includes('Starter creatures'))).toBe(false);
    expect(analysis.flags.every((f) => f.n >= WATCH_FLOOR_N)).toBe(true);
  });

  it('shows n in every rate table and the previous-period note', () => {
    expect(md).toContain('| Depth | Runs (n) |');
    expect(md).toContain('| Rank | Fights (n) |');
    expect(md).toContain('(n=168 player-days)');
  });

  it('checks the mapped sim targets', () => {
    const byId = new Map(analysis.targets.map((t) => [t.targetId, t]));
    expect(byId.get('raid-phase1-typical')?.status).toBe('in_band');
    expect(byId.get('raid-finale-typical')?.status).toBe('outside');
    expect(byId.get('raid-finale-typical')?.display).toBe('34.3%');
    expect(byId.get('dungeon-essence-share')?.status).toBe('in_band');
    expect(md).toContain('| `raid-finale-typical` Finale win rate (no Festival) | 34.3% |');
  });

  it('reports hand-fired against Auto', () => {
    expect(analysis.raid.handFiredShare).toBeCloseTo(0.2, 4);
    expect(md).toContain('hand-fired 20.0%');
  });

  it('has a clean map from live values to real sim targets', () => {
    const ids = LIVE_TARGETS.map((t) => t.targetId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(TARGETS.some((t) => t.id === id)).toBe(true);
  });
});

describe('resource flags', () => {
  const flow = (currency: string, dir: string, label: string, n: number) =>
    row('flow', n, { currency, dir, label });

  it('flags a pile only past the ratio and the per-player threshold', () => {
    const base = [row('dau', 100)];
    const piled = analyse(
      makeReport([
        ...base,
        flow('essence', 'source', 'raid', 600),
        flow('essence', 'sink', 'evolution', 100),
      ]),
      null,
    );
    expect(flagsOf(piled, 'resources').some((f) => f.message.startsWith('piling up'))).toBe(true);
    // Less than three times more in than out.
    const balanced = analyse(
      makeReport([
        ...base,
        flow('essence', 'source', 'raid', 600),
        flow('essence', 'sink', 'evolution', 250),
      ]),
      null,
    );
    expect(flagsOf(balanced, 'resources').some((f) => f.message.startsWith('piling up'))).toBe(
      false,
    );
    // Three times more in than out but a tiny net per player.
    const small = analyse(
      makeReport([
        ...base,
        flow('essence', 'source', 'raid', 30),
        flow('essence', 'sink', 'evolution', 5),
      ]),
      null,
    );
    expect(flagsOf(small, 'resources').some((f) => f.message.startsWith('piling up'))).toBe(false);
  });

  it('flags a currency that runs dry', () => {
    const a = analyse(
      makeReport([
        row('dau', 100),
        flow('bait', 'source', 'leet', 100),
        flow('bait', 'sink', 'training', 400),
      ]),
      null,
    );
    expect(flagsOf(a, 'resources').some((f) => f.message.startsWith('running dry'))).toBe(true);
  });

  it('flags a sink with no use while its currency has sources', () => {
    const a = analyse(
      makeReport([
        row('dau', 100),
        flow('essence', 'source', 'raid', 200),
        flow('essence', 'sink', 'gear', 190),
      ]),
      null,
    );
    const messages = flagsOf(a, 'resources').map((f) => f.message);
    expect(messages.some((m) => m.includes('the sink `evolution` had no use'))).toBe(true);
    expect(messages.some((m) => m.includes('`gear`'))).toBe(false);
  });

  it('makes a flag a watch with few player-days, and raises nothing with very few', () => {
    const rows = [
      flow('essence', 'source', 'raid', 600),
      flow('essence', 'sink', 'evolution', 100),
    ];
    const few = analyse(makeReport([row('dau', 10), ...rows]), null);
    const flagsFew = flagsOf(few, 'resources');
    expect(flagsFew.length).toBeGreaterThan(0);
    expect(flagsFew.every((f) => f.level === 'watch')).toBe(true);
    const tiny = analyse(makeReport([row('dau', 3), ...rows]), null);
    expect(flagsOf(tiny, 'resources')).toEqual([]);
  });
});

describe('pick-rate flags', () => {
  const sends = (counts: Record<string, number>) =>
    Object.entries(counts).map(([destination, n]) =>
      row('expedition.send', n, { destination, length: 'short' }),
    );
  const spread = {
    tidepools: 10,
    'ember-caves': 10,
    'verdant-hollow': 10,
    'storm-ridge': 10,
    'old-crossroads': 10,
    'moonlit-reef': 10,
  };
  const picksFlags = (a: ReturnType<typeof analyse>): Flag[] =>
    flagsOf(a, 'picks').filter((f) => f.subject === 'Expedition destinations');

  const nobodyFlags = (a: ReturnType<typeof analyse>): Flag[] =>
    picksFlags(a).filter((f) => f.message.startsWith('nobody picks'));

  it('flags nobody-picks from the picks threshold, watches below it', () => {
    const enough = analyse(makeReport(sends({ ...spread, tidepools: NOBODY_MIN_PICKS })), null);
    const flag = picksFlags(enough).find((f) => f.message.startsWith('nobody picks'));
    expect(flag?.level).toBe('flag');
    expect(flag?.message).toContain('`festival-grounds`');

    // The boundary: exactly the flag threshold flags, one fewer only watches.
    const atLimit = analyse(
      makeReport(sends({ tidepools: NOBODY_MIN_PICKS - 10, 'ember-caves': 10 })),
      null,
    );
    expect(nobodyFlags(atLimit)[0]?.level).toBe('flag');
    const below = analyse(
      makeReport(sends({ tidepools: NOBODY_MIN_PICKS - 11, 'ember-caves': 10 })),
      null,
    );
    expect(nobodyFlags(below)[0]?.level).toBe('watch');
    const watch = analyse(
      makeReport(sends({ tidepools: NOBODY_WATCH_PICKS, 'ember-caves': 5, 'verdant-hollow': 5 })),
      null,
    );
    expect(picksFlags(watch).every((f) => f.level === 'watch')).toBe(true);
    expect(picksFlags(watch).length).toBeGreaterThan(0);
    const none = analyse(makeReport(sends({ tidepools: 5, 'ember-caves': 4 })), null);
    expect(picksFlags(none)).toEqual([]);
  });

  it('flags everybody-picks above 60% in a group of at least four options', () => {
    const dominant = analyse(makeReport(sends({ ...spread, tidepools: 200 })), null);
    const f = picksFlags(dominant).find((x) => x.message.startsWith('everybody picks'));
    expect(f?.level).toBe('flag');
    expect(f?.message).toContain('`tidepools`');
    // Exactly 60% is not above 60%.
    const exact = analyse(
      makeReport(
        sends({
          tidepools: 60,
          'ember-caves': 10,
          'verdant-hollow': 10,
          'storm-ridge': 10,
          'old-crossroads': 10,
        }),
      ),
      null,
    );
    expect(picksFlags(exact).some((x) => x.message.startsWith('everybody picks'))).toBe(false);
    // A group with fewer than four options is never "everybody picks".
    const risks = analyse(
      makeReport([
        row('pushon.chosen', 90, { goal: 'forage', risk: 'safe' }),
        row('pushon.chosen', 10, { goal: 'linger', risk: 'risky' }),
      ]),
      null,
    );
    expect(flagsOf(risks, 'picks').some((x) => x.subject === 'Push-on risk levels chosen')).toBe(
      false,
    );
  });

  it('judges push-on goals by how often they were offered', () => {
    const a = analyse(
      makeReport([
        row('pushon.chosen', 40, { goal: 'forage', risk: 'safe' }),
        row('pushon.goal_offered', 40, { goal: 'forage' }),
        row('pushon.goal_offered', 31, { goal: 'lost-cache' }),
        row('pushon.goal_offered', 3, { goal: 'shortcut' }),
      ]),
      null,
    );
    const f = flagsOf(a, 'picks').find(
      (x) => x.subject === 'Push-on goals' && x.message.startsWith('nobody picks'),
    );
    expect(f?.message).toContain('`lost-cache`');
    expect(f?.message).not.toContain('`shortcut`');
    expect(f?.level).toBe('flag');
  });
});

describe('dungeon wall flags', () => {
  const depths = (list: [number, number, number][]) =>
    list.flatMap(([depth, runs, clears]) => [
      row('dungeon.depth', runs, { depth }),
      row('dungeon.clear_depth', clears, { depth }),
    ]);
  const walls = (a: ReturnType<typeof analyse>): Flag[] =>
    flagsOf(a, 'dungeon').filter((f) => f.message.startsWith('a wall'));

  it('flags a drop of more than 40 points between consecutive depths', () => {
    const a = analyse(
      makeReport(
        depths([
          [3, 20, 18],
          [4, 20, 4],
        ]),
      ),
      null,
    );
    expect(walls(a)).toHaveLength(1);
    expect(walls(a)[0]?.level).toBe('flag');
    expect(walls(a)[0]?.subject).toBe('depth 3 to 4');
  });

  it('does not flag a drop of exactly 40 points', () => {
    expect(WALL_DROP_PTS).toBe(40);
    const a = analyse(
      makeReport(
        depths([
          [3, 20, 16],
          [4, 20, 8],
        ]),
      ),
      null,
    );
    expect(walls(a)).toEqual([]);
  });

  it('only watches with fewer than the flag sample, and ignores very few runs', () => {
    const watch = analyse(
      makeReport(
        depths([
          [3, 12, 12],
          [4, 12, 0],
        ]),
      ),
      null,
    );
    expect(walls(watch)[0]?.level).toBe('watch');
    const quiet = analyse(
      makeReport(
        depths([
          [3, 9, 9],
          [4, 9, 0],
        ]),
      ),
      null,
    );
    expect(flagsOf(quiet, 'dungeon')).toEqual([]);
  });

  it('only compares neighbouring depths', () => {
    const a = analyse(
      makeReport(
        depths([
          [3, 20, 20],
          [5, 20, 2],
        ]),
      ),
      null,
    );
    expect(walls(a)).toEqual([]);
  });
});

describe('raid flags', () => {
  const finale = (rank: number, total: number, wins: number, festival = 0) => [
    row('raid.phase', wins, { phase: 'finale', rank, festival, win: 1 }),
    row('raid.phase', total - wins, { phase: 'finale', rank, festival, win: 0 }),
  ];
  const band = (a: ReturnType<typeof analyse>): Flag[] => flagsOf(a, 'raid');

  it('flags a finale win rate outside 40-60% with enough fights', () => {
    expect(band(analyse(makeReport(finale(2, 20, 10)), null))).toEqual([]);
    expect(band(analyse(makeReport(finale(2, 20, 8)), null))).toEqual([]);
    expect(band(analyse(makeReport(finale(2, 20, 12)), null))).toEqual([]);
    const high = band(analyse(makeReport(finale(2, 20, 13)), null));
    expect(high).toHaveLength(1);
    expect(high[0]?.level).toBe('flag');
    expect(band(analyse(makeReport(finale(2, 20, 3)), null))[0]?.level).toBe('flag');
  });

  it('watches with few fights, and ignores Festival weeks', () => {
    expect(band(analyse(makeReport(finale(1, 8, 8)), null))[0]?.level).toBe('watch');
    expect(band(analyse(makeReport(finale(1, 4, 4)), null))).toEqual([]);
    expect(band(analyse(makeReport(finale(1, 30, 30, 1)), null))).toEqual([]);
  });

  it('does not compare a small group with a typical group target', () => {
    const rows = [...finale(1, 30, 3), row('raid.party_size_sum', 60, { phase: 'finale' })];
    const a = analyse(makeReport(rows), null);
    const check = a.targets.find((t) => t.targetId === 'raid-finale-typical');
    expect(check?.status).toBe('not_comparable');
    expect(check?.note).toContain('average group 2.0 players');
    expect(flagsOf(a, 'targets').some((f) => f.subject === '`raid-finale-typical`')).toBe(false);
  });
});

describe('the balance log', () => {
  const log = `# Balance log

## Template

### B-000: short title (open | closed)

- **Opened:** YYYY-MM-DD
- **Outcome:** filled in later, with the date.

## Entries

### B-001: Essence piles up (open)

- **Opened:** 2026-10-13, from \`docs/balance/live-2026-10-13.md\`.
- **Finding:** x
- **Action:** none, watching.
- **Outcome:**

### B-002: Dungeon wall at depth 4 (open)

- **Opened:** 2026-10-14.
- **Outcome:** Measured on 2026-10-21: worked.
  The clear rate is back above half.

### B-003: Old thing (closed)

- **Opened:** 2026-10-01.
- **Outcome:**

### B-004: Pending one (open)

- **Opened:** 2026-10-15.
- **Outcome:** pending the next report.
`;

  it('lists open entries with no outcome and skips the template, closed and filled ones', () => {
    expect(openLogEntries(log)).toEqual([
      { id: 'B-001', title: 'Essence piles up', opened: '2026-10-13' },
      { id: 'B-004', title: 'Pending one', opened: '2026-10-15' },
    ]);
  });

  it('shows them in the report, with titles safe to print', () => {
    const md = renderLive(
      analyse(fixtureReport(), log.replace('Essence piles up', 'Essence `piles` up')),
    );
    expect(md).toContain('- `B-001` Essence  piles  up (opened 2026-10-13)');
    expect(md).toContain('- `B-004` Pending one (opened 2026-10-15)');
    expect(md).not.toContain('B-002');
  });

  it('reads the real log: every open entry has an id, a title and an opened date', () => {
    const text = readLog(repoRoot());
    expect(text).not.toBeNull();
    for (const entry of openLogEntries(text ?? '')) {
      expect(entry.id).toMatch(/^B-\d{3}$/);
      expect(entry.id).not.toBe('B-000');
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.opened).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('pnpm analyze', () => {
  it('writes the markdown and the json named by the report date', () => {
    const report = join(dir, 'report.json');
    writeFileSync(report, fixtureText());
    const out = join(dir, 'out');
    const { io, out: lines, err } = capture();
    expect(main([report, '--out', out], io)).toBe(0);
    expect(err).toEqual([]);
    expect(lines[0]).toContain('live-2026-10-12.md');
    expect(readdirSync(out).sort()).toEqual(['live-2026-10-12.json', 'live-2026-10-12.md']);
    const files = analysisFiles(fixtureText(), readLog(repoRoot()));
    expect(readFileSync(join(out, 'live-2026-10-12.md'), 'utf8')).toBe(files.markdown);
    const json = JSON.parse(readFileSync(join(out, 'live-2026-10-12.json'), 'utf8')) as {
      from: string;
      flags: unknown[];
    };
    expect(json.from).toBe('2026-10-06');
    expect(json.flags.length).toBeGreaterThan(0);
  });

  it('refuses an invalid report and a missing path', () => {
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ version: 1, surprise: true }));
    const a = capture();
    expect(main([bad, '--out', join(dir, 'x')], a.io)).toBe(1);
    expect(a.err[0]).toContain('invalid report');
    expect(readdirSync(dir)).not.toContain('x');
    const b = capture();
    expect(main([], b.io)).toBe(1);
    expect(b.err[0]).toContain('Usage');
  });

  it('prints help', () => {
    const { io, out } = capture();
    expect(main(['--help'], io)).toBe(0);
    expect(out[0]).toContain('pnpm analyze');
  });

  it('reads the log from the repo path it is given', () => {
    expect(LOG_FILE).toBe('docs/balance/log.md');
  });
});
