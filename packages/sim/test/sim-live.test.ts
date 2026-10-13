import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_MIX } from '../src/archetypes';
import { runEconomy } from '../src/economy';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  PERCENT_BOUNDS,
  QUICK,
  calibrate,
  fitWindow,
  inferCasualShare,
  inferPlayers,
  mixFromShares,
  observe,
} from '../src/live-calibrate';
import {
  STOCKPILE_MIN,
  STOCKPILE_WEEKS,
  findCrossings,
  parseCalibration,
  type Series,
} from '../src/live-projection';
import {
  findPreviousCalibration,
  main,
  parseWeeks,
  simLiveFiles,
  type Io,
} from '../src/sim-live-cli';
import { fixtureReport, fixtureText, makeReport, row } from './live-helpers';

const dir = mkdtempSync(join(tmpdir(), 'sim-live-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function capture(): { io: Io; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (t) => out.push(t), err: (t) => err.push(t) }, out, err };
}

describe('the sim behaviour knobs', () => {
  const run = (behaviour?: { tripPercent?: number; dungeonPercent?: number }) =>
    runEconomy({
      seed: 'knobs',
      weeks: 4,
      mix: DEFAULT_MIX,
      snapshotWeeks: [],
      ...(behaviour === undefined ? {} : { behaviour }),
    });
  const total = (
    r: ReturnType<typeof run>,
    pick: (w: ReturnType<typeof run>['players'][number]['weeks'][number]) => number,
  ) => r.players.reduce((n, p) => n + p.weeks.reduce((m, w) => m + pick(w), 0), 0);

  it('draw the same numbers as before when they are left at 100', () => {
    const plain = JSON.stringify(run());
    expect(JSON.stringify(run({}))).toBe(plain);
    expect(JSON.stringify(run({ tripPercent: 100, dungeonPercent: 100 }))).toBe(plain);
  });

  it('lower participation means fewer dungeon runs and fewer trips', () => {
    const base = run();
    expect(total(run({ dungeonPercent: 30 }), (w) => w.dungeonRuns)).toBeLessThan(
      total(base, (w) => w.dungeonRuns),
    );
    const lastTrips = (r: ReturnType<typeof run>): number =>
      r.players.reduce((n, p) => n + (p.weeks.at(-1)?.trips ?? 0), 0);
    expect(lastTrips(run({ tripPercent: 30 }))).toBeLessThan(lastTrips(base));
  });

  it('is reproducible for a seed', () => {
    const a = JSON.stringify(run({ tripPercent: 50, dungeonPercent: 60 }));
    expect(JSON.stringify(run({ tripPercent: 50, dungeonPercent: 60 }))).toBe(a);
  });
});

describe('the heuristic mix', () => {
  it('turns sessions per active player-day into a casual share', () => {
    expect(inferCasualShare(1)).toBe(0.9);
    expect(inferCasualShare(2)).toBe(0.05);
    expect(inferCasualShare(3)).toBe(0.05);
    expect(inferCasualShare(null)).toBeCloseTo(DEFAULT_MIX.casual / 10, 6);
    const middle = inferCasualShare(1.5);
    expect(middle).toBeGreaterThan(0.7);
    expect(middle).toBeLessThan(0.8);
    expect(inferCasualShare(1.2)).toBeGreaterThan(inferCasualShare(1.5));
  });

  it('turns daily active players into a server size inside the bounds', () => {
    expect(inferPlayers(0.1, 0.5)).toBe(MIN_PLAYERS);
    expect(inferPlayers(500, 0.5)).toBe(MAX_PLAYERS);
    // 6 active a day with half of the players casual (active 2 days in 7): about 9 players.
    expect(inferPlayers(6, 0.5)).toBe(9);
  });

  it('splits players into archetypes that always sum up', () => {
    for (const players of [3, 7, 10, 14, 30]) {
      for (const share of [0.05, 0.3, 0.59, 0.9]) {
        const mix = mixFromShares(players, share);
        expect(mix.casual + mix.daily + mix.top + mix.newcomer).toBe(players);
        expect(mix.newcomer).toBe(0);
      }
    }
    expect(mixFromShares(12, 0.5)).toEqual({ casual: 6, daily: 4, top: 2, newcomer: 0 });
  });

  it('picks the sim weeks that stand for the report period', () => {
    expect(fitWindow(7, 0)).toEqual({ first: 1, last: 1 });
    expect(fitWindow(30, 4)).toEqual({ first: 5, last: 9 });
    expect(fitWindow(400, 0)).toEqual({ first: 1, last: 8 });
  });
});

describe('what is observed', () => {
  it('reads per-player-day rates and mixes off the totals', () => {
    const obs = observe(fixtureReport());
    expect(obs.playerDays).toBe(168);
    expect(obs.sessionsPerDau).toBeCloseTo(270 / 168, 6);
    expect(obs.sendsPerDau).toBeCloseTo(177 / 168, 6);
    expect(obs.lengthMix['short']).toBeCloseTo(77 / 177, 6);
    expect(obs.dauPerServer).toBeCloseTo(8, 6);
  });
});

describe('calibration', () => {
  const report = fixtureReport();
  const first = calibrate(report, { seed: 'test', ageWeeks: 0, fidelity: QUICK });

  it('is deterministic for a seed', () => {
    expect(calibrate(report, { seed: 'test', ageWeeks: 0, fidelity: QUICK })).toEqual(first);
  });

  it('stays inside its bounds and reports a finite fit error', () => {
    const p = first.params;
    expect(p.players).toBeGreaterThanOrEqual(MIN_PLAYERS);
    expect(p.players).toBeLessThanOrEqual(MAX_PLAYERS);
    for (const percent of [p.tripPercent, p.dungeonPercent]) {
      expect(percent).toBeGreaterThanOrEqual(PERCENT_BOUNDS.min);
      expect(percent).toBeLessThanOrEqual(PERCENT_BOUNDS.max);
    }
    expect(Math.abs(p.casualShare - first.heuristicCasualShare)).toBeLessThanOrEqual(0.2 + 1e-9);
    expect(Number.isFinite(first.fitError)).toBe(true);
    expect(first.fitError).toBeGreaterThanOrEqual(0);
    expect(first.lowData).toBe(false);
    expect(first.observed.sendsPerDau).toBeCloseTo(1.0536, 3);
  });

  it('never fits worse than the start of the search', () => {
    // The start is 100% for both knobs; the search keeps a candidate only when it is better.
    const start = calibrate(report, {
      seed: 'test',
      ageWeeks: 0,
      fidelity: { ...QUICK, rounds: 0 },
    });
    expect(start.params.tripPercent).toBe(100);
    expect(first.fitError).toBeLessThanOrEqual(start.fitError);
  });

  it('marks a report with very few active players as a rough guess', () => {
    const small = makeReport([row('dau', 10), row('sessions', 12), row('expedition.send', 6)]);
    expect(calibrate(small, { seed: 'test', ageWeeks: 0, fidelity: QUICK }).lowData).toBe(true);
  });

  it('refuses a report with no active players', () => {
    expect(() =>
      calibrate(makeReport([row('sessions', 3)]), { seed: 'test', ageWeeks: 0, fidelity: QUICK }),
    ).toThrow('nothing to calibrate');
  });
});

describe('where a projection crosses a band', () => {
  const flat = (n: number, v: number): number[] => Array.from({ length: n }, () => v);
  const nulls = (n: number): (number | null)[] => Array.from({ length: n }, () => null);
  const series = (overrides: Partial<Series>): Series => ({
    essenceStock: flat(10, 0),
    essenceIncome: flat(10, 20),
    baitStock: flat(10, 0),
    baitIncome: flat(10, 100),
    scrapStock: flat(10, 0),
    species: flat(10, 5),
    maxLevel: flat(10, 5),
    dungeonDepth: flat(10, 5),
    casualLevel: nulls(10),
    dailySpecies: nulls(10),
    powerRatio: nulls(10),
    dailyDepth: flat(10, 5),
    ...overrides,
  });

  it('finds the first week a stockpile passes its weeks of income', () => {
    const stock = [0, 10, 40, 60, 90, 100, 120, 200, 300, 400];
    const crossings = findCrossings(series({ essenceStock: stock }), 1, 10);
    const essence = crossings.find((c) => c.what.startsWith('Essence'));
    // Week 5: 90 is over 4 weeks of income (4 x 20 = 80) and over the minimum of 50.
    expect(STOCKPILE_WEEKS).toBe(4);
    expect(STOCKPILE_MIN).toBe(50);
    expect(essence?.week).toBe(5);
    expect(essence?.alreadyAtStart).toBe(false);
    expect(crossings.find((c) => c.what.startsWith('Bait'))?.week).toBeNull();
  });

  it('says so when it already crosses at the first projected week', () => {
    const essence = findCrossings(series({ essenceStock: flat(10, 500) }), 4, 10).find((c) =>
      c.what.startsWith('Essence'),
    );
    expect(essence?.week).toBe(4);
    expect(essence?.alreadyAtStart).toBe(true);
  });

  it('finds where dungeon depth growth falls under the band', () => {
    const depth = [2, 4, 6, 8, 10, 12, 13, 13.5, 14, 14.2];
    const growth = findCrossings(series({ dailyDepth: depth }), 1, 10).find((c) =>
      c.what.includes('depth growth'),
    );
    // Over 4 weeks: week 7 grows (13 - 6) / 4 = 1.75; week 8 (13.5 - 8) / 4 = 1.375; week 9 (14 - 10) / 4 = 1.0;
    // week 10 (14.2 - 12) / 4 = 0.55 is the first under 1.
    expect(growth?.week).toBe(10);
  });
});

describe('pnpm sim:live', () => {
  const options = { seed: 'test', weeks: [2, 4], ageWeeks: 0, quick: true };
  const files = simLiveFiles(fixtureText(), options, null);

  it('is deterministic with a seed', () => {
    expect(simLiveFiles(fixtureText(), options, null)).toEqual(files);
  });

  it('writes a projection with the sections an agent needs', () => {
    const md = files.projectionMd;
    expect(files.name).toBe('live-2026-10-12');
    expect(md.startsWith('# Live projection: 2026-10-12\n')).toBe(true);
    for (const heading of [
      '## Calibration',
      '## Projection',
      '## Where the projection crosses a band',
      '## Week-bound targets',
      '## Limits',
    ]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain('| Per player | week 2 | week 4 |');
    expect(md).toContain('Essence stockpile');
    expect(md).toContain('Fit error');
  });

  it('writes calibration json that reads back', () => {
    const parsed = parseCalibration(files.calibrationJson);
    expect(parsed).not.toBeNull();
    expect(parsed?.seed).toBe('test');
    expect(parsed?.version).toBe(1);
    expect(parseCalibration('{"version":1}')).toBeNull();
    expect(parseCalibration('nope')).toBeNull();
  });

  it('shows the parameter changes against an earlier calibration', () => {
    const previous = parseCalibration(files.calibrationJson);
    if (previous === null) throw new Error('calibration did not read back');
    const earlier = {
      ...previous,
      to: '2026-10-05',
      fitError: previous.fitError + 0.1,
      params: { ...previous.params, tripPercent: 50, players: previous.params.players + 2 },
    };
    const md = simLiveFiles(fixtureText(), options, earlier).projectionMd;
    expect(md).toContain('Previous (2026-10-05)');
    expect(md).toContain('| Check-ins that send trips |');
    expect(md).toContain('| 50% |');
    expect(md).toContain('| Players per server |');
    expect(md).toContain('-2');
  });

  it('writes both files, finds the previous calibration and prints errors', () => {
    const report = join(dir, 'report.json');
    writeFileSync(report, fixtureText());
    const out = join(dir, 'out');
    mkdirSync(out);
    const older = JSON.parse(files.calibrationJson) as {
      to: string;
      params: { tripPercent: number };
    };
    older.to = '2026-10-05';
    older.params.tripPercent = 40;
    writeFileSync(join(out, 'live-2026-10-05.calibration.json'), JSON.stringify(older));
    // A file with the same date or a later one is not "previous".
    writeFileSync(join(out, 'live-2026-10-20.calibration.json'), files.calibrationJson);
    writeFileSync(join(out, 'live-2026-09-01.calibration.json'), '{"broken":true}');

    expect(findPreviousCalibration(out, '2026-10-12')?.params.tripPercent).toBe(40);
    expect(findPreviousCalibration(join(dir, 'missing'), '2026-10-12')).toBeNull();

    const { io, out: lines, err } = capture();
    expect(main([report, '--quick', '--weeks', '2,4', '--seed', 'test', '--out', out], io)).toBe(0);
    expect(err).toEqual([]);
    expect(lines[0]).toContain('live-2026-10-12.calibration.json');
    expect(readdirSync(out)).toContain('live-2026-10-12.projection.md');
    const md = readFileSync(join(out, 'live-2026-10-12.projection.md'), 'utf8');
    expect(md).toContain('Previous (2026-10-05)');
    expect(readFileSync(join(out, 'live-2026-10-12.calibration.json'), 'utf8')).toBe(
      files.calibrationJson,
    );

    const bad = capture();
    expect(main([report, '--weeks', '0'], bad.io)).toBe(1);
    expect(bad.err[0]).toContain('--weeks');
    const none = capture();
    expect(main([], none.io)).toBe(1);
    expect(none.err[0]).toContain('Usage');
    const invalid = join(dir, 'invalid.json');
    writeFileSync(invalid, '{"version":1,"x":1}');
    const refused = capture();
    expect(main([invalid, '--quick', '--out', join(dir, 'never')], refused.io)).toBe(1);
    expect(refused.err[0]).toContain('invalid report');
  });

  it('parses the weeks list', () => {
    expect(parseWeeks('4,12,26')).toEqual([4, 12, 26]);
    expect(parseWeeks('26, 4,4')).toEqual([4, 26]);
    expect(() => parseWeeks('4,x')).toThrow('--weeks');
    expect(() => parseWeeks('105')).toThrow('--weeks');
    expect(() => parseWeeks('1,2,3,4,5,6,7,8,9')).toThrow('--weeks');
  });
});
