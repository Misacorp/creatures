/**
 * The rewards report (`dungeonRewards.ts`) and the reward tally of a run (`RunResult.reward`). Short and seeded: the numbers are the report's
 * (`--dungeon-days --rewards`).
 */
import { RULES, createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { ALL_ROUND_TEAM, runMap } from '../src';
import { gearMarkdown } from '../src/dungeonRewards';
import type { Pick } from '../src/search';

const team: Pick[] = ALL_ROUND_TEAM.map((p) => ({ ...p, level: 30 }));
const easy = { base: { hpMult: 1_000 } } as const;

describe('the reward tally of a run', () => {
  it('counts the base experience of the cleared rooms and the pack as paid', () => {
    const r = runMap(team, 3, createSeededRng('reward-tally'), { policy: 'first', foes: easy });
    expect(r.cleared).toBe(true);
    expect(r.reward.deepest).toBe(0);
    // At least the boss's experience; the pack is the units the rooms put in it.
    expect(r.reward.xp).toBeGreaterThanOrEqual(RULES.experience.dungeon.boss);
    const k = r.reward.kept;
    expect(k.bait + k.essence + k.scrap).toBeGreaterThan(0);
  });
});

describe('the gear table', () => {
  it('has a v1 and a v2 row for every depth band and v2 keeps more at the deep end', () => {
    const md = gearMarkdown(20).join('\n');
    expect(md).toMatch(/\| 41\+ \| base \| v2 \|/);
    const pieces = (rules: string): number =>
      Number(new RegExp(`\\| 41\\+ \\| base \\| ${rules} \\| ([0-9.]+) \\|`).exec(md)?.[1]);
    expect(pieces('v1')).toBe(1);
    expect(pieces('v2')).toBeGreaterThan(1.5);
  });
});
