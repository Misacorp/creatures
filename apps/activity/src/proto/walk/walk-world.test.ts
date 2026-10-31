import { describe, expect, it } from 'vitest';
import { DAILY } from './journey';
import { planOf } from './walk-plan';
import {
  PURSE_START,
  castOf,
  decisionBubbles,
  purseOf,
  walkWorld,
  withoutCast,
} from './walk-world';

const world = walkWorld();
const cast = castOf(world);

describe('the purse of the walk prototype', () => {
  it('holds the valley’s resources, Acorns, scrap and shards, and nothing of the game’s Bait', () => {
    const purse = purseOf(planOf(DAILY, 0, cast), false);
    expect(purse.map((r) => r.label)).toEqual(['Acorns', 'Scrap', 'Shards']);
    expect(purse.map((r) => r.amount)).toEqual([
      PURSE_START.acorns,
      PURSE_START.scrap,
      PURSE_START.shards,
    ]);
  });

  it('gains what came home once it has dropped in, shards of every element added up, pieces left out', () => {
    const plan = planOf(DAILY, 1, cast); // day 2: Ember and Spark shards, pieces
    const before = purseOf(plan, false);
    const after = purseOf(plan, true);
    const amount = (key: string): number => plan.piles.find((p) => p.key === key)?.amount ?? 0;
    const shards = plan.piles
      .filter((p) => p.key.startsWith('shard-'))
      .reduce((n, p) => n + p.amount, 0);
    expect(after[0]?.amount).toBe((before[0]?.amount ?? 0) + amount('acorns'));
    expect(after[1]?.amount).toBe((before[1]?.amount ?? 0) + amount('scrap'));
    expect(after[2]?.amount).toBe((before[2]?.amount ?? 0) + shards);
    expect(shards).toBeGreaterThan(0);
  });
});

describe('the walk’s world', () => {
  it('has nothing waiting: no trip home, no finished job', () => {
    expect(world.trips).toEqual([]);
    expect(world.jobs).toEqual([]);
  });

  it('names the cast from its creatures, and leaves them out of the valley while they walk it', () => {
    expect(cast).toHaveLength(8);
    expect(withoutCast(world).creatures.length).toBe(world.creatures.length - 8);
  });

  it('puts the decision’s picture in a bubble over its place, with no need behind it', () => {
    const bubbles = decisionBubbles(planOf(DAILY, 0, cast)); // day 1: a Monday
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0]).toMatchObject({ place: 'arena', need: null, picture: { glyph: 'blade' } });
    const quiet = DAILY.visits
      .map((_, i) => planOf(DAILY, i, cast))
      .find((p) => p.decision === null);
    expect(quiet).toBeDefined();
    if (quiet !== undefined) expect(decisionBubbles(quiet)).toEqual([]);
  });
});
