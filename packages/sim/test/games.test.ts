import { describe, expect, it } from 'vitest';
import { createSeededRng, gamesEventDef, type GamesEventDef } from '@creatures/game';
import { runGamesEvent, type GamesEntrant } from '@creatures/engine';
import { main, parseGamesCli } from '../src/games-cli';
import {
  assignEntries,
  gamesReport,
  gamesRows,
  runGamesStudy,
  showScript,
  spearman,
  type Candidate,
} from '../src/games-study';

function event(id: string): GamesEventDef {
  const def = gamesEventDef(id);
  if (def === undefined) throw new Error(id);
  return def;
}

function candidate(i: number, over: Partial<GamesEntrant> = {}, power = 100 + i): Candidate {
  return {
    power,
    entrant: {
      id: `p/${String(i)}`,
      playerId: 'p',
      teamId: 'p',
      name: `C${String(i)}`,
      speciesId: 'splashet',
      element: 'spark',
      role: 'setter',
      stage: 2,
      level: 10,
      hp: 300,
      atk: 60,
      spd: 50,
      dodgeBp: 500,
      critBp: 500,
      critDmgBp: 5_000,
      ...over,
    },
  };
}

describe('Spearman', () => {
  it('is 1 for the same order, -1 for the reverse, and handles ties', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
    expect(spearman([1, 1, 1], [1, 2, 3])).toBe(0);
  });
});

describe('assignEntries', () => {
  const lineup = [
    event('sauna-showdown'),
    event('melon-run'),
    event('pepper-panic'),
    event('sauna-stack'),
  ];
  const pool = [
    candidate(0, { hp: 600, element: 'ember' }, 50),
    candidate(1, { spd: 120 }, 60),
    candidate(2, {}, 300),
    candidate(3, {}, 200),
    candidate(4, {}, 90),
    candidate(5, {}, 80),
    candidate(6, {}, 70),
  ];

  it('best: strongest first in lineup order, the team event takes three, no repeats', () => {
    const picks = assignEntries(lineup, pool, 'best', createSeededRng('a'));
    expect(picks.map((cs) => cs.map((c) => c.power))).toEqual([[300], [200], [90], [80, 70, 60]]);
  });

  it('aptitude: the fit goes where it fits', () => {
    const picks = assignEntries(lineup, pool, 'aptitude', createSeededRng('a'));
    expect(picks[0]?.[0]?.entrant.id).toBe('p/0');
    expect(picks[1]?.[0]?.entrant.id).toBe('p/1');
    const all = picks.flat().map((c) => c.entrant.id);
    expect(new Set(all).size).toBe(all.length);
    expect(picks[3]).toHaveLength(3);
  });

  it('a small roster enters what it can', () => {
    const picks = assignEntries(lineup, pool.slice(0, 2), 'random', createSeededRng('a'));
    expect(picks.flat()).toHaveLength(2);
  });
});

describe('the study and the CLI', () => {
  it('parses flags and refuses bad ones', () => {
    expect(parseGamesCli([])).toMatchObject({ mode: 'study', study: { days: 40, sizes: [8, 15] } });
    expect(parseGamesCli(['--days', '3', '--sizes', '4', '--weeks', '1,2'])).toMatchObject({
      study: { days: 3, sizes: [4], weeks: [1, 2] },
    });
    expect(parseGamesCli(['--show', '7', '--event', 'floe-sumo', '--players', '5'])).toMatchObject({
      mode: 'show',
      seed: '7',
      players: 5,
    });
    expect(() => parseGamesCli(['--days', 'x'])).toThrow(/whole number/);
    expect(() => parseGamesCli(['--show', '1', '--event', 'nope'])).toThrow(/unknown event/);
    expect(() => parseGamesCli(['--show', '1', '--policy', 'cheat'])).toThrow(/policy/);
    const errs: string[] = [];
    expect(main(['--bogus'], { out: () => undefined, err: (t) => errs.push(t) })).toBe(2);
    expect(errs).toHaveLength(1);
  });

  it('prints a show as a script with the commentary filled in', () => {
    const def = event('melon-run');
    const field = [0, 1, 2].map((i) => ({
      ...candidate(i).entrant,
      id: `c${String(i)}`,
      playerId: `p${String(i)}`,
      teamId: `p${String(i)}`,
    }));
    const text = showScript(def, runGamesEvent(def, field, createSeededRng('script')));
    expect(text).toContain('Melon Run');
    expect(text).toContain('SAY  "Here comes the melon!"');
    expect(text).toMatch(/Standings:\n {2}1\. /);
  });

  it('a tiny study reports every event it played against the targets', () => {
    const study = runGamesStudy({ seed: 'tiny', sizes: [3], weeks: [1], days: 3 });
    const rows = gamesRows(study);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.seconds).toBeGreaterThan(0);
      expect(r.strongestWins).toBeGreaterThanOrEqual(0);
      expect(r.strongestWins).toBeLessThanOrEqual(1);
    }
    const report = gamesReport(study);
    expect(report).toMatch(/PASS|FAIL/);
    expect(report).toContain('| Event |');
  });
});
