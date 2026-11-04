/**
 * The dungeon measures (`dungeonMeasure.ts`, `fourSlot.ts`): the state buckets, the safe policy that never goes down, the probe, the knobs and
 * the board of four. Short and seeded: the numbers are the report's (`--dungeon-days`, `--four-slot`).
 */
import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { ALL_ROUND_TEAM, runMap, type RunResult } from '../src';
import {
  KNOCK_BUCKETS,
  STATE_BUCKETS,
  bucketOf,
  gainByBand,
  knockBucketOf,
  scenarioOf,
  weekGains,
} from '../src/dungeonMeasure';
import type { PlayerDays } from '../src/dungeonDays';
import { ARENAS, fourSlotArgs, placementsOf, type FourSlotResult } from '../src/fourSlot';
import { toPlacements, type Pick } from '../src/search';

const team: Pick[] = ALL_ROUND_TEAM.map((p) => ({ ...p, level: 30 }));
/** Foes with a tenth of the HP: the floor falls, so the descent is reached. */
const easy = { base: { hpMult: 1_000 } } as const;

function firstCleared(options: Parameters<typeof runMap>[3]): RunResult {
  for (let i = 0; i < 20; i++) {
    const r = runMap(team, 8, createSeededRng(`measure-${i}`), options);
    if (r.cleared) return r;
  }
  throw new Error('no cleared run in 20 seeds');
}

describe('the state buckets', () => {
  it('cut the HP share at 40, 60 and 80 percent, and the knocked-out count at 0, 1 and 2 or more', () => {
    expect([0, 0.39, 0.4, 0.59, 0.6, 0.79, 0.8, 1].map(bucketOf)).toEqual([
      '<40%',
      '<40%',
      '40-60%',
      '40-60%',
      '60-80%',
      '60-80%',
      '>80%',
      '>80%',
    ]);
    expect(new Set(STATE_BUCKETS).size).toBe(4);
    expect([0, 1, 2, 3].map(knockBucketOf)).toEqual(['0', '1', '2+', '2+']);
    expect(KNOCK_BUCKETS).toEqual(['0', '1', '2+']);
  });
});

describe('the safe player', () => {
  it('who never goes down enters no level, and the floor ends the same as for one who is sure: the clear does not depend on the rule', () => {
    const base = { policy: 'smart', levels: 2, descendAbove: -1, foes: easy } as const;
    const never = firstCleared({ ...base, descendShare: 2 });
    expect(never.entered).toBe(0);
    expect(never.undercroft).toBe(0);
    expect(never.floorEnd).not.toBeNull();
    // The same seed with the 'sure' rule: the same floor, whatever it then does.
    const seed = (r: RunResult) => [r.cleared, r.floorEnd?.share, r.floorEnd?.knocked, r.played];
    for (let i = 0; i < 20; i++) {
      const rng = () => createSeededRng(`measure-${i}`);
      const a = runMap(team, 8, rng(), { ...base, descendShare: 2 });
      const b = runMap(team, 8, rng(), { ...base, descendShare: 0.8 });
      expect(a.cleared).toBe(b.cleared);
      expect(a.floorEnd).toEqual(b.floorEnd);
      expect(a.entered).toBe(0);
      expect(seed(a).slice(0, 3)).toEqual(seed(b).slice(0, 3));
    }
  });

  it('the probe plays the level the rule would not, logs it, and leaves what the rule did untouched', () => {
    const base = {
      policy: 'smart',
      levels: 2,
      descendAbove: -1,
      descendShare: 2,
      foes: easy,
    } as const;
    const plain = firstCleared(base);
    const probed = firstCleared({ ...base, probe: true });
    expect(plain.levelLog).toEqual([]);
    expect(probed.entered).toBe(0);
    expect(probed.undercroft).toBe(0);
    const first = probed.levelLog[0];
    expect(first?.level).toBe(1);
    expect(first?.chosen).toBe(false);
    expect(first?.share).toBeGreaterThanOrEqual(0);
    expect(first?.share).toBeLessThanOrEqual(1);
    // A won level pays into the pack; a lost one has something to lose.
    for (const l of probed.levelLog) {
      if (l.won) expect(l.gain).toBeGreaterThan(0);
      else expect(l.gain).toBe(0);
    }
  });

  it('a wipe leaves the depth where it is: no floor end, no level', () => {
    const r = runMap(
      team.map((p) => ({ ...p, level: 1 })),
      60,
      createSeededRng('measure-wipe'),
      { policy: 'smart', levels: 2, probe: true },
    );
    expect(r.cleared).toBe(false);
    expect(r.floorEnd).toBeNull();
    expect(r.levelLog).toEqual([]);
  });
});

