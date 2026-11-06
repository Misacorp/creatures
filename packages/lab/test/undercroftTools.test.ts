/**
 * The Undercroft tools (`undercroftTools.ts`, `undercroftToolSet.ts`): a camp placed in level 1, the extra bench creature, the four-slot row,
 * the gear bump and the tools' wiring. Short and seeded: the numbers are the report's (`--undercroft-tools`).
 */
import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { ALL_ROUND_BENCH, ALL_ROUND_TEAM, runMap, type RunOptions } from '../src';
import { EXTRA_BENCH, teamOf } from '../src/dungeonDays';
import { configOf } from '../src/dungeonMeasure';
import { HABITS } from '../src/habits';
import type { Pick } from '../src/search';
import { TOOLS, toolOf } from '../src/undercroftToolSet';
import { runsFor } from '../src/undercroftTools';
import { VALLEY_ROSTER } from '../src/valley';

const team: Pick[] = ALL_ROUND_TEAM.map((p) => ({ ...p, level: 30 }));
/** Foes with a tenth of the HP everywhere: the floor and the keeper fall. */
const easy = { base: { hpMult: 1_000 }, undercroft: { hpMult: 1_000 } } as const;
const down: RunOptions = {
  policy: 'smart',
  levels: 1,
  descendAbove: -1,
  bench: ALL_ROUND_BENCH,
  foes: easy,
};

describe('a camp in Undercroft level 1', () => {
  it.each(['first', 'middle', 'keeper'] as const)(
    "at %s: the run meets a second camp, in the level; without the option only the day's",
    (at) => {
      let seen = 0;
      for (let i = 0; i < 12 && seen < 3; i++) {
        const plain = runMap(team, 30, createSeededRng(`uc-${at}-${i}`), down);
        const withCamp = runMap(team, 30, createSeededRng(`uc-${at}-${i}`), {
          ...down,
          levelCamp: { at },
        });
        if (!plain.cleared || plain.levelLog.length === 0) continue;
        seen++;
        expect(plain.camps).toBe(1);
        expect(withCamp.camps).toBe(2);
        expect(withCamp.levelLog[0]?.level).toBe(1);
      }
      expect(seen).toBeGreaterThan(0);
    },
  );

  it('a camp that also heals plays too, and level 2 has no camp', () => {
    const r = runMap(team, 30, createSeededRng('uc-both'), {
      ...down,
      levels: 2,
      followCrack: false,
      levelCamp: { at: 'middle', both: true, restBp: 10_000 },
    });
    expect(r.cleared).toBe(true);
    expect(r.camps).toBe(2);
  });
});

describe('the gear bump', () => {
  it('makes the same seeds end healthier', () => {
    const hard = { base: { hpMult: 10_000 } } as const;
    let plain = 0;
    let bumped = 0;
    for (let i = 0; i < 8; i++) {
      const a = runMap(team, 12, createSeededRng(`bump-${i}`), { policy: 'smart', foes: hard });
      const b = runMap(team, 12, createSeededRng(`bump-${i}`), {
        policy: 'smart',
        foes: hard,
        teamBumpBp: 3_000,
      });
      plain += a.fights;
      bumped += b.fights;
    }
    expect(bumped).toBeGreaterThanOrEqual(plain);
  });
});

describe('the bench and the row of four', () => {
  const who = { role: 'prepared', roster: 'daily' } as const;
  const casual = { role: 'casual', roster: 'daily' } as const;
  const at = (w: typeof who | typeof casual, tools: { extraBench?: number; slots?: number }) =>
    teamOf(w, 0, 20, 'expected', 'tools', VALLEY_ROSTER, HABITS, tools);

  it('one more bench creature goes to a planner only, after the others', () => {
    const base = at(who, {});
    const more = at(who, { extraBench: 1 });
    expect(more.team).toEqual(base.team);
    expect(more.bench).toHaveLength(base.bench.length + 1);
    expect(more.bench.at(-1)?.formId).toBe(EXTRA_BENCH[0]?.formId);
    expect(at(casual, { extraBench: 1 }).bench).toEqual([]);
  });

  it('the extra creature is brought in by a swap at the camp (it is the only one on the bench)', () => {
    let swaps = 0;
    // Stops at the first swap (a few seeds in).
    for (let i = 0; i < 300 && swaps === 0; i++) {
      const r = runMap(ALL_ROUND_TEAM, 8, createSeededRng(`camp${i}`), {
        policy: 'smart',
        bench: EXTRA_BENCH.slice(0, 1),
      });
      if (r.camp === 'swap') swaps++;
    }
    expect(swaps).toBeGreaterThan(0);
  });

  it('four slots: the first bench creature joins the row and the bench is one shorter', () => {
    const three = at(who, {});
    const four = at(who, { slots: 4 });
    expect(four.team).toHaveLength(4);
    expect(four.team.slice(0, 3).map((p) => p.formId)).toEqual(three.team.map((p) => p.formId));
    expect(four.bench).toHaveLength(three.bench.length - 1);
    expect(at(casual, { slots: 4 }).team).toHaveLength(4);
  });
});

describe('the tools', () => {
  it('have unique ids, a baseline, and put their settings into the days config', () => {
    expect(new Set(TOOLS.map((t) => t.id)).size).toBe(TOOLS.length);
    expect(toolOf('today').config).toEqual({});
    const c = configOf({ scenario: 'shipped', tool: 'camp-middle' });
    expect(c.runOptions?.levelCamp?.at).toBe('middle');
    expect(c.descent).toBe('sure');
    expect(configOf({ scenario: 'shipped', tool: 'four-slots' }).slots).toBe(4);
    expect(() => toolOf('nope')).toThrow();
  });

  it('the depth picker files a replay under the best depth it stepped back from', () => {
    const run = { replay: true, depth: 30, cleared: true } as never;
    const keep = { replay: false, depth: 40 } as never;
    expect(runsFor(toolOf('back-10'), [run, keep]).map((r) => r.depth)).toEqual([40]);
    expect(runsFor(toolOf('today'), [run, keep])).toHaveLength(2);
  });
});