describe('the foe knobs', () => {
  it('a smaller base scale makes the floor easier and leaves a run without knobs as it was', () => {
    const run = (foes?: Parameters<typeof runMap>[3]['foes']) => {
      let cleared = 0;
      for (let i = 0; i < 12; i++)
        if (
          runMap(
            team.map((p) => ({ ...p, level: 12 })),
            12,
            createSeededRng(`knob-${i}`),
            { policy: 'smart', ...(foes ? { foes } : {}) },
          ).cleared
        )
          cleared++;
      return cleared;
    };
    expect(run({ base: { hpMult: 3_000 } })).toBeGreaterThan(run());
    // An empty knob is the game's own numbers.
    expect(run({})).toBe(run());
  });

  it('the proposed scenarios exist and give the Undercroft its own numbers', () => {
    const s = scenarioOf('base55-u1');
    expect(s.foes?.undercroft).toBeDefined();
    expect(s.foes?.base?.hpMult).toBeLessThan(10_000);
    expect(() => scenarioOf('nope')).toThrow();
  });
});

describe('gain by week band', () => {
  const player = (depthEnd: number[]): PlayerDays => ({
    role: 'prepared',
    roster: 'daily',
    depthEnd,
    runs: [],
  });
  it('reads a week as the depth gained since the last, skipping weeks before a player joined, and counts stuck weeks', () => {
    const p = player([0, 4, 4, 9]);
    expect(weekGains(p).map((w) => [w.present, w.gain])).toEqual([
      [false, 0],
      [true, 3],
      [true, 0],
      [true, 5],
    ]);
    const g = gainByBand([p], [1, 4]);
    expect(g.players).toBe(1);
    expect(g.mean).toBeCloseTo(8 / 3);
    expect(g.stuckWeeks).toBeCloseTo(1 / 3);
    expect(g.stuckPlayers).toBe(1);
  });
});

describe('a team of four', () => {
  const four: Pick[] = [...team, { formId: 'lanternfin', knack: 'lantern-glow', level: 30 }];

  it('plays four creatures in a row of four (and two rows of two on the other board)', () => {
    expect(toPlacements(four, ARENAS.four).map((p) => [p.row, p.col])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ]);
    expect(toPlacements(four, ARENAS['two-by-two']).map((p) => [p.row, p.col])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
    const r = runMap(four, 1, createSeededRng('four'), {
      policy: 'smart',
      mode: ARENAS.four,
      foes: easy,
    });
    expect(r.cleared).toBe(true);
    // The floor boss fell with the whole row of four counted for the state.
    expect(r.floorEnd?.share).toBeGreaterThan(0);
    const fake: FourSlotResult = {
      args: fourSlotArgs(true)[0] as never,
      line: four,
      roles: [],
      forms: [],
      clear: 1,
      level1: 0,
      level2: 0,
      knockouts: 0,
    };
    expect(placementsOf({ ...fake, args: { ...fake.args, arena: 'four' } })).toHaveLength(4);
  });

  it('the search plan covers three, four and two by two, and the fair comparison scales the foes', () => {
    const args = fourSlotArgs(true);
    expect(new Set(args.map((a) => a.arena))).toEqual(new Set(['three', 'four', 'two-by-two']));
    expect(args.some((a) => a.foeHpBp > 10_000)).toBe(true);
    expect(
      new Set(args.map((a) => `${a.arena}:${a.level}:${a.objective}:${a.depth}:${a.foeHpBp}`)).size,
    ).toBe(args.length);
  });
});
